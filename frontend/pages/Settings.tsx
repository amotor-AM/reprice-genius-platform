import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  User, 
  CreditCard, 
  Bell, 
  Shield,
  ExternalLink,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { useBackend } from '../hooks/useBackend';
import { useToast } from '@/components/ui/use-toast';

export function Settings() {
  const backend = useBackend();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState({
    priceChanges: true,
    marketAlerts: true,
    weeklyReports: false,
  });

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => backend.user.getProfile(),
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Settings</h1>

      {/* Account Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <User className="h-5 w-5" />
            <CardTitle>Account Information</CardTitle>
          </div>
          <CardDescription>
            Manage your account details and preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={profile?.email || ''}
                disabled
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="subscription">Subscription</Label>
              <div className="mt-1">
                <Badge variant={profile?.subscriptionStatus === 'active' ? 'default' : 'secondary'}>
                  {profile?.subscriptionTier || 'Free'} Plan
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* eBay Integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <ExternalLink className="h-5 w-5" />
            <CardTitle>eBay Integration</CardTitle>
          </div>
          <CardDescription>
            Connect and manage your eBay account integration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {profile?.ebayConnected ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-yellow-600" />
              )}
              <div>
                <p className="font-medium">
                  eBay Account {profile?.ebayConnected ? 'Connected' : 'Not Connected'}
                </p>
                <p className="text-sm text-gray-500">
                  {profile?.ebayConnected 
                    ? 'Your eBay account is successfully connected and syncing'
                    : 'Connect your eBay account to start managing listings'
                  }
                </p>
              </div>
            </div>
            {!profile?.ebayConnected && (
              <Button onClick={handleConnectEbay}>
                Connect eBay
              </Button>
            )}
          </div>
          
          {profile?.ebayConnected && (
            <>
              <Separator />
              <div className="space-y-3">
                <h4 className="font-medium">Auto-Repricing Settings</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="auto-reprice">Enable Auto-Repricing</Label>
                      <p className="text-sm text-gray-500">
                        Automatically apply AI-suggested price changes
                      </p>
                    </div>
                    <Switch id="auto-reprice" defaultChecked={false} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="min-confidence">Minimum Confidence (%)</Label>
                      <Input
                        id="min-confidence"
                        type="number"
                        placeholder="80"
                        min="0"
                        max="100"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="max-change">Max Price Change (%)</Label>
                      <Input
                        id="max-change"
                        type="number"
                        placeholder="10"
                        min="0"
                        max="50"
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Bell className="h-5 w-5" />
            <CardTitle>Notifications</CardTitle>
          </div>
          <CardDescription>
            Configure how you want to be notified about important events
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="price-changes">Price Change Alerts</Label>
                <p className="text-sm text-gray-500">
                  Get notified when prices are automatically updated
                </p>
              </div>
              <Switch
                id="price-changes"
                checked={notifications.priceChanges}
                onCheckedChange={(checked) =>
                  setNotifications(prev => ({ ...prev, priceChanges: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="market-alerts">Market Alerts</Label>
                <p className="text-sm text-gray-500">
                  Receive alerts about significant market changes
                </p>
              </div>
              <Switch
                id="market-alerts"
                checked={notifications.marketAlerts}
                onCheckedChange={(checked) =>
                  setNotifications(prev => ({ ...prev, marketAlerts: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="weekly-reports">Weekly Reports</Label>
                <p className="text-sm text-gray-500">
                  Get weekly performance summaries via email
                </p>
              </div>
              <Switch
                id="weekly-reports"
                checked={notifications.weeklyReports}
                onCheckedChange={(checked) =>
                  setNotifications(prev => ({ ...prev, weeklyReports: checked }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription & Billing */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <CreditCard className="h-5 w-5" />
            <CardTitle>Subscription & Billing</CardTitle>
          </div>
          <CardDescription>
            Manage your subscription and billing information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Current Plan</p>
              <p className="text-sm text-gray-500">
                {profile?.subscriptionTier || 'Free'} Plan - 
                {profile?.subscriptionStatus === 'active' ? ' Active' : ' Inactive'}
              </p>
            </div>
            <Button variant="outline">
              Upgrade Plan
            </Button>
          </div>
          
          {profile?.subscriptionStatus === 'active' && (
            <>
              <Separator />
              <div className="space-y-3">
                <h4 className="font-medium">Billing Information</h4>
                <div className="text-sm text-gray-600">
                  <p>Next billing date: January 15, 2024</p>
                  <p>Payment method: •••• •••• •••• 4242</p>
                </div>
                <div className="flex space-x-2">
                  <Button variant="outline" size="sm">
                    Update Payment Method
                  </Button>
                  <Button variant="outline" size="sm">
                    Download Invoice
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <CardTitle>Security</CardTitle>
          </div>
          <CardDescription>
            Manage your account security settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Two-Factor Authentication</p>
                <p className="text-sm text-gray-500">
                  Add an extra layer of security to your account
                </p>
              </div>
              <Button variant="outline">
                Enable 2FA
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">API Access</p>
                <p className="text-sm text-gray-500">
                  Manage API keys for third-party integrations
                </p>
              </div>
              <Button variant="outline">
                Manage Keys
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Changes */}
      <div className="flex justify-end">
        <Button onClick={() => {
          toast({
            title: "Settings saved",
            description: "Your preferences have been updated successfully.",
          });
        }}>
          Save Changes
        </Button>
      </div>
    </div>
  );
}
