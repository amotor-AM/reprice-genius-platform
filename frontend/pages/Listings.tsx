import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  TrendingUp, 
  Eye, 
  Heart, 
  Package,
  DollarSign,
  Settings,
  RefreshCw
} from 'lucide-react';
import { useBackend } from '../hooks/useBackend';
import { useToast } from '@/components/ui/use-toast';
import { PricingModal } from '../components/PricingModal';

export function Listings() {
  const backend = useBackend();
  const { toast } = useToast();
  const [selectedListing, setSelectedListing] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: listings, isLoading, refetch } = useQuery({
    queryKey: ['listings', statusFilter],
    queryFn: () => backend.ebay.listItems({ 
      status: statusFilter === 'all' ? undefined : statusFilter,
      limit: 50 
    }),
  });

  const handleSyncListings = async () => {
    try {
      const response = await backend.ebay.syncListings();
      toast({
        title: "Success",
        description: response.message,
      });
      refetch();
    } catch (error) {
      console.error('Error syncing listings:', error);
      toast({
        title: "Error",
        description: "Failed to sync listings. Please try again.",
        variant: "destructive",
      });
    }
  };

  const filteredListings = listings?.listings?.filter(listing =>
    listing.title.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Listings</h1>
        <Button onClick={handleSyncListings}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Sync Listings
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search listings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Listings</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="sold">Sold</SelectItem>
            <SelectItem value="ended">Ended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Listings Grid */}
      {filteredListings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No listings found</h3>
            <p className="text-gray-500 text-center mb-4">
              {listings?.listings?.length === 0 
                ? "Connect your eBay account and sync your listings to get started."
                : "No listings match your current filters."
              }
            </p>
            {listings?.listings?.length === 0 && (
              <Button onClick={handleSyncListings}>
                Sync eBay Listings
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredListings.map((listing) => (
            <Card key={listing.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg line-clamp-2">
                    {listing.title}
                  </CardTitle>
                  <Badge 
                    variant={listing.status === 'active' ? 'default' : 'secondary'}
                    className="ml-2 flex-shrink-0"
                  >
                    {listing.status}
                  </Badge>
                </div>
                <CardDescription>
                  eBay ID: {listing.ebayItemId}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Price Information */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      ${listing.currentPrice.toFixed(2)}
                    </p>
                    {listing.currentPrice !== listing.originalPrice && (
                      <p className="text-sm text-gray-500">
                        Originally ${listing.originalPrice.toFixed(2)}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">
                      Qty: {listing.quantity}
                    </p>
                    {listing.soldQuantity > 0 && (
                      <p className="text-sm text-green-600">
                        {listing.soldQuantity} sold
                      </p>
                    )}
                  </div>
                </div>

                {/* Engagement Metrics */}
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <div className="flex items-center">
                    <Eye className="h-4 w-4 mr-1" />
                    {listing.views}
                  </div>
                  <div className="flex items-center">
                    <Heart className="h-4 w-4 mr-1" />
                    {listing.watchers}
                  </div>
                  <div className="flex items-center">
                    <TrendingUp className="h-4 w-4 mr-1" />
                    {listing.targetProfitMargin * 100}%
                  </div>
                </div>

                {/* Auto-reprice Status */}
                <div className="flex items-center justify-between">
                  <Badge variant={listing.autoRepriceEnabled ? 'default' : 'outline'}>
                    {listing.autoRepriceEnabled ? 'Auto-reprice ON' : 'Auto-reprice OFF'}
                  </Badge>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedListing(listing.id)}
                    >
                      <DollarSign className="h-4 w-4 mr-1" />
                      Price
                    </Button>
                    <Button size="sm" variant="outline">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Price Bounds */}
                {(listing.minPrice || listing.maxPrice) && (
                  <div className="text-xs text-gray-500">
                    Price range: 
                    {listing.minPrice && ` $${listing.minPrice.toFixed(2)} min`}
                    {listing.minPrice && listing.maxPrice && ' - '}
                    {listing.maxPrice && ` $${listing.maxPrice.toFixed(2)} max`}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pricing Modal */}
      {selectedListing && (
        <PricingModal
          listingId={selectedListing}
          onClose={() => setSelectedListing(null)}
          onSuccess={() => {
            setSelectedListing(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}
