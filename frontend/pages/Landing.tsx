import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  TrendingUp, 
  Zap, 
  Shield, 
  BarChart3,
  Brain,
  DollarSign
} from 'lucide-react';

export function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <TrendingUp className="h-8 w-8 text-blue-600 mr-2" />
              <h1 className="text-2xl font-bold text-gray-900">Reprice Genius</h1>
            </div>
            <Link to="/auth">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Intelligent eBay
            <span className="text-blue-600"> Repricing</span>
          </h2>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Maximize your eBay profits with AI-powered pricing strategies. 
            Our platform analyzes market conditions, competitor pricing, and historical data 
            to make data-driven pricing decisions.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/auth">
              <Button size="lg" className="w-full sm:w-auto">
                Start Free Trial
              </Button>
            </Link>
            <Button variant="outline" size="lg" className="w-full sm:w-auto">
              Watch Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h3 className="text-3xl font-bold text-gray-900 mb-4">
              Why Choose Reprice Genius?
            </h3>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Our advanced AI algorithms and comprehensive market analysis 
              give you the competitive edge you need to succeed on eBay.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <Brain className="h-10 w-10 text-blue-600 mb-2" />
                <CardTitle>AI-Powered Intelligence</CardTitle>
                <CardDescription>
                  Advanced machine learning algorithms analyze market trends and optimize pricing strategies
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <BarChart3 className="h-10 w-10 text-green-600 mb-2" />
                <CardTitle>Multi-Source Analysis</CardTitle>
                <CardDescription>
                  Comprehensive market data from eBay, Amazon, and Google Trends for informed decisions
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Zap className="h-10 w-10 text-yellow-600 mb-2" />
                <CardTitle>Real-Time Updates</CardTitle>
                <CardDescription>
                  Instant price adjustments based on market conditions and competitor movements
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <DollarSign className="h-10 w-10 text-emerald-600 mb-2" />
                <CardTitle>Profit Optimization</CardTitle>
                <CardDescription>
                  Maximize revenue while maintaining healthy profit margins with intelligent pricing
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Shield className="h-10 w-10 text-purple-600 mb-2" />
                <CardTitle>Risk Management</CardTitle>
                <CardDescription>
                  Built-in safeguards and price boundaries to protect your business from extreme changes
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <TrendingUp className="h-10 w-10 text-red-600 mb-2" />
                <CardTitle>Learning System</CardTitle>
                <CardDescription>
                  Continuous improvement through feedback analysis and performance tracking
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-blue-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h3 className="text-3xl font-bold text-white mb-4">
            Ready to Boost Your eBay Sales?
          </h3>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Join thousands of successful eBay sellers who trust Reprice Genius 
            to optimize their pricing strategies and increase profits.
          </p>
          <Link to="/auth">
            <Button size="lg" variant="secondary">
              Get Started Today
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center">
            <TrendingUp className="h-6 w-6 mr-2" />
            <span className="text-lg font-semibold">Reprice Genius</span>
          </div>
          <p className="text-center text-gray-400 mt-4">
            © 2024 Reprice Genius. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
