// Simulates an ensemble forecasting model (ARIMA, Prophet, LSTM)

export async function forecastWithEnsemble(historicalData: any[], horizon: number) {
  // Simulate running multiple models and combining results
  const prophetForecast = simulateProphet(historicalData, horizon);
  const lstmForecast = simulateLstm(historicalData, horizon);

  const combinedForecast = prophetForecast.map((p, i) => {
    const lstmPoint = lstmForecast[i];
    const avgDemand = (p.predictedDemand * 0.6) + (lstmPoint.predictedDemand * 0.4);
    const lowerBound = Math.min(p.confidenceInterval.lower, lstmPoint.confidenceInterval.lower);
    const upperBound = Math.max(p.confidenceInterval.upper, lstmPoint.confidenceInterval.upper);
    return {
      date: p.date,
      predictedDemand: Math.round(avgDemand),
      confidenceInterval: { lower: Math.round(lowerBound), upper: Math.round(upperBound) },
    };
  });

  return {
    forecast: combinedForecast,
    modelsUsed: ['prophet', 'lstm'],
    confidence: 0.88,
    warnings: ['High market volatility may affect accuracy.'],
  };
}

function simulateProphet(data: any[], horizon: number) {
  // Simplified Prophet-like forecast with seasonality
  return Array.from({ length: horizon }, (_, i) => {
    const date = new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000);
    const seasonalFactor = 1 + 0.15 * Math.sin(date.getDay() * (2 * Math.PI / 7));
    const demand = (data[data.length - 1].sales || 10) * seasonalFactor;
    return {
      date: date.toISOString().split('T')[0],
      predictedDemand: demand,
      confidenceInterval: { lower: demand * 0.8, upper: demand * 1.2 },
    };
  });
}

function simulateLstm(data: any[], horizon: number) {
  // Simplified LSTM-like forecast based on recent trend
  let trend = (data[data.length - 1].sales - data[0].sales) / data.length;
  let lastValue = data[data.length - 1].sales;
  return Array.from({ length: horizon }, (_, i) => {
    lastValue += trend;
    const demand = Math.max(0, lastValue);
    return {
      date: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      predictedDemand: demand,
      confidenceInterval: { lower: demand * 0.75, upper: demand * 1.25 },
    };
  });
}
