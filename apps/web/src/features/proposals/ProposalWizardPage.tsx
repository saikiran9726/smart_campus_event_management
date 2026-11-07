import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Calendar,
  MapPin,
  Speaker,
  FileText,
  AlertCircle,
  Clock,
  Users,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useActiveClub } from '@/features/organizer/ActiveClubContext';
import { ZeroClubsEmptyState } from '@/features/organizer/ZeroClubsEmptyState';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';

interface VenueItem {
  id: string;
  name: string;
  capacity: number;
  locationText: string;
}

interface AvAvailabilityItem {
  id: string;
  name: string;
  kind: string;
  totalQuantity: number;
  reservedQuantity: number;
  remainingQuantity: number;
}

interface VenueAvailabilityResponse {
  venueId: string;
  from: string;
  to: string;
  isAvailable: boolean;
  overlappingBookings: Array<{
    id: string;
    during: string;
    status: string;
  }>;
}

export const ProposalWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const {
    clubs,
    activeClubId,
    setActiveClubId,
    isLoading: isLoadingClubs,
    refetchClubs,
  } = useActiveClub();

  // Form State
  const [clubId, setClubId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expectedAttendance, setExpectedAttendance] = useState<number>(100);

  // Sync selected clubId with active club
  useEffect(() => {
    if (activeClubId) {
      setClubId(activeClubId);
    } else if (clubs.length > 0 && clubs[0]) {
      setClubId(clubs[0].id);
    }
  }, [activeClubId, clubs]);

  // Date and Venue
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [selectedVenueId, setSelectedVenueId] = useState('');

  // AV Requests: map avResourceId -> quantity
  const [avRequests, setAvRequests] = useState<Record<string, number>>({});

  // Conflict State from Server
  const [conflictError, setConflictError] = useState<{
    code: string;
    message: string;
    details?: any;
  } | null>(null);

  // 1. Fetch Real Venues
  const {
    data: venues = [],
    isLoading: isLoadingVenues,
    isError: isVenuesError,
    refetch: refetchVenues,
  } = useQuery<VenueItem[]>({
    queryKey: ['venues'],
    queryFn: async () => {
      const res = await api.get<{ venues?: VenueItem[]; items?: VenueItem[] }>('/venues', {
        showToast: false,
      });
      return res.venues || res.items || [];
    },
  });

  // 2. Live Venue Availability Query
  const { data: venueAvailability, isFetching: isCheckingVenue } = useQuery<VenueAvailabilityResponse>({
    queryKey: ['venues', 'availability', selectedVenueId, startAt, endAt],
    queryFn: async () => {
      return await api.get<VenueAvailabilityResponse>(
        `/venues/availability?venueId=${selectedVenueId}&from=${encodeURIComponent(new Date(startAt).toISOString())}&to=${encodeURIComponent(new Date(endAt).toISOString())}`
      );
    },
    enabled: !!selectedVenueId && !!startAt && !!endAt && new Date(endAt) > new Date(startAt),
  });

  // 3. Live AV Resources Availability Query
  const {
    data: avResourcesData,
    isLoading: isLoadingAv,
    isError: isAvError,
    refetch: refetchAv,
  } = useQuery<{ items: AvAvailabilityItem[] }>({
    queryKey: ['av', 'availability', startAt, endAt],
    queryFn: async () => {
      return await api.get<{ items: AvAvailabilityItem[] }>(
        `/av/availability?from=${encodeURIComponent(new Date(startAt).toISOString())}&to=${encodeURIComponent(new Date(endAt).toISOString())}`,
        { showToast: false }
      );
    },
    enabled: !!startAt && !!endAt && new Date(endAt) > new Date(startAt),
  });

  // Submit Proposal Mutation
  const submitProposalMutation = useMutation({
    mutationFn: async () => {
      setConflictError(null);
      const avList = Object.entries(avRequests)
        .filter(([_, q]) => q > 0)
        .map(([avResourceId, quantity]) => ({ avResourceId, quantity }));

      const targetClubId = clubs.find((c) => c.id === clubId || c.slug === clubId)?.id || clubId;

      return await api.post(`/clubs/${targetClubId}/proposals`, {
        title,
        description,
        expectedAttendance: Number(expectedAttendance),
        venueId: selectedVenueId,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        avRequests: avList,
      });
    },
    onSuccess: () => {
      toast.success('Event proposal submitted for faculty review!');
      navigate('/organizer/proposals');
    },
    onError: (err: any) => {
      const code = err?.code || err?.error?.code || 'VALIDATION_FAILED';
      const msg = err?.message || err?.error?.message || 'Failed to submit proposal.';
      const details = err?.details || err?.error?.details;
      setConflictError({ code, message: msg, details });

      if (code === 'VENUE_CONFLICT') {
        toast.error('Venue Conflict: The selected hall is booked during this window.');
      } else if (code === 'AV_CONFLICT') {
        toast.error('AV Conflict: Insufficient equipment available for this window.');
      } else {
        toast.error(msg);
      }
    },
  });

  if (!isLoadingClubs && clubs.length === 0) {
    return (
      <div className="container max-w-3xl py-8 px-4 mx-auto space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/organizer')}
          className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Organizer Studio</span>
        </Button>
        <ZeroClubsEmptyState onRetry={refetchClubs} />
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-8 px-4 sm:px-8 mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/organizer/proposals')}
            className="mb-2 -ml-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Cancel Proposal</span>
          </Button>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Event Proposal Wizard
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Multi-stage proposal flow with real-time venue calendar locks and AV allocation.
          </p>
        </div>

        <div className="text-right">
          <Badge variant="outline" className="text-xs font-mono font-bold">
            Step {step} of 4
          </Badge>
        </div>
      </div>

      {/* Progress Stepper */}
      <div className="grid grid-cols-4 gap-2 text-center text-xs font-medium">
        <div
          className={`p-2 rounded-lg border ${
            step >= 1 ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 font-bold text-indigo-700 dark:text-indigo-400' : 'border-border text-muted-foreground'
          }`}
        >
          1. Basic Info
        </div>
        <div
          className={`p-2 rounded-lg border ${
            step >= 2 ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 font-bold text-indigo-700 dark:text-indigo-400' : 'border-border text-muted-foreground'
          }`}
        >
          2. Venue & Time
        </div>
        <div
          className={`p-2 rounded-lg border ${
            step >= 3 ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 font-bold text-indigo-700 dark:text-indigo-400' : 'border-border text-muted-foreground'
          }`}
        >
          3. AV Requests
        </div>
        <div
          className={`p-2 rounded-lg border ${
            step >= 4 ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 font-bold text-indigo-700 dark:text-indigo-400' : 'border-border text-muted-foreground'
          }`}
        >
          4. Review
        </div>
      </div>

      {/* Step 1: Event Info */}
      {step === 1 && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-indigo-600" />
              Event Description & Expected Crowd
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="club-select">Hosting Club</Label>
              <Select
                value={clubId}
                onValueChange={(val) => {
                  setClubId(val);
                  setActiveClubId(val);
                }}
              >
                <SelectTrigger id="club-select" data-testid="select-hosting-club">
                  <SelectValue placeholder="Select Club" />
                </SelectTrigger>
                <SelectContent>
                  {clubs.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="proposal-title">Event Title</Label>
              <Input
                id="proposal-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Annual Autonomous Hackathon 2026"
                data-testid="input-proposal-title"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="proposal-desc">Description / Agenda Abstract</Label>
              <textarea
                id="proposal-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Describe the scope, objectives, student audience, and guest speakers..."
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                data-testid="input-proposal-desc"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="proposal-attendance">Expected Attendance</Label>
              <Input
                id="proposal-attendance"
                type="number"
                min={1}
                value={expectedAttendance}
                onChange={(e) => setExpectedAttendance(Number(e.target.value))}
                placeholder="100"
                data-testid="input-proposal-attendance"
              />
              <p className="text-xs text-muted-foreground">
                Venues with capacity lower than this number will be flagged.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button
              onClick={() => {
                if (!title.trim() || !description.trim()) {
                  toast.error('Title and description are required.');
                  return;
                }
                if (!clubId) {
                  toast.error('Please select a valid hosting club.');
                  return;
                }
                setStep(2);
              }}
              className="gap-2"
              data-testid="btn-step-1-next"
            >
              <span>Next: Venue & Time</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 2: Venue and Time */}
      {step === 2 && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-indigo-600" />
              Venue & Session Timings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="start-at">Start Date & Time (IST)</Label>
                <Input
                  id="start-at"
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  data-testid="input-start-at"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="end-at">End Date & Time (IST)</Label>
                <Input
                  id="end-at"
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  data-testid="input-end-at"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Select Venue</Label>
              {isVenuesError ? (
                <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-center space-y-2" data-testid="venues-error-state">
                  <AlertCircle className="h-6 w-6 text-destructive mx-auto" />
                  <p className="text-xs text-destructive font-medium">Failed to load verified campus venues.</p>
                  <Button size="sm" variant="outline" onClick={() => refetchVenues()} className="gap-1.5 h-8 text-xs">
                    <RefreshCw className="h-3 w-3" />
                    <span>Retry</span>
                  </Button>
                </div>
              ) : isLoadingVenues ? (
                <div className="space-y-2">
                  <div className="h-16 rounded-xl bg-muted/40 animate-pulse border border-border" />
                  <div className="h-16 rounded-xl bg-muted/40 animate-pulse border border-border" />
                </div>
              ) : venues.length === 0 ? (
                <div className="p-6 rounded-xl border border-border text-center text-xs text-muted-foreground" data-testid="venues-empty-state">
                  No verified campus venues configured in the university registry.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 pt-1">
                  {venues.map((v) => {
                    const isUnderCapacity = v.capacity < expectedAttendance;
                    const isSelected = selectedVenueId === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setSelectedVenueId(v.id)}
                        className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/40 dark:border-indigo-400 dark:bg-indigo-950/20'
                            : 'border-border hover:border-border/80'
                        }`}
                        data-testid={`venue-option-${v.id}`}
                      >
                        <div className="space-y-1">
                          <p className="font-semibold text-sm">{v.name}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {v.locationText}
                          </p>
                        </div>
                        <div className="text-right space-y-1">
                          <Badge variant={isUnderCapacity ? 'outline' : 'secondary'} className="tnum">
                            Capacity: {v.capacity}
                          </Badge>
                          {isUnderCapacity && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400">
                              Below expected ({expectedAttendance})
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Live Venue Availability Banner */}
            {selectedVenueId && startAt && endAt && (
              <div className="pt-2">
                {isCheckingVenue ? (
                  <p className="text-xs text-muted-foreground animate-pulse flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Checking real-time venue calendar availability...
                  </p>
                ) : venueAvailability?.isAvailable === true ? (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>Venue is available! No overlapping bookings detected during this window.</span>
                  </div>
                ) : venueAvailability?.isAvailable === false ? (
                  <div
                    className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-900 dark:text-rose-200 text-xs space-y-1.5"
                    data-testid="venue-conflict-banner"
                  >
                    <div className="flex items-center gap-2 font-semibold text-rose-700 dark:text-rose-400">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>Venue Conflict Detected</span>
                    </div>
                    <p>
                      The hall is already reserved for an active or pending event during this time window.
                    </p>
                    <p className="text-[11px] text-rose-800/80 dark:text-rose-300/80">
                      Suggested alternative: Pick a different campus hall or shift the time by 2+ hours.
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              onClick={() => {
                if (!selectedVenueId || !startAt || !endAt) {
                  toast.error('Venue, start time, and end time are required.');
                  return;
                }
                if (new Date(endAt) <= new Date(startAt)) {
                  toast.error('End time must be after start time.');
                  return;
                }
                setStep(3);
              }}
              className="gap-2"
              data-testid="btn-step-2-next"
            >
              <span>Next: AV Resources</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 3: AV Requests */}
      {step === 3 && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Speaker className="h-5 w-5 text-indigo-600" />
              Audio-Visual Equipment Requests
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Equipment reservations are verified against campus inventory in real time. Units in use by other approved events are deducted automatically.
            </p>

            {isAvError ? (
              <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-center space-y-2" data-testid="av-error-state">
                <AlertCircle className="h-6 w-6 text-destructive mx-auto" />
                <p className="text-xs text-destructive font-medium">Failed to load live AV equipment inventory.</p>
                <Button size="sm" variant="outline" onClick={() => refetchAv()} className="gap-1.5 h-8 text-xs">
                  <RefreshCw className="h-3 w-3" />
                  <span>Retry</span>
                </Button>
              </div>
            ) : isLoadingAv ? (
              <div className="space-y-2">
                <div className="h-14 rounded-xl bg-muted/40 animate-pulse border border-border" />
                <div className="h-14 rounded-xl bg-muted/40 animate-pulse border border-border" />
              </div>
            ) : (avResourcesData?.items ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground p-4 bg-muted/30 rounded-xl text-center">
                No AV equipment registered for reservation. You can proceed without extra equipment.
              </p>
            ) : (
              <div className="space-y-3">
                {(avResourcesData?.items ?? []).map((item) => {
                  const requested = avRequests[item.id] ?? 0;
                  const isOverLimit = requested > item.remainingQuantity;

                  return (
                    <div
                      key={item.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-border bg-card gap-3"
                    >
                      <div>
                        <p className="font-semibold text-sm">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Kind: {item.kind} · Available: <strong className="tnum">{item.remainingQuantity}</strong> of {item.totalQuantity} total
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Label htmlFor={`av-${item.id}`} className="text-xs text-muted-foreground">
                          Units:
                        </Label>
                        <Input
                          id={`av-${item.id}`}
                          type="number"
                          min={0}
                          max={item.totalQuantity}
                          value={requested}
                          onChange={(e) =>
                            setAvRequests({
                              ...avRequests,
                              [item.id]: Math.max(0, Number(e.target.value)),
                            })
                          }
                          className={`w-20 text-center font-medium h-9 ${
                            isOverLimit ? 'border-rose-500' : ''
                          }`}
                          data-testid={`input-av-${item.id}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button onClick={() => setStep(4)} className="gap-2" data-testid="btn-step-3-next">
              <span>Next: Final Review</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 4: Final Review and Submission */}
      {step === 4 && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-indigo-600" />
              Review Proposal Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Inline Conflict Alerts from Server */}
            {conflictError && (
              <div
                className="p-4 rounded-xl border border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 text-sm space-y-2"
                data-testid="server-conflict-alert"
              >
                <div className="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-400">
                  <ShieldAlert className="h-5 w-5" />
                  <span>
                    {conflictError.code === 'VENUE_CONFLICT'
                      ? 'Venue Booking Conflict'
                      : conflictError.code === 'AV_CONFLICT'
                      ? 'AV Resource Conflict'
                      : 'Proposal Error'}
                  </span>
                </div>
                <p>{conflictError.message}</p>
                {conflictError.details && (
                  <div className="text-xs bg-rose-100/80 dark:bg-rose-900/40 p-2.5 rounded font-mono">
                    {conflictError.details.conflictingTitle && (
                      <p>Conflicting Event: {conflictError.details.conflictingTitle}</p>
                    )}
                    {conflictError.details.window && (
                      <p>Window: {conflictError.details.window}</p>
                    )}
                    {conflictError.details.available !== undefined && (
                      <p>
                        Available units: {conflictError.details.available} (Requested: {conflictError.details.requested})
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1">
                <span className="text-muted-foreground font-semibold">Hosting Organization:</span>
                <p className="font-bold text-sm text-foreground">
                  {clubs.find((c) => c.id === clubId || c.slug === clubId)?.name || 'Selected Club'}
                </p>
              </div>

              <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1">
                <span className="text-muted-foreground font-semibold">Event Title:</span>
                <p className="font-bold text-sm text-foreground">{title || 'Untitled'}</p>
              </div>

              <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1">
                <span className="text-muted-foreground font-semibold">Venue:</span>
                <p className="font-bold text-sm text-foreground">
                  {venues.find((v) => v.id === selectedVenueId)?.name || 'None Selected'}
                </p>
              </div>

              <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1">
                <span className="text-muted-foreground font-semibold">Expected Attendance:</span>
                <p className="font-bold text-sm text-foreground tnum">{expectedAttendance} Students</p>
              </div>

              <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1 sm:col-span-2">
                <span className="text-muted-foreground font-semibold">Scheduled Window:</span>
                <p className="font-bold text-sm text-foreground">
                  {startAt ? new Date(startAt).toLocaleString() : 'N/A'} — {endAt ? new Date(endAt).toLocaleString() : 'N/A'}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/60 text-xs text-indigo-900 dark:text-indigo-300 space-y-1">
              <p className="font-bold">Next Steps in Institutional Workflow:</p>
              <p>
                Submitting this proposal will transition it to <strong>PENDING_FACULTY</strong> status and hold a provisional lock on the chosen venue. The designated faculty advisor will receive an authenticated preview token to approve or reject the request.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(3)}>
              Back
            </Button>
            <Button
              onClick={() => submitProposalMutation.mutate()}
              disabled={submitProposalMutation.isPending}
              className="gap-2 font-bold shadow-md bg-indigo-600 hover:bg-indigo-700 text-white"
              data-testid="btn-submit-proposal"
            >
              {submitProposalMutation.isPending ? (
                <span>Submitting Proposal...</span>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Submit for Faculty Approval</span>
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
};

export default ProposalWizardPage;
