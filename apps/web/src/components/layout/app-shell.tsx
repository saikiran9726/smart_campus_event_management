import React, { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/toaster';
import {
  Compass,
  Ticket,
  MessageSquare,
  LayoutDashboard,
  GraduationCap,
  User,
  Sun,
  Moon,
  Shield,
  LogOut,
  CalendarDays,
  Menu,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export const AppShell: React.FC = () => {
  const { isSignedIn, user, clerkUser, isClubOrganizer, isFaculty, isAdmin, signOut } = useAuth();
  const { setTheme, resolvedTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const isScannerRoute = location.pathname.startsWith('/scanner');

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const scannerToken = sessionStorage.getItem('eventora_scanner_token');
      if (scannerToken && !isScannerRoute) {
        navigate('/scanner', { replace: true });
      }
    }
  }, [location.pathname, isScannerRoute, navigate]);

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  const isRouteActive = (itemPath: string) => {
    if (itemPath === '/') {
      return location.pathname === '/' || location.pathname.startsWith('/discover');
    }
    return location.pathname.startsWith(itemPath);
  };

  // Role-based navigation items (hidden, not disabled)
  const navItems = [
    { label: 'Discover', path: '/', icon: Compass, show: true },
    { label: 'Passport', path: '/passport', icon: Ticket, show: true },
    { label: 'Community', path: '/community', icon: MessageSquare, show: true },
    { label: 'Organizer Studio', path: '/organizer', icon: LayoutDashboard, show: isClubOrganizer },
    { label: 'Faculty Dashboard', path: '/faculty/dashboard', icon: GraduationCap, show: isFaculty },
    { label: 'Admin Console', path: '/admin', icon: Shield, show: isAdmin },
  ].filter((item) => item.show);

  const mobileNavItems = [
    { label: 'Discover', path: '/', icon: Compass, show: true },
    { label: 'Passport', path: '/passport', icon: Ticket, show: true },
    { label: 'Community', path: '/community', icon: MessageSquare, show: true },
    { label: 'Organizer', path: '/organizer', icon: LayoutDashboard, show: isClubOrganizer },
    { label: 'Faculty', path: '/faculty/dashboard', icon: GraduationCap, show: isFaculty },
    { label: 'Admin', path: '/admin', icon: Shield, show: isAdmin },
    { label: 'Profile', path: '/profile', icon: User, show: true },
  ].filter((item) => item.show);

  if (isScannerRoute) {
    return (
      <div className="min-h-screen bg-black text-white antialiased">
        <main id="main-content">
          <Outlet />
        </main>
        <Toaster />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground antialiased selection:bg-indigo-500/20">
      {/* 1. Accessibility Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-4 focus:ring-indigo-500/20"
      >
        Skip to main content
      </a>

      {/* 2. Desktop & Tablet Top Navigation */}
      <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-16 items-center justify-between px-4 sm:px-8">
          {/* Brand Logo & Desktop Nav Links */}
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="flex items-center gap-2.5 font-bold tracking-tight text-xl focus-ring rounded-lg p-1"
              aria-label="Eventora Home"
            >
              <div className="h-9 w-9 rounded-lg bg-indigo-700 flex items-center justify-center text-white shadow-sm ring-1 ring-white/20">
                <CalendarDays className="h-5 w-5" />
              </div>
              <span className="flex items-center text-foreground">
                Eventora
                <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold border border-indigo-500/20">
                  OS
                </span>
              </span>
            </Link>

            {/* Desktop Nav Links */}
            <nav className="hidden md:flex items-center gap-1" aria-label="Main Navigation">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = isRouteActive(item.path);

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={cn(
                      'flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-md transition-colors focus-ring min-h-[40px]',
                      isActive
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* Right Header Utilities: Theme & Profile & Mobile Sheet Trigger */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Theme Toggle Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
              className="h-10 w-10 rounded-full focus-ring"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-slate-700" />
              )}
            </Button>

            {/* Mobile Navigation Sheet Trigger */}
            <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open Navigation Menu"
                  className="md:hidden h-10 w-10 rounded-full focus-ring"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-6 flex flex-col justify-between">
                <div className="space-y-6">
                  <SheetHeader className="text-left">
                    <SheetTitle className="flex items-center gap-2 text-lg font-bold">
                      <div className="h-8 w-8 rounded-lg bg-indigo-700 flex items-center justify-center text-white">
                        <CalendarDays className="h-4 w-4" />
                      </div>
                      <span>Eventora OS</span>
                    </SheetTitle>
                  </SheetHeader>

                  <nav className="flex flex-col space-y-1" aria-label="Mobile Drawer Navigation">
                    {navItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = isRouteActive(item.path);

                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => setMobileSheetOpen(false)}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors',
                            isActive
                              ? 'bg-primary/10 text-primary font-semibold'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}

                    <Link
                      to="/profile"
                      onClick={() => setMobileSheetOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors',
                        isRouteActive('/profile')
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <User className="h-4 w-4" />
                      <span>Profile</span>
                    </Link>
                  </nav>
                </div>

                {isSignedIn && (
                  <div className="pt-4 border-t border-border">
                    <Button
                      variant="outline"
                      className="w-full flex items-center justify-center gap-2 text-destructive hover:text-destructive"
                      onClick={() => {
                        setMobileSheetOpen(false);
                        signOut();
                      }}
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Sign Out</span>
                    </Button>
                  </div>
                )}
              </SheetContent>
            </Sheet>

            {/* User Profile or Sign In */}
            {isSignedIn ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-10 w-10 rounded-full p-0 focus-ring"
                    aria-label="User Account Menu"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage
                        src={clerkUser?.imageUrl}
                        alt={user?.fullName || clerkUser?.fullName || 'User Avatar'}
                      />
                      <AvatarFallback>
                        {(user?.fullName || clerkUser?.fullName || 'U')
                          .slice(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {user?.fullName || clerkUser?.fullName || 'Campus Member'}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground truncate">
                        {user?.email || clerkUser?.primaryEmailAddress?.emailAddress}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="flex items-center gap-2 cursor-pointer">
                      <User className="h-4 w-4" />
                      <span>Profile & Settings</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/passport" className="flex items-center gap-2 cursor-pointer">
                      <Ticket className="h-4 w-4" />
                      <span>Event Passport</span>
                    </Link>
                  </DropdownMenuItem>
                  {isClubOrganizer && (
                    <DropdownMenuItem asChild>
                      <Link to="/organizer" className="flex items-center gap-2 cursor-pointer">
                        <LayoutDashboard className="h-4 w-4" />
                        <span>Organizer Studio</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {isFaculty && (
                    <DropdownMenuItem asChild>
                      <Link to="/faculty/dashboard" className="flex items-center gap-2 cursor-pointer">
                        <GraduationCap className="h-4 w-4" />
                        <span>Faculty Dashboard</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="flex items-center gap-2 cursor-pointer">
                        <Shield className="h-4 w-4" />
                        <span>Admin Console</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => signOut()}
                    className="flex items-center gap-2 text-destructive focus:text-destructive cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild size="sm" className="min-h-[40px] px-4 font-semibold">
                <Link to="/profile">Sign In</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* 3. Main Page Content View */}
      <main id="main-content" tabIndex={-1} className="flex-1 pb-20 md:pb-8 outline-none">
        <Outlet />
      </main>

      {/* 4. Mobile Bottom Tab Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-border bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom,0px)]"
      >
        <div className="flex h-16 items-center justify-around px-1">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = isRouteActive(item.path);

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  'flex flex-col items-center justify-center flex-1 h-full min-h-[48px] py-1 text-xs font-medium transition-colors focus-ring',
                  isActive
                    ? 'text-primary font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className={cn('h-5 w-5 mb-0.5', isActive ? 'stroke-[2.5]' : 'stroke-2')} />
                <span className="text-[10px] sm:text-[11px] leading-tight text-center truncate max-w-[64px]">
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* 5. Global Toaster Component */}
      <Toaster />
    </div>
  );
};
