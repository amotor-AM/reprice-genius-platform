import { api, StreamOut } from "encore.dev/api";
import { Subscription } from "encore.dev/pubsub";
import { analyticsTopic, AnalyticsEvent, salesTopic, SaleCompletedEvent } from "../events/topics";

interface RealtimeMetric {
  metric: string;
  value: number;
  change: number;
  timestamp: Date;
}

// In-memory store for real-time metrics (for simplicity).
// In production, use Redis or a similar fast data store.
const realtimeMetrics: Record<string, { value: number; lastValue: number }> = {
  sales_per_minute: { value: 0, lastValue: 0 },
  revenue_per_minute: { value: 0, lastValue: 0 },
  avg_price_change: { value: 0, lastValue: 0 },
};
let priceChangeCount = 0;

const connectedStreams = new Set<StreamOut<RealtimeMetric>>();

// Subscription to update real-time metrics from sales events
new Subscription(salesTopic, "update-realtime-sales-metrics", {
  handler: async (event: SaleCompletedEvent) => {
    realtimeMetrics.sales_per_minute.value += event.quantity;
    realtimeMetrics.revenue_per_minute.value += event.price * event.quantity;
  }
});

// Subscription to update real-time metrics from analytics events
new Subscription(analyticsTopic, "update-realtime-analytics-metrics", {
  handler: async (event: AnalyticsEvent) => {
    if (event.eventType === 'price_change') {
      const currentAvg = realtimeMetrics.avg_price_change.value;
      const newAvg = (currentAvg * priceChangeCount + event.value) / (priceChangeCount + 1);
      realtimeMetrics.avg_price_change.value = newAvg;
      priceChangeCount++;
    }
  }
});

// Periodically broadcast updates and reset counters (simulating a time window)
setInterval(() => {
  for (const stream of connectedStreams) {
    for (const [metric, data] of Object.entries(realtimeMetrics)) {
      stream.send({
        metric,
        value: data.value,
        change: data.value - data.lastValue,
        timestamp: new Date(),
      }).catch(() => connectedStreams.delete(stream));
    }
  }

  // Reset for next window
  for (const metric of Object.values(realtimeMetrics)) {
    metric.lastValue = metric.value;
    metric.value = 0;
  }
  priceChangeCount = 0;
}, 5000); // Broadcast every 5 seconds

// Streams real-time analytics metrics to the client.
// This simulates a real-time analytics pipeline using something like Flink or Spark.
export const streamRealtimeMetrics = api.streamOut<void, RealtimeMetric>(
  { expose: true, path: "/analytics/realtime/stream" },
  async (_, stream) => {
    connectedStreams.add(stream);
    
    // Keep the stream open. The interval will send data.
    // When the client disconnects, the 'close' event will be handled.
    await new Promise((resolve, reject) => {
      stream.on('close', () => {
        connectedStreams.delete(stream);
        resolve(null);
      });
    });
  }
);
