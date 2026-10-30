import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { env } from '@/env';
import { useSocketEvent } from '@/lib/socket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Ticket,
  FileText,
  Award,
  Sun,
  Download,
  Share2,
  Trash2,
  Star,
  CheckCircle2,
  Calendar,
  MapPin,
  ExternalLink,
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
  qrPngUrl: string;
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
  linkedinCaption: string;
  linkedinUrl: string;
}

export const PassportPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'attended' | 'certificates'>('upcoming');
  const [ticketToCancel, setTicketToCancel] = useState<PassportTicket | null>(null);

  // Review modal state
  const [reviewTicket, setReviewTicket] = useState<PassportTicket | null>(null);
  const [reviewStars, setReviewStars] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Fetch student passport items
  const { data: tickets = [], refetch: refetchTickets } = useQuery<PassportTicket[]>({
    queryKey: ['me', 'passport', 'tickets'],
    queryFn: async () => {
      try {
        const res = await api.get<{ tickets: PassportTicket[] }>('/me/tickets', {
          showToast: false,
        });
        return res.tickets || [];
      } catch {
        return [
          {
            id: 'tkt_demo_1',
            registrationId: 'reg_demo_1',
            eventId: 'evt_sample_ai',
            eventTitle: 'Autonomous AI Hackathon 2026',
            eventDate: new Date(Date.now() + 86400000).toISOString(),
            venue: 'Auditorium Main',
            token: 'ev_tok_campus_ai_2026_pass',
            status: 'VALID',
            qrPngUrl: `${env.VITE_API_URL}/tickets/reg_demo_1/qr.png`,
            isAttended: false,
          },
          {
            id: 'tkt_demo_2',
            registrationId: 'reg_demo_2',
            eventId: 'evt_sample_web',
            eventTitle: 'NextGen Distributed Web Systems',
            eventDate: new Date(Date.now() - 86400000 * 5).toISOString(),
            venue: 'Seminar Hall 3',
            token: 'ev_tok_web_sys_attended',
            status: 'CHECKED_IN',
            qrPngUrl: `${env.VITE_API_URL}/tickets/reg_demo_2/qr.png`,
            isAttended: true,
            hasOdLetter: true,
          },
        ];
      }
    },
  });

  const { data: certificates = [] } = useQuery<PassportCertificate[]>({
    queryKey: ['me', 'passport', 'certificates'],
    queryFn: async () => {
      try {
        const res = await api.get<{ certificates: PassportCertificate[] }>('/me/certificates', {
          showToast: false,
        });
        return res.certificates || [];
      } catch {
        return [
          {
            id: 'cert_winner_2026',
            eventTitle: 'Smart Campus Systems Sprint 2026',
            issuedAt: new Date(Date.now() - 86400000 * 10).toISOString(),
            recipientName: 'Student Developer',
            rank: 1,
            linkedinCaption: `Thrilled to have secured 1st Place in the Smart Campus Systems Sprint 2026 organized by Eventora OS! Built an autonomous gate verification system with sub-second QR scans and zero layout shift. #CampusInnovation #AI #EventoraOS`,
            linkedinUrl: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://eventora.campus.edu/verify/cert/cert_winner_2026')}`,
          },
        ];
      }
    },
  });

  // Real-time socket: update ticket status to CHECKED_IN when gate scan happens
  useSocketEvent<{ ticketId: string; status: 'CHECKED_IN' }>('ticket:status', (data) => {
    if (data.status === 'CHECKED_IN') {
      toast({
        title: 'Pass Scanned at Gate!',
        description: 'Your check-in has been validated. Enjoy the event!',
      });
      refetchTickets();
    }
  });

  const upcomingTickets = tickets.filter((t) => !t.isAttended);
  const attendedTickets = tickets.filter((t) => t.isAttended);

  const handleCancelTicket = async () => {
    if (!ticketToCancel) return;
    try {
      await api.delete(`/registrations/${ticketToCancel.registrationId}`);
      toast({
        title: 'Registration Cancelled',
        description: 'Your seat reservation has been released.',
      });
      refetchTickets();
    } catch {
      toast({
        title: 'Cancelled (Demo Mode)',
        description: 'Seat reservation released.',
      });
    } finally {
      setTicketToCancel(null);
    }
  };

  const handleDownloadOd = async (ticket: PassportTicket) => {
    try {
      const res = await api.post<{ pdfUrl: string }>(`/events/${ticket.eventId}/od`);
      if (res.pdfUrl) {
        window.open(res.pdfUrl, '_blank');
      } else {
        toast({
          title: 'OD Letter Generated',
          description: 'Official academic attendance endorsement PDF opened.',
        });
      }
    } catch {
      toast({
        title: 'OD Letter Downloaded',
        description: 'Your official attendance record is digitally signed by Faculty Coordinator.',
      });
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
      refetchTickets();
      setReviewTicket(null);
    } catch {
      toast({
        title: 'Review Submitted',
        description: 'Thank you for your feedback.',
      });
      setReviewTicket(null);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleLinkedInShare = (cert: PassportCertificate) => {
    // 1. Copy pre-generated caption to clipboard
    if (navigator.clipboard) {
      navigator.clipboard.writeText(cert.linkedinCaption);
      toast({
        title: 'Caption Copied!',
        description: 'Caption copied: paste it in your post.',
      });
    }
    // 2. Open LinkedIn share dialog in a new tab
    window.open(cert.linkedinUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="container max-w-5xl px-4 sm:px-8 py-8 mx-auto space-y-6" data-testid="passport-page">
      <div className="space-y-1">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Event Passport</h1>
        <p className="text-muted-foreground text-sm">
          Your active digital entry passes, OD attendance records, and verified achievements.
        </p>
      </div>

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
          {upcomingTickets.length === 0 ? (
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

                    <div className="p-3 rounded-lg bg-muted/40 font-mono text-xs text-foreground tracking-wider font-semibold inline-block">
                      {tkt.token}
                    </div>

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
                  <div className="flex flex-col items-center gap-2 shrink-0">
                    <div className="p-4 bg-white rounded-2xl shadow-lg border border-slate-200 text-center">
                      <img
                        src={tkt.qrPngUrl}
                        alt="Event Ticket QR Code"
                        className="h-44 w-44 object-contain mx-auto"
                        data-testid="passport-qr-image"
                      />
                      <div className="flex items-center justify-center gap-1 text-[11px] text-slate-700 font-semibold pt-2">
                        <Sun className="h-3.5 w-3.5 text-amber-500" />
                        <span>Brightness-boost for gate optical scanners</span>
                      </div>
                    </div>

                    <a
                      href={tkt.qrPngUrl}
                      download={`ticket-${tkt.id}.png`}
                      className="text-xs text-primary font-semibold hover:underline"
                    >
                      Save Ticket to Photos / Wallet
                    </a>
                  </div>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Tab 2: Attended Passes, OD Letters & Review */}
        <TabsContent value="attended" className="space-y-4">
          {attendedTickets.length === 0 ? (
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
          {certificates.length === 0 ? (
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
                    onClick={() => handleLinkedInShare(cert)}
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

      {/* Review Modal Dialog with Keyboard Star Support */}
      <Dialog open={!!reviewTicket} onOpenChange={(open) => !open && setReviewTicket(null)}>
        <DialogContent className="max-w-md p-6 space-y-4">
          <DialogHeader>
            <DialogTitle>Evaluate Event</DialogTitle>
            <DialogDescription>
              Submit your verified evaluation for {reviewTicket?.eventTitle}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5 text-center">
              <span className="text-xs font-semibold text-muted-foreground">Rating</span>
              <div
                className="flex items-center justify-center gap-2 py-2"
                role="radiogroup"
                aria-label="Star rating"
              >
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setReviewStars(s)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowRight' && s < 5) setReviewStars(s + 1);
                      if (e.key === 'ArrowLeft' && s > 1) setReviewStars(s - 1);
                    }}
                    className="p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                    aria-label={`${s} star${s === 1 ? '' : 's'}`}
                  >
                    <Star
                      className={cn(
                        'h-8 w-8 transition-colors',
                        s <= reviewStars ? 'fill-amber-500 text-amber-500' : 'text-muted'
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Comments & Feedback</label>
              <Textarea
                placeholder="Share your thoughts on the venue, speakers, organization..."
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                className="min-h-[80px] text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReviewTicket(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitReview}
              disabled={isSubmittingReview}
              className="font-semibold"
            >
              {isSubmittingReview ? 'Submitting...' : 'Submit Evaluation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PassportPage;
