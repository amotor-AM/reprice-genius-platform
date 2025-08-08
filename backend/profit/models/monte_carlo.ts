// This file contains the logic for Monte Carlo simulations.

export async function runMonteCarloSimulation(params: {
  listingId: string;
  priceChangePercent: number;
  simulations: number;
}) {
  const outcomes: number[] = [];
  let profitableSimulations = 0;

  for (let i = 0; i < params.simulations; i++) {
    // Simulate market variables with randomness
    const demandChange = -1.2 * params.priceChangePercent + (Math.random() - 0.5) * 0.1;
    const competitorResponse = (Math.random() - 0.5) * 0.05;
    
    const finalPriceChange = params.priceChangePercent + competitorResponse;
    const finalDemandChange = demandChange * (1 + (Math.random() - 0.5) * 0.2);

    // Simplified profit calculation
    const profit = (1 + finalPriceChange) * (1 + finalDemandChange) - 1;
    outcomes.push(profit * 1000); // Scale to a reasonable number

    if (profit > 0) {
      profitableSimulations++;
    }
  }

  const meanProfit = outcomes.reduce((sum, p) => sum + p, 0) / outcomes.length;
  const probabilityOfProfit = profitableSimulations / params.simulations;

  // Create a histogram for the distribution
  const distribution: Record<string, number> = {};
  outcomes.forEach(o => {
    const bin = Math.floor(o / 50) * 50;
    distribution[bin] = (distribution[bin] || 0) + 1;
  });

  return {
    outcomes,
    meanProfit,
    probabilityOfProfit,
    distribution,
  };
}
