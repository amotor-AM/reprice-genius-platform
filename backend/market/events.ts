import { Topic } from "encore.dev/pubsub";

export interface MarketEvent {
  eventType: 'trend_update' | 'competitor_price_change' | 'new_opportunity';
  payload: any;
  timestamp: Date;
}

export const marketEventsTopic = new Topic<MarketEvent>("market-events", {
  deliveryGuarantee: "at-least-once",
});
