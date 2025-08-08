import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { learningDB } from "./db";
import { listingsDB } from "../listings/db";

export interface CreateExperimentRequest {
  name: string;
  description?: string;
  experimentType: 'ab_test' | 'multi_armed_bandit' | 'reinforcement_learning';
  categoryId?: string;
  brandId?: string;
  strategies: PricingStrategy[];
  allocationMethod?: 'equal' | 'thompson_sampling' | 'epsilon_greedy';
  successMetric?: 'revenue' | 'profit' | 'sales_velocity' | 'conversion_rate';
  confidenceThreshold?: number;
  minSampleSize?: number;
  maxDurationDays?: number;
}

export interface PricingStrategy {
  id: string;
  name: string;
  description: string;
  config: {
    priceAdjustmentType: 'percentage' | 'fixed' | 'dynamic';
    adjustmentValue?: number;
    conditions?: Record<string, any>;
    constraints?: {
      minPrice?: number;
      maxPrice?: number;
      maxChange?: number;
    };
  };
}

export interface CreateExperimentResponse {
  experimentId: string;
  status: string;
  assignedListings: number;
  estimatedDuration: number;
}

export interface ExperimentStatus {
  id: string;
  name: string;
  status: string;
  progress: number;
  results?: {
    leadingStrategy: string;
    confidence: number;
    significantDifference: boolean;
    metrics: Record<string, number>;
  };
  assignedListings: number;
  startDate?: Date;
  endDate?: Date;
}

// Creates a new pricing experiment with A/B testing or multi-armed bandit approach.
export const createExperiment = api<CreateExperimentRequest, CreateExperimentResponse>(
  { auth: true, expose: true, method: "POST", path: "/learning/experiment/create" },
  async (req) => {
    const auth = getAuthData()!;

    try {
      // Validate strategies
      if (req.strategies.length < 2) {
        throw APIError.invalidArgument("At least 2 strategies required for experiment");
      }

      // Generate experiment ID
      const experimentId = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create experiment record
      await learningDB.exec`
        INSERT INTO pricing_experiments (
          id, name, description, experiment_type, user_id, category_id, brand_id,
          strategies, allocation_method, success_metric, confidence_threshold,
          min_sample_size, max_duration_days, status
        ) VALUES (
          ${experimentId}, ${req.name}, ${req.description || ''}, ${req.experimentType},
          ${auth.userID}, ${req.categoryId}, ${req.brandId},
          ${JSON.stringify(req.strategies)}, ${req.allocationMethod || 'equal'},
          ${req.successMetric || 'revenue'}, ${req.confidenceThreshold || 0.95},
          ${req.minSampleSize || 100}, ${req.maxDurationDays || 30}, 'draft'
        )
      `;

      // Initialize bandit arms if using multi-armed bandit
      if (req.experimentType === 'multi_armed_bandit') {
        for (const strategy of req.strategies) {
          await learningDB.exec`
            INSERT INTO bandit_arms (experiment_id, arm_id, strategy_config)
            VALUES (${experimentId}, ${strategy.id}, ${JSON.stringify(strategy)})
          `;
        }
      }

      // Find eligible listings for the experiment
      const eligibleListings = await findEligibleListings(auth.userID, req.categoryId, req.brandId);

      // Assign listings to strategies
      const assignedListings = await assignListingsToStrategies(
        experimentId,
        eligibleListings,
        req.strategies,
        req.allocationMethod || 'equal'
      );

      // Estimate experiment duration
      const estimatedDuration = Math.min(
        req.maxDurationDays || 30,
        Math.max(7, Math.ceil(req.minSampleSize || 100 / Math.max(1, assignedListings / 7)))
      );

      return {
        experimentId,
        status: 'draft',
        assignedListings,
        estimatedDuration,
      };
    } catch (error) {
      console.error('Error creating experiment:', error);
      throw APIError.internal("Failed to create pricing experiment");
    }
  }
);

// Starts a pricing experiment.
export const startExperiment = api<{ experimentId: string }, { success: boolean; message: string }>(
  { auth: true, expose: true, method: "POST", path: "/learning/experiment/:experimentId/start" },
  async (req) => {
    const auth = getAuthData()!;

    try {
      // Verify experiment ownership and status
      const experiment = await learningDB.queryRow`
        SELECT * FROM pricing_experiments 
        WHERE id = ${req.experimentId} AND user_id = ${auth.userID} AND status = 'draft'
      `;

      if (!experiment) {
        throw APIError.notFound("Experiment not found or already started");
      }

      // Update experiment status and start date
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + experiment.max_duration_days * 24 * 60 * 60 * 1000);

      await learningDB.exec`
        UPDATE pricing_experiments 
        SET status = 'active', start_date = ${startDate}, end_date = ${endDate}
        WHERE id = ${req.experimentId}
      `;

      return {
        success: true,
        message: `Experiment started successfully. Will run until ${endDate.toDateString()}`,
      };
    } catch (error) {
      console.error('Error starting experiment:', error);
      throw APIError.internal("Failed to start experiment");
    }
  }
);

// Gets experiment status and results.
export const getExperimentStatus = api<{ experimentId: string }, ExperimentStatus>(
  { auth: true, expose: true, method: "GET", path: "/learning/experiment/:experimentId/status" },
  async (req) => {
    const auth = getAuthData()!;

    try {
      const experiment = await learningDB.queryRow`
        SELECT * FROM pricing_experiments 
        WHERE id = ${req.experimentId} AND user_id = ${auth.userID}
      `;

      if (!experiment) {
        throw APIError.notFound("Experiment not found");
      }

      // Get assignment count
      const assignmentCount = await learningDB.queryRow`
        SELECT COUNT(*) as count FROM experiment_assignments 
        WHERE experiment_id = ${req.experimentId}
      `;

      // Calculate progress
      let progress = 0;
      if (experiment.status === 'active' && experiment.start_date && experiment.end_date) {
        const now = new Date();
        const start = new Date(experiment.start_date);
        const end = new Date(experiment.end_date);
        progress = Math.min(100, Math.max(0, (now.getTime() - start.getTime()) / (end.getTime() - start.getTime()) * 100));
      } else if (experiment.status === 'completed') {
        progress = 100;
      }

      // Get results if experiment is active or completed
      let results;
      if (experiment.status === 'active' || experiment.status === 'completed') {
        results = await calculateExperimentResults(req.experimentId);
      }

      return {
        id: experiment.id,
        name: experiment.name,
        status: experiment.status,
        progress,
        results,
        assignedListings: assignmentCount?.count || 0,
        startDate: experiment.start_date ? new Date(experiment.start_date) : undefined,
        endDate: experiment.end_date ? new Date(experiment.end_date) : undefined,
      };
    } catch (error) {
      console.error('Error getting experiment status:', error);
      throw APIError.internal("Failed to get experiment status");
    }
  }
);

// Lists all experiments for the user.
export const listExperiments = api<void, { experiments: ExperimentStatus[] }>(
  { auth: true, expose: true, method: "GET", path: "/learning/experiments" },
  async () => {
    const auth = getAuthData()!;

    try {
      const experiments = await learningDB.queryAll`
        SELECT pe.*, COUNT(ea.listing_id) as assigned_listings
        FROM pricing_experiments pe
        LEFT JOIN experiment_assignments ea ON pe.id = ea.experiment_id
        WHERE pe.user_id = ${auth.userID}
        GROUP BY pe.id
        ORDER BY pe.created_at DESC
      `;

      const experimentStatuses = await Promise.all(
        experiments.map(async (exp) => {
          let progress = 0;
          if (exp.status === 'active' && exp.start_date && exp.end_date) {
            const now = new Date();
            const start = new Date(exp.start_date);
            const end = new Date(exp.end_date);
            progress = Math.min(100, Math.max(0, (now.getTime() - start.getTime()) / (end.getTime() - start.getTime()) * 100));
          } else if (exp.status === 'completed') {
            progress = 100;
          }

          let results;
          if (exp.status === 'active' || exp.status === 'completed') {
            results = await calculateExperimentResults(exp.id);
          }

          return {
            id: exp.id,
            name: exp.name,
            status: exp.status,
            progress,
            results,
            assignedListings: exp.assigned_listings || 0,
            startDate: exp.start_date ? new Date(exp.start_date) : undefined,
            endDate: exp.end_date ? new Date(exp.end_date) : undefined,
          };
        })
      );

      return { experiments: experimentStatuses };
    } catch (error) {
      console.error('Error listing experiments:', error);
      throw APIError.internal("Failed to list experiments");
    }
  }
);

async function findEligibleListings(userId: string, categoryId?: string, brandId?: string): Promise<string[]> {
  let whereClause = "WHERE p.user_id = $1 AND ml.status = 'active'";
  const params: any[] = [userId];

  if (categoryId) {
    whereClause += " AND p.category_id = $2";
    params.push(categoryId);
  }

  if (brandId) {
    whereClause += ` AND p.brand = $${params.length + 1}`;
    params.push(brandId);
  }

  const listings = await listingsDB.rawQueryAll(
    `SELECT p.id FROM products p
     JOIN marketplace_listings ml ON p.id = ml.product_id
     ${whereClause} ORDER BY ml.created_at DESC LIMIT 1000`,
    ...params
  );

  return listings.map(listing => listing.id);
}

async function assignListingsToStrategies(
  experimentId: string,
  listings: string[],
  strategies: PricingStrategy[],
  allocationMethod: string
): Promise<number> {
  if (listings.length === 0) return 0;

  let assignedCount = 0;

  for (let i = 0; i < listings.length; i++) {
    const listingId = listings[i];
    let strategyId: string;

    switch (allocationMethod) {
      case 'equal':
        strategyId = strategies[i % strategies.length].id;
        break;
      case 'thompson_sampling':
        strategyId = await selectStrategyThompsonSampling(experimentId, strategies);
        break;
      case 'epsilon_greedy':
        strategyId = await selectStrategyEpsilonGreedy(experimentId, strategies);
        break;
      default:
        strategyId = strategies[i % strategies.length].id;
    }

    try {
      await learningDB.exec`
        INSERT INTO experiment_assignments (experiment_id, listing_id, strategy_id)
        VALUES (${experimentId}, ${listingId}, ${strategyId})
      `;
      assignedCount++;
    } catch (error) {
      // Skip if already assigned
      console.log(`Listing ${listingId} already assigned to experiment`);
    }
  }

  return assignedCount;
}

async function selectStrategyThompsonSampling(experimentId: string, strategies: PricingStrategy[]): Promise<string> {
  // Get current bandit arm states
  const arms = await learningDB.queryAll`
    SELECT arm_id, alpha, beta FROM bandit_arms WHERE experiment_id = ${experimentId}
  `;

  if (arms.length === 0) {
    // Fallback to random selection
    return strategies[Math.floor(Math.random() * strategies.length)].id;
  }

  // Sample from Beta distribution for each arm
  let bestArm = arms[0];
  let bestSample = sampleBeta(bestArm.alpha, bestArm.beta);

  for (let i = 1; i < arms.length; i++) {
    const sample = sampleBeta(arms[i].alpha, arms[i].beta);
    if (sample > bestSample) {
      bestSample = sample;
      bestArm = arms[i];
    }
  }

  return bestArm.arm_id;
}

async function selectStrategyEpsilonGreedy(experimentId: string, strategies: PricingStrategy[]): Promise<string> {
  const epsilon = 0.1; // 10% exploration rate

  if (Math.random() < epsilon) {
    // Explore: random selection
    return strategies[Math.floor(Math.random() * strategies.length)].id;
  } else {
    // Exploit: select best performing arm
    const bestArm = await learningDB.queryRow`
      SELECT arm_id FROM bandit_arms 
      WHERE experiment_id = ${experimentId}
      ORDER BY avg_reward DESC
      LIMIT 1
    `;

    return bestArm?.arm_id || strategies[0].id;
  }
}

function sampleBeta(alpha: number, beta: number): number {
  // Simple Beta distribution sampling using rejection method
  // In production, use a proper statistical library
  const gamma1 = sampleGamma(alpha);
  const gamma2 = sampleGamma(beta);
  return gamma1 / (gamma1 + gamma2);
}

function sampleGamma(shape: number): number {
  // Simplified Gamma distribution sampling
  // In production, use a proper statistical library
  if (shape < 1) {
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x, v;
    do {
      x = sampleNormal();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * x * x * x * x) {
      return d * v;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

function sampleNormal(): number {
  // Box-Muller transform for normal distribution
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

async function calculateExperimentResults(experimentId: string): Promise<any> {
  // Get performance metrics for each strategy
  const strategyResults = await learningDB.queryAll`
    SELECT 
      ea.strategy_id,
      COUNT(*) as sample_size,
      AVG(po.outcome_score) as avg_score,
      AVG(po.revenue_after - po.revenue_before) as avg_revenue_impact,
      AVG(po.sales_velocity_change) as avg_velocity_change,
      STDDEV(po.outcome_score) as score_stddev
    FROM experiment_assignments ea
    LEFT JOIN pricing_outcomes po ON ea.listing_id = po.listing_id 
      AND po.applied_at >= (SELECT start_date FROM pricing_experiments WHERE id = ${experimentId})
    WHERE ea.experiment_id = ${experimentId}
    GROUP BY ea.strategy_id
  `;

  if (strategyResults.length === 0) {
    return null;
  }

  // Find leading strategy
  const leadingStrategy = strategyResults.reduce((best, current) => 
    (current.avg_score || 0) > (best.avg_score || 0) ? current : best
  );

  // Calculate statistical significance (simplified t-test)
  const significantDifference = strategyResults.length > 1 && 
    calculateStatisticalSignificance(strategyResults);

  return {
    leadingStrategy: leadingStrategy.strategy_id,
    confidence: 0.85, // Simplified confidence calculation
    significantDifference,
    metrics: {
      avgScore: leadingStrategy.avg_score || 0,
      avgRevenueImpact: leadingStrategy.avg_revenue_impact || 0,
      avgVelocityChange: leadingStrategy.avg_velocity_change || 0,
      sampleSize: leadingStrategy.sample_size || 0,
    },
  };
}

function calculateStatisticalSignificance(results: any[]): boolean {
  // Simplified statistical significance test
  // In production, implement proper statistical tests
  if (results.length < 2) return false;

  const sorted = results.sort((a, b) => (b.avg_score || 0) - (a.avg_score || 0));
  const best = sorted[0];
  const second = sorted[1];

  const scoreDiff = (best.avg_score || 0) - (second.avg_score || 0);
  const pooledStddev = Math.sqrt(((best.score_stddev || 0) ** 2 + (second.score_stddev || 0) ** 2) / 2);

  // Simple effect size calculation
  const effectSize = pooledStddev > 0 ? scoreDiff / pooledStddev : 0;

  return effectSize > 0.5 && (best.sample_size || 0) > 30; // Minimum effect size and sample size
}
