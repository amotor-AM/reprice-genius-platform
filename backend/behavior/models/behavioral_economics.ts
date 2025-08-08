// Simulates behavioral economics models.

export function calculateCharmPrice(price: number): number {
  const floorPrice = Math.floor(price);
  if (price - floorPrice > 0.9) {
    return price; // Already a charm price
  }
  return floorPrice - 0.01;
}

export function getPriceAnchorEffect(currentPrice: number, referencePrice: number): number {
  if (referencePrice <= currentPrice) return 0;
  const diff = referencePrice - currentPrice;
  // The perceived value increases with the discount, but with diminishing returns.
  return Math.log1p(diff / currentPrice);
}

export function predictImpulseBuyProbability(listing: any, marketPsychology: any): number {
  let probability = 0.1; // Base probability
  
  // Scarcity
  if (listing.quantity < 5) probability += 0.15;
  
  // Urgency (e.g., from a "sale ends soon" tag)
  if (listing.tags?.includes('urgent')) probability += 0.2;
  
  // Market Greed
  if (marketPsychology.fearGreedIndex > 70) probability += 0.1;
  
  // Price point
  if (listing.currentPrice < 20) probability += 0.1;
  
  return Math.min(1.0, probability);
}
