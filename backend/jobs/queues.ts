import { Topic } from "encore.dev/pubsub";

export interface JobPayload {
  jobId: string;
  jobType: string;
  payload: any;
}

// Different topics for different priorities
export const criticalJobQueue = new Topic<JobPayload>("jobs-critical", {
  deliveryGuarantee: "at-least-once",
});
export const highJobQueue = new Topic<JobPayload>("jobs-high", {
  deliveryGuarantee: "at-least-once",
});
export const mediumJobQueue = new Topic<JobPayload>("jobs-medium", {
  deliveryGuarantee: "at-least-once",
});
export const lowJobQueue = new Topic<JobPayload>("jobs-low", {
  deliveryGuarantee: "at-least-once",
});
