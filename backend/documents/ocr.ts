import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { documentsDB } from "./db";
import { documentsBucket } from "./storage";

const googleVisionApiKey = secret("GoogleVisionApiKey");

export interface ExtractDataRequest {
  documentId: string;
  templateId?: string;
}

export interface ExtractedData {
  invoiceId?: string;
  vendorName?: string;
  invoiceDate?: Date;
  dueDate?: Date;
  totalAmount?: number;
  items: Array<{
    description: string;
    quantity: number;
    unitCost: number;
    total: number;
    sku?: string;
  }>;
  rawText: string;
}

// Extracts structured data from a document using OCR.
export const extract = api<ExtractDataRequest, ExtractedData>(
  { expose: true, method: "POST", path: "/documents/extract" },
  async (req) => {
    const document = await documentsDB.queryRow`
      SELECT * FROM processed_documents WHERE id = ${req.documentId}
    `;

    if (!document) {
      throw APIError.notFound("Document not found");
    }

    const fileBuffer = await documentsBucket.download(document.storage_path);

    return extractDataFromInvoice(fileBuffer, req.templateId);
  }
);

export async function extractDataFromInvoice(fileBuffer: Buffer, templateId?: string): Promise<ExtractedData> {
  try {
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${googleVisionApiKey()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{
          image: {
            content: fileBuffer.toString('base64'),
          },
          features: [{
            type: 'DOCUMENT_TEXT_DETECTION',
          }],
        }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Google Cloud Vision API error: ${response.statusText}`);
    }

    const data = await response.json();
    const rawText = data.responses[0]?.fullTextAnnotation?.text || '';

    // Parse the raw text to extract structured data
    const structuredData = parseInvoiceText(rawText, templateId);

    return {
      ...structuredData,
      rawText,
    };
  } catch (error) {
    console.error('Error with OCR processing:', error);
    throw APIError.internal("Failed to process document with OCR");
  }
}

function parseInvoiceText(text: string, templateId?: string): Partial<ExtractedData> {
  // This is a simplified parser. A real implementation would be much more complex,
  // possibly using another LLM call or sophisticated regex based on templates.
  const lines = text.split('\n');
  const items: ExtractedData['items'] = [];
  let totalAmount: number | undefined;

  // Find total amount
  const totalRegex = /Total\s*[:\s]*\$?(\d+\.\d{2})/;
  const totalMatch = text.match(totalRegex);
  if (totalMatch) {
    totalAmount = parseFloat(totalMatch[1]);
  }

  // Find items (very simplified)
  for (const line of lines) {
    const itemRegex = /([\w\s]+)\s+(\d+)\s+\$?(\d+\.\d{2})\s+\$?(\d+\.\d{2})/;
    const match = line.match(itemRegex);
    if (match) {
      items.push({
        description: match[1].trim(),
        quantity: parseInt(match[2]),
        unitCost: parseFloat(match[3]),
        total: parseFloat(match[4]),
        sku: `SKU-${Math.floor(Math.random() * 10000)}`,
      });
    }
  }

  return {
    invoiceId: text.match(/Invoice #:\s*(\w+)/)?.[1],
    vendorName: lines[0],
    invoiceDate: new Date(),
    totalAmount,
    items,
  };
}
