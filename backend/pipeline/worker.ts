import { Subscription } from "encore.dev/pubsub";
import { pipelineDB } from "./db";
import { 
  ingestionTopic, IngestionEvent,
  transformationTopic, TransformationEvent,
  validationTopic, ValidationEvent
} from "./queues";
import { rawLayerBucket, processedLayerBucket, analyticsLayerBucket } from "./storage";

// Worker for data ingestion
new Subscription(ingestionTopic, "ingestion-worker", {
  handler: async (event: IngestionEvent) => {
    await updateRunStatus(event.runId, 'running', 'Ingestion started.');
    
    try {
      // Simulate fetching data from source
      const rawData = JSON.stringify(event.payload);
      const rawDataPath = `raw/${event.sourceId}/${event.runId}.json`;
      
      // Store in raw layer
      await rawLayerBucket.upload(rawDataPath, Buffer.from(rawData));
      
      // Record data asset and lineage
      // ...
      
      await updateRunStatus(event.runId, 'ingestion_complete', 'Raw data stored.');
      
      // Trigger transformation
      await transformationTopic.publish({
        runId: event.runId,
        sourceAssetId: `raw:${event.sourceId}`,
        sourceLocation: rawDataPath,
        transformationType: 'clean_and_normalize',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await updateRunStatus(event.runId, 'failed', `Ingestion failed: ${errorMessage}`);
    }
  },
});

// Worker for data transformation
new Subscription(transformationTopic, "transformation-worker", {
  handler: async (event: TransformationEvent) => {
    await updateRunStatus(event.runId, 'transforming', `Transformation started: ${event.transformationType}`);
    
    try {
      // Get raw data
      const rawDataBuffer = await rawLayerBucket.download(event.sourceLocation);
      const rawData = JSON.parse(rawDataBuffer.toString());
      
      // Simulate transformation
      const processedData = { ...rawData, processedAt: new Date() };
      const processedDataPath = `processed/${event.runId}.json`;
      
      // Store in processed layer
      await processedLayerBucket.upload(processedDataPath, Buffer.from(JSON.stringify(processedData)));
      
      await updateRunStatus(event.runId, 'transformation_complete', 'Data transformed.');
      
      // Trigger validation
      await validationTopic.publish({
        runId: event.runId,
        assetId: `processed:${event.runId}`,
        assetLocation: processedDataPath,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await updateRunStatus(event.runId, 'failed', `Transformation failed: ${errorMessage}`);
    }
  },
});

// Worker for data validation
new Subscription(validationTopic, "validation-worker", {
  handler: async (event: ValidationEvent) => {
    await updateRunStatus(event.runId, 'validating', 'Data quality checks started.');
    
    try {
      // Simulate data quality checks
      const qualityPassed = Math.random() > 0.1; // 90% pass rate
      
      if (qualityPassed) {
        await updateRunStatus(event.runId, 'completed', 'Pipeline completed successfully.');
      } else {
        await updateRunStatus(event.runId, 'failed', 'Data quality checks failed.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await updateRunStatus(event.runId, 'failed', `Validation failed: ${errorMessage}`);
    }
  },
});

async function updateRunStatus(runId: string, status: string, logMessage: string) {
  await pipelineDB.exec`
    UPDATE pipeline_runs
    SET 
      status = ${status},
      logs = logs || ${JSON.stringify([{ timestamp: new Date(), message: logMessage }])}::jsonb,
      end_time = CASE WHEN ${status} IN ('completed', 'failed') THEN NOW() ELSE end_time END
    WHERE id = ${runId}
  `;
}
