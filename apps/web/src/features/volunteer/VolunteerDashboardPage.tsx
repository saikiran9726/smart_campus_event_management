import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  QrCode,
  ShieldCheck,
  Calendar,
  MapPin,
  DoorOpen,
  UserCheck,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  KeyRound,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';

interface VolunteerAssignment {
  id: string;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  eventStatus: string;
  startDate: string;
  endDate: string;
  capacity: number;
  remainingCapacity: number;
  venueName?: string | null;
  gate: string;
  role: string;
  notes?: string | null;
  status: string;
  checkedInCount: number;
  myScanCount: number;
}

export const VolunteerDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activationToken, setActivationToken] = useState('');

  // 1. Fetch user's assigned volunteer duties
  const {
    data: assignmentsData,
    isLoading,
    refetch,
  } = useQuery<{ assignments: VolunteerAssignment[] }>({
    queryKey: ['me', 'volunteer-assignments'],
    queryFn: async () => {
      return await api.get<{ assignments: VolunteerAssignment[] }>('/me/volunteer-assignments');
    },
  });

  // 2. Activate Invitation Code Mutation
  const activateMutation = useMutation({
    mutationFn: async (token: string) => {
      return await api.post<{ success: boolean; event: any }>('/volunteers/activate', {
        token: token.trim(),
      });
    },
    onSuccess: (res) => {
      toast.success(`Volunteer access activated for ${res.event?.title || 'event'}!`);
      setActivationToken('');
      refetch();
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to activate invitation code.');
    },
  });

  // 3. Launch Scanner Session Mutation
  const launchSessionMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      return await api.post<{
        token: string;
        eventId: string;
        eventTitle: string;
        volunteerName: string;
        gate: string;
        role: string;
      }>(`/me/volunteer-assignments/${assignmentId}/scanner-session`, {});
    },
    onSuccess: (res) => {
      // Clear any prior stale scanner sessions
      sessionStorage.removeItem('eventora_scanner_token');
      sessionStorage.removeItem('eventora_scanner_event');
      localStorage.removeItem('scanner_token');
      localStorage.removeItem('scanner_session');

      const sessionData = JSON.stringify({
        eventId: res.eventId,
        eventTitle: res.eventTitle,
        volunteerName: res.volunteerName,
        gate: res.gate,
        role: res.role,
      });

      // Set canonical scanner session in both sessionStorage and localStorage
      sessionStorage.setItem('eventora_scanner_token', res.token);
      sessionStorage.setItem('eventora_scanner_event', sessionData);
      localStorage.setItem('eventora_scanner_token', res.token);
      localStorage.setItem('eventora_scanner_event', sessionData);

      // Preserve legacy keys for backward test compatibility
      localStorage.setItem('scanner_token', res.token);
      localStorage.setItem('scanner_session', sessionData);

      toast.success(`Scanner session initialized for ${res.gate}!`);
      navigate('/scanner');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Could not launch scanner session.');
    },
  });

  const assignments = assignmentsData?.assignments ?? [];

  return (
    <div className="container max-w-5xl py-8 px-4 sm:px-8 mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold mb-2">
            <ShieldCheck className="h-3.5 w-3.5" />
            Field Operations
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Volunteer Portal & Duty Stations</h1>
          <p className="text-sm text-muted-foreground">
            Manage your operational duties, assigned gates, attendance check-ins, and ticket scanning.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="gap-1.5 shadow-sm"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Code Activation Card */}
      <Card className="border-border bg-stone-50/70 dark:bg-stone-900/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            Have a Volunteer Invitation Code?
          </CardTitle>
          <CardDescription className="text-xs">
            Enter your duty passcode (e.g. VOL-A1B2C3D4) provided by the event organizer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-2 max-w-md">
            <Input
              placeholder="e.g. VOL-9F4D28A1..."
              value={activationToken}
              onChange={(e) => setActivationToken(e.target.value.toUpperCase())}
              className="font-mono text-xs uppercase"
              data-testid="input-volunteer-code"
            />
            <Button
              size="sm"
              onClick={() => activateMutation.mutate(activationToken)}
              disabled={!activationToken.trim() || activateMutation.isPending}
              data-testid="btn-activate-volunteer"
            >
              Activate Duty
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Assigned Operations Duties */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold tracking-tight">Your Assigned Events & Gates</h2>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-48 border rounded-xl animate-pulse bg-muted/40" />
            <div className="h-48 border rounded-xl animate-pulse bg-muted/40" />
          </div>
        ) : assignments.length === 0 ? (
          <Card className="border-dashed p-8 text-center space-y-3">
            <DoorOpen className="h-10 w-10 mx-auto text-muted-foreground/60" />
            <h3 className="font-semibold text-sm">No Active Volunteer Assignments</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              You are currently not assigned to any live event gates. Contact your club organizer or university event team to be assigned.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assignments.map((asgn) => (
              <Card key={asgn.id} className="border-border flex flex-col justify-between hover:border-border/80 transition-shadow shadow-xs">
                <CardHeader className="space-y-2 pb-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                      {asgn.role}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      {new Date(asgn.startDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <CardTitle className="text-lg font-bold leading-tight">
                    {asgn.eventTitle}
                  </CardTitle>
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <DoorOpen className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                      <span className="font-medium text-foreground">{asgn.gate}</span>
                    </div>
                    {asgn.venueName && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                        <span>{asgn.venueName}</span>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 text-xs">
                  {asgn.notes && (
                    <div className="p-2.5 bg-muted/40 rounded-lg text-muted-foreground text-[11px]">
                      <span className="font-semibold block text-foreground mb-0.5">Duty Instructions:</span>
                      {asgn.notes}
                    </div>
                  )}

                  {/* Attendance & Personal Scans Stats */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
                    <div className="bg-background border rounded-lg p-2 text-center">
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Event Check-ins</span>
                      <span className="font-mono text-base font-bold text-foreground">{asgn.checkedInCount}</span>
                      <span className="text-[10px] text-muted-foreground block">/ {asgn.capacity} max</span>
                    </div>
                    <div className="bg-background border rounded-lg p-2 text-center">
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground block">My Verified Scans</span>
                      <span className="font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">{asgn.myScanCount}</span>
                      <span className="text-[10px] text-muted-foreground block">tickets</span>
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="pt-2 border-t border-border/40">
                  <Button
                    size="sm"
                    className="w-full gap-2 shadow-xs"
                    onClick={() => launchSessionMutation.mutate(asgn.id)}
                    disabled={launchSessionMutation.isPending}
                    data-testid={`btn-launch-scanner-${asgn.eventId}`}
                  >
                    <QrCode className="h-4 w-4" />
                    <span>Launch Ticket Scanner</span>
                    <ArrowRight className="h-3.5 w-3.5 ml-auto opacity-70" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default VolunteerDashboardPage;
