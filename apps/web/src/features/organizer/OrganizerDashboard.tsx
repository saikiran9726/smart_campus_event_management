import React, { useState } from 'react';
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
} from 'lucide-react';
import { api } from '@/lib/api';
import { useActiveClub } from './ActiveClubContext';
import { ClubSwitcher } from './ClubSwitcher';
import { ZeroClubsEmptyState } from './ZeroClubsEmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
        `/clubs/${activeClubId}/events`,
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
        return <Badge className="bg-emerald-500 text-white animate-pulse">LIVE NOW</Badge>;
      case EventStatus.PUBLISHED:
        return <Badge className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-300">Published</Badge>;
      case EventStatus.APPROVED:
        return <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-300">Approved</Badge>;
      case EventStatus.COMPLETED:
        return <Badge variant="secondary">Completed</Badge>;
      case EventStatus.CANCELLED:
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (!isLoadingClubs && clubs.length === 0) {
    return (
      <div className="container max-w-6xl py-8 px-4 sm:px-8 mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold tracking-tight">Organizer Studio</h1>
            <p className="text-sm text-muted-foreground">
              Manage your campus club operations, event creation, gate scanning, and team rosters.
            </p>
          </div>
          <ClubSwitcher />
        </div>
        <ZeroClubsEmptyState onRetry={refetchClubs} />
      </div>
    );
  }

  if (isClubsError) {
    return (
      <div className="container max-w-6xl py-12 px-4 mx-auto text-center space-y-4">
        <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
        <h2 className="text-xl font-bold">Failed to load club memberships</h2>
        <p className="text-sm text-muted-foreground">
          Could not establish connection to the campus membership registry.
        </p>
        <Button onClick={refetchClubs} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          <span>Retry</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-8 px-4 sm:px-8 mx-auto space-y-6">
      {/* Top Header & Club Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight">Organizer Studio</h1>
            {activeClub && (
              <Badge variant="outline" className="text-xs uppercase font-mono">
                {activeClub.role}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {activeClub ? `Managing ${activeClub.name}` : 'Manage your campus club operations, event creation, and gate scanning.'}
          </p>
        </div>

        {/* Club Switcher & Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <ClubSwitcher />

          <Button
            onClick={() => navigate('/organizer/proposals/new')}
            className="gap-2 shadow-sm"
            data-testid="btn-create-proposal"
            disabled={!activeClubId}
          >
            <Plus className="h-4 w-4" />
            <span>New Proposal</span>
          </Button>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          to="/organizer/proposals"
          className="flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <FileText className="h-4 w-4 text-indigo-500" />
            <span className="font-semibold text-xs">Proposals</span>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </Link>

        <Link
          to="/organizer/budget"
          className="flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <DollarSign className="h-4 w-4 text-emerald-500" />
            <span className="font-semibold text-xs">Budget Ledger</span>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </Link>

        <Link
          to="/organizer/analytics"
          className="flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <TrendingUp className="h-4 w-4 text-violet-500" />
            <span className="font-semibold text-xs">NAAC Analytics</span>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </Link>

        <Link
          to="/organizer/settings"
          className="flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Users className="h-4 w-4 text-amber-500" />
            <span className="font-semibold text-xs">Club Settings</span>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </Link>
      </div>

      {/* Events Section */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight">Club Events</h2>
            <Badge variant="secondary" className="text-xs tnum">
              {filteredEvents.length}
            </Badge>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {['ALL', 'LIVE', 'PUBLISHED', 'APPROVED', 'COMPLETED'].map((filter) => (
              <Button
                key={filter}
                variant={statusFilter === filter ? 'default' : 'outline'}
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
          <Card className="border-border p-6 text-center space-y-3" data-testid="events-error-state">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
            <div className="space-y-1">
              <h3 className="font-semibold text-sm">Failed to load club events</h3>
              <p className="text-xs text-muted-foreground">
                Unable to query event listings for this organization.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => refetchEvents()} className="gap-2">
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </Button>
          </Card>
        ) : isLoadingEvents ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-48 rounded-xl bg-muted/40 animate-pulse border border-border" />
            <div className="h-48 rounded-xl bg-muted/40 animate-pulse border border-border" />
          </div>
        ) : filteredEvents.length === 0 ? (
          <Card className="border-border p-10 text-center space-y-3">
            <Calendar className="h-10 w-10 text-muted-foreground mx-auto" />
            <div className="space-y-1">
              <h3 className="font-semibold text-base">No events found</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                No events match the selected criteria for this club. Submit an event proposal to get started.
              </p>
            </div>
            <Button
              onClick={() => navigate('/organizer/proposals/new')}
              size="sm"
              className="gap-2"
              disabled={!activeClubId}
            >
              <Plus className="h-4 w-4" />
              <span>Submit Event Proposal</span>
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredEvents.map((evt) => (
              <Card key={evt.id} className="border-border hover:shadow-md transition-shadow">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(evt.status)}
                        {evt.isCompetition && (
                          <Badge variant="outline" className="text-[10px]">
                            Hackathon
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-bold text-base text-foreground line-clamp-1">
                        {evt.title}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t border-border/60">
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
                      asChild
                    >
                      <Link to={`/organizer/events/${evt.id}/gate`}>
                        <QrCode className="h-3.5 w-3.5" />
                        <span>Gate Scanner</span>
                      </Link>
                    </Button>

                    <Button
                      size="sm"
                      className="gap-1.5 text-xs h-8"
                      asChild
                    >
                      <Link to={`/organizer/events/${evt.id}/edit`}>
                        <span>Event Studio</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrganizerDashboard;
