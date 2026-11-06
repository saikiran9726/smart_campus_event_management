import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  QrCode,
  Users,
  Utensils,
  Package,
  KeyRound,
  Copy,
  Check,
  Trash2,
  Lock,
  Download,
  Search,
  UserCheck,
  AlertCircle,
  Plus,
  RefreshCw,
  Filter,
  CheckCircle2,
  Clock,
  XCircle,
  CreditCard,
  FileText,
  User,
  Calendar,
  Phone,
  Ticket,
  ExternalLink,
  Eye,
} from 'lucide-react';
import { api } from '@/lib/api';
import { socket } from '@/lib/socket';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { copyToClipboard } from '@/lib/clipboard';

interface GateStats {
  checkedIn: number;
  totalCapacity: number;
  remainingCapacity: number;
  mealsDispensed: number;
  kitsDispensed: number;
  totalRegistrations?: number;
  confirmedRegistrations?: number;
  pendingPayments?: number;
  waitlistedCount?: number;
  cancelledCount?: number;
}

interface PasskeyItem {
  id: string;
  label: string;
  expiresAt: string;
  revokedAt?: string | null;
  createdAt: string;
}

interface NewlyCreatedPasskey {
  id: string;
  code: string;
  label: string;
  expiresAt: string;
  setupUrl: string;
}

interface FormResponseRow {
  registrationId: string;
  name?: string;
  studentName: string;
  fullName?: string;
  rollNumber: string;
  email: string;
  phone?: string;
  department?: string;
  academicYear?: number | string | null;
  year?: number | string | null;
  registrationDate?: string;
  registrationStatus?: string;
  ticketStatus: string;
  status: string;
  approvalStatus?: string;
  formVersion?: number;
  paymentStatus: string;
  checkInStatus?: string;
  registeredAt: string;
  checkedInAt?: string | null;
  checkedInVia?: string | null;
  teamName?: string | null;
  user?: {
    id: string;
    fullName: string;
    email: string;
    rollNumber: string | null;
    department: string | null;
    year: number | null;
    phone: string | null;
    collegeName?: string | null;
    program?: string | null;
  };
  ticket?: {
    id: string;
    token: string;
    ticketNumber?: string;
    status: string;
    checkedInAt: string | null;
    checkedInVia: string | null;
  } | null;
  team?: {
    id: string;
    name: string;
    inviteCode?: string;
  } | null;
  answers: Record<string, any>;
}

export const GateOps: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Live Stats State
  const [stats, setStats] = useState<GateStats>({
    checkedIn: 0,
    totalCapacity: 0,
    remainingCapacity: 0,
    mealsDispensed: 0,
    kitsDispensed: 0,
    totalRegistrations: 0,
    confirmedRegistrations: 0,
    pendingPayments: 0,
    waitlistedCount: 0,
    cancelledCount: 0,
  });

  // Attendee Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [checkinFilter, setCheckinFilter] = useState('ALL');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [yearFilter, setYearFilter] = useState('ALL');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [selectedAttendee, setSelectedAttendee] = useState<FormResponseRow | null>(null);

  // Deep inspection query for selected attendee (10 comprehensive sections)
  const { data: inspectionData, isLoading: isInspectionLoading } = useQuery<{
    personalProfile: any;
    registration: any;
    formResponses: any[];
    formVersion?: number;
    documents?: any[];
    team: any;
    payment: any;
    ticket?: any;
    checkInTimestamp?: string | null;
    gateCheckIn: any;
  }>({
    queryKey: ['events', eventId, 'attendees', selectedAttendee?.registrationId],
    queryFn: async () => {
      if (!selectedAttendee?.registrationId) return null as any;
      return await api.get(`/events/${eventId}/attendees/${selectedAttendee.registrationId}`);
    },
    enabled: !!selectedAttendee?.registrationId,
  });

  // Spot Search / Manual Check-in
  const [manualRollNumber, setManualRollNumber] = useState('');
  const [spotRollNumber, setSpotRollNumber] = useState('');

  // Passkey Generation State
  const [isPasskeyModalOpen, setIsPasskeyModalOpen] = useState(false);
  const [passkeyLabel, setPasskeyLabel] = useState('Volunteer Gate 1');
  const [passkeyTtl, setPasskeyTtl] = useState(12);
  const [newlyCreatedPasskey, setNewlyCreatedPasskey] = useState<NewlyCreatedPasskey | null>(null);
  const [hasCopiedCode, setHasCopiedCode] = useState(false);

  // Close Check-in Dialog
  const [isCloseCheckinOpen, setIsCloseCheckinOpen] = useState(false);

  // 1. Fetch Authoritative Gate Stats
  const { data: initialStats, refetch: refetchStats } = useQuery<GateStats>({
    queryKey: ['gate', 'stats', eventId],
    queryFn: async () => {
      try {
        return await api.get<GateStats>(`/gate/stats?eventId=${eventId}`);
      } catch {
        return {
          checkedIn: 0,
          totalCapacity: 0,
          remainingCapacity: 0,
          mealsDispensed: 0,
          kitsDispensed: 0,
          totalRegistrations: 0,
          confirmedRegistrations: 0,
          pendingPayments: 0,
          waitlistedCount: 0,
          cancelledCount: 0,
        };
      }
    },
    enabled: !!eventId,
  });

  useEffect(() => {
    if (initialStats) {
      setStats((prev) => ({
        ...prev,
        ...initialStats,
      }));
    }
  }, [initialStats]);

  // 2. Realtime Sockets: Listen for scan events
  useEffect(() => {
    const handleGateScan = (payload: { eventId: string; mode?: string }) => {
      if (payload.eventId === eventId) {
        setStats((prev) => {
          const mode = payload.mode || 'GATE';
          return {
            ...prev,
            checkedIn: mode === 'GATE' ? prev.checkedIn + 1 : prev.checkedIn,
            remainingCapacity: mode === 'GATE' ? Math.max(0, prev.remainingCapacity - 1) : prev.remainingCapacity,
            mealsDispensed: mode === 'MEAL' ? prev.mealsDispensed + 1 : prev.mealsDispensed,
            kitsDispensed: mode === 'KIT' ? prev.kitsDispensed + 1 : prev.kitsDispensed,
          };
        });
        refetchResponses();
      }
    };

    socket.on('scan:result', handleGateScan);
    return () => {
      socket.off('scan:result', handleGateScan);
    };
  }, [eventId]);

  // 3. Fetch Passkeys
  const { data: passkeysData, refetch: refetchPasskeys } = useQuery<{ passkeys: PasskeyItem[] }>({
    queryKey: ['passkeys', eventId],
    queryFn: async () => {
      try {
        return await api.get<{ passkeys: PasskeyItem[] }>(`/events/${eventId}/passkeys`);
      } catch {
        return { passkeys: [] };
      }
    },
    enabled: !!eventId,
  });

  // 4. Create Passkey Mutation
  const createPasskeyMutation = useMutation({
    mutationFn: async () => {
      return await api.post<NewlyCreatedPasskey>(`/events/${eventId}/passkeys`, {
        label: passkeyLabel,
        ttlHours: Number(passkeyTtl),
      });
    },
    onSuccess: (res) => {
      setNewlyCreatedPasskey(res);
      setIsPasskeyModalOpen(false);
      refetchPasskeys();
      toast.success('Scanner passkey generated!');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to generate passkey.');
    },
  });

  // 5. Revoke Passkey Mutation
  const revokePasskeyMutation = useMutation({
    mutationFn: async (id: string) => {
      return await api.delete(`/events/${eventId}/passkeys/${id}`);
    },
    onSuccess: () => {
      toast.success('Scanner passkey revoked.');
      refetchPasskeys();
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to revoke passkey.');
    },
  });

  // 6. Manual Check-in Mutation
  const manualCheckinMutation = useMutation({
    mutationFn: async () => {
      return await api.post('/gate/manual-checkin', {
        eventId,
        rollNumber: manualRollNumber.trim(),
      });
    },
    onSuccess: () => {
      toast.success(`Check-in recorded for ${manualRollNumber}`);
      setManualRollNumber('');
      refetchStats();
      refetchResponses();
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Manual check-in failed.');
    },
  });

  // 7. Spot Walk-in Registration Mutation
  const spotRegisterMutation = useMutation({
    mutationFn: async () => {
      return await api.post('/gate/spot-register', {
        eventId,
        rollNumber: spotRollNumber.trim(),
      });
    },
    onSuccess: () => {
      toast.success(`Spot walk-in registered and admitted for ${spotRollNumber}`);
      setSpotRollNumber('');
      refetchStats();
      refetchResponses();
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Spot registration failed.');
    },
  });

  // 8. Close Check-in (locks hackathon rosters)
  const closeCheckinMutation = useMutation({
    mutationFn: async () => {
      return await api.post(`/events/${eventId}/close-checkin`, {});
    },
    onSuccess: () => {
      toast.success('Check-in closed! Competition rosters auto-locked.');
      setIsCloseCheckinOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to close check-in.');
    },
  });

  const approveAttendeeMutation = useMutation({
    mutationFn: async (regId: string) => {
      return await api.post(`/events/${eventId}/registrations/${regId}/approve`, {});
    },
    onSuccess: () => {
      toast.success('Registration approved successfully');
      queryClient.invalidateQueries({ queryKey: ['events', eventId] });
      setSelectedAttendee(null);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to approve registration');
    },
  });

  const rejectAttendeeMutation = useMutation({
    mutationFn: async ({ regId, reason }: { regId: string; reason?: string }) => {
      return await api.post(`/events/${eventId}/registrations/${regId}/reject`, { reason });
    },
    onSuccess: () => {
      toast.success('Registration rejected');
      queryClient.invalidateQueries({ queryKey: ['events', eventId] });
      setSelectedAttendee(null);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to reject registration');
    },
  });

  const cancelAttendeeMutation = useMutation({
    mutationFn: async ({ regId, reason }: { regId: string; reason?: string }) => {
      return await api.post(`/events/${eventId}/registrations/${regId}/cancel`, { reason });
    },
    onSuccess: () => {
      toast.success('Registration cancelled');
      queryClient.invalidateQueries({ queryKey: ['events', eventId] });
      setSelectedAttendee(null);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to cancel registration');
    },
  });

  // 9. Fetch Authoritative Form Responses & Filtered Attendees
  const { data: responsesData, refetch: refetchResponses } = useQuery<{
    items: FormResponseRow[];
    total: number;
    stats?: any;
  }>({
    queryKey: [
      'events',
      eventId,
      'responses',
      searchQuery,
      statusFilter,
      paymentFilter,
      checkinFilter,
      departmentFilter,
      yearFilter,
      teamFilter,
    ],
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        if (searchQuery.trim()) {
          params.set('q', searchQuery.trim());
          params.set('search', searchQuery.trim());
        }
        if (statusFilter !== 'ALL') params.set('status', statusFilter);
        if (paymentFilter !== 'ALL') params.set('paymentStatus', paymentFilter);
        if (checkinFilter !== 'ALL') params.set('checkedIn', checkinFilter);
        if (departmentFilter !== 'ALL') params.set('department', departmentFilter);
        if (yearFilter !== 'ALL') params.set('year', yearFilter);
        if (teamFilter !== 'ALL') params.set('team', teamFilter);
        return await api.get<{ items: FormResponseRow[]; total: number; stats?: any }>(
          `/events/${eventId}/form/responses?${params.toString()}`
        );
      } catch {
        return {
          items: [],
          total: 0,
        };
      }
    },
    enabled: !!eventId,
  });

  const responseItems = responsesData?.items ?? [];
  const totalMatching = responsesData?.total ?? responseItems.length;

  // Build CSV download URL with active filters
  const getCsvUrl = () => {
    const params = new URLSearchParams();
    if (searchQuery.trim()) {
      params.set('q', searchQuery.trim());
    }
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    if (paymentFilter !== 'ALL') params.set('paymentStatus', paymentFilter);
    if (checkinFilter !== 'ALL') params.set('checkedIn', checkinFilter);
    if (departmentFilter !== 'ALL') params.set('department', departmentFilter);
    if (yearFilter !== 'ALL') params.set('year', yearFilter);
    if (teamFilter !== 'ALL') params.set('team', teamFilter);
    const queryString = params.toString();
    return `/events/${eventId}/form/responses.csv${queryString ? `?${queryString}` : ''}`;
  };

  return (
    <div className="container max-w-6xl py-8 px-4 sm:px-8 mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/organizer')}
            className="h-8 w-8 p-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Gate Operations & Access Control</h1>
            <p className="text-sm text-muted-foreground">
              Authoritative attendance telemetry, ephemeral scanner passkeys, and real-time attendee ledger.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPasskeyModalOpen(true)}
            className="gap-2 shadow-sm"
            data-testid="btn-create-passkey"
          >
            <KeyRound className="h-4 w-4" />
            <span>Generate Passkey</span>
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsCloseCheckinOpen(true)}
            className="gap-2 shadow-sm"
            data-testid="btn-close-checkin"
          >
            <Lock className="h-4 w-4" />
            <span>Close Check-in</span>
          </Button>
        </div>
      </div>

      {/* Authoritative Live Telemetry Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-border p-5 space-y-1" data-testid="counter-checked-in">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Checked In</span>
            <Users className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-3xl font-extrabold tracking-tight tnum">{stats.checkedIn}</p>
        </Card>

        <Card className="border-border p-5 space-y-1" data-testid="counter-remaining">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Remaining Seats</span>
            <AlertCircle className="h-4 w-4 text-indigo-500" />
          </div>
          <p className="text-3xl font-extrabold tracking-tight tnum">{stats.remainingCapacity}</p>
        </Card>

        <Card className="border-border p-5 space-y-1" data-testid="counter-meals">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Meals Dispensed</span>
            <Utensils className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-3xl font-extrabold tracking-tight tnum">{stats.mealsDispensed}</p>
        </Card>

        <Card className="border-border p-5 space-y-1" data-testid="counter-kits">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Kits Dispensed</span>
            <Package className="h-4 w-4 text-violet-500" />
          </div>
          <p className="text-3xl font-extrabold tracking-tight tnum">{stats.kitsDispensed}</p>
        </Card>
      </div>

      {/* Newly Created Passkey Alert */}
      {newlyCreatedPasskey && (
        <Card className="border-indigo-300 bg-indigo-50/50 dark:border-indigo-900/60 dark:bg-indigo-950/20 p-6 space-y-4 shadow-sm" data-testid="new-passkey-card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <Badge className="bg-indigo-600 text-white text-[11px]">
                New Volunteer Passkey Active
              </Badge>
              <h3 className="font-bold text-lg">{newlyCreatedPasskey.label}</h3>
              <p className="text-xs text-muted-foreground">
                Display code to volunteer once. For security, this passkey code cannot be retrieved after leaving this screen.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-3 bg-background border rounded-xl shadow-xs font-mono font-extrabold text-2xl tracking-wider text-indigo-600 dark:text-indigo-400 tnum" data-testid="passkey-code-display">
                {newlyCreatedPasskey.code}
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const success = await copyToClipboard(newlyCreatedPasskey.code);
                  if (success) {
                    setHasCopiedCode(true);
                    toast.success('Passkey copied to clipboard!');
                    setTimeout(() => setHasCopiedCode(false), 2000);
                  }
                }}
                className="gap-1.5"
              >
                {hasCopiedCode ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                {hasCopiedCode ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Operations Console: Manual Check-in & Spot Walk-in */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-emerald-500" />
              Manual Roll Number Check-in
            </CardTitle>
            <CardDescription className="text-xs">
              Check in registered attendees who cannot present their QR ticket.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Enter Roll Number (e.g. 21CS042)"
                value={manualRollNumber}
                onChange={(e) => setManualRollNumber(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && manualRollNumber.trim()) {
                    manualCheckinMutation.mutate();
                  }
                }}
                data-testid="input-manual-checkin-roll"
              />
              <Button
                size="sm"
                onClick={() => manualCheckinMutation.mutate()}
                disabled={!manualRollNumber.trim() || manualCheckinMutation.isPending}
                data-testid="btn-submit-manual-checkin"
              >
                Check In
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Plus className="h-4 w-4 text-indigo-500" />
              Spot Walk-in Admission
            </CardTitle>
            <CardDescription className="text-xs">
              Directly admit a walk-in attendee on the spot if capacity allows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Enter Roll Number (e.g. 22EC105)"
                value={spotRollNumber}
                onChange={(e) => setSpotRollNumber(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && spotRollNumber.trim()) {
                    spotRegisterMutation.mutate();
                  }
                }}
                data-testid="input-spot-roll"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => spotRegisterMutation.mutate()}
                disabled={!spotRollNumber.trim() || spotRegisterMutation.isPending}
                data-testid="btn-submit-spot-register"
              >
                Spot Admit
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Ephemeral Scanner Passkeys */}
      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base font-semibold">Active Volunteer Scanner Passkeys</CardTitle>
            <CardDescription className="text-xs">
              Time-bound access codes generated for volunteer gates and check-in stations.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetchPasskeys()}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          {passkeysData?.passkeys && passkeysData.passkeys.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No active scanner passkeys. Click "Generate Passkey" to provision a volunteer station.
            </p>
          ) : (
            <div className="divide-y divide-border/60 text-xs">
              {passkeysData?.passkeys.map((pk) => (
                <div key={pk.id} className="flex items-center justify-between py-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{pk.label}</span>
                      {pk.revokedAt ? (
                        <Badge variant="destructive" className="text-[10px]">Revoked</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">Active</Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground text-[11px]">
                      Expires: {new Date(pk.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <div>
                    {!pk.revokedAt && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revokePasskeyMutation.mutate(pk.id)}
                        disabled={revokePasskeyMutation.isPending}
                        className="text-rose-500 hover:text-rose-600 h-8 gap-1.5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Revoke
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Authoritative Attendee Responses Ledger */}
      <Card className="border-border">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3">
          <div>
            <CardTitle className="text-base font-semibold">Authoritative Attendee Directory</CardTitle>
            <CardDescription className="text-xs">
              Live registration records, payment statuses, and gate check-in timestamps. ({totalMatching} total)
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.open(getCsvUrl(), '_blank');
            }}
            className="gap-1.5 h-8 text-xs shadow-sm"
            data-testid="btn-download-responses-csv"
          >
            <Download className="h-3.5 w-3.5" />
            Download Filtered CSV
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-7 gap-2.5 text-xs">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search name, roll, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
                data-testid="input-attendee-search"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Registration Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                <SelectItem value="WAITLISTED">Waitlisted</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Payment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Payments</SelectItem>
                <SelectItem value="SUCCEEDED">Paid</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="REFUNDED">Refunded</SelectItem>
                <SelectItem value="NOT_REQUIRED">Free</SelectItem>
              </SelectContent>
            </Select>

            <Select value={checkinFilter} onValueChange={setCheckinFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Check-in" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Check-ins</SelectItem>
                <SelectItem value="true">Checked In Only</SelectItem>
                <SelectItem value="false">Not Checked In</SelectItem>
              </SelectContent>
            </Select>

            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Formats</SelectItem>
                <SelectItem value="WITH_TEAM">In a Team</SelectItem>
                <SelectItem value="SOLO">Solo Registrant</SelectItem>
              </SelectContent>
            </Select>

            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Departments</SelectItem>
                <SelectItem value="Computer Science">Computer Science</SelectItem>
                <SelectItem value="Electrical Engineering">Electrical Engineering</SelectItem>
                <SelectItem value="Mechanical Engineering">Mechanical Engineering</SelectItem>
                <SelectItem value="Civil Engineering">Civil Engineering</SelectItem>
                <SelectItem value="Mathematics">Mathematics</SelectItem>
              </SelectContent>
            </Select>

            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Years</SelectItem>
                <SelectItem value="1">1st Year</SelectItem>
                <SelectItem value="2">2nd Year</SelectItem>
                <SelectItem value="3">3rd Year</SelectItem>
                <SelectItem value="4">4th Year</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Authoritative Attendee Directory Table */}
          <div className="overflow-x-auto border rounded-xl divide-y divide-border/50 text-xs">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-muted/50 border-b border-border/60 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="py-2.5 px-3">Attendee</th>
                  <th className="py-2.5 px-3">Roll No</th>
                  <th className="py-2.5 px-3">Phone</th>
                  <th className="py-2.5 px-3">Dept &amp; Year</th>
                  <th className="py-2.5 px-3">Team</th>
                  <th className="py-2.5 px-3">Registration</th>
                  <th className="py-2.5 px-3">Payment</th>
                  <th className="py-2.5 px-3">Check-in</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {responseItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center space-y-1">
                        <Users className="h-8 w-8 stroke-1 text-muted-foreground/60" />
                        <p className="font-medium text-xs">No matching attendee records found.</p>
                        <p className="text-[11px] text-muted-foreground/80">Adjust search criteria or filters to inspect attendee records.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  responseItems.map((item, idx) => {
                    const studentName = item.studentName || item.fullName || item.name || 'Unknown';
                    const email = item.email || item.user?.email || '';
                    const rollNo = item.rollNumber || item.user?.rollNumber || 'N/A';
                    const phone = item.phone || item.user?.phone || 'N/A';
                    const dept = item.department || item.user?.department || 'N/A';
                    const yr = item.academicYear || item.year || item.user?.year || 'N/A';
                    const regDate = item.registrationDate || item.registeredAt;
                    const regStatus = item.registrationStatus || item.status || 'CONFIRMED';
                    const payStatus = item.paymentStatus || 'FREE';
                    const isCheckedIn = item.checkInStatus === 'CHECKED_IN' || item.ticketStatus === 'CHECKED_IN' || !!item.ticket?.checkedInAt;
                    const teamName = item.teamName || item.team?.name || null;

                    return (
                      <tr
                        key={item.registrationId || idx}
                        onClick={() => setSelectedAttendee(item)}
                        className="hover:bg-muted/40 cursor-pointer transition-colors"
                        data-testid={`attendee-row-${item.rollNumber || item.registrationId}`}
                      >
                        <td className="py-2 px-3">
                          <p className="font-semibold text-xs text-foreground truncate max-w-[150px]">{studentName}</p>
                          <p className="text-[11px] text-muted-foreground font-mono truncate max-w-[200px]">{rollNo} · {email}</p>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] font-medium text-primary">
                          {rollNo}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-muted-foreground">
                          {phone}
                        </td>
                        <td className="py-2 px-3 text-[11px] text-muted-foreground">
                          <span className="block truncate max-w-[130px] font-medium text-foreground">{dept}</span>
                          <span className="text-[10px]">Year {yr}</span>
                        </td>
                        <td className="py-2 px-3">
                          {teamName ? (
                            <Badge variant="outline" className="text-[10px] bg-indigo-50/50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300">
                              {teamName}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-[10px] italic">Solo</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <div className="space-y-0.5">
                            <Badge
                              variant={regStatus === 'CONFIRMED' ? 'default' : 'secondary'}
                              className="text-[10px]"
                            >
                              {regStatus}
                            </Badge>
                            {regDate && (
                              <p className="text-[10px] text-muted-foreground">
                                {new Date(regDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <Badge
                            variant={payStatus === 'SUCCEEDED' ? 'default' : payStatus === 'PENDING' ? 'outline' : 'secondary'}
                            className={`text-[10px] ${
                              payStatus === 'SUCCEEDED'
                                ? 'bg-emerald-600 text-white'
                                : payStatus === 'PENDING'
                                  ? 'text-amber-600 border-amber-500/30'
                                  : ''
                            }`}
                          >
                            {payStatus === 'SUCCEEDED' ? 'PAID' : payStatus}
                          </Badge>
                        </td>
                        <td className="py-2 px-3">
                          <Badge
                            variant={isCheckedIn ? 'default' : 'outline'}
                            className={`text-[10px] ${isCheckedIn ? 'bg-emerald-600 hover:bg-emerald-600 text-white' : 'text-muted-foreground'}`}
                          >
                            {isCheckedIn ? 'CHECKED IN' : 'NOT CHECKED IN'}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] gap-1 text-primary hover:text-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAttendee(item);
                            }}
                          >
                            <Eye className="h-3 w-3" />
                            <span>Inspect</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Comprehensive Attendee Detail Modal (10 Sections) */}
      {selectedAttendee && (
        <Dialog open={!!selectedAttendee} onOpenChange={(open) => !open && setSelectedAttendee(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <User className="h-5 w-5 text-indigo-600" />
                  <span>Attendee Details</span>
                  <span className="text-xs text-muted-foreground font-normal ml-1">· Attendee Record &amp; Verification</span>
                </DialogTitle>
                <div className="flex gap-1.5">
                  <Badge variant={selectedAttendee.status === 'CONFIRMED' ? 'default' : 'secondary'}>
                    {selectedAttendee.status}
                  </Badge>
                  <Badge
                    variant={selectedAttendee.ticketStatus === 'CHECKED_IN' ? 'default' : 'outline'}
                    className={selectedAttendee.ticketStatus === 'CHECKED_IN' ? 'bg-emerald-600 text-white' : ''}
                  >
                    {selectedAttendee.ticketStatus}
                  </Badge>
                </div>
              </div>
              <DialogDescription className="text-xs">
                Registration ID: <span className="font-mono">{selectedAttendee.registrationId}</span> · Form Version Snapshot: v{inspectionData?.registration?.formVersion ?? inspectionData?.formVersion ?? selectedAttendee.formVersion ?? 1}
              </DialogDescription>
            </DialogHeader>

            {isInspectionLoading ? (
              <div className="py-12 text-center text-xs text-muted-foreground animate-pulse space-y-2">
                <RefreshCw className="h-6 w-6 mx-auto animate-spin text-muted-foreground/60" />
                <p>Loading full 10-part authoritative attendee record...</p>
              </div>
            ) : (
              <div className="space-y-4 py-2 text-xs">
                {/* 1. Student Academic Profile */}
                <div className="bg-muted/40 p-3.5 rounded-xl space-y-2 border border-border/50">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-primary" />
                    1. Student Academic Profile
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Full Legal Name</span>
                      <span className="font-semibold text-sm">
                        {inspectionData?.personalProfile?.fullName || selectedAttendee.studentName || selectedAttendee.fullName}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Student Roll Number</span>
                      <span className="font-mono font-bold text-primary">
                        {inspectionData?.personalProfile?.rollNumber || selectedAttendee.rollNumber || selectedAttendee.user?.rollNumber || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Email Address</span>
                      <span className="text-foreground">
                        {inspectionData?.personalProfile?.email || selectedAttendee.email || selectedAttendee.user?.email}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Contact Mobile</span>
                      <span className="font-mono">
                        {inspectionData?.personalProfile?.phone || selectedAttendee.phone || selectedAttendee.user?.phone || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Department &amp; Year</span>
                      <span>
                        {(inspectionData?.personalProfile?.department && inspectionData.personalProfile.department !== 'N/A'
                          ? inspectionData.personalProfile.department
                          : selectedAttendee.department || selectedAttendee.user?.department || 'N/A')}{' '}
                        · Year{' '}
                        {(inspectionData?.personalProfile?.year && inspectionData.personalProfile.year !== 'N/A'
                          ? inspectionData.personalProfile.year
                          : selectedAttendee.academicYear || selectedAttendee.year || selectedAttendee.user?.year || 'N/A')}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px] block">College / University</span>
                      <span className="font-medium">
                        {inspectionData?.personalProfile?.collegeName || selectedAttendee.user?.collegeName || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Program / Degree</span>
                      <span className="font-medium">
                        {inspectionData?.personalProfile?.program || selectedAttendee.user?.program || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Event Registration Details */}
                <div className="border border-border/60 rounded-xl p-3.5 space-y-2 bg-card">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                    2. Event Registration Details
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Registration Status</span>
                      <Badge variant={selectedAttendee.status === 'CONFIRMED' ? 'default' : 'secondary'} className="text-[10px]">
                        {inspectionData?.registration?.status || selectedAttendee.status}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Faculty Approval</span>
                      <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30">
                        {inspectionData?.registration?.approvalStatus || 'APPROVED'}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Registered On</span>
                      <span className="text-muted-foreground font-mono">
                        {new Date(inspectionData?.registration?.registeredAt || selectedAttendee.registeredAt).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Form Version Active</span>
                      <span className="font-mono font-medium">
                        v{inspectionData?.registration?.formVersion ?? inspectionData?.formVersion ?? selectedAttendee.formVersion ?? 1}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. Custom Form Responses */}
                <div className="border border-border/60 rounded-xl p-3.5 space-y-2 bg-card">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-blue-500" />
                    3. Custom Form Responses (Frozen Snapshot)
                  </h4>
                  {(() => {
                    const responses: Array<{ label: string; type?: string; value: any; isFile?: boolean; downloadUrl?: string }> =
                      (inspectionData?.formResponses && inspectionData.formResponses.length > 0)
                        ? inspectionData.formResponses
                        : (selectedAttendee.answers
                            ? (Array.isArray(selectedAttendee.answers)
                                ? selectedAttendee.answers
                                : Object.entries(selectedAttendee.answers).map(([key, val]: [string, any]) => ({
                                    label: val.labelSnapshot || val.label || key,
                                    type: val.typeSnapshot || val.type || 'SHORT_TEXT',
                                    value: val.value !== undefined ? val.value : val,
                                    isFile: val.typeSnapshot === 'FILE_UPLOAD',
                                  }))
                              )
                            : []
                          );
                    return responses.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {responses.map((ans: any, idx: number) => {
                          const displayVal = typeof ans.value === 'object' && ans.value !== null
                            ? (ans.value.filename || ans.value.objectKey || JSON.stringify(ans.value))
                            : String(ans.value);
                          return (
                            <div key={idx} className="p-2.5 rounded-lg border border-border/50 bg-background text-xs">
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="font-medium text-foreground">{ans.label}</span>
                                {ans.type && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    {ans.type}
                                  </Badge>
                                )}
                              </div>
                              <span className="text-muted-foreground break-all">{displayVal || '—'}</span>
                              {ans.downloadUrl && (
                                <div className="mt-1">
                                  <a
                                    href={ans.downloadUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    <span>Download Uploaded File</span>
                                  </a>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-xs py-1 italic">
                        No custom questions required for this registration.
                      </p>
                    );
                  })()}
                </div>

                {/* 4. Team Information & Roster */}
                <div className="border border-border/60 rounded-xl p-3.5 space-y-2 bg-card">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-purple-500" />
                    4. Team Information &amp; Roster
                  </h4>
                  {(inspectionData?.team || selectedAttendee.team) ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-bold text-foreground">
                            {inspectionData?.team?.name || selectedAttendee.team?.name}
                          </span>
                          {(inspectionData?.team?.inviteCode || (selectedAttendee.team as any)?.inviteCode) && (
                            <span className="text-xs text-muted-foreground font-mono ml-2">
                              Invite Code: {inspectionData?.team?.inviteCode || (selectedAttendee.team as any)?.inviteCode}
                            </span>
                          )}
                          {inspectionData?.team?.leaderName && (
                            <span className="text-xs text-primary font-medium ml-2">
                              · Leader: {inspectionData.team.leaderName}
                            </span>
                          )}
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          Role: {inspectionData?.team?.userRole || (inspectionData?.team?.isLeader ? 'LEADER' : 'MEMBER')}
                        </Badge>
                      </div>

                      {(inspectionData?.team?.members || inspectionData?.team?.roster) && (
                        <div className="border rounded-lg divide-y divide-border/40 text-[11px]">
                          {(inspectionData.team.members || inspectionData.team.roster).map((member: any, i: number) => (
                            <div key={i} className="flex items-center justify-between p-2">
                              <div>
                                <span className="font-semibold text-foreground">{member.fullName}</span>{' '}
                                <span className="font-mono text-muted-foreground">({member.rollNumber || member.email})</span>
                                {member.department && (
                                  <span className="text-muted-foreground text-[10px] ml-1">· {member.department}</span>
                                )}
                              </div>
                              <Badge
                                variant={member.role === 'LEADER' ? 'default' : 'secondary'}
                                className="text-[10px]"
                              >
                                {member.role}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-xs py-1 italic">
                      Registered as an individual attendee (Solo Registrant).
                    </p>
                  )}
                </div>

                {/* 5. Payment & Settlement */}
                <div className="border border-border/60 rounded-xl p-3.5 space-y-2 bg-card">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5 text-amber-500" />
                      5. Payment &amp; Settlement (Razorpay Test Mode)
                    </h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      Sandbox / Test Mode Only
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Payment Status</span>
                      <span className="font-semibold">{inspectionData?.payment?.status || selectedAttendee.paymentStatus || 'FREE'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Amount Paid</span>
                      <span className="font-mono font-bold">
                        ₹{inspectionData?.payment?.amountRupees || '0.00'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Payment Policy</span>
                      <span className="font-medium text-xs">
                        {inspectionData?.payment?.paymentPolicy || 'INDIVIDUAL'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Sandbox Transaction ID</span>
                      <span className="font-mono text-[11px] text-muted-foreground truncate block">
                        {inspectionData?.payment?.orderId || inspectionData?.payment?.paymentId || 'N/A (Free Admission)'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 6. Gate Check-in Telemetry */}
                <div className="border border-border/60 rounded-xl p-3.5 space-y-2 bg-card">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-emerald-500" />
                    6. Gate Check-in Telemetry
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Ticket Status</span>
                      <Badge
                        variant={selectedAttendee.ticketStatus === 'CHECKED_IN' ? 'default' : 'secondary'}
                        className={`text-[10px] ${selectedAttendee.ticketStatus === 'CHECKED_IN' ? 'bg-emerald-600 text-white' : ''}`}
                      >
                        {inspectionData?.ticket?.status || inspectionData?.gateCheckIn?.status || selectedAttendee.ticketStatus || 'VALID'}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Gate Scan Timestamp</span>
                      <span className="font-medium text-xs">
                        {(inspectionData?.checkInTimestamp || inspectionData?.gateCheckIn?.checkedInAt || selectedAttendee.ticket?.checkedInAt)
                          ? `Checked in at ${new Date(inspectionData?.checkInTimestamp || inspectionData?.gateCheckIn?.checkedInAt || selectedAttendee.ticket?.checkedInAt!).toLocaleString()}`
                          : 'Not scanned at gate yet'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Check-in Method</span>
                      <span className="font-mono uppercase text-[11px]">
                        {inspectionData?.gateCheckIn?.checkedInVia || selectedAttendee.ticket?.checkedInVia || 'PENDING GATE SCAN'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 7. Historical Form Version */}
                <div className="border border-border/60 rounded-xl p-3.5 space-y-2 bg-card">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-slate-500" />
                    7. Historical Form Version Snapshot
                  </h4>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-muted/40">
                    <div>
                      <p className="font-semibold text-xs">Form Schema Version</p>
                      <p className="text-[11px] text-muted-foreground">
                        Snapshot frozen when student completed registration. Questions and validation rules are preserved.
                      </p>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs px-2.5 py-1">
                      Version v{inspectionData?.registration?.formVersion ?? inspectionData?.formVersion ?? selectedAttendee.formVersion ?? 1}
                    </Badge>
                  </div>
                </div>

                {/* 8. Uploaded Documents Where Authorized */}
                <div className="border border-border/60 rounded-xl p-3.5 space-y-2 bg-card">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-cyan-500" />
                    8. Uploaded Documents (Authorized View)
                  </h4>
                  {(() => {
                    const docs = inspectionData?.documents ?? [];
                    const fileResponses = (inspectionData?.formResponses ?? []).filter((r) => r.isFile);
                    const allDocs = docs.length > 0 ? docs : fileResponses;

                    return allDocs.length > 0 ? (
                      <div className="space-y-2">
                        {allDocs.map((doc: any, i: number) => {
                          const fileMeta = doc.file || doc.fileMetadata || doc.value || {};
                          const fileName = fileMeta.filename || fileMeta.name || doc.label || `Document_${i + 1}`;
                          const fileSizeKb = fileMeta.sizeBytes ? Math.round(fileMeta.sizeBytes / 1024) : null;
                          return (
                            <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-background">
                              <div className="space-y-0.5">
                                <span className="font-medium text-foreground">{doc.label || fileName}</span>
                                <p className="text-[11px] text-muted-foreground font-mono">
                                  {fileMeta.mimeType || 'Document'} {fileSizeKb ? `· ${fileSizeKb} KB` : ''}
                                </p>
                              </div>
                              {doc.downloadUrl ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1.5"
                                  onClick={() => window.open(doc.downloadUrl, '_blank')}
                                >
                                  <Download className="h-3 w-3" />
                                  <span>Download</span>
                                </Button>
                              ) : (
                                <Badge variant="secondary" className="text-[10px]">Document Stored</Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-xs py-1 italic">
                        No uploaded documents attached to this attendee record.
                      </p>
                    );
                  })()}
                </div>

                {/* 9. Ticket Status & Verification */}
                <div className="border border-border/60 rounded-xl p-3.5 space-y-2 bg-card">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Ticket className="h-3.5 w-3.5 text-violet-500" />
                    9. Ticket Status &amp; Token
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Ticket Status</span>
                      <Badge
                        variant={selectedAttendee.ticketStatus === 'CHECKED_IN' ? 'default' : 'secondary'}
                        className={`text-[10px] ${selectedAttendee.ticketStatus === 'CHECKED_IN' ? 'bg-emerald-600 text-white' : ''}`}
                      >
                        {inspectionData?.ticket?.status || inspectionData?.gateCheckIn?.status || selectedAttendee.ticketStatus || 'VALID'}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Ticket Token / Number</span>
                      <span className="font-mono font-medium text-xs">
                        {inspectionData?.ticket?.token || inspectionData?.gateCheckIn?.ticketToken || selectedAttendee.ticket?.token || 'Assigned'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 10. Gate and Volunteer Information */}
                <div className="border border-border/60 rounded-xl p-3.5 space-y-2 bg-card">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <UserCheck className="h-3.5 w-3.5 text-indigo-500" />
                    10. Gate and Volunteer Information
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Check-in Method / Station</span>
                      <span className="font-mono uppercase text-[11px]">
                        {inspectionData?.gateCheckIn?.checkedInVia || selectedAttendee.ticket?.checkedInVia || 'PENDING GATE SCAN'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Volunteer / Operator</span>
                      <span className="text-xs font-medium">
                        {inspectionData?.gateCheckIn?.volunteer?.fullName ? (
                          <span>
                            {inspectionData.gateCheckIn.volunteer.fullName}{' '}
                            <span className="text-muted-foreground text-[10px]">
                              ({inspectionData.gateCheckIn.volunteer.email})
                            </span>
                          </span>
                        ) : inspectionData?.gateCheckIn?.checkedInAt ? (
                          'Direct Organizer / Manual Console'
                        ) : (
                          'Awaiting Admission Scan'
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Operator Role</span>
                      <Badge variant="outline" className="text-[10px]">
                        {inspectionData?.gateCheckIn?.volunteer?.role || (inspectionData?.gateCheckIn?.checkedInAt ? 'ADMIN/ORGANIZER' : 'N/A')}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {selectedAttendee &&
                  (inspectionData?.registration?.approvalStatus === 'PENDING' ||
                    selectedAttendee.approvalStatus === 'PENDING') && (
                    <>
                      <Button
                        size="sm"
                        variant="default"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs"
                        disabled={approveAttendeeMutation.isPending}
                        onClick={() =>
                          approveAttendeeMutation.mutate(
                            selectedAttendee.registrationId
                          )
                        }
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Approve</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1 text-xs"
                        disabled={rejectAttendeeMutation.isPending}
                        onClick={() => {
                          const reason = window.prompt(
                            'Reason for rejection (optional):'
                          );
                          rejectAttendeeMutation.mutate({
                            regId: selectedAttendee.registrationId,
                            reason: reason || undefined,
                          });
                        }}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        <span>Reject</span>
                      </Button>
                    </>
                  )}
                {selectedAttendee &&
                  selectedAttendee.status !== 'CANCELLED' &&
                  inspectionData?.registration?.status !== 'CANCELLED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10 text-xs"
                      disabled={cancelAttendeeMutation.isPending}
                      onClick={() => {
                        const reason = window.prompt(
                          'Cancellation reason (optional):'
                        );
                        cancelAttendeeMutation.mutate({
                          regId: selectedAttendee.registrationId,
                          reason: reason || undefined,
                        });
                      }}
                    >
                      <span>Cancel Registration</span>
                    </Button>
                  )}
              </div>
              <Button size="sm" variant="outline" onClick={() => setSelectedAttendee(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Generate Passkey Modal */}
      <Dialog open={isPasskeyModalOpen} onOpenChange={setIsPasskeyModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Volunteer Scanner Passkey</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label htmlFor="pk-label">Station / Volunteer Label</Label>
              <Input
                id="pk-label"
                value={passkeyLabel}
                onChange={(e) => setPasskeyLabel(e.target.value)}
                placeholder="e.g. North Gate Station 2"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pk-ttl">TTL Expiry (Hours)</Label>
              <Input
                id="pk-ttl"
                type="number"
                min={1}
                max={72}
                value={passkeyTtl}
                onChange={(e) => setPasskeyTtl(Number(e.target.value))}
              />
            </div>
          </div>
          <DialogFooter className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsPasskeyModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => createPasskeyMutation.mutate()}
              disabled={createPasskeyMutation.isPending}
            >
              Generate Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Check-in Confirmation Dialog */}
      <Dialog open={isCloseCheckinOpen} onOpenChange={setIsCloseCheckinOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <Lock className="h-5 w-5" />
              Close Event Check-in
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Closing check-in will immediately stop new attendee ticket scans and automatically freeze all hackathon competition team rosters with immutable cryptographic snapshots.
          </p>
          <DialogFooter className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsCloseCheckinOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => closeCheckinMutation.mutate()}
              disabled={closeCheckinMutation.isPending}
              data-testid="btn-confirm-close-checkin"
            >
              Confirm Close Check-in
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GateOps;
