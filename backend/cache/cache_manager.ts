import { api } from "encore.dev/api";
import { mlDB } from "../ml/db";

export interface CacheEntry<T = any> {
  id: string;
  data: T;
  expiresAt: Date;
  tags?: string[];
}

export interface SetCacheRequest {
  key: string;
  data: any;
  ttlSeconds?: number;
  tags?: string[];
}

export interface GetCacheRequest {
  key: string;
}

export interface InvalidateCacheRequest {
  keys?: string[];
  tags?: string[];
}

// Sets a value in the cache with optional TTL and tags.
export const setCache = api<SetCacheRequest, { success: boolean }>(
  { expose: true, method: "POST", path: "/cache/set" },
  async (req) => {
    const ttl = req.ttlSeconds || 3600; // Default 1 hour
    const expiresAt = new Date(Date.now() + ttl * 1000);
    
    await mlDB.exec`
      INSERT INTO cache_entries (id, data, expires_at, tags)
      VALUES (${req.key}, ${JSON.stringify(req.data)}, ${expiresAt}, ${req.tags || []})
      ON CONFLICT (id) DO UPDATE SET
        data = EXCLUDED.data,
        expires_at = EXCLUDED.expires_at,
        tags = EXCLUDED.tags
    `;
    
    return { success: true };
  }
);

// Gets a value from the cache.
export const getCache = api<GetCacheRequest, { data: any | null; found: boolean }>(
  { expose: true, method: "GET", path: "/cache/get/:key" },
  async (req) => {
    // Clean up expired entries first
    await mlDB.exec`DELETE FROM cache_entries WHERE expires_at < NOW()`;
    
    const entry = await mlDB.queryRow`
      SELECT data FROM cache_entries 
      WHERE id = ${req.key} AND expires_at > NOW()
    `;
    
    if (entry) {
      return { data: entry.data, found: true };
    }
    
    return { data: null, found: false };
  }
);

// Invalidates cache entries by keys or tags.
export const invalidateCache = api<InvalidateCacheRequest, { invalidated: number }>(
  { expose: true, method: "POST", path: "/cache/invalidate" },
  async (req) => {
    let deletedCount = 0;
    
    if (req.keys && req.keys.length > 0) {
      const result = await mlDB.queryRow`
        DELETE FROM cache_entries WHERE id = ANY(${req.keys})
        RETURNING COUNT(*) as count
      `;
      deletedCount += result?.count || 0;
    }
    
    if (req.tags && req.tags.length > 0) {
      for (const tag of req.tags) {
        const result = await mlDB.queryRow`
          DELETE FROM cache_entries WHERE tags @> ARRAY[${tag}]
          RETURNING COUNT(*) as count
        `;
        deletedCount += result?.count || 0;
      }
    }
    
    return { invalidated: deletedCount };
  }
);

// Helper functions for common caching patterns
export async function getCachedOrCompute<T>(
  key: string,
  computeFn: () => Promise<T>,
  ttlSeconds: number = 3600,
  tags: string[] = []
): Promise<T> {
  // Try to get from cache first
  const cached = await getCache({ key });
  if (cached.found) {
    return cached.data;
  }
  
  // Compute the value
  const value = await computeFn();
  
  // Store in cache
  await setCache({
    key,
    data: value,
    ttlSeconds,
    tags,
  });
  
  return value;
}

export async function invalidateByPattern(pattern: string): Promise<number> {
  // Simple pattern matching for cache invalidation
  const entries = await mlDB.queryAll`
    SELECT id FROM cache_entries WHERE id LIKE ${pattern.replace('*', '%')}
  `;
  
  if (entries.length === 0) {
    return 0;
  }
  
  const keys = entries.map(entry => entry.id);
  const result = await invalidateCache({ keys });
  return result.invalidated;
}
