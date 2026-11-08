import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { api } from '@/lib/api';
import { useSeats } from '@/lib/socket';
import { useAuth } from '@/lib/auth';
import { SeatPill } from '@/components/primitives/seat-pill';
import { StatusBadge } from '@/components/primitives/status-badge';
import { CountdownTimer } from '@/components/primitives/countdown-timer';
import { StickyBottomSheet } from '@/components/primitives/sticky-bottom-sheet';
import { EmptyState } from '@/components/primitives/empty-state';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ReviewsSummary } from './ReviewsSummary';
import { ResourceVaultTeaser } from './ResourceVaultTeaser';
import { ProjectSubmissionConfig } from '@eventora/shared';
import { WinnersPodium, WinnerItem } from './WinnersPodium';
import { TeamPanel } from '../team/TeamPanel';
import { RegisterDialog } from '../register/RegisterDialog';
import { SandboxCheckout } from '../register/SandboxCheckout';
import { AuthenticatedQrImage } from '../passport/AuthenticatedQrImage';
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
  Ticket,
  QrCode,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { copyToClipboard } from '@/lib/clipboard';

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
  venue?: string | null;
  venueName?: string | null;
  venueLocation?: string | null;
  venueMapUrl?: string;
  pricePaise: number;
  capacity: number;
  seatsRemaining: number;
  remainingCapacity?: number;
  registrationMode?: 'INDIVIDUAL' | 'TEAM' | 'BOTH' | string;
  isCompetition?: boolean;
  minTeamSize?: number;
  maxTeamSize?: number;
  projectSubmissionConfig?: ProjectSubmissionConfig | null;
  club: {
    id: string;
    name: string;
    description?: string;
    logoUrl?: string;
    leadName?: string;
  };
  agenda?: Array<{ time?: string; title: string; speaker?: string; speakerOrLocation?: string }>;
  reviews?: {
    average: number;
    count: number;
    histogram: Record<number, number>;
  };
  winners?: WinnerItem[];
  userRegistration?: {
    id: string;
    status: string;
    paymentStatus?: string;
    amountPaise?: number;
    offerExpiresAt?: string | null;
    waitlistPosition?: number;
    ticket?: {
      id: string;
      status: string;
      checkedInAt?: string | null;
    } | null;
  } | null;
  userWaitlistPosition?: number | null;
}

export const EventPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isSignedIn } = useAuth();

  // Modals state
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isTicketOpen, setIsTicketOpen] = useState(false);
  const [isPendingPaymentOpen, setIsPendingPaymentOpen] = useState(false);
  const [isWaitlistModalOpen, setIsWaitlistModalOpen] = useState(false);

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

  const shareEvent = async () => {
    const success = await copyToClipboard(window.location.href);
    if (success) {
      toast({
        title: 'Event Link Copied',
        description: 'Shareable event URL copied to clipboard.',
      });
    } else {
      toast({
        title: 'Unable to Copy Link',
        description: 'Clipboard access was restricted. Please copy the URL from your address bar.',
      });
    }
  };

  const userReg = event?.userRegistration;
  const waitlistPos =
    userReg?.waitlistPosition ??
    (typeof event?.userWaitlistPosition === 'number' ? event.userWaitlistPosition : null);

  // Unified State Resolver for CTA
  type CtaState = {
    label: string;
    onClick: () => void;
    className?: string;
    disabled?: boolean;
    helperText?: string;
  };

  const resolveCta = (): CtaState => {
    if (!userReg || userReg.status === 'CANCELLED' || userReg.status === 'EXPIRED') {
      if (isSoldOut) {
        return {
          label: 'Join Queue',
          onClick: () => setIsRegisterOpen(true),
          className: 'bg-amber-600 hover:bg-amber-700 text-white',
        };
      }
      return {
        label: userReg?.status ? 'Register Again' : 'Register Now',
        onClick: () => setIsRegisterOpen(true),
      };
    }

    if (userReg.status === 'CONFIRMED') {
      if (userReg.paymentStatus === 'PENDING') {
        return {
          label: 'Complete Payment (Pending)',
          onClick: () => setIsPendingPaymentOpen(true),
          className: 'bg-amber-600 hover:bg-amber-700 text-white',
          helperText: 'Seat held temporarily. Complete payment to secure your ticket.',
        };
      }

      const isRevoked =
        userReg.ticket?.status === 'REVOKED' || (userReg.ticket?.status as string) === 'VOID';

      if (isRevoked) {
        return {
          label: 'Pass Inactive or Revoked',
          onClick: () => setIsTicketOpen(true),
          className: 'bg-destructive/80 hover:bg-destructive text-destructive-foreground',
          helperText: 'Your pass for this event has been revoked or invalidated.',
        };
      }

      return {
        label: 'Already Registered • View Ticket',
        onClick: () => setIsTicketOpen(true),
        className: 'bg-emerald-600 hover:bg-emerald-700 text-white',
      };
    }

    if (userReg.status === 'WAITLISTED') {
      const posLabel = waitlistPos !== null ? `Queue #${waitlistPos}` : 'In Queue';
      return {
        label: `Waitlisted (${posLabel})`,
        onClick: () => setIsWaitlistModalOpen(true),
        className: 'bg-amber-600 hover:bg-amber-700 text-white',
        helperText: 'You are on the waitlist. Click to view status.',
      };
    }

    if (userReg.status === 'OFFERED') {
      return {
        label: 'Claim Seat Offer!',
        onClick: () => navigate(`/claim/${userReg.id}`),
        className: 'bg-teal-600 hover:bg-teal-700 text-white animate-pulse',
        helperText: 'Seat offered! Claim your seat before the offer expires.',
      };
    }

    if (userReg.status === 'NO_SHOW') {
      return {
        label: 'Ineligible (Marked No-Show)',
        onClick: () => {},
        disabled: true,
        className: 'bg-muted text-muted-foreground cursor-not-allowed',
        helperText: 'You have been marked as a no-show for this event.',
      };
    }

    // Default fallback
    return {
      label: isSoldOut ? 'Join Queue' : 'Register Now',
      onClick: () => setIsRegisterOpen(true),
      className: isSoldOut ? 'bg-amber-600 hover:bg-amber-700 text-white' : '',
    };
  };

  if (isLoading) {
    return (
      <div className="container max-w-7xl px-4 sm:px-8 py-8 space-y-8 mx-auto animate-pulse">
        <div className="h-4 w-28 bg-stone-200 dark:bg-stone-800 rounded" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 space-y-6">
            <div className="flex gap-2">
              <div className="h-6 w-20 bg-stone-200 dark:bg-stone-800 rounded-full" />
              <div className="h-6 w-24 bg-stone-200 dark:bg-stone-800 rounded-full" />
            </div>
            <div className="h-10 w-3/4 bg-stone-200 dark:bg-stone-800 rounded-md" />
            <div className="h-48 w-full bg-stone-200 dark:bg-stone-800 rounded-xl" />
          </div>
          <div className="lg:col-span-5 space-y-6">
            <div className="h-64 w-full bg-stone-200 dark:bg-stone-800 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="container max-w-7xl px-4 sm:px-8 py-16 mx-auto">
        <EmptyState
          title="Event Not Found"
          description="The event you are looking for may have been removed or the URL is incorrect."
          action={
            <Button onClick={() => navigate('/')} className="mt-4">
              Back to Discover
            </Button>
          }
        />
      </div>
    );
  }

  const cta = resolveCta();

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
                <Clock className="h-5 w-5 text-teal-600 dark:text-teal-400" />
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
                      {(item.speaker || item.speakerOrLocation) && (
                        <p className="text-xs text-muted-foreground">
                          {item.speaker || item.speakerOrLocation}
                        </p>
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

          {/* Hackathon / Competition Teams Panel (Student side) */}
          {Boolean(event && (event.isCompetition || event.registrationMode === 'TEAM' || event.registrationMode === 'BOTH' || (event.minTeamSize && event.minTeamSize > 1))) && (
            <TeamPanel
              eventId={event!.id}
              eventTitle={event!.title}
              minTeamSize={event!.minTeamSize || 2}
              maxTeamSize={event!.maxTeamSize || 4}
              projectSubmissionConfig={event?.projectSubmissionConfig}
              currentUserId={user?.id}
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
                  <Clock className="h-4 w-4 text-teal-600 dark:text-teal-400" />
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
                  <p className="font-semibold text-foreground">{event?.venueName || event?.venue}</p>
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
                onClick={cta.onClick}
                disabled={cta.disabled}
                data-testid="event-cta-button"
                className={cn(
                  'w-full h-12 text-base font-bold shadow-md transition-all',
                  cta.className
                )}
              >
                {cta.label}
              </Button>
              {cta.helperText && (
                <p className="text-[11px] text-center text-muted-foreground font-medium">
                  {cta.helperText}
                </p>
              )}

              {/* Join Team with Code Secondary Entrypoint */}
              {Boolean(event?.registrationMode === 'TEAM' || event?.registrationMode === 'BOTH' || event?.isCompetition) && (!userReg || userReg.status === 'CANCELLED') && (
                <Button
                  variant="outline"
                  onClick={() => navigate('/teams/join')}
                  className="w-full h-11 text-xs font-semibold gap-1.5"
                >
                  <Users className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  <span>Join with Team Code</span>
                </Button>
              )}

              {/* Transparent Waitlist Policy Notice */}
              {isSoldOut && (!userReg || userReg.status === 'CANCELLED' || userReg.status === 'EXPIRED') && (
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
          onClick={cta.onClick}
          disabled={cta.disabled}
          data-testid="mobile-event-cta"
          className={cn(
            'h-11 px-6 font-bold shadow-md',
            cta.className
          )}
        >
          {cta.label}
        </Button>
      </StickyBottomSheet>

      {/* 1. Ticket Modal */}
      {userReg && (
        <Dialog open={isTicketOpen} onOpenChange={setIsTicketOpen}>
          <DialogContent className="max-w-md p-6 space-y-5" data-testid="event-ticket-modal">
            <DialogHeader className="text-left space-y-1">
              <div className="flex items-center gap-2 text-primary">
                <Ticket className="h-5 w-5" />
                <DialogTitle className="text-xl font-bold">Your Event Pass</DialogTitle>
              </div>
              <DialogDescription>
                Verified digital gate pass for {event?.title}.
              </DialogDescription>
            </DialogHeader>

            <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className={cn(
                  'font-bold uppercase',
                  userReg.ticket?.status === 'REVOKED' || (userReg.ticket?.status as string) === 'VOID'
                    ? 'text-destructive'
                    : 'text-emerald-600 dark:text-emerald-400'
                )}>
                  {userReg.ticket?.status || userReg.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Venue</span>
                <span className="font-semibold text-foreground" data-testid="ticket-modal-venue">
                  {event?.venueName || event?.venue}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Start Time</span>
                <span className="font-semibold text-foreground">
                  {event?.startAt ? new Date(event.startAt).toLocaleString() : ''}
                </span>
              </div>
            </div>

            {userReg.ticket?.status === 'REVOKED' || (userReg.ticket?.status as string) === 'VOID' ? (
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs space-y-1" data-testid="revoked-ticket-banner">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Pass Revoked</span>
                </div>
                <p>This pass has been invalidated. Entry at gate scanning stations is strictly prohibited.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl shadow-inner border border-slate-200" data-testid="active-ticket-qr-container">
                <AuthenticatedQrImage
                  registrationId={userReg.id}
                  className="w-48 h-48"
                />
                <p className="text-[11px] text-slate-600 font-medium pt-2">
                  Show this QR code at the check-in desk
                </p>
              </div>
            )}

            <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                variant="outline"
                className="w-full sm:w-auto flex-1 gap-1.5"
                asChild
              >
                <Link to="/passport">
                  <span>Go to Event Passport</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <Button
                variant="default"
                className="w-full sm:w-auto"
                onClick={() => setIsTicketOpen(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 2. Pending Payment Modal */}
      {userReg && event && (
        <Dialog open={isPendingPaymentOpen} onOpenChange={setIsPendingPaymentOpen}>
          <DialogContent className="max-w-lg p-0 overflow-hidden" data-testid="pending-payment-modal">
            <SandboxCheckout
              eventId={event.id}
              registrationId={userReg.id}
              eventTitle={event.title}
              amountPaise={userReg.amountPaise || event.pricePaise || 0}
              onSuccess={() => {
                setIsPendingPaymentOpen(false);
                queryClient.invalidateQueries({ queryKey: ['events'] });
                queryClient.invalidateQueries({ queryKey: ['me', 'registrations'] });
                queryClient.invalidateQueries({ queryKey: ['me', 'passport'] });
                toast({
                  title: 'Payment Completed',
                  description: 'Your registration is now fully confirmed!',
                });
              }}
              onFailure={(msg) => {
                toast({
                  variant: 'destructive',
                  title: 'Payment Incomplete',
                  description: msg,
                });
              }}
              onCancel={() => setIsPendingPaymentOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* 3. Waitlist Status Modal */}
      {userReg && (
        <Dialog open={isWaitlistModalOpen} onOpenChange={setIsWaitlistModalOpen}>
          <DialogContent className="max-w-md p-6 space-y-5" data-testid="waitlist-status-modal">
            <DialogHeader className="text-left space-y-1">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <Clock className="h-5 w-5" />
                <DialogTitle className="text-xl font-bold">Waitlist Status</DialogTitle>
              </div>
              <DialogDescription>
                You are currently in the queue for {event?.title}.
              </DialogDescription>
            </DialogHeader>

            <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 space-y-2 text-xs text-amber-900 dark:text-amber-200">
              <div className="flex items-center justify-between font-bold text-sm">
                <span>Queue Position:</span>
                <span className="font-mono text-base px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-900 text-amber-950 dark:text-amber-100">
                  {waitlistPos !== null ? `#${waitlistPos}` : 'Calculating...'}
                </span>
              </div>
              <p className="pt-1 leading-relaxed">
                When an existing registered attendee cancels, seats are offered in strict FIFO queue order.
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-muted/40 border border-border text-xs space-y-1.5 text-muted-foreground">
              <p className="font-semibold text-foreground">Waitlist Guarantee Policy</p>
              <p>
                When an offer is extended to you, you will have a strict 20-minute claim window. An instant notification will be delivered via Email & WhatsApp.
              </p>
            </div>

            <DialogFooter>
              <Button
                variant="default"
                className="w-full"
                onClick={() => setIsWaitlistModalOpen(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Registration & Dynamic Form Dialog */}
      {event && (
        <RegisterDialog
          eventId={event.id}
          eventTitle={event.title}
          pricePaise={event.pricePaise}
          isOpen={isRegisterOpen}
          onClose={() => setIsRegisterOpen(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['events', slug, 'full'] });
          }}
        />
      )}
    </div>
  );
};

export default EventPage;
