import { Topic } from "encore.dev/pubsub";

export interface DocumentProcessingEvent {
  documentId: string;
  userId: string;
  storagePath: string;
  fileType: 'pdf' | 'csv';
  templateId?: string;
}

export const documentProcessingTopic = new Topic<DocumentProcessingEvent>("document-processing", {
  deliveryGuarantee: "at-least-once",
});

export interface CsvImportEvent {
  jobId: string;
  userId: string;
  storagePath: string;
}

export const csvImportTopic = new Topic<CsvImportEvent>("csv-import", {
  deliveryGuarantee: "at-least-once",
});
