import { api } from "encore.dev/api";
import { secret } from "encore.dev/config";

const sentryDsn = secret("SentryDSN");

export interface ErrorEvent {
  message: string;
  level: 'error' | 'warning' | 'info';
  userId?: string;
  extra?: Record<string, any>;
  tags?: Record<string, string>;
}

export interface PerformanceEvent {
  operation: string;
  duration: number;
  userId?: string;
  metadata?: Record<string, any>;
}

// Logs an error event to Sentry.
export const logError = api<ErrorEvent, { success: boolean }>(
  { expose: true, method: "POST", path: "/monitoring/error" },
  async (event) => {
    try {
      // In production, integrate with actual Sentry SDK
      await sendToSentry('error', event);
      console.error(`[${event.level.toUpperCase()}] ${event.message}`, {
        userId: event.userId,
        extra: event.extra,
        tags: event.tags,
      });
      
      return { success: true };
    } catch (error) {
      console.error('Failed to log error to Sentry:', error);
      return { success: false };
    }
  }
);

// Logs a performance event to Sentry.
export const logPerformance = api<PerformanceEvent, { success: boolean }>(
  { expose: true, method: "POST", path: "/monitoring/performance" },
  async (event) => {
    try {
      await sendToSentry('performance', event);
      console.log(`[PERFORMANCE] ${event.operation}: ${event.duration}ms`, {
        userId: event.userId,
        metadata: event.metadata,
      });
      
      return { success: true };
    } catch (error) {
      console.error('Failed to log performance to Sentry:', error);
      return { success: false };
    }
  }
);

async function sendToSentry(type: string, data: any): Promise<void> {
  // Simulate Sentry integration
  // In production, use the actual Sentry SDK
  const payload = {
    timestamp: new Date().toISOString(),
    type,
    data,
    environment: process.env.NODE_ENV || 'development',
  };

  // Would send to Sentry API here
  console.log('Sentry Event:', JSON.stringify(payload, null, 2));
}

// Helper function to wrap API calls with error tracking
export function withErrorTracking<T extends (...args: any[]) => Promise<any>>(
  operation: string,
  fn: T
): T {
  return (async (...args: any[]) => {
    const startTime = Date.now();
    
    try {
      const result = await fn(...args);
      
      // Log successful performance
      const duration = Date.now() - startTime;
      await logPerformance({
        operation,
        duration,
        metadata: { success: true },
      });
      
      return result;
    } catch (error) {
      // Log error
      await logError({
        message: `Error in ${operation}: ${error.message}`,
        level: 'error',
        extra: {
          operation,
          args: args.length > 0 ? args[0] : undefined,
          stack: error.stack,
        },
      });
      
      throw error;
    }
  }) as T;
}
