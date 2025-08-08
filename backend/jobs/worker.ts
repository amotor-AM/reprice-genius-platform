import { Subscription } from "encore.dev/pubsub";
import { jobsDB } from "./db";
import { 
  criticalJobQueue, 
  highJobQueue, 
  mediumJobQueue, 
  lowJobQueue, 
  JobPayload 
} from "./queues";
import { orchestrator, market, analytics, learning } from "~encore/clients";

// Generic job processor
async function processJob(event: JobPayload) {
  const { jobId, jobType, payload } = event;

  // Mark job as running
  await jobsDB.exec`
    UPDATE jobs SET status = 'running', started_at = CURRENT_TIMESTAMP
    WHERE id = ${jobId}
  `;

  try {
    // Execute job based on type
    switch (jobType) {
      case 'bulk_reprice':
        await orchestrator.repriceAll(payload);
        break;
      case 'market_data_sync':
        // This would call a new endpoint in market service to sync all categories
        // For now, let's assume it exists.
        // await market.syncAllData(payload);
        console.log("Simulating market data sync", payload);
        break;
      case 'generate_daily_report':
        // This would call a new endpoint in analytics service
        // await analytics.generateReport(payload);
        console.log("Simulating report generation", payload);
        break;
      case 'data_cleanup':
        // This would call a new endpoint in a maintenance service
        console.log("Simulating data cleanup", payload);
        break;
      case 'monitor_failed_jobs':
        await monitorFailedJobs();
        break;
      case 'detect_price_anomalies':
        await analytics.detectPriceAnomalies();
        break;
      case 'check_completed_experiments':
        await learning.checkCompletedExperiments();
        break;
      case 'model_retraining':
        await learning.trainRLModel(payload);
        break;
      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }

    // Mark job as completed
    await jobsDB.exec`
      UPDATE jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE id = ${jobId}
    `;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`Job ${jobId} failed:`, errorMessage);
    
    // Mark job as failed
    await jobsDB.exec`
      UPDATE jobs 
      SET status = 'failed', 
          error_log = ${errorMessage},
          retry_count = retry_count + 1,
          completed_at = CURRENT_TIMESTAMP
      WHERE id = ${jobId}
    `;
    
    // Re-throw error to trigger Encore's retry mechanism
    throw error;
  }
}

// Subscriptions for each queue
new Subscription(criticalJobQueue, "process-critical-jobs", {
  handler: processJob,
});

new Subscription(highJobQueue, "process-high-jobs", {
  handler: processJob,
});

new Subscription(mediumJobQueue, "process-medium-jobs", {
  handler: processJob,
});

new Subscription(lowJobQueue, "process-low-jobs", {
  handler: processJob,
});

async function monitorFailedJobs() {
  const failedJobs = await jobsDB.queryAll`
    SELECT id, job_type, error_log FROM jobs
    WHERE status = 'failed' 
      AND updated_at >= NOW() - INTERVAL '1 hour'
      AND retry_count >= 3 -- Alert after 3 retries
  `;

  if (failedJobs.length > 0) {
    // In production, send an alert (email, Slack, etc.)
    console.error(`ALERT: ${failedJobs.length} jobs failed repeatedly.`);
    for (const job of failedJobs) {
      console.error(`- Job ID: ${job.id}, Type: ${job.job_type}, Error: ${job.error_log}`);
    }
  }
}
