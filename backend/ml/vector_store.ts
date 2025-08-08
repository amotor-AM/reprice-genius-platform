import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { mlDB } from "./db";
import { ebayDB } from "../ebay/db";
import { secret } from "encore.dev/config";

const upstashVectorUrl = secret("UpstashVectorUrl");
const upstashVectorToken = secret("UpstashVectorToken");
const redisUrl = secret("RedisUrl");
const redisToken = secret("RedisToken");

export interface ProductEmbedding {
  listingId: string;
  vector: number[];
  modelVersion: string;
  featureHash: string;
  metadata: {
    title: string;
    description?: string;
    category?: string;
    brand?: string;
    condition?: string;
    priceRange: string;
  };
}

export interface SimilarProduct {
  listingId: string;
  title: string;
  currentPrice: number;
  similarity: number;
  relationshipType: string;
  metadata: {
    category?: string;
    brand?: string;
    condition?: string;
  };
}

export interface GenerateEmbeddingRequest {
  listingId: string;
}

export interface GenerateEmbeddingResponse {
  success: boolean;
  embeddingId: string;
  vector: number[];
  metadata: Record<string, any>;
}

export interface FindSimilarRequest {
  listingId: string;
  limit?: number;
  threshold?: number;
  includeMetadata?: boolean;
}

export interface FindSimilarResponse {
  products: SimilarProduct[];
  totalFound: number;
  queryTime: number;
}

// Generates and stores product embeddings using vector database.
export const generateEmbedding = api<GenerateEmbeddingRequest, GenerateEmbeddingResponse>(
  { auth: true, expose: true, method: "POST", path: "/ml/embeddings/generate" },
  async (req) => {
    const auth = getAuthData()!;

    // Get listing details
    const listing = await ebayDB.queryRow`
      SELECT l.*, u.id as user_id FROM listings l
      JOIN users u ON l.user_id = u.id
      WHERE l.id = ${req.listingId} AND l.user_id = ${auth.userID}
    `;

    if (!listing) {
      throw APIError.notFound("Listing not found");
    }

    try {
      // Extract features for embedding
      const features = extractProductFeatures(listing);
      const featureHash = hashFeatures(features);
      
      // Check cache first
      const cachedEmbedding = await getCachedEmbedding(req.listingId, featureHash);
      if (cachedEmbedding) {
        return {
          success: true,
          embeddingId: cachedEmbedding.id,
          vector: cachedEmbedding.vector,
          metadata: cachedEmbedding.metadata,
        };
      }

      // Generate new embedding vector
      const vector = await generateFeatureVector(features);
      const modelVersion = "upstash_v1.0";

      // Store in Upstash Vector
      const vectorId = await storeInUpstashVector(req.listingId, vector, features);

      // Store metadata in local database
      await mlDB.exec`
        INSERT INTO product_embeddings (listing_id, embedding_vector, model_version, feature_hash, metadata)
        VALUES (${req.listingId}, ${JSON.stringify(vector)}, ${modelVersion}, ${featureHash}, ${JSON.stringify(features)})
        ON CONFLICT (listing_id) DO UPDATE SET
          embedding_vector = EXCLUDED.embedding_vector,
          model_version = EXCLUDED.model_version,
          feature_hash = EXCLUDED.feature_hash,
          metadata = EXCLUDED.metadata,
          updated_at = CURRENT_TIMESTAMP
      `;

      // Cache the result
      await cacheEmbedding(req.listingId, featureHash, {
        id: vectorId,
        vector,
        metadata: features,
      });

      return {
        success: true,
        embeddingId: vectorId,
        vector,
        metadata: features,
      };
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw APIError.internal("Failed to generate embedding");
    }
  }
);

// Finds similar products using vector similarity search.
export const findSimilarProducts = api<FindSimilarRequest, FindSimilarResponse>(
  { auth: true, expose: true, method: "POST", path: "/ml/similar-products" },
  async (req) => {
    const auth = getAuthData()!;
    const limit = Math.min(req.limit || 10, 50);
    const threshold = req.threshold || 0.7;
    const startTime = Date.now();

    try {
      // Get or generate embedding for the source listing
      const sourceEmbedding = await getOrGenerateEmbedding(req.listingId, auth.userID);

      // Query Upstash Vector for similar products
      const similarVectors = await queryUpstashVector(
        sourceEmbedding.vector,
        limit + 1, // +1 to exclude self
        threshold
      );

      // Filter out the source listing and get product details
      const similarProducts: SimilarProduct[] = [];
      
      for (const result of similarVectors) {
        if (result.id === req.listingId) continue; // Skip self
        
        // Get listing details from database
        const listing = await ebayDB.queryRow`
          SELECT id, title, current_price, category_id, condition_id
          FROM listings 
          WHERE id = ${result.id}
        `;

        if (listing) {
          similarProducts.push({
            listingId: listing.id,
            title: listing.title,
            currentPrice: listing.current_price,
            similarity: result.score,
            relationshipType: determineRelationshipType(result.score),
            metadata: {
              category: listing.category_id,
              condition: listing.condition_id,
            },
          });
        }
      }

      const queryTime = Date.now() - startTime;

      return {
        products: similarProducts.slice(0, limit),
        totalFound: similarProducts.length,
        queryTime,
      };
    } catch (error) {
      console.error('Error finding similar products:', error);
      throw APIError.internal("Failed to find similar products");
    }
  }
);

function extractProductFeatures(listing: any): Record<string, any> {
  const title = listing.title || '';
  const description = listing.description || '';
  const category = listing.category_id || 'unknown';
  const condition = listing.condition_id || 'unknown';
  const priceRange = getPriceRange(listing.current_price);
  
  // Extract brand from title (simplified)
  const brand = extractBrandFromTitle(title);
  
  return {
    title: title.toLowerCase(),
    description: description.toLowerCase(),
    category,
    brand,
    condition,
    priceRange,
    price: listing.current_price,
  };
}

function extractBrandFromTitle(title: string): string {
  // Common brand patterns - in production, use a comprehensive brand database
  const commonBrands = [
    'apple', 'samsung', 'nike', 'adidas', 'sony', 'microsoft', 'dell', 'hp',
    'canon', 'nikon', 'lego', 'disney', 'marvel', 'nintendo', 'playstation'
  ];
  
  const titleLower = title.toLowerCase();
  for (const brand of commonBrands) {
    if (titleLower.includes(brand)) {
      return brand;
    }
  }
  return 'unknown';
}

function hashFeatures(features: Record<string, any>): string {
  const featureString = JSON.stringify(features);
  let hash = 0;
  for (let i = 0; i < featureString.length; i++) {
    const char = featureString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

async function generateFeatureVector(features: Record<string, any>): Promise<number[]> {
  // Enhanced feature vector generation with semantic understanding
  const vector: number[] = new Array(384).fill(0); // Standard embedding size
  
  // Title features (dimensions 0-127)
  const titleWords = features.title.split(' ').filter((word: string) => word.length > 2);
  for (let i = 0; i < Math.min(titleWords.length, 64); i++) {
    const word = titleWords[i];
    const wordHash = simpleHash(word) % 64;
    vector[wordHash] = (vector[wordHash] || 0) + 1;
    // Add semantic weight
    vector[64 + wordHash] = getSemanticWeight(word);
  }
  
  // Category features (dimensions 128-159)
  const categoryHash = simpleHash(features.category) % 32;
  vector[128 + categoryHash] = 1;
  
  // Brand features (dimensions 160-191)
  const brandHash = simpleHash(features.brand) % 32;
  vector[160 + brandHash] = 1;
  
  // Condition features (dimensions 192-207)
  const conditionHash = simpleHash(features.condition) % 16;
  vector[192 + conditionHash] = 1;
  
  // Price range features (dimensions 208-223)
  const priceRangeIndex = typeof features.priceRange === 'string' ? 
    parseInt(features.priceRange) : features.priceRange;
  if (priceRangeIndex >= 0 && priceRangeIndex < 16) {
    vector[208 + priceRangeIndex] = 1;
  }
  
  // Description features (dimensions 224-319)
  if (features.description) {
    const descWords = features.description.split(' ').filter((word: string) => word.length > 3);
    for (let i = 0; i < Math.min(descWords.length, 48); i++) {
      const word = descWords[i];
      const wordHash = simpleHash(word) % 48;
      vector[224 + wordHash] = (vector[224 + wordHash] || 0) + 0.5;
      // Add TF-IDF like weighting
      vector[272 + wordHash] = Math.log(1 + descWords.length / (1 + wordHash));
    }
  }
  
  // Normalize vector
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return magnitude > 0 ? vector.map(val => val / magnitude) : vector;
}

function getSemanticWeight(word: string): number {
  // Assign semantic weights to important words
  const importantWords = {
    'new': 0.9, 'used': 0.7, 'vintage': 0.8, 'rare': 0.9, 'limited': 0.8,
    'original': 0.8, 'authentic': 0.9, 'genuine': 0.8, 'mint': 0.9,
    'excellent': 0.8, 'good': 0.6, 'fair': 0.4, 'poor': 0.2
  };
  return importantWords[word.toLowerCase()] || 0.5;
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

function getPriceRange(price: number): string {
  if (price < 10) return "0";
  if (price < 25) return "1";
  if (price < 50) return "2";
  if (price < 100) return "3";
  if (price < 250) return "4";
  if (price < 500) return "5";
  if (price < 1000) return "6";
  return "7";
}

async function storeInUpstashVector(listingId: string, vector: number[], metadata: any): Promise<string> {
  try {
    const response = await fetch(`${upstashVectorUrl()}/upsert`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${upstashVectorToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: listingId,
        vector: vector,
        metadata: metadata,
      }),
    });

    if (!response.ok) {
      throw new Error(`Upstash Vector API error: ${response.statusText}`);
    }

    return listingId;
  } catch (error) {
    console.error('Error storing in Upstash Vector:', error);
    throw error;
  }
}

async function queryUpstashVector(vector: number[], topK: number, threshold: number): Promise<Array<{id: string, score: number, metadata?: any}>> {
  try {
    const response = await fetch(`${upstashVectorUrl()}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${upstashVectorToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vector: vector,
        topK: topK,
        includeMetadata: true,
        filter: `score >= ${threshold}`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Upstash Vector query error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.matches || [];
  } catch (error) {
    console.error('Error querying Upstash Vector:', error);
    throw error;
  }
}

async function getCachedEmbedding(listingId: string, featureHash: string): Promise<any> {
  try {
    const response = await fetch(`${redisUrl()}/get/embedding:${listingId}:${featureHash}`, {
      headers: {
        'Authorization': `Bearer ${redisToken()}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      return data.result ? JSON.parse(data.result) : null;
    }
  } catch (error) {
    console.error('Error getting cached embedding:', error);
  }
  return null;
}

async function cacheEmbedding(listingId: string, featureHash: string, embedding: any): Promise<void> {
  try {
    await fetch(`${redisUrl()}/setex/embedding:${listingId}:${featureHash}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${redisToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        value: JSON.stringify(embedding),
        seconds: 3600, // Cache for 1 hour
      }),
    });
  } catch (error) {
    console.error('Error caching embedding:', error);
  }
}

async function getOrGenerateEmbedding(listingId: string, userId: string): Promise<ProductEmbedding> {
  // Try to get existing embedding
  const existing = await mlDB.queryRow`
    SELECT * FROM product_embeddings WHERE listing_id = ${listingId}
  `;

  if (existing) {
    return {
      listingId,
      vector: existing.embedding_vector,
      modelVersion: existing.model_version,
      featureHash: existing.feature_hash,
      metadata: existing.metadata,
    };
  }

  // Generate new embedding
  const response = await generateEmbedding.call({ listingId });
  return {
    listingId,
    vector: response.vector,
    modelVersion: "upstash_v1.0",
    featureHash: "",
    metadata: response.metadata,
  };
}

function determineRelationshipType(similarity: number): string {
  if (similarity >= 0.9) return 'identical';
  if (similarity >= 0.8) return 'very_similar';
  if (similarity >= 0.7) return 'similar';
  if (similarity >= 0.6) return 'related';
  return 'loosely_related';
}
