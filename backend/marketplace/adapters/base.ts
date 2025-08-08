export interface MarketplaceAdapter {
  getAuthUrl(userId: string): Promise<{ authUrl: string }>;
  handleCallback(userId: string, code: string): Promise<void>;
  syncListings(userId: string): Promise<{ synced: number; updated: number }>;
  updatePrice(marketplaceListingId: string, newPrice: number): Promise<void>;
  // ... other common methods like getOrders, shipOrder, etc.
}
