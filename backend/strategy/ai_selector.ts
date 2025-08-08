import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { secret } from "encore.dev/config";
import { strategyDB } from "./db";
import { ebayDB } from "../ebay/db";
import { strategyTopic } from "../events/topics";

const geminiApiKey = secret("GeminiApiKey");

export interface SelectStrategyRequest {
  listingId: string;
  evaluatedStrategies: Array<{
    strategyId: string;
    strategyName: string;
    predictedOutcome: any;
    confidence: number;
    reasoning: string[];
  }>;
  marketContext: {
    currentPrice: number;
    competitorPrices: number[];
    demandSignals: any;
    marketTrend: string;
  };
  businessObjectives?: {
    primaryGoal: 'revenue' | 'profit' | 'market_share' | 'volume';
    riskTolerance: 'low' | 'medium' | 'high';
    timeHorizon: 'short' | 'medium' | 'long';
  };
}

export interface SelectStrategyResponse {
  selectedStrategy: {
    strategyId: string;
    strategyName: string;
    confidence: number;
    expectedOutcome: any;
  };
  aiReasoning: {
    primaryFactors: string[];
    riskAssessment: string;
    marketAnalysis: string;
    recommendation: string;
  };
  alternativeStrategies: Array<{
    strategyId: string;
    strategyName: string;
    score: number;
    reasoning: string;
  }>;
  implementationPlan: {
    immediateActions: string[];
    monitoringPoints: string[];
    adjustmentTriggers: string[];
  };
}

// Uses Gemini AI to select the optimal pricing strategy.
export const selectStrategy = api<SelectStrategyRequest, SelectStrategyResponse>(
  { auth: true, expose: true, method: "POST", path: "/strategy/select" },
  async (req) => {
    const auth = getAuthData()!;

    try {
      // Verify listing ownership
      const listing = await ebayDB.queryRow`
        SELECT * FROM listings WHERE id = ${req.listingId} AND user_id = ${auth.userID}
      `;

      if (!listing) {
        throw APIError.notFound("Listing not found");
      }

      // Prepare context for Gemini AI
      const aiContext = buildAIContext(req, listing);
      
      // Call Gemini AI for strategy selection
      const aiResponse = await callGeminiForStrategySelection(aiContext);
      
      // Parse AI response
      const selection = parseAIStrategySelection(aiResponse, req.evaluatedStrategies);
      
      // Store the selection
      await strategyDB.exec`
        INSERT INTO strategy_selections (
          listing_id, selected_strategy_id, ai_reasoning, confidence_score,
          alternative_strategies, market_context
        ) VALUES (
          ${req.listingId}, ${selection.selectedStrategy.strategyId},
          ${JSON.stringify(selection.aiReasoning)}, ${selection.selectedStrategy.confidence},
          ${JSON.stringify(selection.alternativeStrategies)}, ${JSON.stringify(req.marketContext)}
        )
      `;

      // Publish StrategyChanged event
      await strategyTopic.publish({
        listingId: req.listingId,
        userId: auth.userID,
        oldStrategyId: 'previous_strategy_id', // This would need to be fetched
        newStrategyId: selection.selectedStrategy.strategyId,
        reason: 'ai_selection',
        timestamp: new Date(),
      });

      return selection;
    } catch (error) {
      console.error('Error selecting strategy with AI:', error);
      throw APIError.internal("Failed to select optimal strategy");
    }
  }
);

function buildAIContext(req: SelectStrategyRequest, listing: any): string {
  const businessObjectives = req.businessObjectives || {
    primaryGoal: 'revenue',
    riskTolerance: 'medium',
    timeHorizon: 'medium'
  };

  return `
You are an expert pricing strategist for eBay. Analyze the following data and select the optimal pricing strategy.

PRODUCT INFORMATION:
- Title: ${listing.title}
- Current Price: $${req.marketContext.currentPrice}
- Category: ${listing.category_id || 'Unknown'}
- Views: ${listing.views || 0}
- Watchers: ${listing.watchers || 0}

BUSINESS OBJECTIVES:
- Primary Goal: ${businessObjectives.primaryGoal}
- Risk Tolerance: ${businessObjectives.riskTolerance}
- Time Horizon: ${businessObjectives.timeHorizon}

MARKET CONTEXT:
- Market Trend: ${req.marketContext.marketTrend}
- Competitor Prices: [${req.marketContext.competitorPrices.join(', ')}]
- Average Competitor Price: $${req.marketContext.competitorPrices.length > 0 ? 
    (req.marketContext.competitorPrices.reduce((sum, price) => sum + price, 0) / req.marketContext.competitorPrices.length).toFixed(2) : 'N/A'}
- Demand Signals: ${JSON.stringify(req.marketContext.demandSignals)}

EVALUATED STRATEGIES:
${req.evaluatedStrategies.map((strategy, index) => `
${index + 1}. ${strategy.strategyName} (ID: ${strategy.strategyId})
   - Confidence: ${(strategy.confidence * 100).toFixed(1)}%
   - Revenue Impact: ${(strategy.predictedOutcome.revenueImpact * 100).toFixed(1)}%
   - Profit Impact: ${(strategy.predictedOutcome.profitImpact * 100).toFixed(1)}%
   - Volume Impact: ${(strategy.predictedOutcome.volumeImpact * 100).toFixed(1)}%
   - Risk Level: ${strategy.predictedOutcome.riskLevel}
   - Reasoning: ${strategy.reasoning.join('; ')}
`).join('\n')}

ANALYSIS REQUIREMENTS:
1. Select the optimal strategy considering business objectives and market conditions
2. Provide detailed reasoning for your selection
3. Assess risks and provide mitigation strategies
4. Rank alternative strategies with brief explanations
5. Create an implementation plan with monitoring points

Respond in the following JSON format:
{
  "selectedStrategyId": "strategy_id",
  "confidence": 0.85,
  "primaryFactors": ["factor1", "factor2", "factor3"],
  "riskAssessment": "detailed risk analysis",
  "marketAnalysis": "market condition analysis",
  "recommendation": "specific recommendation with rationale",
  "alternativeStrategies": [
    {"strategyId": "alt1", "score": 0.8, "reasoning": "why this is second choice"},
    {"strategyId": "alt2", "score": 0.7, "reasoning": "why this is third choice"}
  ],
  "implementationPlan": {
    "immediateActions": ["action1", "action2"],
    "monitoringPoints": ["metric1", "metric2"],
    "adjustmentTriggers": ["trigger1", "trigger2"]
  }
}

Focus on data-driven decision making and provide actionable insights.
`;
}

async function callGeminiForStrategySelection(prompt: string): Promise<any> {
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey(),
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.2, // Lower temperature for more consistent strategy selection
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('No response from Gemini API');
    }

    const content = data.candidates[0].content.parts[0].text;
    
    // Try to parse as JSON
    try {
      return JSON.parse(content);
    } catch {
      // If not JSON, extract structured data from text
      return parseTextResponse(content);
    }
  } catch (error) {
    console.error('Gemini API call failed:', error);
    throw error;
  }
}

function parseTextResponse(text: string): any {
  // Fallback parsing for non-JSON responses
  const lines = text.split('\n');
  
  return {
    selectedStrategyId: extractValue(text, 'strategy', ''),
    confidence: 0.75,
    primaryFactors: extractArray(text, 'factor'),
    riskAssessment: extractSection(text, 'risk'),
    marketAnalysis: extractSection(text, 'market'),
    recommendation: extractSection(text, 'recommend'),
    alternativeStrategies: [],
    implementationPlan: {
      immediateActions: extractArray(text, 'action'),
      monitoringPoints: extractArray(text, 'monitor'),
      adjustmentTriggers: extractArray(text, 'trigger'),
    }
  };
}

function extractValue(text: string, key: string, defaultValue: string): string {
  const pattern = new RegExp(`${key}[:\\s]+(\\w+)`, 'i');
  const match = text.match(pattern);
  return match ? match[1] : defaultValue;
}

function extractArray(text: string, key: string): string[] {
  const pattern = new RegExp(`${key}[^\\[]*\\[([^\\]]+)\\]`, 'i');
  const match = text.match(pattern);
  
  if (match) {
    return match[1].split(',').map(item => item.trim().replace(/"/g, ''));
  }
  
  // Fallback: look for numbered lists
  const listPattern = new RegExp(`${key}[^\\n]*\\n([^\\n]*\\d+\\.[^\\n]*)+`, 'gi');
  const listMatch = text.match(listPattern);
  
  if (listMatch) {
    return listMatch[0].split('\n')
      .filter(line => /\d+\./.test(line))
      .map(line => line.replace(/\d+\.\s*/, '').trim())
      .slice(0, 3);
  }
  
  return [];
}

function extractSection(text: string, key: string): string {
  const pattern = new RegExp(`${key}[^\\n]*\\n([^\\n]{20,}[^\\n]*)`, 'i');
  const match = text.match(pattern);
  return match ? match[1].trim() : `${key} analysis not available`;
}

function parseAIStrategySelection(aiResponse: any, evaluatedStrategies: any[]): SelectStrategyResponse {
  // Find the selected strategy
  const selectedStrategyId = aiResponse.selectedStrategyId || evaluatedStrategies[0]?.strategyId;
  const selectedStrategy = evaluatedStrategies.find(s => s.strategyId === selectedStrategyId) || evaluatedStrategies[0];

  if (!selectedStrategy) {
    throw new Error('No valid strategy found');
  }

  // Build alternative strategies
  const alternativeStrategies = evaluatedStrategies
    .filter(s => s.strategyId !== selectedStrategyId)
    .slice(0, 3)
    .map((strategy, index) => {
      const altStrategy = aiResponse.alternativeStrategies?.find((alt: any) => alt.strategyId === strategy.strategyId);
      return {
        strategyId: strategy.strategyId,
        strategyName: strategy.strategyName,
        score: altStrategy?.score || (0.9 - index * 0.1),
        reasoning: altStrategy?.reasoning || `Alternative option with ${(strategy.confidence * 100).toFixed(1)}% confidence`,
      };
    });

  return {
    selectedStrategy: {
      strategyId: selectedStrategy.strategyId,
      strategyName: selectedStrategy.strategyName,
      confidence: aiResponse.confidence || selectedStrategy.confidence,
      expectedOutcome: selectedStrategy.predictedOutcome,
    },
    aiReasoning: {
      primaryFactors: aiResponse.primaryFactors || ['Market conditions', 'Competitive landscape', 'Risk assessment'],
      riskAssessment: aiResponse.riskAssessment || 'Moderate risk with good potential returns',
      marketAnalysis: aiResponse.marketAnalysis || 'Market conditions support the selected strategy',
      recommendation: aiResponse.recommendation || `${selectedStrategy.strategyName} is recommended based on current market conditions`,
    },
    alternativeStrategies,
    implementationPlan: aiResponse.implementationPlan || {
      immediateActions: ['Apply recommended price change', 'Monitor competitor responses'],
      monitoringPoints: ['Sales velocity', 'Competitor price changes', 'Market demand'],
      adjustmentTriggers: ['Significant competitor response', 'Demand pattern changes', 'Profit margin deviation'],
    },
  };
}
