import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { pipelineDB } from "./db";
import { ingestionTopic, transformationTopic } from "./queues";
import { v4 as uuidv4 } from 'uuid';

export interface IngestDataRequest {
  sourceId: string;
  sourceType: 'api' | 'database' | 'file_upload';
  payload: any;
}

export interface IngestDataResponse {
  runId: string;
  status: string;
  message: string;
}

export interface PipelineStatusResponse {
  runId: string;
  status: string;
  startTime: Date;
  endTime?: Date;
  logs: any[];
}

export interface TransformDataRequest {
  runId: string;
  transformationType: 'clean' | 'aggregate' | 'enrich';
  params?: any;
}

export interface DataLineageResponse {
  assetId: string;
  lineage: any;
}

// Ingests data from a specified source into the pipeline.
export const ingest = api<IngestDataRequest, IngestDataResponse>(
  { auth: true, expose: true, method: "POST", path: "/pipeline/ingest" },
  async (req) => {
    const auth = getAuthData()!;
    const runId = uuidv4();

    // Create pipeline run record
    await pipelineDB.exec`
      INSERT INTO pipeline_runs (id, pipeline_id, status, start_time, logs)
      VALUES (${runId}, 'ingestion_pipeline', 'queued', NOW(), ${JSON.stringify([{
        timestamp: new Date(),
        message: `Ingestion job queued for source ${req.sourceId}`,
      }])})
    `;

    // Publish event to ingestion queue
    await ingestionTopic.publish({
      runId,
      sourceId: req.sourceId,
      sourceType: req.sourceType,
      payload: req.payload,
      userId: auth.userID,
    });

    return {
      runId,
      status: 'queued',
      message: 'Data ingestion job has been queued.',
    };
  }
);

// Gets the status of a specific pipeline run.
export const getStatus = api<{ runId: string }, PipelineStatusResponse>(
  { auth: true, expose: true, method: "GET", path: "/pipeline/status/:runId" },
  async ({ runId }) => {
    const run = await pipelineDB.queryRow`
      SELECT * FROM pipeline_runs WHERE id = ${runId}
    `;

    if (!run) {
      throw APIError.notFound("Pipeline run not found");
    }

    return {
      runId: run.id,
      status: run.status,
      startTime: run.start_time,
      endTime: run.end_time,
      logs: run.logs || [],
    };
  }
);

// Triggers a data transformation job.
export const transform = api<TransformDataRequest, { success: boolean }>(
  { auth: true, expose: true, method: "POST", path: "/pipeline/transform" },
  async (req) => {
    // In a real scenario, you'd verify the runId and its state
    await transformationTopic.publish({
      runId: req.runId,
      transformationType: req.transformationType,
      params: req.params,
    });
    return { success: true };
  }
);

// Gets the data lineage for a specific data asset.
export const getLineage = api<{ assetId: string }, DataLineageResponse>(
  { auth: true, expose: true, method: "GET", path: "/pipeline/lineage/:assetId" },
  async ({ assetId }) => {
    // This would recursively query the data_lineage table to build the full lineage graph.
    // For simplicity, we'll return a mock response.
    const lineage = {
      assetId,
      sources: [
        { assetId: 'raw_data_1', transformation: 'cleaning' },
        { assetId: 'raw_data_2', transformation: 'joining' },
      ],
      targets: [
        { assetId: 'analytics_report_1', transformation: 'aggregation' },
      ],
    };

    return {
      assetId,
      lineage,
    };
  }
);
