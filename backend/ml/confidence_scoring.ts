import { api } from "encore.dev/api";
import { mlDB } from "./db";

export interface ConfidenceFactors {
  dataQuality: number;
  marketStability: number;
  historicalAccuracy: number;
  competitorData: number;
  seasonalReliability: number;
  modelPerformance: number;
}

export interface ConfidenceScoreRequest {
  listingId: string;
  analysisType: 'price_recommendation' | 'market_analysis' | 'similarity_search';
  inputData: any;
  modelVersion?: string;
}

export interface ConfidenceScoreResponse {
  overallConfidence: number;
  factors: ConfidenceFactors;
  reasoning: string[];
  recommendations: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

// Calculates comprehensive confidence scores for AI predictions.
export const calculateConfidenceScore = api<ConfidenceScoreRequest, ConfidenceScoreResponse>(
  { expose: true, method: "POST", path: "/ml/confidence/calculate" },
  async (req) => {
    try {
      const factors = await calculateConfidenceFactors(req.listingId, req.analysisType, req.inputData);
      const overallConfidence = calculateOverallConfidence(factors);
      const reasoning = generateConfidenceReasoning(factors);
      const recommendations = generateConfidenceRecommendations(factors, overallConfidence);
      const riskLevel = determineRiskLevel(overallConfidence, factors);
      
      // Store confidence analysis for learning
      await storeConfidenceAnalysis(req.listingId, req.analysisType, {
        overallConfidence,
        factors,
        reasoning,
        riskLevel,
      });
      
      return {
        overallConfidence,
        factors,
        reasoning,
        recommendations,
        riskLevel,
      };
    } catch (error) {
      console.error('Error calculating confidence score:', error);
      
      // Return conservative confidence score on error
      return {
        overallConfidence: 0.5,
        factors: getDefaultFactors(),
        reasoning: ['Error in confidence calculation - using conservative estimate'],
        recommendations: ['Manual review recommended due to calculation error'],
        riskLevel: 'high',
      };
    }
  }
);

async function calculateConfidenceFactors(
  listingId: string, 
  analysisType: string, 
  inputData: any
): Promise<ConfidenceFactors> {
  const [
    dataQuality,
    marketStability,
    historicalAccuracy,
    competitorData,
    seasonalReliability,
    modelPerformance
  ] = await Promise.all([
    calculateDataQuality(listingId, inputData),
    calculateMarketStability(listingId),
    calculateHistoricalAccuracy(listingId, analysisType),
    calculateCompetitorDataQuality(listingId),
    calculateSeasonalReliability(listingId),
    calculateModelPerformance(analysisType),
  ]);
  
  return {
    dataQuality,
    marketStability,
    historicalAccuracy,
    competitorData,
    seasonalReliability,
    modelPerformance,
  };
}

async function calculateDataQuality(listingId: string, inputData: any): Promise<number> {
  let score = 0.5; // Base score
  
  // Check listing data completeness
  const listing = await mlDB.queryRow`
    SELECT l.*, COUNT(ph.id) as price_history_count
    FROM listings l
    LEFT JOIN price_history ph ON l.id = ph.listing_id
    WHERE l.id = ${listingId}
    GROUP BY l.id
  `;
  
  if (listing) {
    // Title quality
    if (listing.title && listing.title.length > 20) score += 0.1;
    if (listing.title && listing.title.length > 50) score += 0.1;
    
    // Category and condition data
    if (listing.category_id && listing.category_id !== 'unknown') score += 0.1;
    if (listing.condition_id && listing.condition_id !== 'unknown') score += 0.1;
    
    // Engagement metrics
    if (listing.views > 10) score += 0.05;
    if (listing.views > 100) score += 0.05;
    if (listing.watchers > 5) score += 0.05;
    
    // Price history
    if (listing.price_history_count > 0) score += 0.1;
    if (listing.price_history_count > 5) score += 0.1;
    
    // Image and description quality (simulated)
    if (listing.image_urls && listing.image_urls.length > 0) score += 0.05;
    if (listing.description && listing.description.length > 100) score += 0.05;
  }
  
  return Math.min(1.0, score);
}

async function calculateMarketStability(listingId: string): Promise<number> {
  // Analyze price volatility in the category
  const volatility = await mlDB.queryRow`
    SELECT 
      STDDEV(current_price) / AVG(current_price) as price_volatility,
      COUNT(*) as sample_size
    FROM listings l1
    JOIN listings l2 ON l1.category_id = l2.category_id
    WHERE l2.id = ${listingId}
      AND l1.created_at >= NOW() - INTERVAL '30 days'
      AND l1.listing_status = 'active'
  `;
  
  if (!volatility || volatility.sample_size < 5) {
    return 0.5; // Low confidence due to insufficient data
  }
  
  const volatilityRatio = volatility.price_volatility || 0;
  
  // Lower volatility = higher stability = higher confidence
  if (volatilityRatio < 0.1) return 0.9;
  if (volatilityRatio < 0.2) return 0.8;
  if (volatilityRatio < 0.3) return 0.7;
  if (volatilityRatio < 0.5) return 0.6;
  return 0.4;
}

async function calculateHistoricalAccuracy(listingId: string, analysisType: string): Promise<number> {
  // Get historical prediction accuracy for similar items
  const accuracy = await mlDB.queryRow`
    SELECT 
      AVG(CASE 
        WHEN ABS(predicted_value - actual_value) / actual_value < 0.1 THEN 1.0
        WHEN ABS(predicted_value - actual_value) / actual_value < 0.2 THEN 0.8
        WHEN ABS(predicted_value - actual_value) / actual_value < 0.3 THEN 0.6
        ELSE 0.4
      END) as accuracy_score,
      COUNT(*) as prediction_count
    FROM prediction_accuracy pa
    JOIN listings l ON pa.listing_id = l.id
    WHERE l.category_id = (SELECT category_id FROM listings WHERE id = ${listingId})
      AND pa.analysis_type = ${analysisType}
      AND pa.created_at >= NOW() - INTERVAL '90 days'
  `;
  
  if (!accuracy || accuracy.prediction_count < 3) {
    return 0.6; // Default confidence for new categories
  }
  
  return Math.min(1.0, accuracy.accuracy_score || 0.6);
}

async function calculateCompetitorDataQuality(listingId: string): Promise<number> {
  // Assess quality and quantity of competitor data
  const competitorData = await mlDB.queryRow`
    SELECT 
      COUNT(*) as competitor_count,
      AVG(views) as avg_views,
      AVG(watchers) as avg_watchers
    FROM listings l1
    JOIN listings l2 ON l1.category_id = l2.category_id
    WHERE l2.id = ${listingId}
      AND l1.id != ${listingId}
      AND l1.listing_status = 'active'
      AND l1.created_at >= NOW() - INTERVAL '60 days'
  `;
  
  if (!competitorData) return 0.3;
  
  let score = 0.3; // Base score
  
  // More competitors = better data
  if (competitorData.competitor_count > 5) score += 0.2;
  if (competitorData.competitor_count > 20) score += 0.2;
  if (competitorData.competitor_count > 50) score += 0.1;
  
  // Active competitors (with views/watchers) = better data
  if (competitorData.avg_views > 10) score += 0.1;
  if (competitorData.avg_watchers > 2) score += 0.1;
  
  return Math.min(1.0, score);
}

async function calculateSeasonalReliability(listingId: string): Promise<number> {
  // Analyze seasonal patterns and current season alignment
  const currentMonth = new Date().getMonth() + 1;
  
  const seasonalData = await mlDB.queryRow`
    SELECT 
      AVG(CASE WHEN EXTRACT(MONTH FROM created_at) = ${currentMonth} THEN current_price END) as current_month_avg,
      AVG(current_price) as overall_avg,
      COUNT(CASE WHEN EXTRACT(MONTH FROM created_at) = ${currentMonth} THEN 1 END) as current_month_count,
      COUNT(*) as total_count
    FROM listings l1
    JOIN listings l2 ON l1.category_id = l2.category_id
    WHERE l2.id = ${listingId}
      AND l1.created_at >= NOW() - INTERVAL '365 days'
  `;
  
  if (!seasonalData || seasonalData.current_month_count < 3) {
    return 0.6; // Moderate confidence without seasonal data
  }
  
  // If current month has sufficient data, higher confidence
  const monthlyDataRatio = seasonalData.current_month_count / seasonalData.total_count;
  
  if (monthlyDataRatio > 0.15) return 0.9; // Strong seasonal data
  if (monthlyDataRatio > 0.08) return 0.8; // Good seasonal data
  if (monthlyDataRatio > 0.04) return 0.7; // Moderate seasonal data
  return 0.6; // Limited seasonal data
}

async function calculateModelPerformance(analysisType: string): Promise<number> {
  // Get recent model performance metrics
  const performance = await mlDB.queryRow`
    SELECT 
      AVG(confidence_score) as avg_confidence,
      AVG(accuracy_score) as avg_accuracy,
      COUNT(*) as prediction_count
    FROM model_performance 
    WHERE analysis_type = ${analysisType}
      AND created_at >= NOW() - INTERVAL '30 days'
  `;
  
  if (!performance || performance.prediction_count < 10) {
    // Default performance for new models
    const defaultPerformance = {
      'price_recommendation': 0.75,
      'market_analysis': 0.70,
      'similarity_search': 0.80,
    };
    return defaultPerformance[analysisType] || 0.70;
  }
  
  // Combine confidence and accuracy
  const combinedScore = (performance.avg_confidence + performance.avg_accuracy) / 2;
  return Math.min(1.0, combinedScore || 0.70);
}

function calculateOverallConfidence(factors: ConfidenceFactors): number {
  // Weighted average of confidence factors
  const weights = {
    dataQuality: 0.25,
    marketStability: 0.20,
    historicalAccuracy: 0.20,
    competitorData: 0.15,
    seasonalReliability: 0.10,
    modelPerformance: 0.10,
  };
  
  return (
    factors.dataQuality * weights.dataQuality +
    factors.marketStability * weights.marketStability +
    factors.historicalAccuracy * weights.historicalAccuracy +
    factors.competitorData * weights.competitorData +
    factors.seasonalReliability * weights.seasonalReliability +
    factors.modelPerformance * weights.modelPerformance
  );
}

function generateConfidenceReasoning(factors: ConfidenceFactors): string[] {
  const reasoning: string[] = [];
  
  if (factors.dataQuality > 0.8) {
    reasoning.push('High-quality listing data with complete information');
  } else if (factors.dataQuality < 0.5) {
    reasoning.push('Limited listing data may affect prediction accuracy');
  }
  
  if (factors.marketStability > 0.8) {
    reasoning.push('Stable market conditions support reliable predictions');
  } else if (factors.marketStability < 0.5) {
    reasoning.push('Volatile market conditions increase prediction uncertainty');
  }
  
  if (factors.historicalAccuracy > 0.8) {
    reasoning.push('Strong historical prediction accuracy in this category');
  } else if (factors.historicalAccuracy < 0.6) {
    reasoning.push('Limited historical accuracy data for this category');
  }
  
  if (factors.competitorData > 0.7) {
    reasoning.push('Sufficient competitor data for market comparison');
  } else if (factors.competitorData < 0.5) {
    reasoning.push('Limited competitor data may affect market analysis');
  }
  
  return reasoning;
}

function generateConfidenceRecommendations(factors: ConfidenceFactors, overallConfidence: number): string[] {
  const recommendations: string[] = [];
  
  if (overallConfidence > 0.8) {
    recommendations.push('High confidence - safe to apply automated pricing');
  } else if (overallConfidence > 0.6) {
    recommendations.push('Moderate confidence - consider manual review');
  } else {
    recommendations.push('Low confidence - manual review strongly recommended');
  }
  
  if (factors.dataQuality < 0.6) {
    recommendations.push('Improve listing data quality (title, description, images)');
  }
  
  if (factors.competitorData < 0.5) {
    recommendations.push('Monitor competitor pricing more closely');
  }
  
  if (factors.marketStability < 0.5) {
    recommendations.push('Use conservative pricing in volatile market');
  }
  
  return recommendations;
}

function determineRiskLevel(overallConfidence: number, factors: ConfidenceFactors): 'low' | 'medium' | 'high' {
  if (overallConfidence > 0.8 && factors.marketStability > 0.7) {
    return 'low';
  } else if (overallConfidence > 0.6 && factors.dataQuality > 0.6) {
    return 'medium';
  } else {
    return 'high';
  }
}

function getDefaultFactors(): ConfidenceFactors {
  return {
    dataQuality: 0.5,
    marketStability: 0.5,
    historicalAccuracy: 0.5,
    competitorData: 0.5,
    seasonalReliability: 0.5,
    modelPerformance: 0.5,
  };
}

async function storeConfidenceAnalysis(listingId: string, analysisType: string, analysis: any): Promise<void> {
  try {
    await mlDB.exec`
      INSERT INTO confidence_analyses (listing_id, analysis_type, confidence_data, created_at)
      VALUES (${listingId}, ${analysisType}, ${JSON.stringify(analysis)}, CURRENT_TIMESTAMP)
    `;
  } catch (error) {
    console.error('Error storing confidence analysis:', error);
  }
}

// Track prediction accuracy for continuous learning
export async function trackPredictionAccuracy(
  listingId: string,
  analysisType: string,
  predictedValue: number,
  actualValue: number,
  confidenceScore: number
): Promise<void> {
  try {
    await mlDB.exec`
      INSERT INTO prediction_accuracy (
        listing_id, analysis_type, predicted_value, actual_value, 
        confidence_score, accuracy_score, created_at
      ) VALUES (
        ${listingId}, ${analysisType}, ${predictedValue}, ${actualValue},
        ${confidenceScore}, ${1 - Math.abs(predictedValue - actualValue) / actualValue}, 
        CURRENT_TIMESTAMP
      )
    `;
  } catch (error) {
    console.error('Error tracking prediction accuracy:', error);
  }
}
