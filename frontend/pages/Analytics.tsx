import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Target,
  Clock,
  BarChart3
} from 'lucide-react';
import { useState } from 'react';
import { useBackend } from '../hooks/useBackend';

export function Analytics() {
  const backend = useBackend();
  const [period, setPeriod] = useState('30d');

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard', period],
    queryFn: () => backend.analytics.getDashboard({ period }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const conversionRate = dashboard?.avgConversionRate || 0;
  const profitMargin = dashboard?.totalRevenue ? 
    (dashboard.totalProfit / dashboard.totalRevenue) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="1y">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Key Performance Indicators */}
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
            <div className="flex items-center text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
              +12.5% from last period
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profit Margin</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {profitMargin.toFixed(1)}%
            </div>
            <div className="flex items-center text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
              +2.1% from last period
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(conversionRate * 100).toFixed(1)}%
            </div>
            <div className="flex items-center text-xs text-muted-foreground">
              <TrendingDown className="h-3 w-3 mr-1 text-red-500" />
              -0.8% from last period
            </div>
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
            <div className="flex items-center text-xs text-muted-foreground">
              <TrendingDown className="h-3 w-3 mr-1 text-green-500" />
              -2.3 days from last period
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pricing Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Pricing Decisions</CardTitle>
            <CardDescription>AI-powered pricing performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total Decisions</span>
                <Badge variant="outline">{dashboard?.priceChanges || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Applied Changes</span>
                <Badge variant="default">{dashboard?.successfulPriceChanges || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Success Rate</span>
                <Badge variant="secondary">
                  {dashboard?.priceChanges ? 
                    Math.round((dashboard.successfulPriceChanges / dashboard.priceChanges) * 100) : 0}%
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Avg Confidence</span>
                <Badge variant="outline">87%</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Market Insights</CardTitle>
            <CardDescription>Current market conditions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Market Trend</span>
                <div className="flex items-center">
                  <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                  <span className="text-sm text-green-600">Bullish</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Demand Level</span>
                <Badge variant="default">High</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Competition</span>
                <Badge variant="secondary">Moderate</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Seasonal Factor</span>
                <Badge variant="outline">+15%</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Performing Listings */}
      {dashboard?.topPerformingListings && dashboard.topPerformingListings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Performing Listings</CardTitle>
            <CardDescription>Your most profitable items this period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {dashboard.topPerformingListings.map((listing, index) => (
                <div key={listing.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline">#{index + 1}</Badge>
                      <h4 className="font-medium text-gray-900 truncate">
                        {listing.title}
                      </h4>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {(listing.conversionRate * 100).toFixed(1)}% conversion rate
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg text-gray-900">
                      ${listing.revenue.toFixed(2)}
                    </p>
                    <p className="text-sm text-green-600">
                      ${listing.profit.toFixed(2)} profit
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pricing Insights */}
      {dashboard?.pricingInsights && dashboard.pricingInsights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>AI Insights & Recommendations</CardTitle>
            <CardDescription>Data-driven suggestions to improve performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {dashboard.pricingInsights.map((insight, index) => (
                <div key={index} className="flex items-start space-x-3 p-4 border rounded-lg">
                  <div className="flex-shrink-0 mt-1">
                    {insight.type === 'success_rate' && <BarChart3 className="h-5 w-5 text-blue-600" />}
                    {insight.type === 'market_trend' && <TrendingUp className="h-5 w-5 text-green-600" />}
                    {insight.type === 'optimization' && <Target className="h-5 w-5 text-purple-600" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">{insight.message}</p>
                    <div className="flex items-center mt-2 space-x-2">
                      <Badge variant="outline" className="text-xs">
                        {Math.round(insight.confidence * 100)}% confidence
                      </Badge>
                      {insight.impact > 0 && (
                        <Badge variant="default" className="text-xs">
                          +{(insight.impact * 100).toFixed(1)}% potential impact
                        </Badge>
                      )}
                    </div>
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
