import { Topic } from "encore.dev/pubsub";

// --- Event Payloads ---

export interface ListingEvent {
  listingId: string;
  userId: string;
  eventType: 'created' | 'updated' | 'deleted';
  timestamp: Date;
  payload?: any;
}

export interface PriceChangedEvent {
  listingId: string;
  userId: string;
  oldPrice: number;
  newPrice: number;
  reason: string;
  confidence: number;
  timestamp: Date;
}

export interface CompetitorUpdatedEvent {
  listingId: string;
  competitorId: string;
  newPrice: number;
  timestamp: Date;
  eventType: 'competitor_updated';
}

export interface SaleCompletedEvent {
  listingId: string;
  userId: string;
  price: number;
  quantity: number;
  timestamp: Date;
}

export interface MarketShiftEvent {
  categoryId: string;
  shiftType: 'demand_spike' | 'supply_change' | 'price_trend_change';
  magnitude: number;
  timestamp: Date;
  eventType: 'market_shift';
}

export interface StrategyChangedEvent {
  listingId: string;
  userId: string;
  oldStrategyId: string;
  newStrategyId: string;
  reason: string;
  timestamp: Date;
}

export interface LearningCompleteEvent {
  experimentId: string;
  userId: string;
  outcome: 'conclusive' | 'inconclusive';
  winningStrategyId?: string;
  timestamp: Date;
}

export interface RepriceListingEvent {
  listingId: string;
  userId: string;
  correlationId: string;
}

export interface AnalyticsEvent {
  eventType: 'sale' | 'price_change' | 'view';
  listingId: string;
  value: number;
  timestamp: Date;
}

// --- Topics ---

export const listingTopic = new Topic<ListingEvent>("listing-events", {
  deliveryGuarantee: "at-least-once",
});

export const pricingTopic = new Topic<PriceChangedEvent>("pricing-events", {
  deliveryGuarantee: "at-least-once",
});

export const marketTopic = new Topic<MarketShiftEvent | CompetitorUpdatedEvent>("market-events", {
  deliveryGuarantee: "at-least-once",
});

export const salesTopic = new Topic<SaleCompletedEvent>("sales-events", {
  deliveryGuarantee: "at-least-once",
});

export const strategyTopic = new Topic<StrategyChangedEvent>("strategy-events", {
  deliveryGuarantee: "at-least-once",
});

export const learningTopic = new Topic<LearningCompleteEvent>("learning-events", {
  deliveryGuarantee: "at-least-once",
});

export const orchestrationTopic = new Topic<RepriceListingEvent>("orchestration-events", {
  deliveryGuarantee: "at-least-once",
});

export const analyticsTopic = new Topic<AnalyticsEvent>("analytics-events", {
  deliveryGuarantee: "at-least-once",
});
