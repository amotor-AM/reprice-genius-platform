import { Subscription } from "encore.dev/pubsub";
import { 
  listingTopic, ListingEvent,
  orchestrationTopic, RepriceListingEvent
} from "../events/topics";
import { orchestratorDB } from "./db";
import { ml, pricing, strategy } from "~encore/clients";

// Saga for single product price optimization
new Subscription(listingTopic, "price-optimization-saga", {
  handler: async (event: ListingEvent) => {
    if (event.eventType !== 'created') return;

    const sagaId = `opt_${event.listingId}`;
    
    try {
      // 1. Start Saga
      await orchestratorDB.exec`
        INSERT INTO sagas (id, saga_type, status, current_step, payload)
        VALUES (${sagaId}, 'price_optimization', 'running', 'start', ${JSON.stringify(event)})
        ON CONFLICT (id) DO NOTHING
      `;

      // 2. Generate Embeddings
      await orchestratorDB.exec`UPDATE sagas SET current_step = 'generate_embedding' WHERE id = ${sagaId}`;
      await ml.generateEmbedding({ listingId: event.listingId });

      // 3. Analyze Market
      await orchestratorDB.exec`UPDATE sagas SET current_step = 'analyze_market' WHERE id = ${sagaId}`;
      const marketAnalysis = await pricing.analyzeMarket({ listingId: event.listingId });

      // 4. Evaluate Strategies
      await orchestratorDB.exec`UPDATE sagas SET current_step = 'evaluate_strategies' WHERE id = ${sagaId}`;
      const evaluatedStrategies = await strategy.evaluateStrategies({ listingId: event.listingId });

      // 5. Select Best Strategy
      await orchestratorDB.exec`UPDATE sagas SET current_step = 'select_strategy' WHERE id = ${sagaId}`;
      const selectedStrategy = await strategy.selectStrategy({
        listingId: event.listingId,
        evaluatedStrategies: evaluatedStrategies.evaluations,
        marketContext: evaluatedStrategies.marketContext,
      });

      // 6. Apply Price
      await orchestratorDB.exec`UPDATE sagas SET current_step = 'apply_price' WHERE id = ${sagaId}`;
      const recommendedPrice = selectedStrategy.selectedStrategy.expectedOutcome.priceChange + marketAnalysis.currentPrice;
      await pricing.applyPrice({
        listingId: event.listingId,
        newPrice: recommendedPrice,
      });

      // 7. Complete Saga
      await orchestratorDB.exec`
        UPDATE sagas SET status = 'completed', current_step = 'end' WHERE id = ${sagaId}
      `;

    } catch (error) {
      console.error(`Saga ${sagaId} failed:`, error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await orchestratorDB.exec`
        UPDATE sagas SET status = 'failed', error_message = ${errorMessage} WHERE id = ${sagaId}
      `;
      // Here you would implement compensating transactions
    }
  },
});

// Saga for bulk repricing a single listing
new Subscription(orchestrationTopic, "bulk-reprice-item-saga", {
  handler: async (event: RepriceListingEvent) => {
    const { listingId, correlationId } = event;
    
    try {
      // This is a simplified saga step, just calling the analysis and apply logic
      const marketAnalysis = await pricing.analyzeMarket({ listingId });
      await pricing.applyPrice({
        listingId,
        newPrice: marketAnalysis.suggestedPrice,
      });

      // Log step completion
      await orchestratorDB.exec`
        INSERT INTO saga_steps (saga_id, step_name, status)
        VALUES (${correlationId}, 'reprice_item_${listingId}', 'completed')
      `;

    } catch (error) {
      console.error(`Bulk reprice for ${listingId} failed:`, error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await orchestratorDB.exec`
        INSERT INTO saga_steps (saga_id, step_name, status, error_message)
        VALUES (${correlationId}, 'reprice_item_${listingId}', 'failed', ${errorMessage})
      `;
    }
  }
});
