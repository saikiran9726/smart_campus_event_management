import fs from 'node:fs';

const orgDashPath = 'apps/web/src/features/organizer/OrganizerDashboard.tsx';

const newOrgDashCode = `import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  Users,
  QrCode,
  Plus,
  ArrowRight,
  TrendingUp,
  FileText,
  DollarSign,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Settings,
  Layers,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useActiveClub } from './ActiveClubContext';
import { ClubSwitcher } from './ClubSwitcher';
import { ZeroClubsEmptyState } from './ZeroClubsEmptyState';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge';
import { StatCard } from '@/components/shared/StatCard';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { Skeleton } from '@/components/shared/Skeleton';
import { EventStatus } from '@eventora/shared';

interface EventItem {
  id: string;
  clubId: string;
  title: string;
  slug: string;
  status: EventStatus;
  startAt: string;
  endAt: string;
  capacity: number;
  remainingCapacity: number;
  pricePaise: number;
  isPaid: boolean;
  isCompetition: boolean;
  posterKey?: string | null;
}

export const OrganizerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const {
    clubs,
    activeClub,
    activeClubId,
    isLoading: isLoadingClubs,
    isError: isClubsError,
    refetchClubs,
  } = useActiveClub();

  // Fetch real events for the selected active club
  const {
    data: events = [],
    isLoading: isLoadingEvents,
    isError: isEventsError,
    refetch: refetchEvents,
  } = useQuery<EventItem[]>({
    queryKey: ['events', 'club', activeClubId],
    queryFn: async () => {
      if (!activeClubId) return [];
      const res = await api.get<{ items?: EventItem[]; events?: EventItem[] }>(
        \`/clubs/\${activeClubId}/events\`,
        { showToast: false }
      );
      return res.items || res.events || [];
    },
    enabled: !!activeClubId,
  });

  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const filteredEvents = (events ?? []).filter((e) => {
    if (statusFilter === 'ALL') return true;
    return e.status === statusFilter;
  });

  const getStatusBadge = (status: EventStatus) => {
    switch (status) {
      case EventStatus.LIVE:
        return <Badge variant="success" className="animate-pulse">LIVE NOW</Badge>;
      case EventStatus.PUBLISHED:
        return <Badge variant="primary">Published</Badge>;
      case EventStatus.APPROVED:
        return <Badge variant="info">Approved</Badge>;
      case EventStatus.COMPLETED:
        return <Badge variant="neutral">Completed</Badge>;
      case EventStatus.CANCELLED:
        return <Badge variant="danger">Cancelled</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  if (!isLoadingClubs && clubs.length === 0) {
    return (
      <div className="container max-w-6xl py-8 px-4 sm:px-8 mx-auto space-y-6">
        <PageHeader
          title="Organizer Studio"
          subtitle="Manage your campus club operations, event creation, gate scanning, and team rosters."
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: 'Organizer' },
          ]}
          actions={<ClubSwitcher />}
        />
        <ZeroClubsEmptyState onRetry={refetchClubs} />
      </div>
    );
  }

  if (isClubsError) {
    return (
      <div className="container max-w-6xl py-12 px-4 mx-auto text-center space-y-4">
        <ErrorState
          title="Failed to load club memberships"
          message="Could not establish connection to the campus membership registry."
          onRetry={refetchClubs}
        />
      </div>
    );
  }

  const totalRegistered = events.reduce((sum, e) => sum + (e.capacity - e.remainingCapacity), 0);
  const totalCapacity = events.reduce((sum, e) => sum + e.capacity, 0);
  const activeCount = events.filter(
    (e) => e.status === EventStatus.LIVE || e.status === EventStatus.PUBLISHED || e.status === EventStatus.APPROVED
  ).length;

  return (
    <div className="container max-w-6xl py-8 px-4 sm:px-8 mx-auto space-y-8">
      {/* Top Header & Club Switcher */}
      <PageHeader
        title="Organizer Studio"
        subtitle={activeClub ? \`Managing \${activeClub.name}\` : 'Manage your campus club operations, event creation, and gate scanning.'}
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Organizer' },
        ]}
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            <ClubSwitcher />

            <Button
              onClick={() => navigate('/organizer/proposals/new')}
              className="gap-2 shadow-sm font-semibold"
              data-testid="btn-create-proposal"
              disabled={!activeClubId}
            >
              <Plus className="h-4 w-4" />
              <span>New Proposal</span>
            </Button>
          </div>
        }
      />

      {/* StatCards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Club Events"
          value={events.length}
          icon={<Calendar className="h-4 w-4" />}
          change={\`\${filteredEvents.length} in current view\`}
        />
        <StatCard
          label="Active & Published"
          value={activeCount}
          icon={<Sparkles className="h-4 w-4" />}
          intent="teal"
        />
        <StatCard
          label="Confirmed Attendees"
          value={totalRegistered}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Total Capacity"
          value={totalCapacity}
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          to="/organizer/proposals"
          className="flex items-center justify-between p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-teal-500/50 hover:shadow-xs transition-all"
        >
          <div className="flex items-center gap-2.5">
            <FileText className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            <span className="font-semibold text-xs text-stone-900 dark:text-stone-100">Proposals</span>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-stone-400" />
        </Link>

        <Link
          to="/organizer/budget"
          className="flex items-center justify-between p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-teal-500/50 hover:shadow-xs transition-all"
        >
          <div className="flex items-center gap-2.5">
            <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="font-semibold text-xs text-stone-900 dark:text-stone-100">Budget Ledger</span>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-stone-400" />
        </Link>

        <Link
          to="/organizer/analytics"
          className="flex items-center justify-between p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-teal-500/50 hover:shadow-xs transition-all"
        >
          <div className="flex items-center gap-2.5">
            <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="font-semibold text-xs text-stone-900 dark:text-stone-100">NAAC Analytics</span>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-stone-400" />
        </Link>

        <Link
          to="/organizer/settings"
          className="flex items-center justify-between p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-teal-500/50 hover:shadow-xs transition-all"
        >
          <div className="flex items-center gap-2.5">
            <Settings className="h-4 w-4 text-stone-600 dark:text-stone-400" />
            <span className="font-semibold text-xs text-stone-900 dark:text-stone-100">Club Settings</span>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-stone-400" />
        </Link>
      </div>

      {/* Events Section */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Club Events</h2>
            <Badge variant="neutral" className="text-xs tnum">
              {filteredEvents.length}
            </Badge>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {['ALL', 'LIVE', 'PUBLISHED', 'APPROVED', 'COMPLETED'].map((filter) => (
              <Button
                key={filter}
                variant={statusFilter === filter ? 'primary' : 'outline'}
                size="sm"
                className="h-8 text-xs font-semibold px-3"
                aria-pressed={statusFilter === filter}
                onClick={() => setStatusFilter(filter)}
              >
                {filter}
              </Button>
            ))}
          </div>
        </div>

        {isEventsError ? (
          <ErrorState
            title="Failed to load club events"
            message="Unable to query event listings for this organization from the campus server."
            onRetry={() => refetchEvents()}
          />
        ) : isLoadingEvents ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        ) : filteredEvents.length === 0 ? (
          <EmptyState
            title="No events found"
            description="No events match the selected criteria for this club. Submit an event proposal to get started."
            actionLabel="Submit Event Proposal"
            onAction={() => navigate('/organizer/proposals/new')}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredEvents.map((evt) => (
              <Card key={evt.id} className="p-5 space-y-4 hover:border-stone-300 dark:hover:border-stone-700 transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(evt.status)}
                      {evt.isCompetition && (
                        <Badge variant="neutral" className="text-[10px]">
                          Hackathon
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-bold text-base text-stone-900 dark:text-stone-100 line-clamp-1">
                      {evt.title}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-stone-500 pt-1 border-t border-stone-100 dark:border-stone-800">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{new Date(evt.startAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    <span>{evt.capacity - evt.remainingCapacity} / {evt.capacity} registered</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs h-8"
                    onClick={() => navigate(\`/organizer/events/\${evt.id}/gate\`)}
                  >
                    <QrCode className="h-3.5 w-3.5" />
                    <span>Gate Scanner</span>
                  </Button>

                  <Button
                    size="sm"
                    className="gap-1.5 text-xs h-8"
                    onClick={() => navigate(\`/organizer/events/\${evt.id}/edit\`)}
                  >
                    <span>Event Studio</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrganizerDashboard;
`;

fs.writeFileSync(orgDashPath, newOrgDashCode, 'utf8');
console.log('OrganizerDashboard.tsx upgraded with StatCards and design tokens');
