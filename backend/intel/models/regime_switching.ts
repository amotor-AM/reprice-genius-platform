// Simulates a market regime-switching model

export async function detectMarketRegime(categoryId: string, historicalData: any[]) {
  // Analyze volatility and trends to detect regime
  const prices = historicalData.map(d => d.price);
  const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
  const volatility = Math.sqrt(prices.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) / prices.length) / avgPrice;
  const trend = (prices[prices.length - 1] - prices[0]) / prices[0];

  if (volatility > 0.2) return 'volatile';
  if (trend > 0.05) return 'bullish';
  if (trend < -0.05) return 'bearish';
  return 'stable';
}
