import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { Topic, Subscription } from "encore.dev/pubsub";
import { learningDB } from "./db";
import { pricingDB } from "../pricing/db";
import { ebayDB } from "../ebay/db";
import { graphDB } from "../graph/db";

export interface FeedbackEvent {
  listingId: string;
  eventType: 'sale' | 'view_increase' | 'watcher_increase' | 'price_change' | 'competitor_response';
  eventValue: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface RecordFeedbackRequest {
  decisionId?: number;
  experimentId?: string;
  listingId: string;
  outcomeType: 'positive' | 'negative' | 'neutral';
  metrics: {
    salesBefore: number;
    salesAfter: number;
    viewsBefore: number;
    viewsAfter: number;
    watchersBefore: number;
    watchersAfter: number;
    revenueBefore: number;
    revenueAfter: number;
    timeToFirstSale?: number;
    competitorResponses?: Array<{
      competitorId: string;
      priceChange: number;
      responseTime: number;
    }>;
  };
  trackingPeriodDays?: number;
}

export interface RecordFeedbackResponse {
  outcomeId: number;
  outcomeScore: number;
  learningUpdated: boolean;
}

export const feedbackTopic = new Topic<FeedbackEvent>("feedback-events", {
  deliveryGuarantee: "at-least-once",
});

// Processes feedback events to improve pricing models.
new Subscription(feedbackTopic, "process-feedback", {
  handler: async (event) => {
    try {
      await processFeedbackEvent(event);
    } catch (error) {
      console.error('Error processing feedback event:', error);
    }
  },
});

// Records detailed outcome feedback for a pricing decision.
export const recordFeedback = api<RecordFeedbackRequest, RecordFeedbackResponse>(
  { auth: true, expose: true, method: "POST", path: "/learning/feedback/record" },
  async (req) => {
    const auth = getAuthData()!;

    try {
      // Verify listing ownership
      const listing = await ebayDB.queryRow`
        SELECT * FROM listings WHERE id = ${req.listingId} AND user_id = ${auth.userID}
      `;

      if (!listing) {
        throw APIError.notFound("Listing not found");
      }

      // Get pricing decision details if provided
      let pricingDecision = null;
      if (req.decisionId) {
        pricingDecision = await pricingDB.queryRow`
          SELECT pd.*, l.user_id
          FROM pricing_decisions pd
          JOIN listings l ON pd.listing_id = l.id
          WHERE pd.id = ${req.decisionId} AND l.user_id = ${auth.userID}
        `;

        if (!pricingDecision) {
          throw APIError.notFound("Pricing decision not found");
        }
      }

      // Calculate outcome score
      const outcomeScore = calculateOutcomeScore(req.metrics, req.outcomeType);

      // Calculate derived metrics
      const salesVelocityChange = calculateSalesVelocityChange(req.metrics);
      const conversionRateBefore = req.metrics.viewsBefore > 0 ? req.metrics.salesBefore / req.metrics.viewsBefore : 0;
      const conversionRateAfter = req.metrics.viewsAfter > 0 ? req.metrics.salesAfter / req.metrics.viewsAfter : 0;
      const marketShareChange = calculateMarketShareChange(req.metrics);

      // Store outcome record
      const outcomeResult = await learningDB.queryRow`
        INSERT INTO pricing_outcomes (
          decision_id, experiment_id, listing_id, strategy_id,
          old_price, new_price, price_change_percent, applied_at,
          sales_before, sales_after, views_before, views_after,
          watchers_before, watchers_after, time_to_first_sale,
          sales_velocity_change, conversion_rate_before, conversion_rate_after,
          revenue_before, revenue_after, competitor_responses,
          market_share_change, outcome_type, outcome_score,
          confidence_score, tracking_end, is_complete
        ) VALUES (
          ${req.decisionId}, ${req.experimentId}, ${req.listingId}, 
          ${getStrategyIdFromExperiment(req.experimentId, req.listingId)},
          ${pricingDecision?.old_price || listing.original_price},
          ${pricingDecision?.suggested_price || listing.current_price},
          ${pricingDecision ? ((pricingDecision.suggested_price - pricingDecision.old_price) / pricingDecision.old_price) * 100 : 0},
          ${pricingDecision?.applied_at || new Date()},
          ${req.metrics.salesBefore}, ${req.metrics.salesAfter},
          ${req.metrics.viewsBefore}, ${req.metrics.viewsAfter},
          ${req.metrics.watchersBefore}, ${req.metrics.watchersAfter},
          ${req.metrics.timeToFirstSale}, ${salesVelocityChange},
          ${conversionRateBefore}, ${conversionRateAfter},
          ${req.metrics.revenueBefore}, ${req.metrics.revenueAfter},
          ${JSON.stringify(req.metrics.competitorResponses || [])},
          ${marketShareChange}, ${req.outcomeType}, ${outcomeScore},
          ${pricingDecision?.confidence_score || 0.5},
          ${new Date(Date.now() + (req.trackingPeriodDays || 7) * 24 * 60 * 60 * 1000)},
          true
        )
        RETURNING id
      `;

      const outcomeId = outcomeResult.id;

      // Update bandit arms if this is part of an experiment
      let learningUpdated = false;
      if (req.experimentId) {
        await updateBanditArms(req.experimentId, req.listingId, outcomeScore);
        learningUpdated = true;
      }

      // Update strategy performance
      await updateStrategyPerformance(req.listingId, outcomeScore, req.metrics);

      // Feed insights to graph database
      await feedInsightsToGraph(req.listingId, outcomeScore, req.metrics);

      // Trigger pattern detection
      await detectNewPatterns(req.listingId, req.metrics);

      return {
        outcomeId,
        outcomeScore,
        learningUpdated,
      };
    } catch (error) {
      console.error('Error recording feedback:', error);
      throw APIError.internal("Failed to record feedback");
    }
  }
);

async function processFeedbackEvent(event: FeedbackEvent) {
  try {
    // Find recent pricing decisions for this listing
    const recentDecisions = await pricingDB.queryAll`
      SELECT pd.*, l.user_id
      FROM pricing_decisions pd
      JOIN listings l ON pd.listing_id = l.id
      WHERE pd.listing_id = ${event.listingId}
        AND pd.applied = true
        AND pd.applied_at >= ${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)} -- Last 7 days
      ORDER BY pd.applied_at DESC
    `;

    for (const decision of recentDecisions) {
      const timeToFeedback = Math.floor(
        (event.timestamp.getTime() - new Date(decision.applied_at).getTime()) / (1000 * 60)
      );

      // Store feedback
      await pricingDB.exec`
        INSERT INTO learning_feedback (
          decision_id, feedback_type, feedback_value, time_to_feedback,
          additional_context, created_at
        ) VALUES (
          ${decision.id}, ${event.eventType}, ${event.eventValue}, ${timeToFeedback},
          ${JSON.stringify(event.metadata || {})}, CURRENT_TIMESTAMP
        )
      `;

      // Update decision outcome tracking
      await pricingDB.exec`
        UPDATE pricing_decisions 
        SET outcome_tracked = true,
            outcome_data = COALESCE(outcome_data, '{}') || ${JSON.stringify({
              [event.eventType]: event.eventValue,
              timeToFeedback,
            })}
        WHERE id = ${decision.id}
      `;
    }

    // Update real-time learning metrics
    await updateRealtimeLearning(event);

  } catch (error) {
    console.error('Error processing feedback event:', error);
  }
}

function calculateOutcomeScore(metrics: any, outcomeType: string): number {
  let score = 0.5; // Neutral baseline

  // Revenue impact (40% weight)
  const revenueChange = metrics.revenueAfter - metrics.revenueBefore;
  const revenueImpact = revenueChange / Math.max(1, metrics.revenueBefore);
  score += revenueImpact * 0.4;

  // Sales velocity impact (30% weight)
  const salesChange = metrics.salesAfter - metrics.salesBefore;
  const salesImpact = salesChange / Math.max(1, metrics.salesBefore);
  score += salesImpact * 0.3;

  // Engagement impact (20% weight)
  const viewsChange = metrics.viewsAfter - metrics.viewsBefore;
  const watchersChange = metrics.watchersAfter - metrics.watchersBefore;
  const engagementImpact = (viewsChange + watchersChange * 2) / Math.max(1, metrics.viewsBefore + metrics.watchersBefore * 2);
  score += engagementImpact * 0.2;

  // Time to sale bonus (10% weight)
  if (metrics.timeToFirstSale && metrics.timeToFirstSale < 24 * 60) { // Less than 24 hours
    score += 0.1;
  }

  // Apply outcome type modifier
  switch (outcomeType) {
    case 'positive':
      score = Math.max(0.6, score);
      break;
    case 'negative':
      score = Math.min(0.4, score);
      break;
    case 'neutral':
      score = Math.max(0.4, Math.min(0.6, score));
      break;
  }

  return Math.max(0, Math.min(1, score));
}

function calculateSalesVelocityChange(metrics: any): number {
  const salesBefore = metrics.salesBefore || 0;
  const salesAfter = metrics.salesAfter || 0;
  
  if (salesBefore === 0) {
    return salesAfter > 0 ? 1.0 : 0.0;
  }
  
  return (salesAfter - salesBefore) / salesBefore;
}

function calculateMarketShareChange(metrics: any): number {
  // Simplified market share calculation
  // In production, this would use actual market data
  const totalMarketSales = 1000; // Mock total market sales
  const shareChange = (metrics.salesAfter - metrics.salesBefore) / totalMarketSales;
  return shareChange;
}

async function getStrategyIdFromExperiment(experimentId?: string, listingId?: string): Promise<string | null> {
  if (!experimentId || !listingId) return null;

  const assignment = await learningDB.queryRow`
    SELECT strategy_id FROM experiment_assignments 
    WHERE experiment_id = ${experimentId} AND listing_id = ${listingId}
  `;

  return assignment?.strategy_id || null;
}

async function updateBanditArms(experimentId: string, listingId: string, outcomeScore: number) {
  // Get strategy assignment
  const assignment = await learningDB.queryRow`
    SELECT strategy_id FROM experiment_assignments 
    WHERE experiment_id = ${experimentId} AND listing_id = ${listingId}
  `;

  if (!assignment) return;

  // Update bandit arm statistics
  const isSuccess = outcomeScore > 0.6;
  
  await learningDB.exec`
    UPDATE bandit_arms 
    SET 
      alpha = alpha + ${isSuccess ? 1 : 0},
      beta = beta + ${isSuccess ? 0 : 1},
      total_pulls = total_pulls + 1,
      total_reward = total_reward + ${outcomeScore},
      avg_reward = (total_reward + ${outcomeScore}) / (total_pulls + 1),
      updated_at = CURRENT_TIMESTAMP
    WHERE experiment_id = ${experimentId} AND arm_id = ${assignment.strategy_id}
  `;
}

async function updateStrategyPerformance(listingId: string, outcomeScore: number, metrics: any) {
  // Get the strategy used for this listing (simplified)
  const strategyId = 'default_strategy'; // In production, track actual strategy used

  const isSuccess = outcomeScore > 0.6;
  const revenueImpact = metrics.revenueAfter - metrics.revenueBefore;
  const profitImpact = revenueImpact * 0.3; // Assume 30% margin

  await learningDB.exec`
    INSERT INTO strategy_performance (
      strategy_id, strategy_name, strategy_config,
      total_applications, successful_applications, success_rate,
      total_revenue_impact, avg_revenue_impact,
      total_profit_impact, avg_profit_impact,
      last_used, updated_at
    ) VALUES (
      ${strategyId}, 'Default Strategy', '{}',
      1, ${isSuccess ? 1 : 0}, ${isSuccess ? 1.0 : 0.0},
      ${revenueImpact}, ${revenueImpact},
      ${profitImpact}, ${profitImpact},
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (strategy_id) DO UPDATE SET
      total_applications = strategy_performance.total_applications + 1,
      successful_applications = strategy_performance.successful_applications + ${isSuccess ? 1 : 0},
      success_rate = (strategy_performance.successful_applications + ${isSuccess ? 1 : 0}) / 
                    (strategy_performance.total_applications + 1.0),
      total_revenue_impact = strategy_performance.total_revenue_impact + ${revenueImpact},
      avg_revenue_impact = (strategy_performance.total_revenue_impact + ${revenueImpact}) / 
                          (strategy_performance.total_applications + 1.0),
      total_profit_impact = strategy_performance.total_profit_impact + ${profitImpact},
      avg_profit_impact = (strategy_performance.total_profit_impact + ${profitImpact}) / 
                         (strategy_performance.total_applications + 1.0),
      last_used = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `;
}

async function feedInsightsToGraph(listingId: string, outcomeScore: number, metrics: any) {
  try {
    // Create outcome node in graph database
    const outcomeNodeId = `outcome_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await graphDB.exec`
      INSERT INTO graph_nodes (id, node_type, properties)
      VALUES (${outcomeNodeId}, 'outcome', ${JSON.stringify({
        listingId,
        outcomeScore,
        revenueImpact: metrics.revenueAfter - metrics.revenueBefore,
        salesImpact: metrics.salesAfter - metrics.salesBefore,
        timestamp: new Date().toISOString(),
      })})
    `;

    // Create relationship between product and outcome
    const productNode = await graphDB.queryRow`
      SELECT id FROM graph_nodes 
      WHERE node_type = 'product' AND properties->>'listingId' = ${listingId}
    `;

    if (productNode) {
      await graphDB.exec`
        INSERT INTO graph_relationships (source_node_id, target_node_id, relationship_type, strength)
        VALUES (${productNode.id}, ${outcomeNodeId}, 'RESULTED_IN', ${outcomeScore})
      `;
    }
  } catch (error) {
    console.error('Error feeding insights to graph:', error);
  }
}

async function detectNewPatterns(listingId: string, metrics: any) {
  // Simplified pattern detection - in production, use more sophisticated algorithms
  try {
    // Detect sales velocity patterns
    const salesVelocityChange = calculateSalesVelocityChange(metrics);
    
    if (Math.abs(salesVelocityChange) > 0.5) { // Significant change
      await learningDB.exec`
        INSERT INTO market_patterns (
          pattern_type, pattern_name, description,
          pattern_data, strength, confidence, sample_size,
          first_detected, last_observed
        ) VALUES (
          'sales_velocity', 'Significant Sales Velocity Change',
          'Detected significant change in sales velocity after pricing adjustment',
          ${JSON.stringify({
            listingId,
            velocityChange: salesVelocityChange,
            metrics,
          })},
          ${Math.abs(salesVelocityChange)}, 0.7, 1,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT (pattern_type, pattern_name) DO UPDATE SET
          last_observed = CURRENT_TIMESTAMP,
          sample_size = market_patterns.sample_size + 1,
          strength = (market_patterns.strength + ${Math.abs(salesVelocityChange)}) / 2
      `;
    }
  } catch (error) {
    console.error('Error detecting patterns:', error);
  }
}

async function updateRealtimeLearning(event: FeedbackEvent) {
  // Update real-time learning metrics for immediate strategy adjustments
  try {
    const learningUpdate = {
      eventType: event.eventType,
      eventValue: event.eventValue,
      timestamp: event.timestamp,
      listingId: event.listingId,
    };

    // Store in a fast-access table for real-time strategy updates
    await learningDB.exec`
      INSERT INTO realtime_learning_updates (
        listing_id, event_type, event_value, learning_signal, created_at
      ) VALUES (
        ${event.listingId}, ${event.eventType}, ${event.eventValue},
        ${JSON.stringify(learningUpdate)}, CURRENT_TIMESTAMP
      )
    `;
  } catch (error) {
    console.error('Error updating realtime learning:', error);
  }
}

// Manual feedback submission endpoint
export const submitFeedback = api<FeedbackEvent, { success: boolean }>(
  { expose: true, method: "POST", path: "/learning/feedback" },
  async (event) => {
    await feedbackTopic.publish(event);
    return { success: true };
  }
);
