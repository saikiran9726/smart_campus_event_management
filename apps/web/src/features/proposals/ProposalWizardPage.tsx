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
} from 'lucide-react';
import { api } from '@/lib/api';
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

  // Form State
  const [clubId, setClubId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expectedAttendance, setExpectedAttendance] = useState<number>(100);

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

  // 1. Fetch Clubs (user's clubs)
  const { data: clubsData } = useQuery({
    queryKey: ['clubs', 'me'],
    queryFn: async () => {
      try {
        const res = await api.get<{ clubs: Array<{ id: string; name: string }> }>('/clubs/me');
        return res.clubs;
      } catch {
        return [
          { id: '11111111-1111-1111-1111-111111111111', name: 'Computer Science Society' },
          { id: '22222222-2222-2222-2222-222222222222', name: 'Robotics & AI Club' },
        ];
      }
    },
  });

  useEffect(() => {
    if (clubsData && clubsData.length > 0 && !clubId && clubsData[0]?.id) {
      setClubId(clubsData[0].id);
    }
  }, [clubsData, clubId]);

  // 2. Fetch Venues
  const { data: venuesData } = useQuery({
    queryKey: ['venues'],
    queryFn: async () => {
      try {
        const res = await api.get<{ venues: VenueItem[] }>('/venues');
        return res.venues;
      } catch {
        return [
          { id: '33333333-3333-3333-3333-333333333333', name: 'Main Auditorium', capacity: 500, locationText: 'Campus Center Block A' },
          { id: '44444444-4444-4444-4444-444444444444', name: 'Seminar Hall 1', capacity: 150, locationText: 'Academic Block B, 2nd Floor' },
          { id: '55555555-5555-5555-5555-555555555555', name: 'Tech Amphitheatre', capacity: 300, locationText: 'Innovation Quad' },
        ];
      }
    },
  });

  // 3. Live Venue Availability Query
  const { data: venueAvailability, isFetching: isCheckingVenue } = useQuery<VenueAvailabilityResponse>({
    queryKey: ['venues', 'availability', selectedVenueId, startAt, endAt],
    queryFn: async () => {
      return await api.get<VenueAvailabilityResponse>(
        `/venues/availability?venueId=${selectedVenueId}&from=${encodeURIComponent(new Date(startAt).toISOString())}&to=${encodeURIComponent(new Date(endAt).toISOString())}`
      );
    },
    enabled: !!selectedVenueId && !!startAt && !!endAt && new Date(endAt) > new Date(startAt),
  });

  // 4. Live AV Resources Availability Query
  const { data: avResourcesData, isFetching: isCheckingAv } = useQuery<{ items: AvAvailabilityItem[] }>({
    queryKey: ['av', 'availability', startAt, endAt],
    queryFn: async () => {
      return await api.get<{ items: AvAvailabilityItem[] }>(
        `/av/availability?from=${encodeURIComponent(new Date(startAt).toISOString())}&to=${encodeURIComponent(new Date(endAt).toISOString())}`
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

      return await api.post(`/clubs/${clubId}/proposals`, {
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
        toast.error('AV Equipment Conflict: Requested equipment exceeds available units.');
      } else {
        toast.error(msg);
      }
    },
  });

  const selectedVenue = venuesData?.find((v) => v.id === selectedVenueId);

  return (
    <div className="container max-w-3xl py-8 px-4 mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/organizer/proposals')}
          className="h-8 w-8 p-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Event Proposal</h1>
          <p className="text-sm text-muted-foreground">
            Multi-step campus proposal with real-time venue and AV collision detection.
          </p>
        </div>
      </div>

      {/* Stepper Progress */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { num: 1, label: 'Event Info' },
          { num: 2, label: 'Venue & Time' },
          { num: 3, label: 'AV Resources' },
          { num: 4, label: 'Review & Submit' },
        ].map((s) => (
          <div
            key={s.num}
            className={`border-b-2 pb-2 text-xs font-medium transition-colors ${
              step >= s.num
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-border text-muted-foreground'
            }`}
          >
            Step {s.num}: {s.label}
          </div>
        ))}
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
              <Select value={clubId} onValueChange={setClubId}>
                <SelectTrigger id="club-select">
                  <SelectValue placeholder="Select Club" />
                </SelectTrigger>
                <SelectContent>
                  {(clubsData ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
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
              <div className="grid grid-cols-1 gap-2 pt-1">
                {(venuesData ?? []).map((v) => {
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

            {/* Summary Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-xl border border-border">
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider block">Title</span>
                <p className="font-semibold text-base mt-0.5">{title}</p>
              </div>

              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider block">Expected Crowd</span>
                <p className="font-semibold text-base mt-0.5 tnum">{expectedAttendance} students</p>
              </div>

              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider block">Venue</span>
                <p className="font-semibold mt-0.5">{selectedVenue?.name}</p>
                <p className="text-xs text-muted-foreground">{selectedVenue?.locationText}</p>
              </div>

              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider block">Schedule</span>
                <p className="font-semibold mt-0.5">
                  {startAt ? new Date(startAt).toLocaleString() : ''} - {endAt ? new Date(endAt).toLocaleTimeString() : ''}
                </p>
              </div>

              <div className="sm:col-span-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wider block">AV Requests</span>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  {Object.entries(avRequests).filter(([_, q]) => q > 0).length === 0 ? (
                    <span className="text-xs text-muted-foreground">None requested</span>
                  ) : (
                    Object.entries(avRequests)
                      .filter(([_, q]) => q > 0)
                      .map(([id, q]) => {
                        const item = avResourcesData?.items.find((r) => r.id === id);
                        return (
                          <Badge key={id} variant="secondary">
                            {item?.name ?? 'AV Item'}: {q} units
                          </Badge>
                        );
                      })
                  )}
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Upon submission, a temporary calendar hold is placed on the venue, and a single-use cryptographic approval magic-link is emailed to your club's assigned faculty coordinator.
            </p>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(3)}>
              Back
            </Button>
            <Button
              onClick={() => submitProposalMutation.mutate()}
              disabled={submitProposalMutation.isPending}
              className="gap-2 shadow-sm"
              data-testid="btn-submit-proposal"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{submitProposalMutation.isPending ? 'Submitting...' : 'Submit Proposal'}</span>
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
};

export default ProposalWizardPage;
