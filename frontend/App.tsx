import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ClerkProvider, SignedIn, SignedOut } from '@clerk/clerk-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { clerkPublishableKey } from './config';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Listings } from './pages/Listings';
import { Analytics } from './pages/Analytics';
import { Settings } from './pages/Settings';
import { Landing } from './pages/Landing';
import { AuthPage } from './pages/AuthPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppInner() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={
          <>
            <SignedOut>
              <Landing />
            </SignedOut>
            <SignedIn>
              <Navigate to="/dashboard" replace />
            </SignedIn>
          </>
        } />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/dashboard" element={
          <SignedIn>
            <Layout>
              <Dashboard />
            </Layout>
          </SignedIn>
        } />
        <Route path="/listings" element={
          <SignedIn>
            <Layout>
              <Listings />
            </Layout>
          </SignedIn>
        } />
        <Route path="/analytics" element={
          <SignedIn>
            <Layout>
              <Analytics />
            </Layout>
          </SignedIn>
        } />
        <Route path="/settings" element={
          <SignedIn>
            <Layout>
              <Settings />
            </Layout>
          </SignedIn>
        } />
      </Routes>
      <Toaster />
    </Router>
  );
}

export default function App() {
  if (!clerkPublishableKey) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Configuration Error</h1>
          <p className="text-gray-600">
            Please set your Clerk publishable key in frontend/config.ts
          </p>
        </div>
      </div>
    );
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <QueryClientProvider client={queryClient}>
        <AppInner />
      </QueryClientProvider>
    </ClerkProvider>
  );
}
