import { secret } from "encore.dev/config";
import { marketDB } from "./db";
import { marketEventsTopic } from "./events";
import { setCache } from "./cache";

const rapidApiKey = secret("RapidApiKey");
const proxyUrl = secret("ProxyUrl"); // For scraping

// Simulates web scraping with rate limiting and proxy rotation
async function scrapeData(url: string) {
  console.log(`Scraping ${url} using proxy...`);
  // In a real implementation, use a library like axios or node-fetch with proxy agent
  // and implement rate limiting logic (e.g., using a token bucket algorithm).
  // const response = await fetch(url, { agent: new HttpsProxyAgent(proxyUrl()) });
  // For now, return mock data
  return {
    price: Math.random() * 100,
    stock: Math.floor(Math.random() * 50),
  };
}

// Fetches data from eBay (simulated)
async function fetchEbayData(query: string) {
  // In production, this would use the eBay API
  return {
    avgPrice: 45.0 + Math.random() * 10,
    activeListings: 100 + Math.floor(Math.random() * 50),
  };
}

// Fetches data from Amazon via RapidAPI
async function fetchAmazonData(query: string) {
  try {
    const response = await fetch(`https://amazon-data1.p.rapidapi.com/search?query=${encodeURIComponent(query)}`, {
      headers: {
        'X-RapidAPI-Key': rapidApiKey(),
        'X-RapidAPI-Host': 'amazon-data1.p.rapidapi.com',
      },
    });
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error('Amazon API error:', error);
  }
  return null;
}

// Fetches data from Google Trends (simulated)
async function fetchGoogleTrendsData(query: string) {
  return {
    searchVolume: 1000 + Math.floor(Math.random() * 500),
    trend: Math.random() > 0.5 ? 'rising' : 'stable',
  };
}

// Aggregates data from all sources for a given category
export async function aggregateCategoryData(categoryId: string) {
  const [ebayData, amazonData, googleTrendsData] = await Promise.all([
    fetchEbayData(categoryId),
    fetchAmazonData(categoryId),
    fetchGoogleTrendsData(categoryId),
  ]);

  const aggregatedData = {
    ebay: ebayData,
    amazon: amazonData,
    googleTrends: googleTrendsData,
    timestamp: new Date(),
  };

  // Store trend data
  await marketDB.exec`
    INSERT INTO market_trends (category_id, trend_type, trend_value, period, source, calculated_at)
    VALUES 
      (${categoryId}, 'price', ${ebayData.avgPrice}, 'realtime', 'ebay', NOW()),
      (${categoryId}, 'supply', ${ebayData.activeListings}, 'realtime', 'ebay', NOW()),
      (${categoryId}, 'demand', ${googleTrendsData.searchVolume}, 'realtime', 'google_trends', NOW())
    ON CONFLICT (category_id, product_id, trend_type, period, source) DO UPDATE SET
      trend_value = EXCLUDED.trend_value,
      calculated_at = NOW()
  `;

  // Cache the aggregated data
  await setCache(`market_data:${categoryId}`, aggregatedData, 3600); // Cache for 1 hour

  // Publish market event
  await marketEventsTopic.publish({
    eventType: 'trend_update',
    payload: { categoryId, data: aggregatedData },
    timestamp: new Date(),
  });

  return aggregatedData;
}
