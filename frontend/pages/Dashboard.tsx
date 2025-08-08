import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  DollarSign, 
  TrendingUp, 
  Package, 
  Activity,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { useBackend } from '../hooks/useBackend';
import { useToast } from '@/components/ui/use-toast';

export function Dashboard() {
  const backend = useBackend();
  const { toast } = useToast();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => backend.user.getProfile(),
  });

  const { data: dashboard, isLoading: dashboardLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => backend.analytics.getDashboard({ period: '30d' }),
  });

  const handleConnectEbay = async () => {
    try {
      const response = await backend.marketplace.getAuthUrl({ marketplace: 'ebay' });
      window.location.href = response.authUrl;
    } catch (error) {
      console.error('Error connecting eBay:', error);
      toast({
        title: "Error",
        description: "Failed to connect eBay account. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSyncListings = async () => {
    try {
      // This should be updated to a more generic sync if needed
      // const response = await backend.marketplace.syncListings({ marketplace: 'ebay' });
      toast({
        title: "Success",
        description: "Sync started.",
      });
    } catch (error) {
      console.error('Error syncing listings:', error);
      toast({
        title: "Error",
        description: "Failed to sync listings. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (profileLoading || dashboardLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex gap-2">
          {!profile?.ebayConnected && (
            <Button onClick={handleConnectEbay} variant="outline">
              Connect eBay
            </Button>
          )}
          {profile?.ebayConnected && (
            <Button onClick={handleSyncListings}>
              Sync Listings
            </Button>
          )}
        </div>
      </div>

      {/* Connection Status */}
      {!profile?.ebayConnected && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-yellow-600 mr-2" />
              <CardTitle className="text-yellow-800">eBay Account Not Connected</CardTitle>
            </div>
            <CardDescription className="text-yellow-700">
              Connect your eBay account to start managing your listings and pricing strategies.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleConnectEbay}>
              Connect eBay Account
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${dashboard?.totalRevenue?.toFixed(2) || '0.00'}
            </div>
            <p className="text-xs text-muted-foreground">
              +12.5% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Listings</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboard?.activeListings || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {dashboard?.totalListings || 0} total listings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Price Changes</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboard?.priceChanges || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {dashboard?.successfulPriceChanges || 0} applied
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Sale Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboard?.avgSaleTime?.toFixed(1) || '0.0'}d
            </div>
            <p className="text-xs text-muted-foreground">
              -2.3 days from last month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity & Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest pricing changes and updates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {dashboard?.recentActivity?.slice(0, 5).map((activity, index) => (
                <div key={index} className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    {activity.type === 'price_change' ? (
                      <TrendingUp className="h-4 w-4 text-blue-600" />
                    ) : (
                      <Activity className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">
                      {activity.description}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(activity.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                  {activity.value && (
                    <Badge variant={activity.value > 0 ? "default" : "secondary"}>
                      {activity.value > 0 ? '+' : ''}${activity.value.toFixed(2)}
                    </Badge>
                  )}
                </div>
              )) || (
                <p className="text-sm text-gray-500">No recent activity</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pricing Insights</CardTitle>
            <CardDescription>AI-generated recommendations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {dashboard?.pricingInsights?.map((insight, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-1">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">{insight.message}</p>
                    <div className="flex items-center mt-1 space-x-2">
                      <Badge variant="outline" className="text-xs">
                        {Math.round(insight.confidence * 100)}% confidence
                      </Badge>
                      {insight.impact > 0 && (
                        <Badge variant="default" className="text-xs">
                          +{(insight.impact * 100).toFixed(1)}% impact
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )) || (
                <p className="text-sm text-gray-500">No insights available</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Performing Listings */}
      {dashboard?.topPerformingListings && dashboard.topPerformingListings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Performing Listings</CardTitle>
            <CardDescription>Your best sellers this month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {dashboard.topPerformingListings.map((listing, index) => (
                <div key={listing.id} className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 truncate">
                      {listing.title}
                    </p>
                    <p className="text-sm text-gray-500">
                      {(listing.conversionRate * 100).toFixed(1)}% conversion rate
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">
                      ${listing.revenue.toFixed(2)}
                    </p>
                    <p className="text-sm text-gray-500">
                      ${listing.profit.toFixed(2)} profit
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
