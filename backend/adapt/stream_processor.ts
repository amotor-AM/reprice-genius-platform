import { api } from "encore.dev/api";
import { Subscription } from "encore.dev/pubsub";
import { pricingTopic, salesTopic, PriceChangedEvent, SaleCompletedEvent } from "../events/topics";
import { adaptDB } from "./db";
import { detectMicroOpportunities } from "./models/cep";
import { updateOnlineModel } from "./models/online_learning";

export interface StreamEvent {
  eventType: string;
  payload: any;
  timestamp: Date;
}

// Processes a real-time event from the stream.
export const processStreamEvent = api<StreamEvent, { success: boolean }>(
  { expose: true, method: "POST", path: "/adapt/stream/process" },
  async (event) => {
    // This endpoint is for manual event injection.
    // The main processing happens via subscriptions.
    await handleEvent(event.eventType, event.payload);
    return { success: true };
  }
);

// Subscription for price change events
new Subscription(pricingTopic, "adapt-on-price-change", {
  handler: async (event: PriceChangedEvent) => {
    await handleEvent('price_changed', event);
  }
});

// Subscription for sales events
new Subscription(salesTopic, "adapt-on-sale", {
  handler: async (event: SaleCompletedEvent) => {
    await handleEvent('sale_completed', event);
  }
});

async function handleEvent(eventType: string, payload: any) {
  // 1. Update sliding window aggregations
  await updateSlidingWindows(eventType, payload);

  // 2. Run Complex Event Processing (CEP) for pattern detection
  const opportunities = await detectMicroOpportunities(eventType, payload);
  for (const opp of opportunities) {
    await adaptDB.exec`
      INSERT INTO micro_opportunities (opportunity_type, entity_id, entity_type, description, expires_at, confidence, metadata)
      VALUES (${opp.type}, ${opp.entityId}, ${opp.entityType}, ${opp.description}, ${opp.expiresAt}, ${opp.confidence}, ${JSON.stringify(opp.metadata)})
    `;
  }

  // 3. Update online learning models
  await updateOnlineModel(eventType, payload);

  // 4. Real-time feature engineering (can be part of window updates)
}

async function updateSlidingWindows(eventType: string, payload: any) {
  // This is a simplified implementation. A real system would use a stream processing engine.
  // We'll use SQL to simulate windowed aggregations.
  
  if (eventType === 'sale_completed') {
    const sale = payload as SaleCompletedEvent;
    const stateId = `product:${sale.listingId}`;
    
    // Update sales velocity for the last 5 minutes
    await adaptDB.exec`
      INSERT INTO realtime_market_state (id, state_type, state_data)
      VALUES (${stateId}, 'product', ${JSON.stringify({ sales_velocity_5m: sale.quantity })})
      ON CONFLICT (id) DO UPDATE SET
        state_data = jsonb_set(
          realtime_market_state.state_data, 
          '{sales_velocity_5m}', 
          (COALESCE(realtime_market_state.state_data->>'sales_velocity_5m', '0')::numeric + ${sale.quantity})::text::jsonb
        ),
        last_updated = NOW()
    `;
  }
  
  if (eventType === 'price_changed') {
    const priceChange = payload as PriceChangedEvent;
    const stateId = `product:${priceChange.listingId}`;
    
    // Update price volatility for the last hour
    // (This is a simplified calculation)
    await adaptDB.exec`
      INSERT INTO realtime_market_state (id, state_type, state_data)
      VALUES (${stateId}, 'product', ${JSON.stringify({ price_volatility_1h: Math.abs(priceChange.newPrice - priceChange.oldPrice) })})
      ON CONFLICT (id) DO UPDATE SET
        state_data = jsonb_set(
          realtime_market_state.state_data,
          '{price_volatility_1h}',
          ((COALESCE(realtime_market_state.state_data->>'price_volatility_1h', '0')::numeric + ${Math.abs(priceChange.newPrice - priceChange.oldPrice)}) / 2)::text::jsonb
        ),
        last_updated = NOW()
    `;
  }
}
