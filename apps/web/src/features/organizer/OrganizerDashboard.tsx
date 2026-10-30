import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Plus,
  Calendar,
  Users,
  Settings,
  DollarSign,
  BarChart3,
  FileText,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronRight,
  Trophy,
} from 'lucide-react';
import { EventStatus } from '@eventora/shared';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ClubItem {
  id: string;
  name: string;
  slug: string;
}

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

  // 1. Fetch user clubs
  const { data: clubs } = useQuery<ClubItem[]>({
    queryKey: ['clubs', 'me'],
    queryFn: async () => {
      try {
        const res = await api.get<{ clubs: ClubItem[] }>('/clubs/me');
        return res.clubs;
      } catch {
        return [
          { id: '11111111-1111-1111-1111-111111111111', name: 'Computer Science Society', slug: 'cs-society' },
          { id: '22222222-2222-2222-2222-222222222222', name: 'Robotics & AI Club', slug: 'robotics-ai' },
        ];
      }
    },
  });

  const [selectedClubId, setSelectedClubId] = useState<string>('');
  const activeClubId = selectedClubId || (clubs && clubs[0]?.id) || '';

  // 2. Fetch events
  const { data: events, isLoading } = useQuery<EventItem[]>({
    queryKey: ['events', 'club', activeClubId],
    queryFn: async () => {
      try {
        const res = await api.get<{ items: EventItem[] }>(`/clubs/${activeClubId}/events`);
        return res.items;
      } catch {
        // Fallback demo events
        return [
          {
            id: 'evt-101',
            clubId: activeClubId,
            title: 'Autonomous AI Hackathon 2026',
            slug: 'ai-hackathon-2026',
            status: EventStatus.PUBLISHED,
            startAt: new Date(Date.now() + 86400000 * 3).toISOString(),
            endAt: new Date(Date.now() + 86400000 * 4).toISOString(),
            capacity: 250,
            remainingCapacity: 12,
            pricePaise: 0,
            isPaid: false,
            isCompetition: true,
          },
          {
            id: 'evt-102',
            clubId: activeClubId,
            title: 'Full-Stack Distributed Systems Workshop',
            slug: 'systems-workshop',
            status: EventStatus.LIVE,
            startAt: new Date().toISOString(),
            endAt: new Date(Date.now() + 3600000 * 4).toISOString(),
            capacity: 120,
            remainingCapacity: 0,
            pricePaise: 50000,
            isPaid: true,
            isCompetition: false,
          },
        ];
      }
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

  return (
    <div className="container max-w-6xl py-8 px-4 sm:px-8 mx-auto space-y-6">
      {/* Top Header & Club Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight">Organizer Studio</h1>
          <p className="text-sm text-muted-foreground">
            Manage your campus club operations, event creation, gate scanning, and team rosters.
          </p>
        </div>

        {/* Club Switcher & Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-56">
            <Select
              value={activeClubId}
              onValueChange={(val) => setSelectedClubId(val)}
            >
              <SelectTrigger data-testid="club-switcher">
                <SelectValue placeholder="Select Club" />
              </SelectTrigger>
              <SelectContent>
                {(clubs ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={() => navigate('/organizer/proposals/new')}
            className="gap-2 shadow-sm"
            data-testid="btn-create-proposal"
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
            <BarChart3 className="h-4 w-4 text-violet-500" />
            <span className="font-semibold text-xs">Analytics & NAAC</span>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </Link>

        <Link
          to="/organizer/settings"
          className="flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Settings className="h-4 w-4 text-blue-500" />
            <span className="font-semibold text-xs">Club Settings</span>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </Link>
      </div>

      {/* Pipeline Status Filter Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {['ALL', 'PUBLISHED', 'LIVE', 'APPROVED', 'COMPLETED', 'CANCELLED'].map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors ${
              statusFilter === st
                ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted'
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Event Cards Pipeline List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-28 bg-muted rounded-xl" />
            <div className="h-28 bg-muted rounded-xl" />
          </div>
        ) : filteredEvents.length === 0 ? (
          <Card className="border-dashed p-12 text-center text-muted-foreground space-y-2">
            <Calendar className="h-10 w-10 mx-auto text-muted-foreground/40 mb-1" />
            <p className="text-sm font-semibold">No events found in this view</p>
            <p className="text-xs">Create a new event proposal to schedule campus activities.</p>
          </Card>
        ) : (
          filteredEvents.map((evt) => (
            <Card
              key={evt.id}
              className="border-border hover:border-border/80 transition-all p-5"
              data-testid={`organizer-event-${evt.id}`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-lg">{evt.title}</h3>
                    {getStatusBadge(evt.status)}
                    {evt.isCompetition && (
                      <Badge variant="outline" className="text-indigo-600 dark:text-indigo-400 border-indigo-300 text-[11px] flex items-center gap-1">
                        <Trophy className="h-3 w-3" />
                        Hackathon / Team
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap tnum">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(evt.startAt).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {evt.capacity - evt.remainingCapacity} / {evt.capacity} registered
                    </span>
                    <span>
                      {evt.isPaid ? `₹${(evt.pricePaise / 100).toFixed(2)}` : 'Free'}
                    </span>
                  </div>
                </div>

                {/* Event Action Buttons */}
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                  >
                    <Link to={`/organizer/events/${evt.id}/edit`}>
                      <Settings className="h-3.5 w-3.5" />
                      Edit Event
                    </Link>
                  </Button>

                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    data-testid={`btn-builder-${evt.id}`}
                  >
                    <Link to={`/organizer/events/${evt.id}/builder`}>
                      <FileText className="h-3.5 w-3.5" />
                      Form Builder
                    </Link>
                  </Button>

                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    data-testid={`btn-gate-${evt.id}`}
                  >
                    <Link to={`/organizer/events/${evt.id}/gate`}>
                      <QrCode className="h-3.5 w-3.5" />
                      Gate Ops
                    </Link>
                  </Button>

                  {evt.isCompetition && (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5 text-indigo-600 dark:text-indigo-400"
                    >
                      <Link to={`/organizer/events/${evt.id}/teams`}>
                        <Trophy className="h-3.5 w-3.5" />
                        Teams & Podium
                      </Link>
                    </Button>
                  )}

                  <Button
                    asChild
                    size="sm"
                    className="h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    <Link to={`/organizer/events/${evt.id}/analytics`}>
                      <BarChart3 className="h-3.5 w-3.5" />
                      Analytics
                    </Link>
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default OrganizerDashboard;
