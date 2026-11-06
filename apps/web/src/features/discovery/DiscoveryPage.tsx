import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { EventCard, EventCardData } from './EventCard';
import {
  Button,
  Input,
  Card,
  Badge,
  StatusPill,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@/components/shared';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Search,
  SlidersHorizontal,
  Sparkles,
  RotateCcw,
  Calendar,
  Users,
  Ticket,
  ArrowRight,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTeamCode } from '@eventora/shared';

export const CATEGORIES = [
  'All',
  'Tech',
  'Cultural',
  'Sports',
  'Workshop',
  'Hackathon',
] as const;

export const DATE_FILTERS = [
  { label: 'All Dates', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'Tomorrow', value: 'tomorrow' },
  { label: 'This Week', value: 'this-week' },
  { label: 'This Month', value: 'this-month' },
] as const;

export const DiscoveryPage: React.FC = () => {
  const { user, isSignedIn } = useAuth();
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('all');
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  // 300ms Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  const resetFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setSelectedCategory('All');
    setSelectedDateFilter('all');
    setIsFilterSheetOpen(false);
  };

  const hasActiveFilters =
    debouncedSearch.length > 0 ||
    selectedCategory !== 'All' ||
    selectedDateFilter !== 'all';

  // Fetch pending invitations for next-step cards
  const { data: invitationsData } = useQuery({
    queryKey: ['me', 'invitations', 'dashboard'],
    queryFn: async () => {
      try {
        const res = await api.get<{ invitations: any[] }>('/me/team-invitations', { showToast: false });
        return res?.invitations || [];
      } catch {
        return [];
      }
    },
    enabled: Boolean(isSignedIn),
  });

  // Fetch student active teams
  const { data: myTeamsData } = useQuery({
    queryKey: ['me', 'teams', 'dashboard'],
    queryFn: async () => {
      try {
        const res = await api.get<{ teams: any[] }>('/me/teams', { showToast: false });
        return res?.teams || [];
      } catch {
        return [];
      }
    },
    enabled: Boolean(isSignedIn),
  });

  // Keyset cursor infinite query
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['events', 'infinite', debouncedSearch, selectedCategory, selectedDateFilter],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (selectedCategory !== 'All') params.set('category', selectedCategory);
      if (selectedDateFilter !== 'all') params.set('dateFilter', selectedDateFilter);
      if (pageParam) params.set('cursor', pageParam);
      params.set('limit', '9');

      const res = await api.get<{
        items?: any[];
        events?: any[];
        nextCursor?: string | null;
      }>(`/events?${params.toString()}`, { showToast: false });

      const rawList = res.items || res.events || [];
      const list: EventCardData[] = rawList.map((item: any) => ({
        id: item.id,
        slug: item.slug,
        title: item.title,
        description: item.description,
        category: item.category,
        bannerUrl: item.bannerUrl ?? item.posterUrl ?? item.coverImageUrl ?? null,
        startAt: item.startAt,
        endAt: item.endAt,
        venue: item.venue ?? item.venueName ?? null,
        pricePaise: item.pricePaise,
        capacity: item.capacity,
        seatsRemaining: item.seatsRemaining ?? item.remainingCapacity ?? 0,
        clubName: item.clubName,
        registrationMode: item.registrationMode,
        minTeamSize: item.minTeamSize,
        maxTeamSize: item.maxTeamSize,
        isCompetition: item.isCompetition,
      }));
      return {
        events: list,
        nextCursor: res.nextCursor || null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const allEvents = useMemo(() => {
    return data?.pages.flatMap((page) => page.events) || [];
  }, [data]);

  const pendingInvitations = (invitationsData || []).filter((inv: any) => inv.status === 'PENDING');
  const activeTeams = myTeamsData || [];

  return (
    <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10 text-left">
      {/* 1. Greeting Hero Section */}
      <section className="p-6 sm:p-8 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge variant="primary" size="sm" leftDot>Campus Portal</Badge>
              {isSignedIn && (
                <span className="text-xs text-stone-500 font-medium">Logged in as {user?.role || 'Student'}</span>
              )}
            </div>
            <h1 className="font-heading text-2xl sm:text-4xl font-extrabold text-stone-900 dark:text-stone-100 tracking-tight">
              {isSignedIn
                ? `Welcome back, ${user?.fullName ? user.fullName.split(' ')[0] : 'Campus Member'}!`
                : 'Discover Campus Events & Hackathons'}
            </h1>
            <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 max-w-2xl leading-relaxed">
              Explore university hackathons, register individually or collaborate in teams, and track digital QR passes.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/teams/join')}
              leftIcon={<Users className="h-4 w-4 text-teal-700 stroke-[1.75]" />}
            >
              Join with Code
            </Button>
            <Button
              size="sm"
              onClick={() => navigate('/passport')}
              leftIcon={<Ticket className="h-4 w-4 stroke-[1.75]" />}
            >
              My Passport
            </Button>
          </div>
        </div>

        {/* 2. Next-step Cards (Pending Invitations & Active Teams) */}
        {isSignedIn && (pendingInvitations.length > 0 || activeTeams.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-stone-100 dark:border-stone-800">
            {/* Pending Team Invitations */}
            {pendingInvitations.length > 0 && (
              <div className="p-4 rounded-md border border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center shrink-0">
                    <Users className="h-4 w-4 stroke-[2]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-amber-900 dark:text-amber-200 truncate">
                      {pendingInvitations.length} Pending Team Invitation{pendingInvitations.length > 1 ? 's' : ''}
                    </p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 truncate">
                      From team &quot;{pendingInvitations[0].teamName}&quot;
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white shrink-0 text-xs h-8"
                  onClick={() => navigate('/teams/join')}
                >
                  Review
                </Button>
              </div>
            )}

            {/* Active Teams */}
            {activeTeams.length > 0 && (
              <div className="p-4 rounded-md border border-teal-200 bg-teal-50/40 dark:border-teal-800 dark:bg-teal-950/20 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 stroke-[2]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-teal-900 dark:text-teal-200 truncate">
                      {activeTeams[0].name}
                    </p>
                    <p className="text-[11px] text-teal-700 dark:text-teal-400 font-mono tnum">
                      Code: {formatTeamCode(activeTeams[0].inviteCode)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-xs h-8"
                  onClick={() => navigate('/passport')}
                >
                  View Team
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. Search & Filter Bar */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading text-xl font-bold text-stone-900 dark:text-stone-100">
              Upcoming Events
            </h2>
            <p className="text-xs text-stone-500">Live listings with real-time seat tracking</p>
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} leftIcon={<RotateCcw className="h-3.5 w-3.5" />}>
              Clear All Filters
            </Button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 stroke-[1.75]" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search hackathons, workshops, fests..."
              className="w-full h-11 pl-10 pr-4 rounded-md border border-stone-300 bg-white text-sm text-stone-800 placeholder:text-stone-400 focus-ring dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 transition-colors"
              aria-label="Search campus events"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-stone-500 hover:text-stone-800 p-1"
                aria-label="Clear search"
              >
                Clear
              </button>
            )}
          </div>

          {/* Desktop Categories Filter Tabs */}
          <div className="hidden lg:flex items-center gap-1.5 overflow-x-auto">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  'px-3 py-2 rounded-md text-xs font-semibold border transition-colors whitespace-nowrap focus-ring',
                  selectedCategory === cat
                    ? 'bg-teal-700 text-white border-teal-700 dark:bg-teal-600'
                    : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-700'
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Mobile Filter Sheet Trigger */}
          <Sheet open={isFilterSheetOpen} onOpenChange={setIsFilterSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                className="lg:hidden h-11 px-4 flex items-center gap-2 shrink-0 font-semibold text-xs"
              >
                <SlidersHorizontal className="h-4 w-4 stroke-[1.75]" />
                <span>Filters {hasActiveFilters && '•'}</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-lg max-h-[85vh] p-6 space-y-6">
              <SheetHeader>
                <SheetTitle className="text-left font-heading text-lg font-bold">Filter Events</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 text-left">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Category</p>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={cn(
                          'px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                          selectedCategory === cat
                            ? 'bg-teal-700 text-white border-teal-700'
                            : 'bg-stone-100 text-stone-700 border-stone-200'
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Date</p>
                  <div className="flex flex-wrap gap-2">
                    {DATE_FILTERS.map((d) => (
                      <button
                        key={d.value}
                        onClick={() => setSelectedDateFilter(d.value)}
                        className={cn(
                          'px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                          selectedDateFilter === d.value
                            ? 'bg-teal-700 text-white border-teal-700'
                            : 'bg-stone-100 text-stone-700 border-stone-200'
                        )}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </section>

      {/* 4. Event Cards Grid */}
      <section>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <Skeleton variant="card" className="h-[380px]" />
            <Skeleton variant="card" className="h-[380px]" />
            <Skeleton variant="card" className="h-[380px]" />
          </div>
        ) : isError ? (
          <ErrorState
            title="Failed to Load Events"
            message={(error as Error)?.message || 'Unable to load events from the campus server.'}
            onRetry={() => refetch()}
          />
        ) : allEvents.length === 0 ? (
          <EmptyState
            title="No Campus Events Found"
            description={
              hasActiveFilters
                ? 'No campus events matched your current search and filter criteria.'
                : 'There are currently no upcoming events published on campus.'
            }
            actionLabel={hasActiveFilters ? 'Reset Filters' : undefined}
            onAction={hasActiveFilters ? resetFilters : undefined}
          />
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="events-grid">
              {allEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>

            {hasNextPage && (
              <div className="text-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => fetchNextPage()}
                  isLoading={isFetchingNextPage}
                >
                  Load More Events
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
export default DiscoveryPage;
