# Reprice Genius - Intelligent eBay Repricing Platform

An AI-powered eBay repricing platform built with Encore.ts that optimizes product pricing strategies using machine learning and comprehensive market analysis.

## 🚀 Features

- **AI-Powered Pricing**: Advanced algorithms analyze market conditions and competitor pricing
- **Multi-Source Analysis**: Data from eBay, Amazon, and Google Trends
- **Real-time Updates**: Instant price adjustments based on market conditions
- **Autonomous Learning System**: Continuous improvement through feedback analysis, meta-learning, causal inference, and automated experimentation.
- **Behavioral AI**: Models buyer and competitor psychology using behavioral economics and game theory.
- **Intelligence Service**: Advanced forecasting, external signal integration, and competitive intelligence.
- **Real-time Adaptation**: Adapts to micro-changes in the market using stream processing and CEP.
- **Profit Maximization**: Advanced profitability optimization, LTV modeling, and risk assessment.
- **AI Strategy Composer**: Generate complex pricing strategies from simple natural language descriptions.
- **Proprietary Data Moat**: Creates unique data advantages through synthetic data, crowdsourcing, and network effects.
- **Autonomous Optimization**: Self-running systems with AutoML, autonomous experimentation, and self-healing capabilities.
- **Master Orchestration Layer (Brain)**: Central nervous system coordinating all AI services for unified decision-making.
- **Risk Management**: Built-in safeguards and price boundaries
- **Comprehensive Analytics**: Detailed performance tracking and insights
- **Event-Driven Architecture**: Scalable and resilient workflows using sagas and an event bus.
- **Predictive Analytics**: Time-series forecasting for sales and demand.
- **Cohort Analysis**: Track performance of pricing strategies over time.
- **Real-time Analytics**: Live streaming of key performance indicators.
- **Background Jobs**: Dedicated service for managing all asynchronous tasks.
- **Advanced AI Capabilities**: Cutting-edge deep learning system with multi-modal analysis and a "Product DNA" system.
- **Data Pipeline**: Robust ETL/ELT pipelines with a data lake architecture for scalable data management.
- **Multi-Marketplace Support**: Unified platform for eBay, Amazon, Shopify, and more with centralized inventory and order management.
- **AI Copilot**: Natural language interface for platform control, conversational AI, and proactive insights.

## 🏗️ Architecture

### Backend Services (Encore.ts)
- **Brain Service**: Central orchestration layer and decision engine.
- **User Service**: User management and profiles
- **Marketplace Service**: Abstracted integration layer for eBay, Amazon, Shopify, etc.
- **Listings Service**: Unified product catalog and inventory management.
- **Orders Service**: Centralized order processing and fulfillment routing.
- **Pricing Service**: AI-powered pricing algorithms
- **Analytics Service**: Performance metrics, forecasting, and insights
- **Learning Service**: Autonomous learning with meta-learning, causal inference, and automated experimentation.
- **ML Service**: Multi-modal deep learning, Product DNA, and predictive modeling.
- **Behavior Service**: Models buyer and competitor psychology.
- **Intel Service**: Advanced forecasting and competitive intelligence.
- **Adapt Service**: Real-time adaptation and micro-moment strategy adjustments.
- **Profit Service**: Advanced profitability optimization and financial modeling.
- **Composer Service**: AI-powered strategy generation from natural language.
- **Moat Service**: Creates proprietary data advantages.
- **Auto Service**: Self-running optimization systems.
- **Cache Service**: High-performance caching layer
- **Monitoring Service**: Error tracking and performance monitoring
- **Notifications Service**: Alert system for price changes
- **Market Service**: Market intelligence and data aggregation
- **Graph Service**: Relationship mapping and pattern analysis with GNNs
- **Documents Service**: Invoice and CSV processing
- **Events Service**: Centralized event bus and audit log
- **Orchestrator Service**: Manages complex, multi-step workflows (sagas)
- **Jobs Service**: Manages all asynchronous background tasks and scheduled jobs
- **Feature Store Service**: Centralized feature management for all AI models
- **Pipeline Service**: Manages data ingestion, transformation, and quality control
- **Copilot Service**: Natural language interface and conversational AI

### Frontend (React + TypeScript)
- **Modern UI**: Built with React, TypeScript, and Tailwind CSS
- **Type-safe API**: Auto-generated clients from backend
- **Real-time Updates**: Live data synchronization
- **Responsive Design**: Mobile-first approach

## 🛠️ Technology Stack

### Backend
- **Framework**: Encore.ts
- **Language**: TypeScript
- **Database**: PostgreSQL (multiple logical databases)
- **Event Bus**: Encore Pub/Sub
- **Authentication**: Clerk
- **Payments**: Polar (planned)
- **Infrastructure**: Auto-managed by Encore (including built-in circuit breakers)

### Frontend
- **Framework**: React 18
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui
- **State Management**: TanStack Query
- **Routing**: React Router
- **Icons**: Lucide React

## 📋 Prerequisites

- Node.js 18+ 
- Encore CLI (`npm install -g @encore/cli`)
- Clerk account for authentication
- eBay Developer account
- RapidAPI account (optional, for enhanced market data)
- Google Gemini API Key
- Google Vision API Key

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/reprice-genius.git
cd reprice-genius
```

### 2. Install Dependencies

```bash
# Install Encore CLI if not already installed
npm install -g @encore/cli

# The project dependencies are automatically managed by Encore
```

### 3. Configure Secrets

Set up the required secrets in the Encore dashboard or using the CLI:

```bash
encore secret set ClerkSecretKey
encore secret set EbayClientId
encore secret set EbayClientSecret
encore secret set EbayRedirectUri
encore secret set RapidApiKey
encore secret set SentryDSN
encore secret set GeminiApiKey
encore secret set GoogleVisionApiKey
```

### 4. Configure Frontend

Update `frontend/config.ts` with your Clerk publishable key:

```typescript
export const clerkPublishableKey = "pk_test_your_clerk_key_here";
```

### 5. Run the Application

```bash
# Start the development server
encore run
```

The application will be available at:
- Backend API: `http://localhost:4000`
- Frontend: `http://localhost:3000`

## 🔧 Configuration

### eBay Integration

1. Create an eBay Developer account
2. Register your application
3. Set the redirect URI to match your deployment URL
4. Configure the secrets with your eBay credentials

### Clerk Authentication

1. Create a Clerk account
2. Set up your application
3. Configure the allowed redirect URLs
4. Add your Clerk keys to the configuration

### Optional Integrations

- **Sentry**: For error tracking and monitoring
- **RapidAPI**: For enhanced market data from Amazon and other sources

## 📊 Database Schema

The application uses multiple PostgreSQL databases:

- **User Database**: User profiles and authentication data
- **eBay Database**: Listings, price history, and market data
- **Pricing Database**: AI models, decisions, and feedback
- **Analytics Database**: Performance metrics and insights
- **ML Database**: Embeddings, relationships, and cache
- **Events Database**: Audit log of all domain events

## 🔄 API Endpoints

### User Management
- `GET /user/profile` - Get user profile
- `POST /user/update` - Update user settings

### eBay Integration
- `GET /ebay/auth/url` - Get OAuth URL
- `POST /ebay/auth/callback` - Handle OAuth callback
- `GET /ebay/listings` - List user's eBay items
- `POST /ebay/sync` - Sync listings from eBay

### Pricing Engine
- `POST /pricing/analyze` - Analyze market conditions
- `POST /pricing/apply` - Apply price changes

### Analytics
- `GET /analytics/dashboard` - Get dashboard metrics
- `GET /analytics/forecast/{productId}` - Get sales forecast

### Orchestration
- `POST /orchestrate/reprice-all` - Trigger bulk repricing workflow

## 🧪 Testing

```bash
# Run backend tests
encore test

# Run frontend tests (if configured)
cd frontend && npm test
```

## 🚀 Deployment

### Encore Cloud (Recommended)

```bash
# Deploy to Encore Cloud
encore deploy

# Set up custom domain (optional)
encore domain add your-domain.com
```

### Self-hosted

The application can be deployed to any cloud provider that supports Docker containers. Encore generates optimized Docker images for production deployment.

## 📈 Monitoring

The application includes comprehensive monitoring:

- **Error Tracking**: Sentry integration for error monitoring
- **Performance Metrics**: Built-in performance tracking
- **Business Metrics**: Custom analytics for pricing decisions
- **Health Checks**: Automatic service health monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [Encore.ts Docs](https://encore.dev/docs)
- **Community**: [Encore Discord](https://encore.dev/discord)
- **Issues**: [GitHub Issues](https://github.com/your-username/reprice-genius/issues)

## 🗺️ Roadmap

See [COMPARISON_AND_ROADMAP.md](COMPARISON_AND_ROADMAP.md) for detailed development roadmap and feature comparison with the previous implementation.

## 🙏 Acknowledgments

- [Encore.ts](https://encore.dev) for the amazing backend framework
- [Clerk](https://clerk.dev) for authentication
- [shadcn/ui](https://ui.shadcn.com) for beautiful UI components
- [Tailwind CSS](https://tailwindcss.com) for styling
