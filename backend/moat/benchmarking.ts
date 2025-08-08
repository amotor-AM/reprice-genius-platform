import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { moatDB } from "./db";
import { analytics } from "~encore/clients";

export interface BenchmarkCompareRequest {
  listingId: string;
  metrics: Array<'profit_margin' | 'sales_velocity' | 'conversion_rate'>;
}

export interface BenchmarkComparison {
  metric: string;
  yourValue: number;
  peerAverage: number;
  percentile: number;
  interpretation: string;
}

export interface BenchmarkCompareResponse {
  listingId: string;
  comparisons: BenchmarkComparison[];
}

// Compares a listing's performance against anonymous peer benchmarks.
export const compare = api<BenchmarkCompareRequest, BenchmarkCompareResponse>(
  { auth: true, expose: true, method: "POST", path: "/moat/benchmark/compare" },
  async (req) => {
    const auth = getAuthData()!;
    
    // Get user's data for the listing (simulated)
    const yourData = await getYourListingData(req.listingId);

    const comparisons: BenchmarkComparison[] = [];

    for (const metric of req.metrics) {
      // Get peer benchmark data
      const peerData = await getPeerBenchmark(metric);

      const yourValue = yourData[metric] || 0;
      const peerAverage = peerData.p50 || 0;
      const percentile = calculatePercentile(yourValue, peerData);

      comparisons.push({
        metric,
        yourValue,
        peerAverage,
        percentile,
        interpretation: getInterpretation(percentile),
      });
    }

    return {
      listingId: req.listingId,
      comparisons,
    };
  }
);

async function getYourListingData(listingId: string): Promise<Record<string, number>> {
  // In a real app, this would fetch from the analytics service.
  // const data = await analytics.getListingPerformance({ listingId });
  return {
    profit_margin: Math.random() * 0.3 + 0.1, // 10-40%
    sales_velocity: Math.random() * 5 + 1, // 1-6 sales/week
    conversion_rate: Math.random() * 0.05 + 0.01, // 1-6%
  };
}

async function getPeerBenchmark(metric: string): Promise<any> {
  // Fetch or calculate peer benchmark data
  const benchmark = await moatDB.queryRow`
    SELECT data FROM community_benchmarks WHERE id = ${`metric:${metric}`}
  `;
  if (benchmark) return benchmark.data;

  // If not cached, calculate and store it (simplified)
  const peerData = {
    p25: Math.random() * 10,
    p50: Math.random() * 10 + 10,
    p75: Math.random() * 10 + 20,
    p90: Math.random() * 10 + 30,
  };
  await moatDB.exec`
    INSERT INTO community_benchmarks (id, benchmark_type, data, sample_size)
    VALUES (${`metric:${metric}`}, 'performance', ${JSON.stringify(peerData)}, 1000)
    ON CONFLICT (id, benchmark_type) DO UPDATE SET
      data = EXCLUDED.data,
      sample_size = EXCLUDED.sample_size,
      last_updated = NOW()
  `;
  return peerData;
}

function calculatePercentile(value: number, peerData: any): number {
  if (value < peerData.p25) return Math.floor(Math.random() * 25);
  if (value < peerData.p50) return Math.floor(Math.random() * 25) + 25;
  if (value < peerData.p75) return Math.floor(Math.random() * 25) + 50;
  if (value < peerData.p90) return Math.floor(Math.random() * 15) + 75;
  return Math.floor(Math.random() * 10) + 90;
}

function getInterpretation(percentile: number): string {
  if (percentile > 90) return "Excellent, in the top 10% of peers.";
  if (percentile > 75) return "Great, performing better than 75% of peers.";
  if (percentile > 50) return "Good, above average performance.";
  if (percentile > 25) return "Average, room for improvement.";
  return "Below average, significant opportunity for improvement.";
}
