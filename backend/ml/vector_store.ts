import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { mlDB } from "./db";
import { ebayDB } from "../ebay/db";

export interface ProductEmbedding {
  listingId: string;
  vector: number[];
  modelVersion: string;
  featureHash: string;
}

export interface SimilarProduct {
  listingId: string;
  title: string;
  currentPrice: number;
  similarity: number;
  relationshipType: string;
}

export interface FindSimilarRequest {
  listingId: string;
  limit?: number;
  threshold?: number;
}

export interface FindSimilarResponse {
  products: SimilarProduct[];
  totalFound: number;
}

// Generates and stores product embeddings based on listing features.
export async function generateEmbedding(listingId: string): Promise<ProductEmbedding> {
  // Get listing details
  const listing = await ebayDB.queryRow`
    SELECT * FROM listings WHERE id = ${listingId}
  `;

  if (!listing) {
    throw new Error("Listing not found");
  }

  // Extract features for embedding
  const features = extractFeatures(listing);
  const featureHash = hashFeatures(features);
  
  // Check if we already have an embedding for these features
  const existingEmbedding = await mlDB.queryRow`
    SELECT * FROM product_embeddings 
    WHERE listing_id = ${listingId} AND feature_hash = ${featureHash}
  `;

  if (existingEmbedding) {
    return {
      listingId,
      vector: existingEmbedding.embedding_vector,
      modelVersion: existingEmbedding.model_version,
      featureHash: existingEmbedding.feature_hash,
    };
  }

  // Generate new embedding (simplified version)
  const vector = await generateFeatureVector(features);
  const modelVersion = "v1.0";

  // Store embedding
  await mlDB.exec`
    INSERT INTO product_embeddings (listing_id, embedding_vector, model_version, feature_hash)
    VALUES (${listingId}, ${JSON.stringify(vector)}, ${modelVersion}, ${featureHash})
    ON CONFLICT (listing_id) DO UPDATE SET
      embedding_vector = EXCLUDED.embedding_vector,
      model_version = EXCLUDED.model_version,
      feature_hash = EXCLUDED.feature_hash,
      updated_at = CURRENT_TIMESTAMP
  `;

  return {
    listingId,
    vector,
    modelVersion,
    featureHash,
  };
}

// Finds similar products using vector similarity.
export const findSimilar = api<FindSimilarRequest, FindSimilarResponse>(
  { auth: true, expose: true, method: "POST", path: "/ml/similar" },
  async (req) => {
    const auth = getAuthData()!;
    const limit = req.limit || 10;
    const threshold = req.threshold || 0.7;

    // Get or generate embedding for the source listing
    const sourceEmbedding = await generateEmbedding(req.listingId);

    // Find similar products using cosine similarity
    // Note: In production, you'd use a proper vector database or PostgreSQL's vector extension
    const similarProducts = await findSimilarProducts(
      sourceEmbedding.vector,
      req.listingId,
      limit,
      threshold
    );

    return {
      products: similarProducts,
      totalFound: similarProducts.length,
    };
  }
);

function extractFeatures(listing: any): Record<string, any> {
  // Extract relevant features from listing
  const titleWords = listing.title.toLowerCase().split(' ').filter((word: string) => word.length > 2);
  const priceRange = getPriceRange(listing.current_price);
  const category = listing.category_id || 'unknown';
  
  return {
    titleWords,
    priceRange,
    category,
    condition: listing.condition_id || 'unknown',
    hasImages: listing.image_urls ? listing.image_urls.length > 0 : false,
    listingType: listing.listing_type || 'auction',
  };
}

function hashFeatures(features: Record<string, any>): string {
  // Simple hash of features to detect changes
  const featureString = JSON.stringify(features);
  let hash = 0;
  for (let i = 0; i < featureString.length; i++) {
    const char = featureString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

async function generateFeatureVector(features: Record<string, any>): Promise<number[]> {
  // Simplified feature vector generation
  // In production, you'd use a proper ML model or embedding service
  
  const vector: number[] = new Array(128).fill(0);
  
  // Title word features (first 50 dimensions)
  const titleWords = features.titleWords || [];
  for (let i = 0; i < Math.min(titleWords.length, 50); i++) {
    const word = titleWords[i];
    const wordHash = simpleHash(word) % 50;
    vector[wordHash] = (vector[wordHash] || 0) + 1;
  }
  
  // Price range features (dimensions 50-60)
  const priceRange = features.priceRange || 0;
  vector[50 + priceRange] = 1;
  
  // Category features (dimensions 60-80)
  const categoryHash = simpleHash(features.category) % 20;
  vector[60 + categoryHash] = 1;
  
  // Condition features (dimensions 80-90)
  const conditionHash = simpleHash(features.condition) % 10;
  vector[80 + conditionHash] = 1;
  
  // Other features (dimensions 90-128)
  vector[90] = features.hasImages ? 1 : 0;
  vector[91] = features.listingType === 'auction' ? 1 : 0;
  vector[92] = features.listingType === 'buy_it_now' ? 1 : 0;
  
  // Normalize vector
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return magnitude > 0 ? vector.map(val => val / magnitude) : vector;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function getPriceRange(price: number): number {
  if (price < 10) return 0;
  if (price < 25) return 1;
  if (price < 50) return 2;
  if (price < 100) return 3;
  if (price < 250) return 4;
  if (price < 500) return 5;
  if (price < 1000) return 6;
  return 7;
}

async function findSimilarProducts(
  sourceVector: number[],
  sourceListingId: string,
  limit: number,
  threshold: number
): Promise<SimilarProduct[]> {
  // Get all embeddings except the source
  const embeddings = await mlDB.queryAll`
    SELECT pe.*, l.title, l.current_price
    FROM product_embeddings pe
    JOIN listings l ON pe.listing_id = l.id
    WHERE pe.listing_id != ${sourceListingId}
    ORDER BY pe.created_at DESC
    LIMIT 1000
  `;

  const similarities: Array<{
    listingId: string;
    title: string;
    currentPrice: number;
    similarity: number;
  }> = [];

  for (const embedding of embeddings) {
    const targetVector = embedding.embedding_vector;
    const similarity = cosineSimilarity(sourceVector, targetVector);
    
    if (similarity >= threshold) {
      similarities.push({
        listingId: embedding.listing_id,
        title: embedding.title,
        currentPrice: embedding.current_price,
        similarity,
      });
    }
  }

  // Sort by similarity and take top results
  similarities.sort((a, b) => b.similarity - a.similarity);
  
  return similarities.slice(0, limit).map(item => ({
    ...item,
    relationshipType: 'similar',
  }));
}

function cosineSimilarity(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
    normA += vectorA[i] * vectorA[i];
    normB += vectorB[i] * vectorB[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
