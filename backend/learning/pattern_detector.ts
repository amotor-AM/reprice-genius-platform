import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { learningDB } from "./db";
import { ebayDB } from "../ebay/db";

export interface DetectPatternsRequest {
  categoryId?: string;
  brandId?: string;
  timeRangeStart?: Date;
  timeRangeEnd?: Date;
  patternTypes?: string[];
  minConfidence?: number;
  minSampleSize?: number;
}

export interface MarketPattern {
  id: number;
  patternType: string;
  patternName: string;
  description: string;
  strength: number;
  confidence: number;
  sampleSize: number;
  patternData: Record<string, any>;
  seasonality?: Record<string, any>;
  frequency: string;
  durationDays: number;
  predictionAccuracy?: number;
  status: string;
  firstDetected: Date;
  lastObserved: Date;
}

export interface DetectPatternsResponse {
  patterns: MarketPattern[];
  newPatternsDetected: number;
  updatedPatterns: number;
  insights: {
    strongestPattern: MarketPattern | null;
    emergingTrends: string[];
    recommendations: string[];
  };
}

export interface CompetitorResponsePattern {
  competitorId: string;
  avgResponseTime: number; // hours
  avgResponseMagnitude: number; // percentage
  responseFrequency: number; // 0-1
  confidence: number;
}

export interface SeasonalPattern {
  month: number;
  avgPriceMultiplier: number;
  salesVelocityMultiplier: number;
  confidence: number;
  sampleSize: number;
}

// Detects new market patterns using machine learning and statistical analysis.
export const detectPatterns = api<DetectPatternsRequest, DetectPatternsResponse>(
  { auth: true, expose: true, method: "POST", path: "/learning/pattern/detect" },
  async (req) => {
    const auth = getAuthData()!;

    try {
      const timeRangeStart = req.timeRangeStart || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
      const timeRangeEnd = req.timeRangeEnd || new Date();
      const minConfidence = req.minConfidence || 0.7;
      const minSampleSize = req.minSampleSize || 10;

      let newPatternsDetected = 0;
      let updatedPatterns = 0;
      const detectedPatterns: MarketPattern[] = [];

      // Detect different types of patterns
      const patternTypes = req.patternTypes || ['seasonal', 'competitor_response', 'demand_spike', 'price_elasticity'];

      for (const patternType of patternTypes) {
        const patterns = await detectPatternType(
          patternType,
          req.categoryId,
          req.brandId,
          timeRangeStart,
          timeRangeEnd,
          minConfidence,
          minSampleSize
        );

        for (const pattern of patterns) {
          const existingPattern = await findExistingPattern(pattern);
          
          if (existingPattern) {
            await updateExistingPattern(existingPattern.id, pattern);
            updatedPatterns++;
          } else {
            const newPattern = await createNewPattern(pattern);
            newPatternsDetected++;
            detectedPatterns.push(newPattern);
          }
        }
      }

      // Get all patterns for insights
      const allPatterns = await getAllPatterns(req.categoryId, req.brandId, minConfidence);
      
      // Generate insights
      const insights = generatePatternInsights(allPatterns);

      return {
        patterns: allPatterns,
        newPatternsDetected,
        updatedPatterns,
        insights,
      };
    } catch (error) {
      console.error('Error detecting patterns:', error);
      throw APIError.internal("Failed to detect market patterns");
    }
  }
);

async function detectPatternType(
  patternType: string,
  categoryId?: string,
  brandId?: string,
  timeRangeStart?: Date,
  timeRangeEnd?: Date,
  minConfidence?: number,
  minSampleSize?: number
): Promise<Partial<MarketPattern>[]> {
  switch (patternType) {
    case 'seasonal':
      return await detectSeasonalPatterns(categoryId, brandId, timeRangeStart, timeRangeEnd, minConfidence, minSampleSize);
    case 'competitor_response':
      return await detectCompetitorResponsePatterns(categoryId, brandId, timeRangeStart, timeRangeEnd, minConfidence, minSampleSize);
    case 'demand_spike':
      return await detectDemandSpikePatterns(categoryId, brandId, timeRangeStart, timeRangeEnd, minConfidence, minSampleSize);
    case 'price_elasticity':
      return await detectPriceElasticityPatterns(categoryId, brandId, timeRangeStart, timeRangeEnd, minConfidence, minSampleSize);
    default:
      return [];
  }
}

async function detectSeasonalPatterns(
  categoryId?: string,
  brandId?: string,
  timeRangeStart?: Date,
  timeRangeEnd?: Date,
  minConfidence?: number,
  minSampleSize?: number
): Promise<Partial<MarketPattern>[]> {
  // Analyze seasonal price and sales patterns
  let whereClause = "WHERE po.applied_at >= $1 AND po.applied_at <= $2";
  const params: any[] = [timeRangeStart, timeRangeEnd];

  if (categoryId) {
    whereClause += " AND l.category_id = $3";
    params.push(categoryId);
  }

  const seasonalData = await learningDB.rawQueryAll(
    `SELECT 
       EXTRACT(MONTH FROM po.applied_at) as month,
       AVG(po.new_price / po.old_price) as avg_price_ratio,
       AVG(po.sales_velocity_change) as avg_velocity_change,
       COUNT(*) as sample_size,
       STDDEV(po.new_price / po.old_price) as price_ratio_stddev
     FROM pricing_outcomes po
     JOIN listings l ON po.listing_id = l.id
     ${whereClause}
     GROUP BY EXTRACT(MONTH FROM po.applied_at)
     HAVING COUNT(*) >= ${minSampleSize || 10}
     ORDER BY month`,
    ...params
  );

  const patterns: Partial<MarketPattern>[] = [];

  if (seasonalData.length >= 6) { // Need at least 6 months of data
    // Calculate seasonal strength
    const avgRatios = seasonalData.map(d => d.avg_price_ratio);
    const overallAvg = avgRatios.reduce((sum, ratio) => sum + ratio, 0) / avgRatios.length;
    const variance = avgRatios.reduce((sum, ratio) => sum + Math.pow(ratio - overallAvg, 2), 0) / avgRatios.length;
    const strength = Math.sqrt(variance) / overallAvg;

    if (strength > 0.05) { // 5% seasonal variation threshold
      const confidence = Math.min(0.95, seasonalData.reduce((sum, d) => sum + d.sample_size, 0) / 100);
      
      if (confidence >= (minConfidence || 0.7)) {
        patterns.push({
          patternType: 'seasonal',
          patternName: 'Monthly Seasonal Price Pattern',
          description: `Detected ${(strength * 100).toFixed(1)}% seasonal price variation across months`,
          strength,
          confidence,
          sampleSize: seasonalData.reduce((sum, d) => sum + d.sample_size, 0),
          patternData: {
            monthlyData: seasonalData,
            peakMonth: seasonalData.reduce((peak, current) => 
              current.avg_price_ratio > peak.avg_price_ratio ? current : peak
            ).month,
            lowMonth: seasonalData.reduce((low, current) => 
              current.avg_price_ratio < low.avg_price_ratio ? current : low
            ).month,
          },
          seasonality: {
            type: 'monthly',
            strength,
            data: seasonalData,
          },
          frequency: 'yearly',
          durationDays: 365,
          status: 'active',
        });
      }
    }
  }

  return patterns;
}

async function detectCompetitorResponsePatterns(
  categoryId?: string,
  brandId?: string,
  timeRangeStart?: Date,
  timeRangeEnd?: Date,
  minConfidence?: number,
  minSampleSize?: number
): Promise<Partial<MarketPattern>[]> {
  // Analyze competitor response patterns
  let whereClause = "WHERE po.applied_at >= $1 AND po.applied_at <= $2 AND po.competitor_responses IS NOT NULL";
  const params: any[] = [timeRangeStart, timeRangeEnd];

  if (categoryId) {
    whereClause += " AND l.category_id = $3";
    params.push(categoryId);
  }

  const competitorData = await learningDB.rawQueryAll(
    `SELECT 
       po.competitor_responses,
       po.price_change_percent,
       po.applied_at
     FROM pricing_outcomes po
     JOIN listings l ON po.listing_id = l.id
     ${whereClause}`,
    ...params
  );

  if (competitorData.length < (minSampleSize || 10)) {
    return [];
  }

  // Analyze response patterns
  const responseAnalysis = analyzeCompetitorResponses(competitorData);
  
  if (responseAnalysis.avgResponseRate > 0.3) { // 30% response rate threshold
    const strength = responseAnalysis.avgResponseRate;
    const confidence = Math.min(0.95, competitorData.length / 50);

    if (confidence >= (minConfidence || 0.7)) {
      return [{
        patternType: 'competitor_response',
        patternName: 'Competitor Price Response Pattern',
        description: `Competitors respond to ${(responseAnalysis.avgResponseRate * 100).toFixed(1)}% of price changes within ${responseAnalysis.avgResponseTime.toFixed(1)} hours`,
        strength,
        confidence,
        sampleSize: competitorData.length,
        patternData: {
          avgResponseRate: responseAnalysis.avgResponseRate,
          avgResponseTime: responseAnalysis.avgResponseTime,
          avgResponseMagnitude: responseAnalysis.avgResponseMagnitude,
          responsesByMagnitude: responseAnalysis.responsesByMagnitude,
        },
        frequency: 'event_driven',
        durationDays: 7, // Typical response window
        status: 'active',
      }];
    }
  }

  return [];
}

async function detectDemandSpikePatterns(
  categoryId?: string,
  brandId?: string,
  timeRangeStart?: Date,
  timeRangeEnd?: Date,
  minConfidence?: number,
  minSampleSize?: number
): Promise<Partial<MarketPattern>[]> {
  // Analyze sudden demand spikes
  let whereClause = "WHERE po.applied_at >= $1 AND po.applied_at <= $2";
  const params: any[] = [timeRangeStart, timeRangeEnd];

  if (categoryId) {
    whereClause += " AND l.category_id = $3";
    params.push(categoryId);
  }

  const demandData = await learningDB.rawQueryAll(
    `SELECT 
       po.sales_velocity_change,
       po.views_after - po.views_before as view_change,
       po.watchers_after - po.watchers_before as watcher_change,
       po.applied_at,
       EXTRACT(DOW FROM po.applied_at) as day_of_week,
       EXTRACT(HOUR FROM po.applied_at) as hour_of_day
     FROM pricing_outcomes po
     JOIN listings l ON po.listing_id = l.id
     ${whereClause}
     ORDER BY po.applied_at`,
    ...params
  );

  if (demandData.length < (minSampleSize || 10)) {
    return [];
  }

  // Detect spike patterns
  const spikes = demandData.filter(d => d.sales_velocity_change > 0.5 || d.view_change > 100);
  
  if (spikes.length >= 3) {
    // Analyze timing patterns
    const hourlySpikes = analyzeTimingPatterns(spikes, 'hour_of_day');
    const dailySpikes = analyzeTimingPatterns(spikes, 'day_of_week');

    const patterns: Partial<MarketPattern>[] = [];

    // Check for hourly patterns
    if (hourlySpikes.strength > 0.3) {
      patterns.push({
        patternType: 'demand_spike',
        patternName: 'Hourly Demand Spike Pattern',
        description: `Demand spikes occur most frequently at hour ${hourlySpikes.peakTime}`,
        strength: hourlySpikes.strength,
        confidence: Math.min(0.9, spikes.length / 20),
        sampleSize: spikes.length,
        patternData: {
          peakHour: hourlySpikes.peakTime,
          spikeDistribution: hourlySpikes.distribution,
          avgSpikeIntensity: spikes.reduce((sum, s) => sum + s.sales_velocity_change, 0) / spikes.length,
        },
        frequency: 'daily',
        durationDays: 1,
        status: 'active',
      });
    }

    // Check for daily patterns
    if (dailySpikes.strength > 0.3) {
      patterns.push({
        patternType: 'demand_spike',
        patternName: 'Weekly Demand Spike Pattern',
        description: `Demand spikes occur most frequently on day ${dailySpikes.peakTime} of the week`,
        strength: dailySpikes.strength,
        confidence: Math.min(0.9, spikes.length / 20),
        sampleSize: spikes.length,
        patternData: {
          peakDay: dailySpikes.peakTime,
          spikeDistribution: dailySpikes.distribution,
          avgSpikeIntensity: spikes.reduce((sum, s) => sum + s.sales_velocity_change, 0) / spikes.length,
        },
        frequency: 'weekly',
        durationDays: 7,
        status: 'active',
      });
    }

    return patterns;
  }

  return [];
}

async function detectPriceElasticityPatterns(
  categoryId?: string,
  brandId?: string,
  timeRangeStart?: Date,
  timeRangeEnd?: Date,
  minConfidence?: number,
  minSampleSize?: number
): Promise<Partial<MarketPattern>[]> {
  // Analyze price elasticity of demand
  let whereClause = "WHERE po.applied_at >= $1 AND po.applied_at <= $2 AND po.price_change_percent != 0";
  const params: any[] = [timeRangeStart, timeRangeEnd];

  if (categoryId) {
    whereClause += " AND l.category_id = $3";
    params.push(categoryId);
  }

  const elasticityData = await learningDB.rawQueryAll(
    `SELECT 
       po.price_change_percent,
       po.sales_velocity_change,
       po.conversion_rate_after - po.conversion_rate_before as conversion_change,
       ABS(po.price_change_percent) as abs_price_change
     FROM pricing_outcomes po
     JOIN listings l ON po.listing_id = l.id
     ${whereClause}
     ORDER BY po.price_change_percent`,
    ...params
  );

  if (elasticityData.length < (minSampleSize || 10)) {
    return [];
  }

  // Calculate price elasticity
  const elasticity = calculatePriceElasticity(elasticityData);
  
  if (Math.abs(elasticity.coefficient) > 0.5 && elasticity.rSquared > 0.3) {
    const strength = Math.min(1.0, Math.abs(elasticity.coefficient) / 2);
    const confidence = Math.min(0.95, elasticity.rSquared);

    if (confidence >= (minConfidence || 0.7)) {
      return [{
        patternType: 'price_elasticity',
        patternName: 'Price Elasticity Pattern',
        description: `Price elasticity of ${elasticity.coefficient.toFixed(2)} detected (${elasticity.coefficient < -1 ? 'elastic' : 'inelastic'} demand)`,
        strength,
        confidence,
        sampleSize: elasticityData.length,
        patternData: {
          elasticityCoefficient: elasticity.coefficient,
          rSquared: elasticity.rSquared,
          demandType: elasticity.coefficient < -1 ? 'elastic' : 'inelastic',
          priceRanges: elasticity.priceRanges,
        },
        frequency: 'continuous',
        durationDays: 30,
        status: 'active',
      }];
    }
  }

  return [];
}

function analyzeCompetitorResponses(competitorData: any[]) {
  let totalResponses = 0;
  let totalResponseTime = 0;
  let totalResponseMagnitude = 0;
  let responseCount = 0;

  const responsesByMagnitude = {
    small: 0,   // < 5%
    medium: 0,  // 5-15%
    large: 0,   // > 15%
  };

  for (const data of competitorData) {
    const responses = data.competitor_responses || [];
    
    for (const response of responses) {
      if (response.priceChange && Math.abs(response.priceChange) > 0.01) {
        responseCount++;
        totalResponseTime += response.responseTime || 24; // Default 24 hours
        totalResponseMagnitude += Math.abs(response.priceChange);

        if (Math.abs(response.priceChange) < 0.05) {
          responsesByMagnitude.small++;
        } else if (Math.abs(response.priceChange) < 0.15) {
          responsesByMagnitude.medium++;
        } else {
          responsesByMagnitude.large++;
        }
      }
    }
    totalResponses++;
  }

  return {
    avgResponseRate: responseCount / Math.max(1, totalResponses),
    avgResponseTime: totalResponseTime / Math.max(1, responseCount),
    avgResponseMagnitude: totalResponseMagnitude / Math.max(1, responseCount),
    responsesByMagnitude,
  };
}

function analyzeTimingPatterns(spikes: any[], timeField: string) {
  const distribution: Record<number, number> = {};
  
  for (const spike of spikes) {
    const timeValue = spike[timeField];
    distribution[timeValue] = (distribution[timeValue] || 0) + 1;
  }

  const maxCount = Math.max(...Object.values(distribution));
  const peakTime = Object.keys(distribution).find(key => distribution[parseInt(key)] === maxCount);
  const totalSpikes = spikes.length;
  const strength = maxCount / totalSpikes;

  return {
    peakTime: parseInt(peakTime || '0'),
    strength,
    distribution,
  };
}

function calculatePriceElasticity(data: any[]) {
  // Simple linear regression to calculate price elasticity
  const n = data.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;

  for (const point of data) {
    const x = point.price_change_percent;
    const y = point.sales_velocity_change;
    
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
    sumYY += y * y;
  }

  const coefficient = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const correlation = (n * sumXY - sumX * sumY) / Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
  const rSquared = correlation * correlation;

  // Analyze by price ranges
  const priceRanges = {
    small: data.filter(d => Math.abs(d.price_change_percent) < 0.05),
    medium: data.filter(d => Math.abs(d.price_change_percent) >= 0.05 && Math.abs(d.price_change_percent) < 0.15),
    large: data.filter(d => Math.abs(d.price_change_percent) >= 0.15),
  };

  return {
    coefficient,
    rSquared,
    priceRanges: {
      small: priceRanges.small.length,
      medium: priceRanges.medium.length,
      large: priceRanges.large.length,
    },
  };
}

async function findExistingPattern(pattern: Partial<MarketPattern>) {
  const existing = await learningDB.queryRow`
    SELECT * FROM market_patterns 
    WHERE pattern_type = ${pattern.patternType} 
      AND pattern_name = ${pattern.patternName}
      AND category_id IS NOT DISTINCT FROM ${pattern.patternData?.categoryId}
  `;

  return existing;
}

async function updateExistingPattern(patternId: number, newPattern: Partial<MarketPattern>) {
  await learningDB.exec`
    UPDATE market_patterns 
    SET 
      strength = ${newPattern.strength},
      confidence = ${newPattern.confidence},
      sample_size = ${newPattern.sampleSize},
      pattern_data = ${JSON.stringify(newPattern.patternData)},
      last_observed = CURRENT_TIMESTAMP,
      validation_count = validation_count + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${patternId}
  `;
}

async function createNewPattern(pattern: Partial<MarketPattern>): Promise<MarketPattern> {
  const result = await learningDB.queryRow`
    INSERT INTO market_patterns (
      pattern_type, pattern_name, description, pattern_data,
      strength, confidence, sample_size, seasonality,
      frequency, duration_days, status
    ) VALUES (
      ${pattern.patternType}, ${pattern.patternName}, ${pattern.description},
      ${JSON.stringify(pattern.patternData)}, ${pattern.strength}, ${pattern.confidence},
      ${pattern.sampleSize}, ${JSON.stringify(pattern.seasonality)},
      ${pattern.frequency}, ${pattern.durationDays}, ${pattern.status}
    )
    RETURNING *
  `;

  return {
    id: result.id,
    patternType: result.pattern_type,
    patternName: result.pattern_name,
    description: result.description,
    strength: result.strength,
    confidence: result.confidence,
    sampleSize: result.sample_size,
    patternData: result.pattern_data,
    seasonality: result.seasonality,
    frequency: result.frequency,
    durationDays: result.duration_days,
    status: result.status,
    firstDetected: result.first_detected,
    lastObserved: result.last_observed,
  };
}

async function getAllPatterns(categoryId?: string, brandId?: string, minConfidence?: number): Promise<MarketPattern[]> {
  let whereClause = "WHERE confidence >= $1";
  const params: any[] = [minConfidence || 0.5];

  if (categoryId) {
    whereClause += " AND category_id = $2";
    params.push(categoryId);
  }

  const patterns = await learningDB.rawQueryAll(
    `SELECT * FROM market_patterns ${whereClause} 
     ORDER BY strength DESC, confidence DESC`,
    ...params
  );

  return patterns.map(p => ({
    id: p.id,
    patternType: p.pattern_type,
    patternName: p.pattern_name,
    description: p.description,
    strength: p.strength,
    confidence: p.confidence,
    sampleSize: p.sample_size,
    patternData: p.pattern_data,
    seasonality: p.seasonality,
    frequency: p.frequency,
    durationDays: p.duration_days,
    predictionAccuracy: p.prediction_accuracy,
    status: p.status,
    firstDetected: p.first_detected,
    lastObserved: p.last_observed,
  }));
}

function generatePatternInsights(patterns: MarketPattern[]) {
  const strongestPattern = patterns.length > 0 ? patterns[0] : null;
  
  const emergingTrends = patterns
    .filter(p => p.status === 'active' && p.strength > 0.7)
    .map(p => p.patternName)
    .slice(0, 3);

  const recommendations = [];

  if (strongestPattern) {
    recommendations.push(`Leverage ${strongestPattern.patternName} for pricing decisions`);
  }

  if (patterns.some(p => p.patternType === 'seasonal')) {
    recommendations.push('Consider seasonal pricing adjustments');
  }

  if (patterns.some(p => p.patternType === 'competitor_response')) {
    recommendations.push('Monitor competitor responses closely');
  }

  if (patterns.some(p => p.patternType === 'price_elasticity')) {
    const elasticPattern = patterns.find(p => p.patternType === 'price_elasticity');
    if (elasticPattern?.patternData?.demandType === 'elastic') {
      recommendations.push('Demand is price-sensitive - use conservative price changes');
    } else {
      recommendations.push('Demand is price-insensitive - consider premium pricing');
    }
  }

  return {
    strongestPattern,
    emergingTrends,
    recommendations,
  };
}
