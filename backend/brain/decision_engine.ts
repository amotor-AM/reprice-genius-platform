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
    // Using a placeholder for profit optimization on a single item
    // profit.optimizePortfolio({ listingIds: [listingId], objective: 'maximize_profit' }),
    Promise.resolve({ status: 'fulfilled', value: { recommendedPrice: 110, confidence: 0.8 } }),
    behavior.getPsychologicalStrategy({ listingId, strategyType: 'charm_pricing' }),
    intel.forecastDemand({ listingId, forecastHorizonDays: 7 }),
    adapt.getInstantResponse({ scenario: { listingId, eventType: 'decision_request', eventPayload: {} } }),
  ]);

  return {
    ml: mlRes.status === 'fulfilled' ? mlRes.value : null,
    profit: profitRes.status === 'fulfilled' ? profitRes.value : null,
    behavior: behaviorRes.status === 'fulfilled' ? behaviorRes.value : null,
    intel: intelRes.status === 'fulfilled' ? intelRes.value : null,
    adapt: adaptRes.status === 'fulfilled' ? adaptRes.value : null,
  };
}

export function makeMasterDecision(inputs: DecisionInputs, context: any): MasterDecision {
  // 2. Combine outputs using a weighted model
  const priceRecommendations: { value: number; weight: number }[] = [];
  
  if (inputs.ml?.predictedPrice) {
    priceRecommendations.push({ value: inputs.ml.predictedPrice, weight: 0.4 });
  }
  if (inputs.profit?.recommendedPrice) {
    priceRecommendations.push({ value: inputs.profit.recommendedPrice, weight: 0.3 });
  }
  if (inputs.behavior?.recommendedAction?.newPrice) {
    priceRecommendations.push({ value: inputs.behavior.recommendedAction.newPrice, weight: 0.2 });
  }
  if (inputs.adapt?.action === 'price_change' && inputs.adapt.newPrice) {
    priceRecommendations.push({ value: inputs.adapt.newPrice, weight: 0.1 });
  }

  let finalPrice = 0;
  let totalWeight = 0;
  if (priceRecommendations.length > 0) {
    for (const rec of priceRecommendations) {
      finalPrice += rec.value * rec.weight;
      totalWeight += rec.weight;
    }
    finalPrice /= totalWeight;
  } else {
    finalPrice = context.currentPrice; // Fallback
  }

  // 3. Calculate master confidence
  const confidences = [
    inputs.ml?.confidence,
    inputs.profit?.confidence,
    inputs.behavior?.confidence,
    inputs.adapt?.confidence,
  ].filter(c => c !== undefined);
  
  const masterConfidence = confidences.length > 0 
    ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
    : 0.5;

  // 4. Generate reasoning
  const reasoning = [
    `ML service predicted price: $${inputs.ml?.predictedPrice?.toFixed(2)} (confidence: ${inputs.ml?.confidence?.toFixed(2)})`,
    `Profit service recommended: $${inputs.profit?.recommendedPrice?.toFixed(2)} (confidence: ${inputs.profit?.confidence?.toFixed(2)})`,
    `Behavioral service suggested: $${inputs.behavior?.recommendedAction?.newPrice?.toFixed(2)} (confidence: ${inputs.behavior?.confidence?.toFixed(2)})`,
    `Final decision combines these with a weighted average.`,
  ];

  return {
    decisionType: 'price_change',
    payload: { newPrice: Math.round(finalPrice * 100) / 100 },
    confidence: masterConfidence,
    reasoning,
  };
}
