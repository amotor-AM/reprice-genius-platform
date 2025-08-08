import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { documentsBucket } from "./storage";
import { documentsDB } from "./db";
import { documentProcessingTopic } from "./queues";
import { Subscription } from "encore.dev/pubsub";
import { extractDataFromInvoice } from "./ocr";
import { pricing } from "~encore/clients";
import { Buffer } from "buffer";

export interface UploadInvoiceRequest {
  file: Buffer;
  fileName: string;
  templateId?: string;
}

export interface UploadInvoiceResponse {
  documentId: string;
  message: string;
  status: string;
}

// Uploads a PDF invoice for processing.
export const uploadInvoice = api<UploadInvoiceRequest, UploadInvoiceResponse>(
  { auth: true, expose: true, method: "POST", path: "/documents/invoice/upload" },
  async (req) => {
    const auth = getAuthData()!;

    if (!req.file || req.file.length === 0) {
      throw APIError.invalidArgument("No file uploaded");
    }

    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const storagePath = `invoices/${auth.userID}/${documentId}/${req.fileName}`;

    // Upload to bucket
    await documentsBucket.upload(storagePath, req.file);

    // Create document record
    await documentsDB.exec`
      INSERT INTO processed_documents (id, user_id, file_name, file_type, storage_path, status)
      VALUES (${documentId}, ${auth.userID}, ${req.fileName}, 'pdf', ${storagePath}, 'pending')
    `;

    // Publish event for async processing
    await documentProcessingTopic.publish({
      documentId,
      userId: auth.userID,
      storagePath,
      fileType: 'pdf',
      templateId: req.templateId,
    });

    return {
      documentId,
      message: "Invoice uploaded and queued for processing.",
      status: "pending",
    };
  }
);

// Subscription to process documents from the queue.
new Subscription(documentProcessingTopic, "process-document", {
  handler: async (event) => {
    try {
      // Update status to processing
      await documentsDB.exec`
        UPDATE processed_documents SET status = 'processing', updated_at = CURRENT_TIMESTAMP
        WHERE id = ${event.documentId}
      `;

      // Download file from bucket
      const fileBuffer = await documentsBucket.download(event.storagePath);

      // Extract data using OCR
      const extractedData = await extractDataFromInvoice(fileBuffer, event.templateId);

      // Update document with extracted data
      await documentsDB.exec`
        UPDATE processed_documents 
        SET status = 'completed', extracted_data = ${JSON.stringify(extractedData)}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${event.documentId}
      `;

      // Update pricing service with cost data
      if (extractedData.items) {
        for (const item of extractedData.items) {
          if (item.sku && item.unitCost) {
            await pricing.updateCostData({
              sku: item.sku,
              cost: item.unitCost,
              source: `invoice_${event.documentId}`,
            });
          }
        }
      }

    } catch (error) {
      console.error(`Error processing document ${event.documentId}:`, error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await documentsDB.exec`
        UPDATE processed_documents 
        SET status = 'failed', error_message = ${errorMessage}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${event.documentId}
      `;
    }
  },
});
