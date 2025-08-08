import { Topic } from "encore.dev/pubsub";

export interface IngestionEvent {
  runId: string;
  sourceId: string;
  sourceType: string;
  payload: any;
  userId: string;
}

export interface TransformationEvent {
  runId: string;
  sourceAssetId: string;
  sourceLocation: string;
  transformationType: string;
  params?: any;
}

export interface ValidationEvent {
  runId: string;
  assetId: string;
  assetLocation: string;
}

export const ingestionTopic = new Topic<IngestionEvent>("pipeline-ingestion", {
  deliveryGuarantee: "at-least-once",
});

export const transformationTopic = new Topic<TransformationEvent>("pipeline-transformation", {
  deliveryGuarantee: "at-least-once",
});

export const validationTopic = new Topic<ValidationEvent>("pipeline-validation", {
  deliveryGuarantee: "at-least-once",
});
