import { Subscription } from "encore.dev/pubsub";
import { eventsDB } from "./db";
import { 
  listingTopic, ListingEvent,
  pricingTopic, PriceChangedEvent,
  marketTopic, MarketShiftEvent, CompetitorUpdatedEvent,
  salesTopic, SaleCompletedEvent,
  strategyTopic, StrategyChangedEvent,
  learningTopic, LearningCompleteEvent,
  orchestrationTopic, RepriceListingEvent
} from "./topics";
import { v4 as uuidv4 } from 'uuid';

// Generic event handler
async function logEvent(topicName: string, event: any) {
  await eventsDB.exec`
    INSERT INTO event_log (event_id, topic, event_type, payload, correlation_id)
    VALUES (${uuidv4()}, ${topicName}, ${event.eventType || 'unknown'}, ${JSON.stringify(event)}, ${event.correlationId || null})
  `;
}

// Subscriptions for logging
new Subscription(listingTopic, "log-listing-events", {
  handler: async (event: ListingEvent) => logEvent("listing-events", event),
});

new Subscription(pricingTopic, "log-pricing-events", {
  handler: async (event: PriceChangedEvent) => logEvent("pricing-events", event),
});

new Subscription(marketTopic, "log-market-events", {
  handler: async (event: MarketShiftEvent | CompetitorUpdatedEvent) => logEvent("market-events", event),
});

new Subscription(salesTopic, "log-sales-events", {
  handler: async (event: SaleCompletedEvent) => logEvent("sales-events", event),
});

new Subscription(strategyTopic, "log-strategy-events", {
  handler: async (event: StrategyChangedEvent) => logEvent("strategy-events", event),
});

new Subscription(learningTopic, "log-learning-events", {
  handler: async (event: LearningCompleteEvent) => logEvent("learning-events", event),
});

new Subscription(orchestrationTopic, "log-orchestration-events", {
  handler: async (event: RepriceListingEvent) => logEvent("orchestration-events", event),
});
