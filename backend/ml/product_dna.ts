import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { mlDB } from "./db";
import { listingsDB } from "../listings/db";
import { analyzeImageWithViT } from "./models/vision_transformer";
import { analyzeTextWithBert } from "./models/bert_analyzer";
import { forecastWithProphet } from "./models/prophet_forecaster";

export interface ProductDNA {
  listingId: string;
  dnaVector: number[];
  modelVersion: string;
  featureHash: string;
  metadata: {
    imageAnalysis: any;
    textAnalysis: any;
    seasonalForecast: any;
  };
  priceHistory: number[];
  imageEmbedding: number[];
  textEmbedding: number[];
}

export interface GenerateDNARequest {
  listingId: string;
}

export interface GenerateDNAResponse {
  success: boolean;
  dnaId: string;
  vector: number[];
  metadata: any;
}

// Generates a complete Product DNA profile.
export const generateProductDNA = api<GenerateDNARequest, GenerateDNAResponse>(
  { auth: true, expose: true, method: "POST", path: "/ml/dna/generate" },
  async (req) => {
    const auth = getAuthData()!;

    const product = await listingsDB.queryRow`
      SELECT * FROM products WHERE id = ${req.listingId} AND user_id = ${auth.userID}
    `;
    if (!product) throw APIError.notFound("Product not found");

    const marketplaceListing = await listingsDB.queryRow`
      SELECT * FROM marketplace_listings WHERE product_id = ${product.id} ORDER BY created_at DESC LIMIT 1
    `;
    if (!marketplaceListing) throw APIError.notFound("Marketplace listing not found");

    const featureHash = hashProductFeatures(product, marketplaceListing);

    // Check if up-to-date DNA already exists
    const existingDNA = await mlDB.queryRow`
      SELECT * FROM product_dna WHERE id = ${req.listingId} AND feature_hash = ${featureHash}
    `;
    if (existingDNA) {
      return {
        success: true,
        dnaId: existingDNA.id,
        vector: existingDNA.dna_vector,
        metadata: existingDNA.metadata,
      };
    }

    // Generate multi-modal features
    const [imageAnalysis, textAnalysis, seasonalForecast, priceHistory] = await Promise.all([
      analyzeImageWithViT((marketplaceListing.metadata as any)?.image_url || ''),
      analyzeTextWithBert(`${product.title} ${product.description || ''}`),
      getSeasonalForecast(req.listingId),
      getPriceHistory(marketplaceListing.id),
    ]);

    // Combine features into a single 512-dimensional embedding
    const dnaVector = combineFeaturesToDNA(
      imageAnalysis,
      textAnalysis,
      seasonalForecast,
      priceHistory,
      marketplaceListing
    );

    // Store the new DNA
    const modelVersion = "dna_v1.0";
    await mlDB.exec`
      INSERT INTO product_dna (id, dna_vector, model_version, feature_hash, metadata)
      VALUES (${req.listingId}, ${JSON.stringify(dnaVector)}, ${modelVersion}, ${featureHash}, ${JSON.stringify({
        imageAnalysis, textAnalysis, seasonalForecast
      })})
      ON CONFLICT (id) DO UPDATE SET
        dna_vector = EXCLUDED.dna_vector,
        model_version = EXCLUDED.model_version,
        feature_hash = EXCLUDED.feature_hash,
        metadata = EXCLUDED.metadata,
        updated_at = CURRENT_TIMESTAMP
    `;

    // Store in history
    await mlDB.exec`
      INSERT INTO product_dna_history (listing_id, dna_vector, model_version, change_reason)
      VALUES (${req.listingId}, ${JSON.stringify(dnaVector)}, ${modelVersion}, 'generation')
    `;

    return {
      success: true,
      dnaId: req.listingId,
      vector: dnaVector,
      metadata: { imageAnalysis, textAnalysis, seasonalForecast },
    };
  }
);

function hashProductFeatures(product: any, listing: any): string {
  const featureString = JSON.stringify({
    title: product.title,
    description: product.description,
    price: listing.current_price,
    condition: (product.properties as any)?.condition,
    images: (listing.metadata as any)?.image_url,
  });
  let hash = 0;
  for (let i = 0; i < featureString.length; i++) {
    const char = featureString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

async function getSeasonalForecast(listingId: string): Promise<any> {
  const historicalData = await listingsDB.queryAll`
    SELECT created_at as ds, new_price as y
    FROM price_history
    WHERE marketplace_listing_id = (
      SELECT id FROM marketplace_listings WHERE product_id = ${listingId} ORDER BY created_at DESC LIMIT 1
    )
    ORDER BY created_at ASC
  `;
  if (historicalData.length < 14) return [];
  return forecastWithProphet(historicalData);
}

async function getPriceHistory(marketplaceListingId: string): Promise<number[]> {
  const history = await listingsDB.queryAll`
    SELECT new_price FROM price_history
    WHERE marketplace_listing_id = ${marketplaceListingId}
    ORDER BY created_at DESC LIMIT 30
  `;
  return history.map(h => h.new_price);
}

function combineFeaturesToDNA(
  imageAnalysis: any,
  textAnalysis: any,
  seasonalForecast: any,
  priceHistory: number[],
  listing: any
): number[] {
  const dnaVector = new Array(512).fill(0);

  // Image features (128 dims)
  imageAnalysis.embedding.forEach((val, i) => dnaVector[i] = val);
  dnaVector[128] = imageAnalysis.qualityScore;
  dnaVector[129] = imageAnalysis.appealScore;

  // Text features (128 dims)
  // In a real scenario, use BERT embeddings directly
  textAnalysis.keywords.forEach((kw, i) => {
    dnaVector[130 + i] = textAnalysis.keywordEffectiveness[kw];
  });
  dnaVector[256] = textAnalysis.sentimentScore;
  dnaVector[257] = textAnalysis.clarityScore;

  // Price & Time-series features (128 dims)
  dnaVector[258] = listing.current_price / 1000; // Normalize price
  priceHistory.forEach((price, i) => {
    if (i < 30) dnaVector[259 + i] = price / 1000;
  });
  if (seasonalForecast.length > 0) {
    const trend = seasonalForecast[0].trend;
    dnaVector[289] = trend;
  }

  // Structured data features (128 dims)
  dnaVector[384] = (listing.metadata as any)?.views / 1000 || 0;
  dnaVector[385] = (listing.metadata as any)?.watchers / 100 || 0;
  
  // Normalize final vector
  const magnitude = Math.sqrt(dnaVector.reduce((sum, val) => sum + val * val, 0));
  return magnitude > 0 ? dnaVector.map(val => val / magnitude) : dnaVector;
}

export async function getProductDNA(listingId: string): Promise<ProductDNA> {
  const dna = await mlDB.queryRow`
    SELECT * FROM product_dna WHERE id = ${listingId}
  `;
  if (dna) {
    return {
      listingId: dna.id,
      dnaVector: dna.dna_vector,
      modelVersion: dna.model_version,
      featureHash: dna.feature_hash,
      metadata: dna.metadata,
      priceHistory: [], // Should be fetched if needed
      imageEmbedding: dna.metadata.imageAnalysis.embedding,
      textEmbedding: [], // Should be generated from textAnalysis
    };
  }
  // If not found, generate it
  const newDNA = await generateProductDNA.call({ listingId });
  const dnaData = await mlDB.queryRow`SELECT * FROM product_dna WHERE id = ${listingId}`;
  return {
    listingId: dnaData.id,
    dnaVector: dnaData.dna_vector,
    modelVersion: dnaData.model_version,
    featureHash: dnaData.feature_hash,
    metadata: dnaData.metadata,
    priceHistory: [],
    imageEmbedding: dnaData.metadata.imageAnalysis.embedding,
    textEmbedding: [],
  };
}
