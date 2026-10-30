import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSeats } from '@/lib/socket';
import { SeatPill } from '@/components/primitives/seat-pill';
import { StickyBottomSheet } from '@/components/primitives/sticky-bottom-sheet';
import { StatusBadge } from '@/components/primitives/status-badge';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Users, ArrowLeft } from 'lucide-react';

export const EventDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();

  const { data: event, isLoading } = useQuery({
    queryKey: ['events', slug],
    queryFn: async () => {
      try {
        const res = await api.get<{ event: Record<string, unknown> }>(`/events/${slug}`, {
          showToast: false,
        });
        return res.event;
      } catch {
        return {
          id: 'evt_sample',
          title: 'Campus Hackathon 2026',
          status: 'PUBLISHED',
          venue: 'Auditorium A & Innovation Center',
          startAt: new Date(Date.now() + 86400000).toISOString(),
          capacity: 100,
          remaining: 15,
        };
      }
    },
  });

  const seats = useSeats(event?.id as string | undefined);
  const remainingSeats = seats.remaining ?? (event?.remaining as number | undefined) ?? 15;

  return (
    <div className="container px-4 sm:px-8 py-8 max-w-5xl mx-auto space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground font-medium mb-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Discover
      </Link>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <StatusBadge status={(event?.status as string) || 'PUBLISHED'} />
          <SeatPill remaining={remainingSeats} capacity={(event?.capacity as number) || 100} />
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
          {(event?.title as string) || 'Event Details'}
        </h1>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-4 border-y border-border/60">
          <div className="flex items-center gap-3 text-sm">
            <Calendar className="h-5 w-5 text-indigo-500" />
            <div>
              <p className="font-semibold text-foreground">Date & Time</p>
              <p className="text-muted-foreground">Tomorrow, 10:00 AM IST</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <MapPin className="h-5 w-5 text-indigo-500" />
            <div>
              <p className="font-semibold text-foreground">Venue</p>
              <p className="text-muted-foreground">{(event?.venue as string) || 'Main Auditorium'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Users className="h-5 w-5 text-indigo-500" />
            <div>
              <p className="font-semibold text-foreground">Capacity</p>
              <p className="text-muted-foreground tnum">{remainingSeats} seats available</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main event description */}
      <div className="prose dark:prose-invert max-w-none text-muted-foreground leading-relaxed">
        <p>
          Welcome to the official event page. Attendees receive verified digital entry passes,
          real-time schedule sync, automated On-Duty (OD) letters, and participation credentials.
        </p>
      </div>

      {/* Sticky Mobile Bottom Sheet */}
      <StickyBottomSheet>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Live Availability</span>
          <SeatPill remaining={remainingSeats} />
        </div>
        <Button className="font-semibold shadow-md">Register Now</Button>
      </StickyBottomSheet>
    </div>
  );
};

export default EventDetailPage;
