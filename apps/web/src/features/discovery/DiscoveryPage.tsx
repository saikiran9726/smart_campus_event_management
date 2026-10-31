import React, { useState, useEffect, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { EventCard, EventCardData } from './EventCard';
import { SkeletonCard } from '@/components/primitives/skeleton-card';
import { EmptyState } from '@/components/primitives/empty-state';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Search, SlidersHorizontal, Sparkles, RotateCcw, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

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
        events?: EventCardData[];
        items?: EventCardData[];
        nextCursor?: string | null;
      }>(`/events?${params.toString()}`, { showToast: false });
      const list = res.events || res.items || [];
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

  return (
    <div className="container max-w-7xl px-4 sm:px-8 py-8 space-y-8 mx-auto">
      {/* 1. Hero Search Section */}
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Campus Event Feed</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
            Discover Campus Life
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-2xl">
            Live tickets, instant gate passes, academic OD letters, and hackathon teams.
          </p>
        </div>

        {/* Search input + Mobile Filter Trigger */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-2xl">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search hackathons, workshops, cultural fests..."
              className="pl-10 h-12 text-base rounded-xl border-border/80 shadow-sm focus-visible:ring-4 focus-visible:ring-indigo-500/20"
              aria-label="Search campus events"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground hover:text-foreground p-1"
                aria-label="Clear search"
              >
                Clear
              </button>
            )}
          </div>

          {/* Mobile Filter Sheet Trigger */}
          <Sheet open={isFilterSheetOpen} onOpenChange={setIsFilterSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                className="sm:hidden h-12 px-4 rounded-xl flex items-center gap-2 border-border shadow-sm shrink-0"
                aria-label="Open filter options"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span>Filters</span>
                {hasActiveFilters && (
                  <span className="h-2 w-2 rounded-full bg-primary" />
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] p-6 space-y-6">
              <SheetHeader>
                <SheetTitle className="text-left text-lg font-bold">Filter Events</SheetTitle>
              </SheetHeader>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                    Category
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={cn(
                          'px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                          selectedCategory === cat
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/50 text-foreground border-border'
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                    Date Window
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {DATE_FILTERS.map((df) => (
                      <button
                        key={df.value}
                        onClick={() => setSelectedDateFilter(df.value)}
                        className={cn(
                          'px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                          selectedDateFilter === df.value
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/50 text-foreground border-border'
                        )}
                      >
                        {df.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-border">
                <Button variant="outline" className="flex-1 h-12" onClick={resetFilters}>
                  Reset All
                </Button>
                <Button className="flex-1 h-12" onClick={() => setIsFilterSheetOpen(false)}>
                  Apply Filters
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Desktop Category Chips & Date Filter Buttons */}
        <div className="hidden sm:flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-border/40">
          {/* Category Chips */}
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Event categories">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  'px-4 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer focus-ring',
                  selectedCategory === cat
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-background hover:bg-muted text-muted-foreground hover:text-foreground border-border'
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Date Filters */}
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-muted-foreground mr-1" />
            {DATE_FILTERS.map((df) => (
              <button
                key={df.value}
                onClick={() => setSelectedDateFilter(df.value)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors focus-ring',
                  selectedDateFilter === df.value
                    ? 'bg-muted font-bold text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {df.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Events Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="discovery-loading-skeletons">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : isError ? (
        <div className="p-8 rounded-xl border border-destructive/20 bg-destructive/10 text-center space-y-3">
          <p className="text-sm font-semibold text-destructive">
            Failed to load campus events: {(error as any)?.message || 'Network error'}
          </p>
          <Button variant="outline" onClick={() => refetch()} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            <span>Retry</span>
          </Button>
        </div>
      ) : allEvents.length === 0 ? (
        <EmptyState
          title="No Campus Events Found"
          description="We couldn't find any events matching your current filter criteria or search keyword."
          action={
            <Button
              onClick={resetFilters}
              variant="outline"
              className="inline-flex items-center gap-2 h-11 px-6 shadow-sm"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Reset Filters</span>
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
            data-testid="discovery-events-grid"
          >
            {allEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>

          {/* Keyset Cursor Infinite Scroll Trigger */}
          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="h-12 px-8 font-semibold min-h-12"
              >
                {isFetchingNextPage ? 'Loading more events...' : 'Load More Events'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DiscoveryPage;
