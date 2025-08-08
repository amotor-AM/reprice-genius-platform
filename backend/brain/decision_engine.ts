import { ml, profit, behavior, intel, adapt } from "~encore/clients";

export interface DecisionInputs {
  ml: any;
  profit: any;
  behavior: any;
  intel: any;
  adapt: any;
}

export interface MasterDecision {
  decisionType: 'price_change' | 'strategy_change';
  payload: {
    newPrice?: number;
    strategyId?: string;
  };
  confidence: number;
  reasoning: string[];
}

export async function gatherInputs(listingId: string): Promise<DecisionInputs> {
  const [mlRes, profitRes, behaviorRes, intelRes, adaptRes] = await Promise.allSettled([
    ml.predictPrice({ listingId }),
    profit.optimizePortfolio({ listingIds: [listingId], objective: 'maximize_profit' }),
    behavior.getPsychologicalStrategy({ listingId, strategyType: 'charm_pricing' }),
    intel.forecastDemand({ listingId, forecastHorizonDays: 7 }),
    adapt.getInstantResponse({ scenario: { listingId, eventType: 'decision_request', eventPayload: {} } }),
  ]);

  return {
    ml: mlRes.status === 'fulfilled' ? mlRes.value : { error: (mlRes as PromiseRejectedResult).reason },
    profit: profitRes.status === 'fulfilled' ? profitRes.value : { error: (profitRes as PromiseRejectedResult).reason },
    behavior: behaviorRes.status === 'fulfilled' ? behaviorRes.value : { error: (behaviorRes as PromiseRejectedResult).reason },
    intel: intelRes.status === 'fulfilled' ? intelRes.value : { error: (intelRes as PromiseRejectedResult).reason },
    adapt: adaptRes.status === 'fulfilled' ? adaptRes.value : { error: (adaptRes as PromiseRejectedResult).reason },
  };
}

export function makeMasterDecision(inputs: DecisionInputs, context: any): MasterDecision {
  const recommendations: { value: number; weight: number; service: string }[] = [];
  const reasoning: string[] = [];

  // Gather recommendations and their confidence scores
  if (inputs.ml && !inputs.ml.error && inputs.ml.predictedPrice) {
    recommendations.push({ value: inputs.ml.predictedPrice, weight: inputs.ml.confidence || 0.7, service: 'ML' });
    reasoning.push(`ML service predicted price: $${inputs.ml.predictedPrice.toFixed(2)} (confidence: ${inputs.ml.confidence?.toFixed(2)})`);
  }
  if (inputs.profit && !inputs.profit.error && inputs.profit.optimalAllocation?.[0]?.recommendedPrice) {
    const profitRec = inputs.profit.optimalAllocation[0];
    recommendations.push({ value: profitRec.recommendedPrice, weight: inputs.profit.confidence || 0.8, service: 'Profit' });
    reasoning.push(`Profit service recommended: $${profitRec.recommendedPrice.toFixed(2)} (confidence: ${inputs.profit.confidence?.toFixed(2)})`);
  }
  if (inputs.behavior && !inputs.behavior.error && inputs.behavior.recommendedAction?.newPrice) {
    recommendations.push({ value: inputs.behavior.recommendedAction.newPrice, weight: inputs.behavior.confidence || 0.6, service: 'Behavior' });
    reasoning.push(`Behavioral service suggested: $${inputs.behavior.recommendedAction.newPrice.toFixed(2)} (confidence: ${inputs.behavior.confidence?.toFixed(2)})`);
  }
  if (inputs.adapt && !inputs.adapt.error && inputs.adapt.action === 'price_change' && inputs.adapt.newPrice) {
    recommendations.push({ value: inputs.adapt.newPrice, weight: inputs.adapt.confidence || 0.9, service: 'Adapt' });
    reasoning.push(`Adapt service gave instant response: $${inputs.adapt.newPrice.toFixed(2)} (confidence: ${inputs.adapt.confidence?.toFixed(2)})`);
  }

  if (recommendations.length === 0) {
    reasoning.push("No valid recommendations from AI services, maintaining current price.");
    return {
      decisionType: 'price_change',
      payload: { newPrice: context.currentPrice },
      confidence: 0.3,
      reasoning,
    };
  }

  // Calculate weighted average based on confidence
  let finalPrice = 0;
  let totalWeight = 0;
  for (const rec of recommendations) {
    finalPrice += rec.value * rec.weight;
    totalWeight += rec.weight;
  }
  finalPrice /= totalWeight;

  // Calculate master confidence as the weighted average of individual confidences
  const masterConfidence = totalWeight > 0 ? recommendations.reduce((sum, rec) => sum + rec.weight * rec.weight, 0) / totalWeight : 0.5;

  reasoning.push(`Final decision combines these with a weighted average based on confidence scores.`);

  return {
    decisionType: 'price_change',
    payload: { newPrice: Math.round(finalPrice * 100) / 100 },
    confidence: masterConfidence,
    reasoning,
  };
}
