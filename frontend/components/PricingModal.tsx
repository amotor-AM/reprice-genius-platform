import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  TrendingUp, 
  Brain, 
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { useBackend } from '../hooks/useBackend';
import { useToast } from '@/components/ui/use-toast';

interface PricingModalProps {
  listingId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function PricingModal({ listingId, onClose, onSuccess }: PricingModalProps) {
  const backend = useBackend();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [customPrice, setCustomPrice] = useState('');

  // Get market analysis
  const { data: analysis, isLoading: analysisLoading } = useQuery({
    queryKey: ['market-analysis', listingId],
    queryFn: () => backend.pricing.analyzeMarket({ listingId }),
  });

  // Apply price mutation
  const applyPriceMutation = useMutation({
    mutationFn: (data: { newPrice: number; decisionId?: number }) =>
      backend.pricing.applyPrice({
        listingId,
        newPrice: data.newPrice,
        decisionId: data.decisionId,
      }),
    onSuccess: (data) => {
      toast({
        title: "Price Updated",
        description: `Price changed from $${data.oldPrice.toFixed(2)} to $${data.newPrice.toFixed(2)}`,
      });
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      onSuccess();
    },
    onError: (error) => {
      console.error('Error applying price:', error);
      toast({
        title: "Error",
        description: "Failed to update price. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleApplyAIPrice = () => {
    if (analysis) {
      applyPriceMutation.mutate({ newPrice: analysis.suggestedPrice });
    }
  };

  const handleApplyCustomPrice = () => {
    const price = parseFloat(customPrice);
    if (isNaN(price) || price <= 0) {
      toast({
        title: "Invalid Price",
        description: "Please enter a valid price.",
        variant: "destructive",
      });
      return;
    }
    applyPriceMutation.mutate({ newPrice: price });
  };

  const priceChange = analysis ? analysis.suggestedPrice - analysis.currentPrice : 0;
  const priceChangePercent = analysis ? (priceChange / analysis.currentPrice) * 100 : 0;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Brain className="h-5 w-5 mr-2" />
            AI Pricing Analysis
          </DialogTitle>
          <DialogDescription>
            Get intelligent pricing recommendations based on market analysis
          </DialogDescription>
        </DialogHeader>

        {analysisLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Analyzing market conditions...</span>
          </div>
        ) : analysis ? (
          <div className="space-y-6">
            {/* Current vs Suggested Price */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Price Recommendation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-500 mb-1">Current Price</p>
                    <p className="text-2xl font-bold">${analysis.currentPrice.toFixed(2)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-500 mb-1">Suggested Price</p>
                    <p className="text-2xl font-bold text-blue-600">
                      ${analysis.suggestedPrice.toFixed(2)}
                    </p>
                    <div className="flex items-center justify-center mt-1">
                      {priceChange > 0 ? (
                        <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                      ) : (
                        <TrendingUp className="h-4 w-4 text-red-500 mr-1 rotate-180" />
                      )}
                      <span className={`text-sm ${priceChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)} ({priceChangePercent.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-center">
                  <Badge variant={analysis.confidence > 0.8 ? 'default' : 'secondary'}>
                    {Math.round(analysis.confidence * 100)}% Confidence
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Market Factors */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Market Analysis</CardTitle>
                <CardDescription>
                  Factors influencing the pricing recommendation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium">Competitor Average</p>
                    <p className="text-lg">${analysis.marketFactors.avgCompetitorPrice.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Price Range</p>
                    <p className="text-lg">
                      ${analysis.marketFactors.priceRange.min.toFixed(2)} - 
                      ${analysis.marketFactors.priceRange.max.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Search Volume</p>
                    <p className="text-lg">{analysis.marketFactors.demandIndicators.searchVolume.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Active Listings</p>
                    <p className="text-lg">{analysis.marketFactors.supplyIndicators.activeListings}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Reasoning */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">AI Reasoning</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {analysis.reasoning.map((reason, index) => (
                    <li key={index} className="flex items-center text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                      {reason}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Separator />

            {/* Actions */}
            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-3">Apply Pricing</h3>
                <div className="flex gap-3">
                  <Button
                    onClick={handleApplyAIPrice}
                    disabled={applyPriceMutation.isPending}
                    className="flex-1"
                  >
                    {applyPriceMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Brain className="h-4 w-4 mr-2" />
                    )}
                    Apply AI Suggestion
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="custom-price" className="text-sm font-medium">
                  Or set custom price
                </Label>
                <div className="flex gap-2 mt-2">
                  <div className="relative flex-1">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="custom-price"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={customPrice}
                      onChange={(e) => setCustomPrice(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Button
                    onClick={handleApplyCustomPrice}
                    disabled={applyPriceMutation.isPending || !customPrice}
                    variant="outline"
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <AlertTriangle className="h-8 w-8 text-yellow-500 mr-2" />
            <span>Failed to load market analysis</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
