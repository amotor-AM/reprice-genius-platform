import { secret } from "encore.dev/config";

const redisUrl = secret("RedisUrl");
const redisToken = secret("RedisToken");

export async function setCache(key: string, value: any, ttlSeconds: number): Promise<void> {
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

export async function getCache<T>(key: string): Promise<T | null> {
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

export async function getCachedOrCompute<T>(
  key: string,
  computeFn: () => Promise<T>,
  ttlSeconds: number = 3600
): Promise<T> {
  const cached = await getCache<T>(key);
  if (cached) {
    return cached;
  }
  
  const value = await computeFn();
  await setCache(key, value, ttlSeconds);
  return value;
}
