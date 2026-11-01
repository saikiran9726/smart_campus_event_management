import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSocketEvent } from '@/lib/socket';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/primitives/status-badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { AuthenticatedQrImage } from './AuthenticatedQrImage';
import {
  Ticket,
  FileText,
  Award,
  Sun,
  Download,
  Share2,
  Trash2,
  Star,
  MapPin,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PassportTicket {
  id: string;
  registrationId: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  venue: string;
  token: string;
  status: 'VALID' | 'CHECKED_IN' | 'REVOKED';
  isAttended: boolean;
  hasOdLetter?: boolean;
  reviewed?: boolean;
}

export interface PassportCertificate {
  id: string;
  eventTitle: string;
  issuedAt: string;
  recipientName: string;
  rank?: number;
}

interface RegistrationApiRow {
  registration: {
    id: string;
    userId: string;
    eventId: string;
    status: 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED' | 'ATTENDED';
    createdAt: string;
    updatedAt: string;
  };
  event: {
    id: string;
    title: string;
    slug: string;
    startAt: string;
    endAt: string;
    category: string;
    posterKey?: string | null;
    isPaid: boolean;
    pricePaise: number;
  };
  ticket: {
    id: string;
    registrationId: string;
    userId: string;
    token: string;
    status: 'VALID' | 'CHECKED_IN' | 'REVOKED';
    checkedInAt?: string | null;
    checkedInVia?: string | null;
    createdAt: string;
  } | null;
}

interface PassportApiRow {
  event: {
    id: string;
    title: string;
    slug: string;
    startAt: string;
    endAt: string;
    club: { name: string; slug: string };
  };
  ticket: {
    id: string;
    registrationId?: string;
    checkedInAt: string;
  };
  certificate: {
    id: string;
    kind: string;
    rank?: number | null;
    issuedAt: string;
  } | null;
  odLetter: {
    id: string;
    serial: string;
    issuedAt: string;
  } | null;
  review: {
    id: string;
    stars: number;
    comment: string | null;
    createdAt: string;
  } | null;
  resources: Array<{ id: string; title: string; kind: string; resourceKey?: string; url?: string }>;
}

export const PassportPage: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'upcoming' | 'attended' | 'certificates'>('upcoming');
  const [ticketToCancel, setTicketToCancel] = useState<PassportTicket | null>(null);
  const [qrBlobUrls, setQrBlobUrls] = useState<Record<string, string | null>>({});

  const handleQrUrlChange = React.useCallback((tktId: string, url: string | null) => {
    setQrBlobUrls((prev) => {
      if (prev[tktId] === url) return prev;
      return { ...prev, [tktId]: url };
    });
  }, []);

  // Review modal state
  const [reviewTicket, setReviewTicket] = useState<PassportTicket | null>(null);
  const [reviewStars, setReviewStars] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // 1. Fetch registrations
  const {
    data: registrations = [],
    isLoading: isLoadingRegistrations,
    isError: isRegistrationsError,
    refetch: refetchRegistrations,
  } = useQuery<RegistrationApiRow[]>({
    queryKey: ['me', 'registrations'],
    queryFn: async () => {
      const res = await api.get<{ items: RegistrationApiRow[] }>('/me/registrations', {
        showToast: false,
      });
      return res?.items || [];
    },
  });

  // 2. Fetch passport attended items and certificates
  const {
    data: passportItems = [],
    isLoading: isLoadingPassport,
    isError: isPassportError,
    refetch: refetchPassport,
  } = useQuery<PassportApiRow[]>({
    queryKey: ['me', 'passport'],
    queryFn: async () => {
      const res = await api.get<{ passport: PassportApiRow[] }>('/me/passport', {
        showToast: false,
      });
      return res?.passport || [];
    },
  });

  const refetchAll = () => {
    void refetchRegistrations();
    void refetchPassport();
  };

  // Real-time socket: update ticket status to CHECKED_IN when gate scan happens
  useSocketEvent<{ ticketId: string; status: 'CHECKED_IN' }>('ticket:status', (data) => {
    if (data.status === 'CHECKED_IN') {
      toast({
        title: 'Pass Scanned at Gate!',
        description: 'Your check-in has been validated. Enjoy the event!',
      });
      refetchAll();
    }
  });

  // Index passport items by event ID for fast metadata lookup
  const passportByEventId = React.useMemo(() => {
    const map = new Map<string, PassportApiRow>();
    for (const item of passportItems) {
      map.set(item.event.id, item);
    }
    return map;
  }, [passportItems]);

  // Map registrations into PassportTicket items
  const allTickets = React.useMemo<PassportTicket[]>(() => {
    const list: PassportTicket[] = [];
    const seenEventIds = new Set<string>();

    for (const row of registrations) {
      if (row.registration.status === 'CANCELLED' || row.registration.status === 'WAITLISTED') continue;
      const passportMeta = passportByEventId.get(row.event.id);
      const isAttended =
        !!row.ticket?.checkedInAt ||
        row.registration.status === 'ATTENDED' ||
        !!passportMeta;

      seenEventIds.add(row.event.id);
      list.push({
        id: row.ticket?.id || row.registration.id,
        registrationId: row.registration.id,
        eventId: row.event.id,
        eventTitle: row.event.title,
        eventDate: row.event.startAt,
        venue: 'Campus Main Venue',
        token: row.ticket?.token || '',
        status: (row.ticket?.status || (isAttended ? 'CHECKED_IN' : 'VALID')) as 'VALID' | 'CHECKED_IN' | 'REVOKED',
        isAttended,
        hasOdLetter: !!passportMeta?.odLetter,
        reviewed: !!passportMeta?.review,
      });
    }

    // Add any passport items that might not be in user registrations list
    for (const p of passportItems) {
      if (!seenEventIds.has(p.event.id)) {
        list.push({
          id: p.ticket.id,
          registrationId: p.ticket.registrationId || p.ticket.id,
          eventId: p.event.id,
          eventTitle: p.event.title,
          eventDate: p.event.startAt,
          venue: 'Campus Main Venue',
          token: '',
          status: 'CHECKED_IN',
          isAttended: true,
          hasOdLetter: !!p.odLetter,
          reviewed: !!p.review,
        });
      }
    }

    return list;
  }, [registrations, passportItems, passportByEventId]);

  // Map certificates from passport items
  const certificates = React.useMemo<PassportCertificate[]>(() => {
    return passportItems
      .filter((p) => p.certificate !== null)
      .map((p) => ({
        id: p.certificate!.id,
        eventTitle: p.event.title,
        issuedAt: p.certificate!.issuedAt,
        recipientName: user?.fullName || 'Campus Member',
        rank: p.certificate!.rank ?? undefined,
      }));
  }, [passportItems, user]);

  const upcomingTickets = allTickets.filter((t) => !t.isAttended && t.status !== 'REVOKED');
  const attendedTickets = allTickets.filter((t) => t.isAttended);

  const handleCancelTicket = async () => {
    if (!ticketToCancel) return;
    try {
      await api.post(`/registrations/${ticketToCancel.registrationId}/cancel`);
      toast({
        title: 'Registration Cancelled',
        description: 'Your seat reservation has been released.',
      });
      refetchAll();
    } catch {
      // Error toast already displayed by api client
    } finally {
      setTicketToCancel(null);
    }
  };

  const handleDownloadOd = async (ticket: PassportTicket) => {
    try {
      const res = await api.post<{ pdfUrl: string }>(`/events/${ticket.eventId}/od`);
      if (res?.pdfUrl) {
        window.open(res.pdfUrl, '_blank');
      }
      toast({
        title: 'OD Letter Generated',
        description: 'Official academic attendance endorsement PDF opened.',
      });
    } catch {
      // Error toast already displayed by api client
    }
  };

  const handleSubmitReview = async () => {
    if (!reviewTicket) return;
    setIsSubmittingReview(true);
    try {
      await api.post(`/events/${reviewTicket.eventId}/reviews`, {
        stars: reviewStars,
        comment: reviewComment,
      });
      toast({
        title: 'Review Submitted!',
        description: 'Thank you for your feedback.',
      });
      refetchAll();
      setReviewTicket(null);
    } catch {
      // Error toast already displayed by api client
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleLinkedInShare = async (cert: PassportCertificate) => {
    try {
      const shareData = await api.get<{ linkedinUrl: string; caption: string }>(
        `/certificates/${cert.id}/share`,
        { showToast: false }
      );
      if (navigator.clipboard && shareData.caption) {
        await navigator.clipboard.writeText(shareData.caption);
        toast({
          title: 'Caption Copied!',
          description: 'Caption copied: paste it in your post.',
        });
      }
      if (shareData.linkedinUrl) {
        window.open(shareData.linkedinUrl, '_blank', 'noopener,noreferrer');
      }
    } catch {
      const fallbackUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
        `${window.location.origin}/verify/cert/${cert.id}`
      )}`;
      window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const isError = isRegistrationsError || isPassportError;
  const isLoading = isLoadingRegistrations && isLoadingPassport;

  return (
    <div className="container max-w-5xl px-4 sm:px-8 py-8 mx-auto space-y-6" data-testid="passport-page">
      <div className="space-y-1">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Event Passport</h1>
        <p className="text-muted-foreground text-sm">
          Your active digital entry passes, OD attendance records, and verified achievements.
        </p>
      </div>

      {isError ? (
        <Card className="border-border p-12 text-center space-y-4" data-testid="passport-error-state">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-lg text-foreground">Failed to Load Passport</h3>
            <p className="text-xs text-muted-foreground">
              Unable to load your tickets and attendance history from the campus server.
            </p>
          </div>
          <Button
            onClick={refetchAll}
            className="h-9 px-4 text-xs font-semibold gap-1.5"
            data-testid="passport-retry-button"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </Button>
        </Card>
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as 'upcoming' | 'attended' | 'certificates')}
          className="space-y-6"
        >
          <TabsList className="grid grid-cols-3 max-w-md h-12">
            <TabsTrigger
              value="upcoming"
              onClick={() => setActiveTab('upcoming')}
              className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold"
            >
              <Ticket className="h-4 w-4" />
              <span>Upcoming ({upcomingTickets.length})</span>
            </TabsTrigger>
            <TabsTrigger
              value="attended"
              onClick={() => setActiveTab('attended')}
              className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold"
            >
              <FileText className="h-4 w-4" />
              <span>Attended ({attendedTickets.length})</span>
            </TabsTrigger>
            <TabsTrigger
              value="certificates"
              onClick={() => setActiveTab('certificates')}
              className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold"
            >
              <Award className="h-4 w-4" />
              <span>Certificates ({certificates.length})</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Upcoming Event Passes */}
          <TabsContent value="upcoming" className="space-y-6">
            {isLoading ? (
              <div className="space-y-4">
                <div className="h-48 bg-muted/30 rounded-2xl animate-pulse" />
                <div className="h-48 bg-muted/30 rounded-2xl animate-pulse" />
              </div>
            ) : upcomingTickets.length === 0 ? (
              <Card className="border-border p-12 text-center space-y-2">
                <p className="text-muted-foreground text-sm">You have no active upcoming event passes.</p>
                <Button asChild variant="outline" size="sm">
                  <Link to="/">Explore Campus Events</Link>
                </Button>
              </Card>
            ) : (
              upcomingTickets.map((tkt) => (
                <Card key={tkt.id} className="border-border shadow-md overflow-hidden" data-testid="upcoming-ticket-card">
                  <div className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                    {/* Left Ticket Info */}
                    <div className="space-y-3 flex-1 text-center md:text-left">
                      <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                        <StatusBadge status={tkt.status} />
                        <span className="text-xs text-muted-foreground tnum">
                          {new Date(tkt.eventDate).toLocaleDateString()}
                        </span>
                      </div>

                      <h3 className="text-2xl font-extrabold text-foreground">{tkt.eventTitle}</h3>

                      <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-primary" />
                          <span>{tkt.venue}</span>
                        </span>
                      </div>

                      {tkt.token && (
                        <div className="p-3 rounded-lg bg-muted/40 font-mono text-xs text-foreground tracking-wider font-semibold inline-block">
                          {tkt.token}
                        </div>
                      )}

                      <div className="pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTicketToCancel(tkt)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs inline-flex items-center gap-1.5"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Cancel Pass</span>
                        </Button>
                      </div>
                    </div>

                    {/* Right High Contrast QR Code Block */}
                    {tkt.token ? (
                      <div className="flex flex-col items-center gap-2 shrink-0">
                        <div className="p-4 bg-white rounded-2xl shadow-lg border border-slate-200 text-center">
                          <AuthenticatedQrImage
                            registrationId={tkt.registrationId}
                            onObjectUrlChange={(url) => handleQrUrlChange(tkt.id, url)}
                          />
                          <div className="flex items-center justify-center gap-1 text-[11px] text-slate-700 font-semibold pt-2">
                            <Sun className="h-3.5 w-3.5 text-amber-500" />
                            <span>Brightness-boost for gate optical scanners</span>
                          </div>
                        </div>

                        {qrBlobUrls[tkt.id] ? (
                          <a
                            href={qrBlobUrls[tkt.id]!}
                            download={`ticket-${tkt.id}.png`}
                            className="text-xs text-primary font-semibold hover:underline"
                          >
                            Save Ticket to Photos / Wallet
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground font-semibold">
                            Save Ticket to Photos / Wallet
                          </span>
                        )}
                      </div>
                    ) : null}
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Tab 2: Attended Passes, OD Letters & Review */}
          <TabsContent value="attended" className="space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                <div className="h-32 bg-muted/30 rounded-2xl animate-pulse" />
              </div>
            ) : attendedTickets.length === 0 ? (
              <Card className="border-border p-12 text-center text-muted-foreground text-sm">
                No attended events recorded yet. Once scanned at the gate, events appear here.
              </Card>
            ) : (
              attendedTickets.map((tkt) => (
                <Card key={tkt.id} className="border-border p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1 text-center sm:text-left">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg text-foreground">{tkt.eventTitle}</h3>
                      <StatusBadge status="CHECKED_IN" />
                    </div>
                    <p className="text-xs text-muted-foreground">Attended & Verified • {tkt.venue}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadOd(tkt)}
                      className="inline-flex items-center gap-1.5 h-10 text-xs font-semibold"
                    >
                      <Download className="h-4 w-4 text-indigo-500" />
                      <span>Download OD Letter</span>
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => setReviewTicket(tkt)}
                      className="inline-flex items-center gap-1.5 h-10 text-xs font-semibold"
                    >
                      <Star className="h-4 w-4" />
                      <span>Leave Review</span>
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Tab 3: Verified Certificates & LinkedIn Share */}
          <TabsContent value="certificates" className="space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                <div className="h-32 bg-muted/30 rounded-2xl animate-pulse" />
              </div>
            ) : certificates.length === 0 ? (
              <Card className="border-border p-12 text-center text-muted-foreground text-sm">
                Your competition podium finishes and verified certificates will be showcased here.
              </Card>
            ) : (
              certificates.map((cert) => (
                <Card key={cert.id} className="border-border p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <Award className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-extrabold text-lg text-foreground">{cert.eventTitle}</h3>
                      <p className="text-xs text-muted-foreground">
                        Awarded to {cert.recipientName} • Verified Credential ID: {cert.id}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      onClick={() => void handleLinkedInShare(cert)}
                      data-testid="linkedin-share-button"
                      className="h-11 px-5 font-semibold bg-[#0A66C2] hover:bg-[#004182] text-white inline-flex items-center gap-2"
                    >
                      <Share2 className="h-4 w-4" />
                      <span>Share to LinkedIn</span>
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Cancel Confirmation Dialog */}
      <Dialog open={!!ticketToCancel} onOpenChange={(open) => !open && setTicketToCancel(null)}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle>Cancel Ticket Registration?</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel your pass for{' '}
              <strong>{ticketToCancel?.eventTitle}</strong>? This seat will be released immediately
              to waitlisted students.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-4">
            <Button variant="outline" onClick={() => setTicketToCancel(null)}>
              Keep My Ticket
            </Button>
            <Button variant="destructive" onClick={handleCancelTicket}>
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Modal Dialog */}
      <Dialog open={!!reviewTicket} onOpenChange={(open) => !open && setReviewTicket(null)}>
        <DialogContent className="max-w-md p-6 space-y-4">
          <DialogHeader>
            <DialogTitle>Evaluate Event</DialogTitle>
            <DialogDescription>
              Submit verified attendee feedback for <strong>{reviewTicket?.eventTitle}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Rating</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReviewStars(star)}
                    className="p-1 text-amber-500 hover:scale-110 transition-transform"
                    aria-label={`${star} Stars`}
                  >
                    <Star
                      className={cn(
                        'h-6 w-6',
                        star <= reviewStars ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reviewComment" className="text-xs font-semibold text-foreground">
                Detailed Feedback
              </label>
              <Textarea
                id="reviewComment"
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Share your thoughts on speakers, track mentorship, organization, and food..."
                rows={4}
                className="resize-none text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReviewTicket(null)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitReview} disabled={isSubmittingReview}>
              {isSubmittingReview ? 'Submitting...' : 'Post Verified Review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PassportPage;
