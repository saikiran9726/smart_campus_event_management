import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { RealPosterCard, SkeletonCard } from '@/components/primitives/skeleton-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Sparkles } from 'lucide-react';

interface EventItem {
  id: string;
  slug: string;
  title: string;
  category: string;
  startAt: string;
  clubName?: string;
}

export const DiscoverPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = React.useState('');

  const { data: events, isLoading } = useQuery<EventItem[]>({
    queryKey: ['events', 'list'],
    queryFn: async () => {
      try {
        const res = await api.get<{ events: EventItem[] }>('/events', { showToast: false });
        return res.events || [];
      } catch {
        return [];
      }
    },
  });

  return (
    <div className="container px-4 sm:px-8 py-8 space-y-8 max-w-7xl mx-auto">
      {/* Hero Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-border/60">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-semibold mb-2">
            <Sparkles className="h-3.5 w-3.5" />
            Campus Hub
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Discover Campus Events
          </h1>
          <p className="mt-1 text-muted-foreground text-sm sm:text-base">
            Workshops, hackathons, guest lectures, and cultural fests across your university.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search events, clubs, venues..."
            className="pl-9 h-11"
          />
        </div>
      </div>

      {/* Grid of Events */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : events && events.length > 0 ? (
          events.map((evt) => (
            <RealPosterCard
              key={evt.id}
              title={evt.title}
              category={evt.category}
              date={new Date(evt.startAt).toLocaleDateString()}
              clubName={evt.clubName || 'Campus Club'}
            />
          ))
        ) : (
          <>
            <RealPosterCard
              title="Autonomous AI Hackathon 2026"
              category="Hackathon"
              date="Tomorrow at 9:00 AM"
              clubName="Turing Code Club"
            />
            <RealPosterCard
              title="NextGen Web Systems & Rust"
              category="Workshop"
              date="Friday at 2:00 PM"
              clubName="ACM Student Chapter"
            />
            <RealPosterCard
              title="Annual Campus Robotics Expo"
              category="Competition"
              date="Saturday at 10:00 AM"
              clubName="Robotics Society"
            />
          </>
        )}
      </div>
    </div>
  );
};

export default DiscoverPage;
