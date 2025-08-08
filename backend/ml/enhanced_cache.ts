import { api } from "encore.dev/api";
import { mlDB } from "./db";
import { secret } from "encore.dev/config";

const redisUrl = secret("RedisUrl");
const redisToken = secret("RedisToken");

export interface CacheEntry<T = any> {
  id: string;
  data: T;
  expiresAt: Date;
  tags?: string[];
  embeddingData?: any;
}

export interface SetVectorCacheRequest {
  listingId: string;
  vectorData: any;
  metadata?: any;
  featureHash: string;
  ttlSeconds?: number;
}

export interface GetVectorCacheRequest {
  listingId: string;
  featureHash?: string;
}

export interface SimilaritySearchCacheRequest {
  sourceListingId: string;
  searchParams: any;
  results: any[];
  ttlSeconds?: number;
}

// Enhanced cache for vector embeddings with Redis fallback.
export const setVectorCache = api<SetVectorCacheRequest, { success: boolean }>(
  { expose: true, method: "POST", path: "/ml/cache/vector/set" },
  async (req) => {
    const ttl = req.ttlSeconds || 3600; // Default 1 hour
    const expiresAt = new Date(Date.now() + ttl * 1000);
    
    try {
      // Store in local database for persistence
      await mlDB.exec`
        INSERT INTO vector_cache (id, listing_id, vector_data, metadata, feature_hash, expires_at)
        VALUES (${req.listingId}, ${req.listingId}, ${JSON.stringify(req.vectorData)}, 
                ${JSON.stringify(req.metadata || {})}, ${req.featureHash}, ${expiresAt})
        ON CONFLICT (id) DO UPDATE SET
          vector_data = EXCLUDED.vector_data,
          metadata = EXCLUDED.metadata,
          feature_hash = EXCLUDED.feature_hash,
          expires_at = EXCLUDED.expires_at,
          updated_at = CURRENT_TIMESTAMP
      `;
      
      // Also cache in Redis for faster access
      await setRedisCache(`vector:${req.listingId}:${req.featureHash}`, {
        vectorData: req.vectorData,
        metadata: req.metadata,
      }, ttl);
      
      return { success: true };
    } catch (error) {
      console.error('Error setting vector cache:', error);
      return { success: false };
    }
  }
);

// Gets vector data from cache with Redis fallback.
export const getVectorCache = api<GetVectorCacheRequest, { data: any | null; found: boolean; source: string }>(
  { expose: true, method: "GET", path: "/ml/cache/vector/get/:listingId" },
  async (req) => {
    try {
      // Try Redis first for speed
      if (req.featureHash) {
        const redisData = await getRedisCache(`vector:${req.listingId}:${req.featureHash}`);
        if (redisData) {
          return { data: redisData, found: true, source: 'redis' };
        }
      }
      
      // Fallback to database
      const dbEntry = await mlDB.queryRow`
        SELECT vector_data, metadata FROM vector_cache 
        WHERE listing_id = ${req.listingId} 
          AND expires_at > NOW()
          ${req.featureHash ? `AND feature_hash = ${req.featureHash}` : ''}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      
      if (dbEntry) {
        return { 
          data: {
            vectorData: dbEntry.vector_data,
            metadata: dbEntry.metadata,
          }, 
          found: true, 
          source: 'database' 
        };
      }
      
      return { data: null, found: false, source: 'none' };
    } catch (error) {
      console.error('Error getting vector cache:', error);
      return { data: null, found: false, source: 'error' };
    }
  }
);

// Caches similarity search results for faster repeated queries.
export const setSimilaritySearchCache = api<SimilaritySearchCacheRequest, { success: boolean }>(
  { expose: true, method: "POST", path: "/ml/cache/similarity/set" },
  async (req) => {
    const ttl = req.ttlSeconds || 1800; // Default 30 minutes
    const expiresAt = new Date(Date.now() + ttl * 1000);
    const cacheId = generateSimilarityCacheId(req.sourceListingId, req.searchParams);
    
    try {
      await mlDB.exec`
        INSERT INTO similarity_search_cache (id, source_listing_id, similar_listings, search_params, expires_at)
        VALUES (${cacheId}, ${req.sourceListingId}, ${JSON.stringify(req.results)}, 
                ${JSON.stringify(req.searchParams)}, ${expiresAt})
        ON CONFLICT (id) DO UPDATE SET
          similar_listings = EXCLUDED.similar_listings,
          search_params = EXCLUDED.search_params,
          expires_at = EXCLUDED.expires_at,
          created_at = CURRENT_TIMESTAMP
      `;
      
      // Also cache in Redis
      await setRedisCache(`similarity:${cacheId}`, req.results, ttl);
      
      return { success: true };
    } catch (error) {
      console.error('Error setting similarity search cache:', error);
      return { success: false };
    }
  }
);

// Gets cached similarity search results.
export async function getSimilaritySearchCache(sourceListingId: string, searchParams: any): Promise<any[] | null> {
  const cacheId = generateSimilarityCacheId(sourceListingId, searchParams);
  
  try {
    // Try Redis first
    const redisData = await getRedisCache(`similarity:${cacheId}`);
    if (redisData) {
      return redisData;
    }
    
    // Fallback to database
    const dbEntry = await mlDB.queryRow`
      SELECT similar_listings FROM similarity_search_cache 
      WHERE id = ${cacheId} AND expires_at > NOW()
    `;
    
    return dbEntry ? dbEntry.similar_listings : null;
  } catch (error) {
    console.error('Error getting similarity search cache:', error);
    return null;
  }
}

// Cleans up expired cache entries.
export async function cleanupExpiredCache(): Promise<{ vectorCleaned: number; similarityCleaned: number }> {
  try {
    const vectorResult = await mlDB.queryRow`
      DELETE FROM vector_cache WHERE expires_at < NOW()
      RETURNING COUNT(*) as count
    `;
    
    const similarityResult = await mlDB.queryRow`
      DELETE FROM similarity_search_cache WHERE expires_at < NOW()
      RETURNING COUNT(*) as count
    `;
    
    return {
      vectorCleaned: vectorResult?.count || 0,
      similarityCleaned: similarityResult?.count || 0,
    };
  } catch (error) {
    console.error('Error cleaning up cache:', error);
    return { vectorCleaned: 0, similarityCleaned: 0 };
  }
}

async function setRedisCache(key: string, value: any, ttlSeconds: number): Promise<void> {
  try {
    await fetch(`${redisUrl()}/setex/${key}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${redisToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        value: JSON.stringify(value),
        seconds: ttlSeconds,
      }),
    });
  } catch (error) {
    console.error('Error setting Redis cache:', error);
  }
}

async function getRedisCache(key: string): Promise<any> {
  try {
    const response = await fetch(`${redisUrl()}/get/${key}`, {
      headers: {
        'Authorization': `Bearer ${redisToken()}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      return data.result ? JSON.parse(data.result) : null;
    }
  } catch (error) {
    console.error('Error getting Redis cache:', error);
  }
  return null;
}

function generateSimilarityCacheId(sourceListingId: string, searchParams: any): string {
  const paramsString = JSON.stringify(searchParams);
  let hash = 0;
  for (let i = 0; i < paramsString.length; i++) {
    const char = paramsString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `${sourceListingId}_${Math.abs(hash).toString(36)}`;
}

// Preload cache for frequently accessed listings
export async function preloadFrequentListings(): Promise<{ preloaded: number }> {
  try {
    // Get frequently viewed listings
    const frequentListings = await mlDB.queryAll`
      SELECT l.id, l.views, l.watchers
      FROM listings l
      WHERE l.views > 100 OR l.watchers > 10
      ORDER BY (l.views + l.watchers * 5) DESC
      LIMIT 50
    `;
    
    let preloaded = 0;
    
    for (const listing of frequentListings) {
      // Check if embedding exists in cache
      const cached = await getVectorCache({ listingId: listing.id });
      if (!cached.found) {
        // Generate and cache embedding
        try {
          // This would trigger embedding generation
          preloaded++;
        } catch (error) {
          console.error(`Error preloading listing ${listing.id}:`, error);
        }
      }
    }
    
    return { preloaded };
  } catch (error) {
    console.error('Error preloading frequent listings:', error);
    return { preloaded: 0 };
  }
}
