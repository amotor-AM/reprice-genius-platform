import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { documentsBucket, exportsBucket } from "./storage";
import { documentsDB } from "./db";
import { csvImportTopic } from "./queues";
import { Subscription } from "encore.dev/pubsub";
import { ebayDB } from "../ebay/db";

export interface ImportCsvRequest {
  file: string; // base64 encoded
  fileName: string;
  importType: 'listings' | 'costs';
}

export interface ImportCsvResponse {
  jobId: string;
  message: string;
  status: string;
}

export interface ExportCsvRequest {
  exportType: 'listings' | 'sales_history';
  filters?: Record<string, any>;
}

export interface ExportCsvResponse {
  jobId: string;
  downloadUrl?: string;
  message: string;
  status: string;
}

// Imports data from a CSV file.
export const importCsv = api<ImportCsvRequest, ImportCsvResponse>(
  { auth: true, expose: true, method: "POST", path: "/documents/csv/import" },
  async (req) => {
    const auth = getAuthData()!;

    if (!req.file || req.file.length === 0) {
      throw APIError.invalidArgument("No file uploaded");
    }

    const jobId = `csv_import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const storagePath = `csv_imports/${auth.userID}/${jobId}/${req.fileName}`;

    const fileBuffer = Buffer.from(req.file, 'base64');

    // Upload to bucket
    await documentsBucket.upload(storagePath, fileBuffer);

    // Create job record
    await documentsDB.exec`
      INSERT INTO csv_jobs (id, user_id, job_type, status, input_file_path)
      VALUES (${jobId}, ${auth.userID}, 'import', 'pending', ${storagePath})
    `;

    // Publish event for async processing
    await csvImportTopic.publish({
      jobId,
      userId: auth.userID,
      storagePath,
    });

    return {
      jobId,
      message: "CSV import job started.",
      status: "pending",
    };
  }
);

// Exports data to a CSV file.
export const exportCsv = api<ExportCsvRequest, ExportCsvResponse>(
  { auth: true, expose: true, method: "GET", path: "/documents/csv/export" },
  async (req) => {
    const auth = getAuthData()!;
    
    // For simplicity, this will be a synchronous export.
    // A real implementation would use a queue for large exports.
    
    let data: any[];
    let headers: string[];

    switch (req.exportType) {
      case 'listings':
        data = await ebayDB.queryAll`
          SELECT * FROM listings WHERE user_id = ${auth.userID}
        `;
        headers = Object.keys(data[0] || {});
        break;
      case 'sales_history':
        data = await ebayDB.queryAll`
          SELECT l.title, ph.* 
          FROM price_history ph
          JOIN listings l ON ph.listing_id = l.id
          WHERE l.user_id = ${auth.userID}
        `;
        headers = Object.keys(data[0] || {});
        break;
      default:
        throw APIError.invalidArgument("Invalid export type");
    }

    if (data.length === 0) {
      return { jobId: '', message: "No data to export.", status: "completed" };
    }

    // Generate CSV content
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => JSON.stringify(row[header])).join(','))
    ].join('\n');

    const buffer = Buffer.from(csvContent, 'utf-8');
    const fileName = `${req.exportType}_${Date.now()}.csv`;
    const storagePath = `csv_exports/${auth.userID}/${fileName}`;

    // Upload to exports bucket
    await exportsBucket.upload(storagePath, buffer, { contentType: 'text/csv' });

    // Generate signed URL for download
    const { url } = await exportsBucket.signedDownloadUrl(storagePath, { ttl: 3600 });

    return {
      jobId: `csv_export_${Date.now()}`,
      downloadUrl: url,
      message: "CSV export generated successfully.",
      status: "completed",
    };
  }
);

// Subscription to process CSV imports.
new Subscription(csvImportTopic, "process-csv-import", {
  handler: async (event) => {
    try {
      await documentsDB.exec`
        UPDATE csv_jobs SET status = 'processing', updated_at = CURRENT_TIMESTAMP
        WHERE id = ${event.jobId}
      `;

      const fileBuffer = await documentsBucket.download(event.storagePath);
      const csvString = fileBuffer.toString('utf-8');
      const rows = csvString.split('\n').map(row => row.split(','));
      const headers = rows.shift() || [];
      
      let processedRows = 0;
      for (const row of rows) {
        if (row.length !== headers.length) continue;
        
        const rowData = headers.reduce((obj, header, index) => {
          obj[header] = row[index];
          return obj;
        }, {} as Record<string, any>);

        // Process row data (e.g., update listings)
        // This is a simplified example
        await ebayDB.exec`
          UPDATE listings SET current_price = ${parseFloat(rowData.price)}
          WHERE ebay_item_id = ${rowData.sku} AND user_id = ${event.userId}
        `;
        
        processedRows++;
      }

      await documentsDB.exec`
        UPDATE csv_jobs 
        SET status = 'completed', processed_rows = ${processedRows}, total_rows = ${rows.length},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${event.jobId}
      `;

    } catch (error) {
      console.error(`Error processing CSV import ${event.jobId}:`, error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await documentsDB.exec`
        UPDATE csv_jobs 
        SET status = 'failed', error_log = ${JSON.stringify({ message: errorMessage })},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${event.jobId}
      `;
    }
  },
});
