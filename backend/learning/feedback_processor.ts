import { api } from "encore.dev/api";
import { Topic, Subscription } from "encore.dev/pubsub";
import { pricingDB } from "../pricing/db";
import { ebayDB } from "../ebay/db";

export interface FeedbackEvent {
  listingId: string;
  eventType: 'sale' | 'view_increase' | 'watcher_increase' | 'price_change';
  eventValue: number;
  timestamp: Date;
  metadata?: Record<string, any>;
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

async function processFeedbackEvent(event: FeedbackEvent) {
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

  // Trigger model retraining if enough new feedback has been collected
  await checkForModelRetraining(event.listingId);
}

async function checkForModelRetraining(listingId: string) {
  const feedbackCount = await pricingDB.queryRow`
    SELECT COUNT(*) as count
    FROM learning_feedback lf
    JOIN pricing_decisions pd ON lf.decision_id = pd.id
    WHERE pd.listing_id = ${listingId}
      AND lf.created_at >= ${new Date(Date.now() - 24 * 60 * 60 * 1000)} -- Last 24 hours
  `;

  // If we have enough feedback, trigger model improvement
  if (feedbackCount && feedbackCount.count >= 10) {
    await improveModelForListing(listingId);
  }
}

async function improveModelForListing(listingId: string) {
  // Analyze feedback patterns
  const feedbackAnalysis = await pricingDB.queryAll`
    SELECT 
      lf.feedback_type,
      lf.feedback_value,
      lf.time_to_feedback,
      pd.confidence_score,
      pd.suggested_price,
      pd.old_price,
      (pd.suggested_price - pd.old_price) as price_change
    FROM learning_feedback lf
    JOIN pricing_decisions pd ON lf.decision_id = pd.id
    WHERE pd.listing_id = ${listingId}
      AND lf.created_at >= ${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)} -- Last 30 days
  `;

  // Calculate success metrics
  const successfulChanges = feedbackAnalysis.filter(f => 
    f.feedback_type === 'sale' || 
    (f.feedback_type === 'view_increase' && f.feedback_value > 0.1)
  );

  const successRate = successfulChanges.length / feedbackAnalysis.length;

  // Update model performance metrics
  await pricingDB.exec`
    UPDATE pricing_models 
    SET performance_metrics = COALESCE(performance_metrics, '{}') || ${JSON.stringify({
      successRate,
      lastUpdated: new Date(),
      feedbackCount: feedbackAnalysis.length,
    })}
    WHERE id = 'hybrid_v1'
  `;

  console.log(`Model improved for listing ${listingId}. Success rate: ${successRate}`);
}

// Manual feedback submission endpoint
export const submitFeedback = api<FeedbackEvent, { success: boolean }>(
  { expose: true, method: "POST", path: "/learning/feedback" },
  async (event) => {
    await feedbackTopic.publish(event);
    return { success: true };
  }
);
