import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { api } from '@/lib/api';
import { useSeats } from '@/lib/socket';
import { useAuth } from '@/lib/auth';
import { SeatPill } from '@/components/primitives/seat-pill';
import { StatusBadge } from '@/components/primitives/status-badge';
import { CountdownTimer } from '@/components/primitives/countdown-timer';
import { StickyBottomSheet } from '@/components/primitives/sticky-bottom-sheet';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ReviewsSummary } from './ReviewsSummary';
import { ResourceVaultTeaser } from './ResourceVaultTeaser';
import { WinnersPodium, WinnerItem } from './WinnersPodium';
import { TeamPanel } from '../team/TeamPanel';
import { RegisterDialog } from '../register/RegisterDialog';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  ExternalLink,
  ShieldAlert,
  ArrowLeft,
  Share2,
  CheckCircle2,
  AlertCircle,
  Building2,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

export interface EventDetailData {
  id: string;
  slug: string;
  title: string;
  narrativeMarkdown: string;
  category: string;
  status: string;
  startAt: string;
  endAt: string;
  registrationClosesAt?: string;
  venue: string;
  venueMapUrl?: string;
  pricePaise: number;
  capacity: number;
  seatsRemaining: number;
  remainingCapacity?: number;
  isCompetition?: boolean;
  minTeamSize?: number;
  maxTeamSize?: number;
  club: {
    id: string;
    name: string;
    description?: string;
    logoUrl?: string;
    leadName?: string;
  };
  agenda?: Array<{ time: string; title: string; speaker?: string }>;
  reviews?: {
    average: number;
    count: number;
    histogram: Record<number, number>;
  };
  winners?: WinnerItem[];
  userRegistration?: {
    id: string;
    status: string;
    ticketToken?: string;
    waitlistPosition?: number;
  } | null;
  userWaitlistPosition?: number | null;
}

export const EventPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { isSignedIn } = useAuth();
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  // Fetch full event details
  const { data: event, isLoading } = useQuery<EventDetailData>({
    queryKey: ['events', slug, 'full'],
    queryFn: async () => {
      const res = await api.get<{ event: EventDetailData }>(`/events/${slug}`, {
        showToast: false,
      });
      return res.event;
    },
    enabled: !!slug,
  });

  // Real-time socket seats hook
  const socketSeats = useSeats(event?.id);
  const remainingSeats = socketSeats.remaining ?? event?.remainingCapacity ?? event?.seatsRemaining ?? 0;
  const capacity = socketSeats.capacity ?? event?.capacity ?? 100;
  const isSoldOut = remainingSeats <= 0;

  const priceFormatted =
    !event?.pricePaise || event.pricePaise === 0
      ? 'Free'
      : `₹${(event.pricePaise / 100).toFixed(2)}`;

  const shareEvent = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      toast({
        title: 'Event Link Copied',
        description: 'Shareable event URL copied to clipboard.',
      });
    }
  };

  const [waitlistPosition, setWaitlistPosition] = useState<number | null>(null);

  useEffect(() => {
    if (event?.userRegistration?.waitlistPosition) {
      setWaitlistPosition(event.userRegistration.waitlistPosition);
    } else if (typeof event?.userWaitlistPosition === 'number') {
      setWaitlistPosition(event.userWaitlistPosition);
    }
  }, [event?.userRegistration?.waitlistPosition, event?.userWaitlistPosition]);

  const ctaText = isSoldOut
    ? waitlistPosition !== null
      ? `Join Queue (Position #${waitlistPosition})`
      : 'Join Queue'
    : 'Register Now';

  return (
    <div className="container max-w-7xl px-4 sm:px-8 py-8 space-y-8 mx-auto">
      {/* Back button */}
      <div className="flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Discover</span>
        </Link>

        <Button
          variant="outline"
          size="sm"
          onClick={shareEvent}
          className="inline-flex items-center gap-1.5 text-xs h-9"
        >
          <Share2 className="h-3.5 w-3.5" />
          <span>Share</span>
        </Button>
      </div>

      {/* Main Grid: Desktop Split 60/40 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (60%): Rich Narrative, Agenda, Club Card, Reviews, Winners Podium */}
        <div className="lg:col-span-7 space-y-8">
          {/* Header Title & Badges */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={event?.status || 'PUBLISHED'} />
              <SeatPill remaining={remainingSeats} capacity={capacity} />
              <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-muted text-foreground">
                {event?.category || 'Hackathon'}
              </span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
              {event?.title || 'Event Details'}
            </h1>
          </div>

          {/* Markdown Narrative */}
          <Card className="border-border p-6 sm:p-8">
            <div className="prose dark:prose-invert max-w-none text-muted-foreground leading-relaxed">
              <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                {event?.narrativeMarkdown || 'Event overview and guidelines.'}
              </ReactMarkdown>
            </div>
          </Card>

          {/* Agenda Timeline */}
          {event?.agenda && event.agenda.length > 0 && (
            <Card className="border-border p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-indigo-500" />
                <h3 className="text-xl font-bold text-foreground">Event Schedule & Agenda</h3>
              </div>
              <div className="space-y-4 pt-2">
                {event.agenda.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-4 text-xs sm:text-sm">
                    <span className="font-mono font-bold text-primary w-24 shrink-0 tnum">
                      {item.time}
                    </span>
                    <div className="space-y-0.5">
                      <p className="font-semibold text-foreground">{item.title}</p>
                      {item.speaker && (
                        <p className="text-xs text-muted-foreground">{item.speaker}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Club Card */}
          {event?.club && (
            <Card className="border-border p-6 flex flex-col sm:flex-row items-center sm:items-start gap-4">
              <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center text-xl font-extrabold text-primary shrink-0">
                {event.club.name[0]}
              </div>
              <div className="space-y-1 text-center sm:text-left flex-1">
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <h4 className="font-bold text-base text-foreground">{event.club.name}</h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase">
                    Host Club
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {event.club.description}
                </p>
                {event.club.leadName && (
                  <p className="text-xs font-medium text-foreground pt-1">
                    Coordinator: {event.club.leadName}
                  </p>
                )}
              </div>
            </Card>
          )}

          {/* Hackathon Teams Panel (Student side) */}
          {event?.isCompetition && (
            <TeamPanel
              eventId={event.id}
              minTeamSize={event.minTeamSize || 2}
              maxTeamSize={event.maxTeamSize || 4}
            />
          )}

          {/* Resource Vault Teaser */}
          <ResourceVaultTeaser />

          {/* Reviews Summary */}
          {event?.reviews && (
            <ReviewsSummary
              average={event.reviews.average}
              count={event.reviews.count}
              histogram={event.reviews.histogram}
            />
          )}

          {/* Winners Podium for competitions */}
          {event?.winners && event.winners.length > 0 && (
            <WinnersPodium winners={event.winners} />
          )}
        </div>

        {/* Right Column (40%): Sticky Checkout Card on desktop */}
        <div className="lg:col-span-5 sticky top-20 space-y-4">
          <Card className="border-border shadow-lg p-6 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-border/60">
              <div>
                <span className="text-xs text-muted-foreground uppercase font-semibold">Entry Ticket</span>
                <p className="text-3xl font-extrabold text-foreground tnum">{priceFormatted}</p>
              </div>
              <SeatPill remaining={remainingSeats} capacity={capacity} />
            </div>

            {/* Capacity gauge */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Capacity Gauge</span>
                <span className="tnum font-medium">
                  {Math.max(0, capacity - remainingSeats)} / {capacity} taken
                </span>
              </div>
              <Progress
                value={Math.min(100, ((capacity - remainingSeats) / capacity) * 100)}
                className="h-2"
              />
            </div>

            {/* Countdown to Registration Close */}
            {event?.registrationClosesAt && (
              <div className="p-3.5 rounded-xl bg-muted/40 flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-indigo-500" />
                  <span>Closes In:</span>
                </span>
                <CountdownTimer
                  expiresAt={event.registrationClosesAt}
                  className="font-mono font-bold text-foreground text-sm"
                />
              </div>
            )}

            {/* Venue & Time details */}
            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-2.5">
                <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold text-foreground">{event?.venue}</p>
                  {event?.venueMapUrl && (
                    <a
                      href={event.venueMapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <span>Open Campus Map Link</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Calendar className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="text-muted-foreground tnum">
                  {new Date(event?.startAt || Date.now()).toLocaleString()}
                </p>
              </div>
            </div>

            {/* CTA Button */}
            <div className="space-y-2 pt-2">
              <Button
                onClick={() => setIsRegisterOpen(true)}
                data-testid="event-cta-button"
                className={cn(
                  'w-full h-12 text-base font-bold shadow-md transition-all',
                  isSoldOut ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''
                )}
              >
                {ctaText}
              </Button>

              {/* Transparent Waitlist Policy Notice */}
              {isSoldOut && (
                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
                  <p className="font-bold">Waitlist Guarantee Policy</p>
                  <p>
                    When a seat opens, promoted candidates have a strict 20-minute claim window. Unclaimed seats pass automatically to the next attendee.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Mobile Sticky Bottom Bar CTA */}
      <StickyBottomSheet>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-foreground tnum">{priceFormatted}</span>
          <SeatPill remaining={remainingSeats} />
        </div>
        <Button
          onClick={() => setIsRegisterOpen(true)}
          data-testid="mobile-event-cta"
          className={cn(
            'h-11 px-6 font-bold shadow-md',
            isSoldOut ? 'bg-amber-600 text-white' : ''
          )}
        >
          {ctaText}
        </Button>
      </StickyBottomSheet>

      {/* Registration & Dynamic Form Dialog */}
      {event && (
        <RegisterDialog
          eventId={event.id}
          eventTitle={event.title}
          pricePaise={event.pricePaise}
          isOpen={isRegisterOpen}
          onClose={() => setIsRegisterOpen(false)}
          onSuccess={(reg) => {
            if (reg && typeof (reg as any).waitlistPosition === 'number') {
              setWaitlistPosition((reg as any).waitlistPosition);
            }
          }}
        />
      )}
    </div>
  );
};

export default EventPage;
