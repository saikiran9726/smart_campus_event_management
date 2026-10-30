import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  GraduationCap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Calendar,
  MapPin,
  Speaker,
  Users,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';

interface FacultyPreviewResponse {
  proposal: {
    id: string;
    title: string;
    description: string;
    expectedAttendance: number;
    startAt: string;
    endAt: string;
    status: string;
    createdAt: string;
  };
  club: {
    id: string;
    name: string;
    slug: string;
  };
  window: {
    startAt: string;
    endAt: string;
  };
  venue: {
    id: string;
    name: string;
    capacity: number;
    locationText: string;
    mapUrl?: string | null;
  } | null;
  avRequests: Array<{
    avResourceId: string;
    quantity: number;
    name: string;
    kind: string;
    totalQuantity: number;
  }>;
  conflictAudit: {
    hasConflicts: boolean;
    venueConflicts: Array<{
      title: string;
      status: string;
    }>;
    avConflicts: Array<{
      avResourceId: string;
      name: string;
      requested: number;
      available: number;
    }>;
  };
  tokenAction: string;
}

export const FacultyDecisionPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [confirmAction, setConfirmAction] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [outcome, setOutcome] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [outcomeEventId, setOutcomeEventId] = useState<string | null>(null);

  // Fetch token preview without consuming
  const {
    data: preview,
    isLoading,
    error,
  } = useQuery<FacultyPreviewResponse>({
    queryKey: ['faculty', 'preview', token],
    queryFn: async () => {
      if (!token) {
        throw { code: 'VALIDATION_FAILED', message: 'No decision token provided in link.' };
      }
      return await api.get<FacultyPreviewResponse>(
        `/public/faculty/preview?token=${encodeURIComponent(token)}`
      );
    },
    enabled: !!token,
    retry: false,
  });

  // Decision mutation (consumes single-use token)
  const decisionMutation = useMutation({
    mutationFn: async (actionToSubmit: 'APPROVE' | 'REJECT') => {
      return await api.post<{
        outcome: 'APPROVED' | 'REJECTED';
        proposalTitle: string;
        eventId?: string;
      }>('/public/faculty/decision', {
        token,
        action: actionToSubmit,
      });
    },
    onSuccess: (res) => {
      setOutcome(res.outcome);
      if (res.eventId) setOutcomeEventId(res.eventId);
      setConfirmAction(null);
      toast.success(
        res.outcome === 'APPROVED'
          ? 'Event proposal approved successfully!'
          : 'Proposal rejected.'
      );
    },
    onError: (err: any) => {
      setConfirmAction(null);
      toast.error(err?.message || 'Failed to submit decision.');
    },
  });

  // Determine error code if any
  const errCode = (error as any)?.code || (error as any)?.error?.code;

  if (!token) {
    return (
      <div className="container max-w-lg px-4 py-16 mx-auto text-center space-y-4">
        <Card className="p-8">
          <HelpCircle className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
          <h2 className="text-xl font-bold">Missing Decision Token</h2>
          <p className="text-sm text-muted-foreground">
            This page requires a secure magic link provided via official faculty coordinator email.
          </p>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container max-w-2xl px-4 py-16 mx-auto space-y-4 animate-pulse">
        <div className="h-12 w-12 bg-muted rounded-full mx-auto" />
        <div className="h-8 w-64 bg-muted rounded mx-auto" />
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    );
  }

  // Handle Token Used (409)
  if (errCode === 'TOKEN_USED') {
    return (
      <div className="container max-w-lg px-4 py-16 mx-auto">
        <Card className="border-amber-300 bg-amber-500/[0.04] p-8 text-center space-y-4" data-testid="token-used-banner">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-amber-950 dark:text-amber-200">
            Decision Already Recorded
          </h2>
          <p className="text-sm text-amber-800 dark:text-amber-300">
            This cryptographic approval link has already been consumed and processed. No further action is required.
          </p>
        </Card>
      </div>
    );
  }

  // Handle Offer Expired (410)
  if (errCode === 'OFFER_EXPIRED') {
    return (
      <div className="container max-w-lg px-4 py-16 mx-auto">
        <Card className="border-rose-300 bg-rose-500/[0.04] p-8 text-center space-y-4" data-testid="token-expired-banner">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 text-rose-600">
            <Clock className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-rose-950 dark:text-rose-200">
            Link Expired
          </h2>
          <p className="text-sm text-rose-800 dark:text-rose-300">
            The 72-hour window for this magic decision link has expired. The club organizers must re-submit their proposal to obtain a fresh review link.
          </p>
        </Card>
      </div>
    );
  }

  // Handle Tampered / Invalid (400)
  if (error) {
    return (
      <div className="container max-w-lg px-4 py-16 mx-auto">
        <Card className="border-rose-300 bg-rose-500/[0.04] p-8 text-center space-y-4" data-testid="token-invalid-banner">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 text-rose-600">
            <XCircle className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-rose-950 dark:text-rose-200">
            Invalid Decision Link
          </h2>
          <p className="text-sm text-rose-800 dark:text-rose-300">
            The decision token is invalid, tampered with, or not recognized by the cryptographic endorsement gateway.
          </p>
        </Card>
      </div>
    );
  }

  // Outcome Screen
  if (outcome) {
    return (
      <div className="container max-w-xl px-4 py-16 mx-auto" data-testid="outcome-screen">
        <Card className="border-border shadow-lg text-center p-8 space-y-4">
          <div
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
              outcome === 'APPROVED'
                ? 'bg-emerald-500/10 text-emerald-600'
                : 'bg-rose-500/10 text-rose-600'
            }`}
          >
            {outcome === 'APPROVED' ? (
              <CheckCircle2 className="h-10 w-10" />
            ) : (
              <XCircle className="h-10 w-10" />
            )}
          </div>

          <h2 className="text-2xl font-extrabold tracking-tight">
            {outcome === 'APPROVED' ? 'Proposal Endorsed & Approved' : 'Proposal Rejected'}
          </h2>

          <p className="text-sm text-muted-foreground">
            {outcome === 'APPROVED'
              ? 'The venue booking has been converted to an active reservation and club organizers may now publish the event registration.'
              : 'The venue hold has been released and notification sent to club organizers.'}
          </p>

          {outcome === 'APPROVED' && outcomeEventId && (
            <div className="pt-2">
              <Button asChild variant="outline">
                <Link to={`/organizer`}>Return to Campus Dashboard</Link>
              </Button>
            </div>
          )}
        </Card>
      </div>
    );
  }

  if (!preview) return null;

  const { proposal, club, venue, avRequests, conflictAudit } = preview;

  return (
    <div className="container max-w-2xl px-4 py-12 mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
          <GraduationCap className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight">Faculty Endorsement Portal</h1>
        <p className="text-xs text-muted-foreground">
          Zero-login decision portal · Cryptographic magic verification active
        </p>
      </div>

      {/* Proposal Summary Card */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3 border-b border-border/60">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Badge variant="outline" className="font-medium text-xs">
              Club: {club.name}
            </Badge>
            <Badge variant="secondary" className="text-[11px] tnum">
              Submitted: {new Date(proposal.createdAt).toLocaleDateString()}
            </Badge>
          </div>
          <CardTitle className="text-xl font-bold mt-2" data-testid="preview-proposal-title">
            {proposal.title}
          </CardTitle>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap pt-1">
            {proposal.description}
          </p>
        </CardHeader>

        <CardContent className="pt-4 space-y-4 text-sm">
          {/* Key Facts Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-muted/20 p-3.5 rounded-xl border border-border/60">
            <div>
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider block font-medium">
                Venue
              </span>
              <p className="font-semibold text-sm mt-0.5">{venue?.name ?? 'Not specified'}</p>
              <p className="text-xs text-muted-foreground">
                Capacity: {venue?.capacity} · {venue?.locationText}
              </p>
            </div>

            <div>
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider block font-medium">
                Attendance
              </span>
              <p className="font-semibold text-sm mt-0.5 tnum">{proposal.expectedAttendance} students expected</p>
            </div>

            <div className="sm:col-span-2">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider block font-medium">
                Requested Schedule (IST)
              </span>
              <p className="font-semibold text-sm mt-0.5">
                {new Date(proposal.startAt).toLocaleString()} – {new Date(proposal.endAt).toLocaleTimeString()}
              </p>
            </div>

            {avRequests.length > 0 && (
              <div className="sm:col-span-2">
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider block font-medium">
                  Audio-Visual Resources
                </span>
                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                  {avRequests.map((av) => (
                    <Badge key={av.avResourceId} variant="secondary" className="text-xs">
                      {av.name}: {av.quantity} units
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Conflict Audit Results */}
          <div className="p-3.5 rounded-xl border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Collision & Conflict Audit
              </span>
              {conflictAudit.hasConflicts ? (
                <Badge variant="destructive" className="flex items-center gap-1 text-[11px]">
                  <ShieldAlert className="h-3 w-3" />
                  Conflicts Flagged
                </Badge>
              ) : (
                <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 flex items-center gap-1 text-[11px]">
                  <ShieldCheck className="h-3 w-3" />
                  Clean Audit (No Collisions)
                </Badge>
              )}
            </div>

            {conflictAudit.hasConflicts && (
              <div className="text-xs text-rose-700 dark:text-rose-300 space-y-1 pt-1">
                {conflictAudit.venueConflicts.map((c, i) => (
                  <p key={i}>• Venue Conflict: Overlaps with booking "{c.title}" ({c.status})</p>
                ))}
                {conflictAudit.avConflicts.map((c, i) => (
                  <p key={i}>• AV Conflict: {c.name} available {c.available} &lt; requested {c.requested}</p>
                ))}
              </div>
            )}
          </div>
        </CardContent>

        {/* Action Buttons: Exactly 48px height per prompt spec */}
        <CardFooter className="pt-2 pb-6 px-6 grid grid-cols-2 gap-4">
          <Button
            type="button"
            onClick={() => setConfirmAction('REJECT')}
            variant="outline"
            className="h-12 border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/40 font-semibold gap-2 shadow-sm text-sm"
            data-testid="btn-faculty-reject"
          >
            <XCircle className="h-5 w-5" />
            <span>Reject Proposal</span>
          </Button>

          <Button
            type="button"
            onClick={() => setConfirmAction('APPROVE')}
            className="h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2 shadow-sm text-sm"
            data-testid="btn-faculty-approve"
          >
            <CheckCircle2 className="h-5 w-5" />
            <span>Approve Proposal</span>
          </Button>
        </CardFooter>
      </Card>

      {/* Confirmation Step Dialog */}
      <Dialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {confirmAction === 'APPROVE' ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  Confirm Event Approval
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-rose-600" />
                  Confirm Proposal Rejection
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            {confirmAction === 'APPROVE'
              ? `Are you sure you want to approve "${proposal.title}" for ${club.name}? The venue booking will be locked immediately.`
              : `Are you sure you want to reject "${proposal.title}"? The temporary calendar hold will be released.`}
          </p>

          <DialogFooter className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmAction(null)}
              disabled={decisionMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => confirmAction && decisionMutation.mutate(confirmAction)}
              disabled={decisionMutation.isPending}
              className={
                confirmAction === 'APPROVE'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-rose-600 hover:bg-rose-700 text-white'
              }
              data-testid="btn-confirm-decision"
            >
              {decisionMutation.isPending
                ? 'Recording...'
                : confirmAction === 'APPROVE'
                ? 'Yes, Approve Event'
                : 'Yes, Reject Proposal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FacultyDecisionPage;
