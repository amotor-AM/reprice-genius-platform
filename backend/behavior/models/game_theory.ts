// Simulates game theory models for competitor response.

export interface Competitor {
  id: string;
  personality: 'Aggressive Pricer' | 'Follower' | 'Stable' | 'Niche Player';
  currentPrice: number;
}

export function predictCompetitorResponse(
  myPriceChange: number, // as a percentage
  competitor: Competitor
): { response: number; confidence: number } {
  let response = 0;
  let confidence = 0.7;

  switch (competitor.personality) {
    case 'Aggressive Pricer':
      // Will likely undercut any price drop.
      if (myPriceChange < -0.02) {
        response = myPriceChange * 1.1; // Undercut by 10% more
        confidence = 0.85;
      }
      break;
    case 'Follower':
      // Will likely match price changes.
      if (Math.abs(myPriceChange) > 0.01) {
        response = myPriceChange;
        confidence = 0.9;
      }
      break;
    case 'Stable':
      // Unlikely to react to small changes.
      if (Math.abs(myPriceChange) > 0.1) {
        response = myPriceChange * 0.5; // Reacts, but conservatively
        confidence = 0.7;
      }
      break;
    case 'Niche Player':
      // Unlikely to react unless their niche is threatened.
      response = 0;
      confidence = 0.8;
      break;
  }

  return { response, confidence };
}
