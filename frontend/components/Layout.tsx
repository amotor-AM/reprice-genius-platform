import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { 
  BarChart3, 
  Package, 
  Settings, 
  TrendingUp,
  Menu,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState } from 'react';

interface LayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: BarChart3 },
  { name: 'Listings', href: '/listings', icon: Package },
  { name: 'Analytics', href: '/analytics', icon: TrendingUp },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const NavItems = () => (
    <>
      {navigation.map((item) => {
        const isActive = location.pathname === item.href;
        return (
          <Link
            key={item.name}
            to={item.href}
            className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <item.icon className="mr-3 h-5 w-5" />
            {item.name}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop Sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex min-h-0 flex-1 flex-col bg-white border-r border-gray-200">
          <div className="flex flex-1 flex-col pt-5 pb-4 overflow-y-auto">
            <div className="flex items-center flex-shrink-0 px-4">
              <h1 className="text-xl font-bold text-gray-900">Reprice Genius</h1>
            </div>
            <nav className="mt-8 flex-1 px-2 space-y-1">
              <NavItems />
            </nav>
          </div>
          <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
            <div className="flex items-center">
              <UserButton afterSignOutUrl="/" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-700">Account</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden fixed top-4 left-4 z-50"
          >
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-4 border-b">
              <h1 className="text-xl font-bold text-gray-900">Reprice Genius</h1>
            </div>
            <nav className="flex-1 px-2 py-4 space-y-1">
              <NavItems />
            </nav>
            <div className="border-t p-4">
              <div className="flex items-center">
                <UserButton afterSignOutUrl="/" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-700">Account</p>
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="lg:pl-64 flex flex-col flex-1">
        <main className="flex-1 pt-16 lg:pt-0">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
