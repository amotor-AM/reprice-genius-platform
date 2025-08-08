import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { learningDB } from "./db";
import { ebayDB } from "../ebay/db";

export interface RLState {
  listingId: string;
  features: {
    currentPrice: number;
    originalPrice: number;
    priceHistory: number[];
    views: number;
    watchers: number;
    competitorPrices: number[];
    marketTrend: number;
    seasonalFactor: number;
    daysSinceListing: number;
    categoryDemand: number;
  };
}

export interface RLAction {
  actionType: 'increase' | 'decrease' | 'maintain';
  magnitude: number; // Percentage change
  confidence: number;
}

export interface RLReward {
  immediate: number; // Immediate reward (sales, views, etc.)
  delayed: number; // Long-term reward (profit, market position)
  total: number;
}

export interface RLEpisode {
  episodeId: string;
  listingId: string;
  states: RLState[];
  actions: RLAction[];
  rewards: RLReward[];
  totalReward: number;
  episodeLength: number;
  completed: boolean;
}

export interface TrainRLModelRequest {
  listingIds?: string[];
  categoryId?: string;
  episodes: number;
  learningRate?: number;
  discountFactor?: number;
  explorationRate?: number;
}

export interface TrainRLModelResponse {
  episodesCompleted: number;
  avgReward: number;
  convergenceMetrics: {
    policyLoss: number;
    valueLoss: number;
    entropy: number;
  };
  modelPerformance: {
    successRate: number;
    avgReturn: number;
    explorationRate: number;
  };
}

export interface GetRLActionRequest {
  listingId: string;
  currentState: RLState;
  explorationMode?: boolean;
}

export interface GetRLActionResponse {
  action: RLAction;
  expectedReward: number;
  stateValue: number;
  actionProbabilities: Record<string, number>;
}

// Trains reinforcement learning model for pricing optimization.
export const trainRLModel = api<TrainRLModelRequest, TrainRLModelResponse>(
  { auth: true, expose: true, method: "POST", path: "/learning/rl/train" },
  async (req) => {
    const auth = getAuthData()!;

    try {
      // Get eligible listings for training
      const eligibleListings = await getEligibleListingsForRL(auth.userID, req.categoryId, req.listingIds);
      
      if (eligibleListings.length === 0) {
        throw APIError.invalidArgument("No eligible listings found for RL training");
      }

      const learningRate = req.learningRate || 0.001;
      const discountFactor = req.discountFactor || 0.95;
      let explorationRate = req.explorationRate || 0.1;

      let totalReward = 0;
      let episodesCompleted = 0;
      const convergenceMetrics = { policyLoss: 0, valueLoss: 0, entropy: 0 };

      // Training loop
      for (let episode = 0; episode < req.episodes; episode++) {
        // Select random listing for this episode
        const listingId = eligibleListings[Math.floor(Math.random() * eligibleListings.length)];
        
        // Run episode
        const episodeResult = await runRLEpisode(
          listingId,
          learningRate,
          discountFactor,
          explorationRate
        );

        totalReward += episodeResult.totalReward;
        episodesCompleted++;

        // Update policy and value function
        await updateRLModel(episodeResult, learningRate);

        // Decay exploration rate
        explorationRate *= 0.995;

        // Calculate convergence metrics every 10 episodes
        if (episode % 10 === 0) {
          const metrics = await calculateConvergenceMetrics();
          convergenceMetrics.policyLoss = metrics.policyLoss;
          convergenceMetrics.valueLoss = metrics.valueLoss;
          convergenceMetrics.entropy = metrics.entropy;
        }
      }

      // Calculate final performance metrics
      const modelPerformance = await calculateModelPerformance(eligibleListings);

      return {
        episodesCompleted,
        avgReward: totalReward / episodesCompleted,
        convergenceMetrics,
        modelPerformance,
      };
    } catch (error) {
      console.error('Error training RL model:', error);
      throw APIError.internal("Failed to train reinforcement learning model");
    }
  }
);

// Gets optimal action from trained RL model.
export const getRLAction = api<GetRLActionRequest, GetRLActionResponse>(
  { auth: true, expose: true, method: "POST", path: "/learning/rl/action" },
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

      // Get current state representation
      const stateHash = hashState(req.currentState);
      
      // Get Q-values for all possible actions
      const qValues = await learningDB.queryAll`
        SELECT action, q_value FROM q_values WHERE state_hash = ${stateHash}
        ORDER BY q_value DESC
      `;

      let selectedAction: RLAction;
      let expectedReward = 0;
      let actionProbabilities: Record<string, number> = {};

      if (qValues.length === 0 || (req.explorationMode && Math.random() < 0.1)) {
        // Exploration: random action
        selectedAction = generateRandomAction();
        expectedReward = 0;
      } else {
        // Exploitation: best known action
        const bestAction = qValues[0];
        selectedAction = parseAction(bestAction.action);
        expectedReward = bestAction.q_value;

        // Calculate action probabilities using softmax
        const temperature = 1.0;
        const expValues = qValues.map(q => Math.exp(q.q_value / temperature));
        const sumExp = expValues.reduce((sum, val) => sum + val, 0);
        
        qValues.forEach((q, index) => {
          actionProbabilities[q.action] = expValues[index] / sumExp;
        });
      }

      // Estimate state value
      const stateValue = qValues.length > 0 ? 
        qValues.reduce((sum, q) => sum + q.q_value, 0) / qValues.length : 0;

      // Store state for learning
      await storeRLState(req.listingId, req.currentState, selectedAction);

      return {
        action: selectedAction,
        expectedReward,
        stateValue,
        actionProbabilities,
      };
    } catch (error) {
      console.error('Error getting RL action:', error);
      throw APIError.internal("Failed to get RL action");
    }
  }
);

// Records reward for RL learning.
export const recordRLReward = api<{ listingId: string; reward: RLReward; nextState?: RLState }, { success: boolean }>(
  { auth: true, expose: true, method: "POST", path: "/learning/rl/reward" },
  async (req) => {
    const auth = getAuthData()!;

    try {
      // Get the most recent state for this listing
      const lastState = await learningDB.queryRow`
        SELECT * FROM rl_states 
        WHERE listing_id = ${req.listingId}
        ORDER BY created_at DESC
        LIMIT 1
      `;

      if (!lastState) {
        throw APIError.notFound("No previous state found for listing");
      }

      // Update the state with reward and next state
      await learningDB.exec`
        UPDATE rl_states 
        SET 
          reward = ${req.reward.total},
          next_state_vector = ${JSON.stringify(req.nextState?.features)},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${lastState.id}
      `;

      // Update Q-values using temporal difference learning
      if (req.nextState) {
        await updateQValues(lastState, req.reward, req.nextState);
      }

      return { success: true };
    } catch (error) {
      console.error('Error recording RL reward:', error);
      throw APIError.internal("Failed to record RL reward");
    }
  }
);

async function getEligibleListingsForRL(userId: string, categoryId?: string, listingIds?: string[]): Promise<string[]> {
  let whereClause = "WHERE user_id = $1 AND listing_status = 'active'";
  const params: any[] = [userId];

  if (categoryId) {
    whereClause += " AND category_id = $2";
    params.push(categoryId);
  }

  if (listingIds && listingIds.length > 0) {
    whereClause += ` AND id = ANY($${params.length + 1})`;
    params.push(listingIds);
  }

  const listings = await ebayDB.rawQueryAll(
    `SELECT id FROM listings ${whereClause} 
     ORDER BY views DESC, watchers DESC 
     LIMIT 100`,
    ...params
  );

  return listings.map(l => l.id);
}

async function runRLEpisode(
  listingId: string,
  learningRate: number,
  discountFactor: number,
  explorationRate: number
): Promise<RLEpisode> {
  const episodeId = `episode_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const states: RLState[] = [];
  const actions: RLAction[] = [];
  const rewards: RLReward[] = [];
  
  // Get initial state
  let currentState = await getCurrentState(listingId);
  states.push(currentState);

  const maxSteps = 10; // Maximum steps per episode
  let totalReward = 0;

  for (let step = 0; step < maxSteps; step++) {
    // Select action (epsilon-greedy)
    const action = Math.random() < explorationRate ? 
      generateRandomAction() : 
      await getBestAction(currentState);
    
    actions.push(action);

    // Simulate action execution and get reward
    const { reward, nextState } = await simulateAction(listingId, currentState, action);
    rewards.push(reward);
    totalReward += reward.total;

    // Store transition
    await storeRLTransition(episodeId, step, currentState, action, reward, nextState);

    // Move to next state
    currentState = nextState;
    states.push(currentState);

    // Check termination conditions
    if (shouldTerminateEpisode(currentState, action, reward)) {
      break;
    }
  }

  return {
    episodeId,
    listingId,
    states,
    actions,
    rewards,
    totalReward,
    episodeLength: actions.length,
    completed: true,
  };
}

async function getCurrentState(listingId: string): Promise<RLState> {
  // Get listing data
  const listing = await ebayDB.queryRow`
    SELECT * FROM listings WHERE id = ${listingId}
  `;

  if (!listing) {
    throw new Error(`Listing ${listingId} not found`);
  }

  // Get price history
  const priceHistory = await ebayDB.queryAll`
    SELECT new_price FROM price_history 
    WHERE listing_id = ${listingId}
    ORDER BY created_at DESC
    LIMIT 10
  `;

  // Get competitor prices (simplified)
  const competitors = await ebayDB.queryAll`
    SELECT current_price FROM listings
    WHERE category_id = ${listing.category_id}
      AND id != ${listingId}
      AND listing_status = 'active'
    ORDER BY views DESC
    LIMIT 5
  `;

  // Calculate derived features
  const daysSinceListing = Math.floor(
    (Date.now() - new Date(listing.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    listingId,
    features: {
      currentPrice: listing.current_price,
      originalPrice: listing.original_price,
      priceHistory: priceHistory.map(p => p.new_price),
      views: listing.views,
      watchers: listing.watchers,
      competitorPrices: competitors.map(c => c.current_price),
      marketTrend: 0.02, // Simplified market trend
      seasonalFactor: getSeasonalFactor(),
      daysSinceListing,
      categoryDemand: 0.5, // Simplified category demand
    },
  };
}

function generateRandomAction(): RLAction {
  const actionTypes = ['increase', 'decrease', 'maintain'];
  const actionType = actionTypes[Math.floor(Math.random() * actionTypes.length)] as 'increase' | 'decrease' | 'maintain';
  
  let magnitude = 0;
  if (actionType !== 'maintain') {
    magnitude = Math.random() * 0.2; // Up to 20% change
  }

  return {
    actionType,
    magnitude,
    confidence: 0.5 + Math.random() * 0.5,
  };
}

async function getBestAction(state: RLState): Promise<RLAction> {
  const stateHash = hashState(state);
  
  const bestQ = await learningDB.queryRow`
    SELECT action, q_value FROM q_values 
    WHERE state_hash = ${stateHash}
    ORDER BY q_value DESC
    LIMIT 1
  `;

  if (bestQ) {
    return parseAction(bestQ.action);
  } else {
    return generateRandomAction();
  }
}

async function simulateAction(
  listingId: string,
  state: RLState,
  action: RLAction
): Promise<{ reward: RLReward; nextState: RLState }> {
  // Simulate the effect of the pricing action
  let newPrice = state.features.currentPrice;
  
  if (action.actionType === 'increase') {
    newPrice *= (1 + action.magnitude);
  } else if (action.actionType === 'decrease') {
    newPrice *= (1 - action.magnitude);
  }

  // Simulate market response (simplified)
  const priceChange = (newPrice - state.features.currentPrice) / state.features.currentPrice;
  const demandElasticity = -1.2; // Price elasticity of demand
  const demandChange = demandElasticity * priceChange;
  
  // Calculate rewards
  const revenueChange = priceChange + demandChange + (priceChange * demandChange);
  const immediateReward = Math.max(-1, Math.min(1, revenueChange));
  
  // Long-term reward considers market position
  const competitorAvg = state.features.competitorPrices.reduce((sum, p) => sum + p, 0) / 
                       Math.max(1, state.features.competitorPrices.length);
  const marketPositionReward = newPrice < competitorAvg * 1.1 ? 0.1 : -0.1;
  
  const reward: RLReward = {
    immediate: immediateReward,
    delayed: marketPositionReward,
    total: immediateReward + marketPositionReward * 0.5,
  };

  // Create next state
  const nextState: RLState = {
    ...state,
    features: {
      ...state.features,
      currentPrice: newPrice,
      priceHistory: [newPrice, ...state.features.priceHistory.slice(0, 9)],
      views: Math.max(0, state.features.views + Math.floor(demandChange * 100)),
      watchers: Math.max(0, state.features.watchers + Math.floor(demandChange * 10)),
    },
  };

  return { reward, nextState };
}

function hashState(state: RLState): string {
  // Create a hash of the state features for Q-table lookup
  const features = state.features;
  const stateString = [
    Math.round(features.currentPrice * 100),
    Math.round(features.originalPrice * 100),
    features.views,
    features.watchers,
    Math.round(features.marketTrend * 100),
    Math.round(features.seasonalFactor * 100),
    features.daysSinceListing,
  ].join('_');

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < stateString.length; i++) {
    const char = stateString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return Math.abs(hash).toString(36);
}

function parseAction(actionString: string): RLAction {
  try {
    return JSON.parse(actionString);
  } catch {
    return generateRandomAction();
  }
}

async function storeRLState(listingId: string, state: RLState, action: RLAction): Promise<void> {
  const episodeId = `current_${listingId}`;
  
  await learningDB.exec`
    INSERT INTO rl_states (listing_id, state_vector, action_taken, episode_id, step_number)
    VALUES (${listingId}, ${JSON.stringify(state.features)}, ${JSON.stringify(action)}, ${episodeId}, 0)
  `;
}

async function storeRLTransition(
  episodeId: string,
  step: number,
  state: RLState,
  action: RLAction,
  reward: RLReward,
  nextState: RLState
): Promise<void> {
  await learningDB.exec`
    INSERT INTO rl_states (
      listing_id, state_vector, action_taken, reward, 
      next_state_vector, episode_id, step_number
    ) VALUES (
      ${state.listingId}, ${JSON.stringify(state.features)}, ${JSON.stringify(action)},
      ${reward.total}, ${JSON.stringify(nextState.features)}, ${episodeId}, ${step}
    )
  `;
}

async function updateQValues(lastState: any, reward: RLReward, nextState: RLState): Promise<void> {
  const stateHash = hashState(JSON.parse(lastState.state_vector));
  const action = lastState.action_taken;
  const nextStateHash = hashState(nextState);
  
  // Get current Q-value
  const currentQ = await learningDB.queryRow`
    SELECT q_value, visit_count FROM q_values 
    WHERE state_hash = ${stateHash} AND action = ${action}
  `;

  // Get max Q-value for next state
  const nextMaxQ = await learningDB.queryRow`
    SELECT MAX(q_value) as max_q FROM q_values WHERE state_hash = ${nextStateHash}
  `;

  const learningRate = 0.1;
  const discountFactor = 0.95;
  const oldQ = currentQ?.q_value || 0;
  const maxNextQ = nextMaxQ?.max_q || 0;
  
  // Q-learning update: Q(s,a) = Q(s,a) + α[r + γ*max(Q(s',a')) - Q(s,a)]
  const newQ = oldQ + learningRate * (reward.total + discountFactor * maxNextQ - oldQ);

  if (currentQ) {
    // Update existing Q-value
    await learningDB.exec`
      UPDATE q_values 
      SET q_value = ${newQ}, visit_count = visit_count + 1, last_updated = CURRENT_TIMESTAMP
      WHERE state_hash = ${stateHash} AND action = ${action}
    `;
  } else {
    // Insert new Q-value
    await learningDB.exec`
      INSERT INTO q_values (state_hash, action, q_value, visit_count)
      VALUES (${stateHash}, ${action}, ${newQ}, 1)
    `;
  }
}

async function updateRLModel(episode: RLEpisode, learningRate: number): Promise<void> {
  // Update Q-values for all state-action pairs in the episode
  for (let i = 0; i < episode.actions.length; i++) {
    const state = episode.states[i];
    const action = episode.actions[i];
    const reward = episode.rewards[i];
    const nextState = episode.states[i + 1];

    if (nextState) {
      // Simulate the lastState structure for updateQValues
      const lastState = {
        state_vector: JSON.stringify(state.features),
        action_taken: JSON.stringify(action),
      };
      
      await updateQValues(lastState, reward, nextState);
    }
  }
}

function shouldTerminateEpisode(state: RLState, action: RLAction, reward: RLReward): boolean {
  // Terminate if reward is very negative (bad action)
  if (reward.total < -0.8) return true;
  
  // Terminate if price becomes unreasonable
  if (state.features.currentPrice < state.features.originalPrice * 0.5) return true;
  if (state.features.currentPrice > state.features.originalPrice * 2.0) return true;
  
  return false;
}

async function calculateConvergenceMetrics(): Promise<{ policyLoss: number; valueLoss: number; entropy: number }> {
  // Simplified convergence metrics
  const recentStates = await learningDB.queryAll`
    SELECT reward FROM rl_states 
    WHERE created_at >= NOW() - INTERVAL '1 hour'
    ORDER BY created_at DESC
    LIMIT 100
  `;

  const rewards = recentStates.map(s => s.reward || 0);
  const avgReward = rewards.reduce((sum, r) => sum + r, 0) / Math.max(1, rewards.length);
  const variance = rewards.reduce((sum, r) => sum + Math.pow(r - avgReward, 2), 0) / Math.max(1, rewards.length);

  return {
    policyLoss: variance, // Simplified policy loss
    valueLoss: Math.abs(avgReward), // Simplified value loss
    entropy: Math.min(1, variance), // Simplified entropy
  };
}

async function calculateModelPerformance(listingIds: string[]): Promise<{ successRate: number; avgReturn: number; explorationRate: number }> {
  const recentEpisodes = await learningDB.queryAll`
    SELECT AVG(reward) as avg_reward, COUNT(*) as count
    FROM rl_states 
    WHERE listing_id = ANY(${listingIds})
      AND created_at >= NOW() - INTERVAL '24 hours'
    GROUP BY episode_id
  `;

  const successfulEpisodes = recentEpisodes.filter(e => e.avg_reward > 0);
  const successRate = recentEpisodes.length > 0 ? successfulEpisodes.length / recentEpisodes.length : 0;
  const avgReturn = recentEpisodes.reduce((sum, e) => sum + e.avg_reward, 0) / Math.max(1, recentEpisodes.length);

  return {
    successRate,
    avgReturn,
    explorationRate: 0.1, // Current exploration rate
  };
}

function getSeasonalFactor(): number {
  const month = new Date().getMonth() + 1;
  const seasonalFactors: Record<number, number> = {
    1: 0.9, 2: 0.95, 3: 1.0, 4: 1.05, 5: 1.1, 6: 1.05,
    7: 1.0, 8: 1.0, 9: 1.05, 10: 1.1, 11: 1.2, 12: 1.3
  };
  return seasonalFactors[month] || 1.0;
}
