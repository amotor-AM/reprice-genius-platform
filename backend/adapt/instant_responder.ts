import { api, APIError } from "encore.dev/api";
import { adaptDB } from "./db";
import { createHash } from 'crypto';

export interface InstantResponseRequest {
  scenario: {
    listingId: string;
    eventType: string;
    eventPayload: any;
  };
}

export interface InstantResponse {
  action: 'price_change' | 'hold';
  newPrice?: number;
  confidence: number;
  source: 'precomputed' | 'realtime';
}

// Gets an instant price response for a given scenario.
export const getInstantResponse = api<InstantResponseRequest, InstantResponse>(
  { expose: true, method: "POST", path: "/adapt/response/instant" },
  async (req) => {
    // Check circuit breaker first
    const circuitBreaker = await getCircuitBreakerStatus(`listing:${req.scenario.listingId}`);
    if (circuitBreaker.status === 'open') {
      throw APIError.unavailable("Circuit breaker is open for this listing. No actions will be taken.");
    }

    // Check for precomputed response
    const scenarioHash = createHash('sha256').update(JSON.stringify(req.scenario)).digest('hex');
    const precomputed = await adaptDB.queryRow`
      SELECT * FROM precomputed_responses WHERE id = ${scenarioHash}
    `;

    if (precomputed) {
      await updateCircuitBreaker(circuitBreaker.id, true);
      return { ...precomputed.response, source: 'precomputed' };
    }

    // If not precomputed, calculate in real-time (simplified)
    const newPrice = calculateRealtimePrice(req.scenario);
    
    await updateCircuitBreaker(circuitBreaker.id, true);
    return {
      action: 'price_change',
      newPrice,
      confidence: 0.7,
      source: 'realtime',
    };
  }
);

async function getCircuitBreakerStatus(id: string) {
  let breaker = await adaptDB.queryRow`SELECT * FROM circuit_breakers WHERE id = ${id}`;
  if (!breaker) {
    await adaptDB.exec`INSERT INTO circuit_breakers (id, status) VALUES (${id}, 'closed')`;
    breaker = { id, status: 'closed', failure_count: 0, success_count: 0 };
  }
  
  // Check if breaker should be moved from open to half-open
  if (breaker.status === 'open' && breaker.opens_at && new Date() > new Date(breaker.opens_at)) {
    breaker.status = 'half_open';
    await adaptDB.exec`UPDATE circuit_breakers SET status = 'half_open' WHERE id = ${id}`;
  }
  
  return breaker;
}

async function updateCircuitBreaker(id: string, success: boolean) {
  if (success) {
    await adaptDB.exec`
      UPDATE circuit_breakers 
      SET success_count = success_count + 1, 
          failure_count = 0,
          status = 'closed'
      WHERE id = ${id}
    `;
  } else {
    const result = await adaptDB.queryRow`
      UPDATE circuit_breakers
      SET failure_count = failure_count + 1
      WHERE id = ${id}
      RETURNING failure_count
    `;
    if (result.failure_count >= 5) { // Open after 5 consecutive failures
      await adaptDB.exec`
        UPDATE circuit_breakers
        SET status = 'open', opens_at = NOW() + INTERVAL '5 minutes'
        WHERE id = ${id}
      `;
    }
  }
}

function calculateRealtimePrice(scenario: any): number {
  // Simplified real-time price calculation
  return scenario.eventPayload.currentPrice * 1.02;
}
