import { cron } from "encore.dev/cron";
import { scheduleJob } from "./endpoints";

// Scheduled repricing runs (every 15 minutes)
export const scheduledRepricing = cron("scheduled-repricing", {
  every: "15m",
  handler: async () => {
    await scheduleJob.call({
      jobType: 'bulk_reprice',
      priority: 'critical',
      payload: { allActive: true },
    });
  },
});

// Market data synchronization (every hour)
export const scheduledMarketSync = cron("scheduled-market-sync", {
  every: "1h",
  handler: async () => {
    await scheduleJob.call({
      jobType: 'market_data_sync',
      priority: 'high',
      payload: { allCategories: true },
    });
  },
});

// Report generation (daily at midnight)
export const scheduledReportGeneration = cron("scheduled-report-generation", {
  every: "24h",
  handler: async () => {
    await scheduleJob.call({
      jobType: 'generate_daily_report',
      priority: 'medium',
      payload: { reportType: 'performance_summary' },
    });
  },
});

// Data cleanup and archival (daily at 2am)
export const scheduledCleanup = cron("scheduled-cleanup", {
  every: "24h",
  handler: async () => {
    await scheduleJob.call({
      jobType: 'data_cleanup',
      priority: 'low',
      payload: { retentionDays: 90 },
    });
  },
});

// Job monitoring and alerting (every 30 minutes)
export const scheduledJobMonitoring = cron("scheduled-job-monitoring", {
  every: "30m",
  handler: async () => {
    await scheduleJob.call({
      jobType: 'monitor_failed_jobs',
      priority: 'medium',
      payload: {},
    });
  },
});

// Anomaly detection (every hour)
export const scheduledAnomalyDetection = cron("scheduled-anomaly-detection", {
  every: "1h",
  handler: async () => {
    await scheduleJob.call({
      jobType: 'detect_price_anomalies',
      priority: 'medium',
    });
  },
});

// Check completed experiments (every hour)
export const scheduledExperimentCheck = cron("scheduled-experiment-check", {
  every: "1h",
  handler: async () => {
    await scheduleJob.call({
      jobType: 'check_completed_experiments',
      priority: 'medium',
    });
  },
});
