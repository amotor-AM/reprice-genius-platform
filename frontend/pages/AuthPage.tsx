import { SignIn, SignUp } from '@clerk/clerk-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TrendingUp } from 'lucide-react';

export function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <TrendingUp className="h-10 w-10 text-blue-600 mr-2" />
            <h1 className="text-3xl font-bold text-gray-900">Reprice Genius</h1>
          </div>
          <p className="text-gray-600">
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8">
          {isSignUp ? (
            <SignUp 
              routing="hash"
              redirectUrl="/dashboard"
              appearance={{
                elements: {
                  rootBox: "w-full",
                  card: "shadow-none border-0 p-0",
                }
              }}
            />
          ) : (
            <SignIn 
              routing="hash"
              redirectUrl="/dashboard"
              appearance={{
                elements: {
                  rootBox: "w-full",
                  card: "shadow-none border-0 p-0",
                }
              }}
            />
          )}

          <div className="mt-6 text-center">
            <Button
              variant="link"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm"
            >
              {isSignUp 
                ? 'Already have an account? Sign in' 
                : "Don't have an account? Sign up"
              }
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
