import React, { useState, useEffect } from 'react';
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
  ChevronLeft,
  ChevronRight,
  Search,
  Bell,
  Sparkles,
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
import { NotificationBell } from '@/components/notifications/NotificationBell';

export const AppShell: React.FC = () => {
  const { isSignedIn, user, clerkUser, isClubOrganizer, isFaculty, isAdmin, signOut } = useAuth();
  const { setTheme, resolvedTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  // Desktop collapsible sidebar state (persisted in localStorage)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('eventora_sidebar_collapsed') === 'true';
    }
    return false;
  });

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isScannerRoute = location.pathname.startsWith('/scanner');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const scannerToken = sessionStorage.getItem('eventora_scanner_token');
      if (scannerToken && !isScannerRoute) {
        navigate('/scanner', { replace: true });
      }
    }
  }, [location.pathname, isScannerRoute, navigate]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('eventora_sidebar_collapsed', String(next));
      return next;
    });
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  const isRouteActive = (itemPath: string) => {
    if (itemPath === '/') {
      return location.pathname === '/' || location.pathname.startsWith('/discover');
    }
    return location.pathname.startsWith(itemPath);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/?q=${encodeURIComponent(searchQuery.trim())}`);
    }
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
    <div className="min-h-screen flex bg-background text-foreground antialiased selection:bg-teal-500/20">
      {/* 1. Accessibility Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-teal-700 focus:text-white focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-teal-700/50"
      >
        Skip to main content
      </a>

      {/* 2. Desktop Collapsible Sidebar */}
      <aside
        aria-label="Sidebar Navigation"
        className={cn(
          'hidden md:flex flex-col sticky top-0 h-screen border-r border-border bg-white dark:bg-stone-900 transition-all duration-200 z-30 shrink-0 shadow-sm',
          isSidebarCollapsed ? 'w-20' : 'w-64'
        )}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-border/80">
          <Link
            to="/"
            className="flex items-center gap-2.5 font-bold tracking-tight text-lg focus-ring rounded-md p-1 overflow-hidden"
            aria-label="Eventora Home"
          >
            <div className="h-9 w-9 rounded-md bg-teal-700 flex items-center justify-center text-white shrink-0 shadow-sm">
              <CalendarDays className="h-5 w-5 stroke-[1.75]" />
            </div>
            {!isSidebarCollapsed && (
              <span className="flex items-center font-heading font-extrabold text-stone-900 dark:text-stone-100 whitespace-nowrap">
                Eventora
                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 font-semibold border border-teal-200 dark:border-teal-800">
                  OS
                </span>
              </span>
            )}
          </Link>
          <button
            onClick={toggleSidebar}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-sm text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 transition-colors focus-ring"
          >
            {isSidebarCollapsed ? (
              <ChevronRight className="h-4 w-4 stroke-[1.75]" />
            ) : (
              <ChevronLeft className="h-4 w-4 stroke-[1.75]" />
            )}
          </button>
        </div>

        {/* Sidebar Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5" aria-label="Main Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = isRouteActive(item.path);

            return (
              <NavLink
                key={item.path}
                to={item.path}
                title={isSidebarCollapsed ? item.label : undefined}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-md transition-colors focus-ring',
                  isSidebarCollapsed ? 'justify-center px-0' : '',
                  isActive
                    ? 'border border-teal-200/80 dark:border-teal-800/80 bg-primary/10 text-primary'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100'
                )}
              >
                <Icon className="h-5 w-5 shrink-0 stroke-[1.75]" />
                {!isSidebarCollapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Sidebar Footer Quick Profile / Status */}
        <div className="p-3 border-t border-border/80">
          {isSignedIn ? (
            <div
              className={cn(
                'flex items-center gap-3 p-2 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors',
                isSidebarCollapsed && 'justify-center p-0'
              )}
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={clerkUser?.imageUrl} alt={user?.fullName || 'User'} />
                <AvatarFallback>{(user?.fullName || 'U').slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              {!isSidebarCollapsed && (
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">
                    {user?.fullName || clerkUser?.fullName || 'Campus Member'}
                  </p>
                  <p className="text-[11px] text-stone-500 truncate">{user?.email || clerkUser?.primaryEmailAddress?.emailAddress}</p>
                </div>
              )}
            </div>
          ) : (
            <Button
              asChild
              size="sm"
              className={cn('w-full h-9 font-semibold', isSidebarCollapsed && 'px-0 text-xs')}
            >
              <Link to="/profile">{isSidebarCollapsed ? 'In' : 'Sign In'}</Link>
            </Button>
          )}
        </div>
      </aside>

      {/* Main Container: Topbar + Page View */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar Navigation */}
        <header className="sticky top-0 z-40 w-full h-16 border-b border-border bg-white/95 dark:bg-stone-900/95 backdrop-blur-none px-4 sm:px-6 flex items-center justify-between gap-4">
          {/* Left: Mobile Brand & Search */}
          <div className="flex items-center gap-3 flex-1 max-w-md">
            {/* Mobile Sheet Drawer Trigger for Non-Student Roles */}
            <Sheet open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open Navigation Drawer"
                  className="md:hidden h-9 w-9 rounded-md focus-ring"
                >
                  <Menu className="h-5 w-5 stroke-[1.75]" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-6 flex flex-col justify-between">
                <div className="space-y-6 text-left">
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2 text-lg font-bold">
                      <div className="h-8 w-8 rounded-md bg-teal-700 flex items-center justify-center text-white">
                        <CalendarDays className="h-4 w-4 stroke-[1.75]" />
                      </div>
                      <span className="font-heading">Eventora OS</span>
                    </SheetTitle>
                  </SheetHeader>

                  <nav className="flex flex-col space-y-1.5" aria-label="Mobile Drawer Navigation">
                    {navItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = isRouteActive(item.path);

                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => setMobileDrawerOpen(false)}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-md transition-colors',
                            isActive
                              ? 'bg-primary/10 text-primary'
                              : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400'
                          )}
                        >
                          <Icon className="h-4 w-4 stroke-[1.75]" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}

                    <Link
                      to="/profile"
                      onClick={() => setMobileDrawerOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-md transition-colors',
                        isRouteActive('/profile')
                          ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300'
                          : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400'
                      )}
                    >
                      <User className="h-4 w-4 stroke-[1.75]" />
                      <span>Profile</span>
                    </Link>
                  </nav>
                </div>

                {isSignedIn && (
                  <div className="pt-4 border-t border-border">
                    <Button
                      variant="outline"
                      className="w-full flex items-center justify-center gap-2 text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50"
                      onClick={() => {
                        setMobileDrawerOpen(false);
                        signOut();
                      }}
                    >
                      <LogOut className="h-4 w-4 stroke-[1.75]" />
                      <span>Sign Out</span>
                    </Button>
                  </div>
                )}
              </SheetContent>
            </Sheet>

            {/* Mobile Brand Link (< 768px) */}
            <Link to="/" className="md:hidden flex items-center gap-1.5 font-heading font-extrabold text-base">
              <span className="text-teal-700 dark:text-teal-400">Eventora</span>
            </Link>

            {/* Quick Search Bar */}
            <form onSubmit={handleSearchSubmit} className="hidden sm:flex relative items-center w-full">
              <Search className="absolute left-3 h-4 w-4 text-stone-400 pointer-events-none stroke-[1.75]" />
              <input
                type="text"
                placeholder="Search events, clubs, teams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-md border border-stone-200 bg-stone-50 text-xs text-stone-800 placeholder:text-stone-400 focus-ring dark:border-stone-800 dark:bg-stone-950/60 dark:text-stone-200 transition-colors"
              />
            </form>
          </div>

          {/* Right: Theme Toggle, Notifications, User Menu */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
              className="h-9 w-9 rounded-md focus-ring"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-400 stroke-[1.75]" />
              ) : (
                <Moon className="h-4 w-4 text-stone-600 stroke-[1.75]" />
              )}
            </Button>

            {isSignedIn && <NotificationBell />}

            {/* User Profile Dropdown */}
            {isSignedIn ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0 focus-ring" aria-label="User Account Menu">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={clerkUser?.imageUrl} alt={user?.fullName || 'User'} />
                      <AvatarFallback>{(user?.fullName || 'U').slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-semibold leading-none">{user?.fullName || clerkUser?.fullName || 'Campus Member'}</p>
                      <p className="text-xs leading-none text-muted-foreground truncate">{user?.email || clerkUser?.primaryEmailAddress?.emailAddress}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="flex items-center gap-2 cursor-pointer">
                      <User className="h-4 w-4 stroke-[1.75]" />
                      <span>Profile & Settings</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/passport" className="flex items-center gap-2 cursor-pointer">
                      <Ticket className="h-4 w-4 stroke-[1.75]" />
                      <span>Event Passport</span>
                    </Link>
                  </DropdownMenuItem>
                  {isClubOrganizer && (
                    <DropdownMenuItem asChild>
                      <Link to="/organizer" className="flex items-center gap-2 cursor-pointer">
                        <LayoutDashboard className="h-4 w-4 stroke-[1.75]" />
                        <span>Organizer Studio</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {isFaculty && (
                    <DropdownMenuItem asChild>
                      <Link to="/faculty/dashboard" className="flex items-center gap-2 cursor-pointer">
                        <GraduationCap className="h-4 w-4 stroke-[1.75]" />
                        <span>Faculty Dashboard</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="flex items-center gap-2 cursor-pointer">
                        <Shield className="h-4 w-4 stroke-[1.75]" />
                        <span>Admin Console</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => signOut()}
                    className="flex items-center gap-2 text-red-600 focus:text-red-700 cursor-pointer"
                  >
                    <LogOut className="h-4 w-4 stroke-[1.75]" />
                    <span>Sign Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild size="sm" className="h-9 px-3.5 font-semibold">
                <Link to="/profile">Sign In</Link>
              </Button>
            )}
          </div>
        </header>

        {/* Main Content Area */}
        <main id="main-content" tabIndex={-1} className="flex-1 pb-20 md:pb-8 outline-none">
          <Outlet />
        </main>

        {/* 3. Mobile Bottom Navigation */}
        <nav
          aria-label="Mobile Navigation"
          className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-border bg-white/95 dark:bg-stone-900/95 pb-[env(safe-area-inset-bottom,0px)] shadow-lg"
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
                    isActive ? 'text-teal-700 dark:text-teal-400 font-bold' : 'text-stone-500 hover:text-stone-900 dark:text-stone-400'
                  )}
                >
                  <Icon className={cn('h-5 w-5 mb-0.5 stroke-[1.75]', isActive && 'stroke-[2.2]')} />
                  <span className="text-[10px] sm:text-[11px] leading-tight text-center truncate max-w-[64px]">
                    {item.label}
                  </span>
                </NavLink>
              );
            })}
          </div>
        </nav>

        {/* Global Toaster */}
        <Toaster />
      </div>
    </div>
  );
};
AppShell.displayName = 'AppShell';
