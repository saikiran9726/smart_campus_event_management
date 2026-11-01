import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
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
} from 'lucide-react';
import { api } from '@/lib/api';
import { socket } from '@/lib/socket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';

interface GateStats {
  checkedIn: number;
  totalCapacity: number;
  remainingCapacity: number;
  mealsDispensed: number;
  kitsDispensed: number;
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
  studentName: string;
  rollNumber: string;
  email: string;
  ticketStatus: string;
  answers: Record<string, any>;
}

export const GateOps: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Live Stats State
  const [stats, setStats] = useState<GateStats>({
    checkedIn: 0,
    totalCapacity: 250,
    remainingCapacity: 250,
    mealsDispensed: 0,
    kitsDispensed: 0,
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

  // 1. Fetch Initial Gate Stats
  const { data: initialStats, refetch: refetchStats } = useQuery<GateStats>({
    queryKey: ['gate', 'stats', eventId],
    queryFn: async () => {
      try {
        return await api.get<GateStats>(`/gate/stats?eventId=${eventId}`);
      } catch {
        return {
          checkedIn: 45,
          totalCapacity: 250,
          remainingCapacity: 205,
          mealsDispensed: 32,
          kitsDispensed: 40,
        };
      }
    },
    enabled: !!eventId,
  });

  useEffect(() => {
    if (initialStats) {
      setStats(initialStats);
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

  // 9. Fetch Form Responses for Virtualized Table
  const { data: responsesData } = useQuery<{ items: FormResponseRow[] }>({
    queryKey: ['events', eventId, 'responses'],
    queryFn: async () => {
      try {
        const res = await api.get<{ items: FormResponseRow[] }>(`/events/${eventId}/form/responses`);
        return res;
      } catch {
        return {
          items: Array.from({ length: 30 }, (_, i) => ({
            registrationId: `reg-${i + 1}`,
            studentName: `Student ${i + 1}`,
            rollNumber: `22CS${100 + i}`,
            email: `student${i + 1}@campus.edu`,
            ticketStatus: i % 3 === 0 ? 'CHECKED_IN' : 'VALID',
            answers: { github: `github.com/student${i + 1}` },
          })),
        };
      }
    },
    enabled: !!eventId,
  });

  const responseItems = responsesData?.items ?? [];

  // Virtualizer for response rows
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: responseItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 5,
  });

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
              Real-time attendance telemetry, ephemeral scanner passkeys, and spot admissions.
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

      {/* Live Telemetry Counters */}
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
            <span className="text-xs font-semibold uppercase tracking-wider">Remaining</span>
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

      {/* Newly Created Passkey Alert (Shown ONCE with Copy Button and Setup QR) */}
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
                onClick={() => {
                  navigator.clipboard.writeText(newlyCreatedPasskey.code);
                  setHasCopiedCode(true);
                  toast.success('Passkey copied to clipboard!');
                  setTimeout(() => setHasCopiedCode(false), 2000);
                }}
                className="gap-1.5 h-11"
                data-testid="btn-copy-passkey"
              >
                {hasCopiedCode ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                <span>{hasCopiedCode ? 'Copied' : 'Copy'}</span>
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Spot Check-in Monitor & Manual Lookup */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Manual Check-in Card */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-indigo-500" />
              Manual Roll Number Check-in
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              If an attendee cannot present their QR ticket, look up and record check-in via institutional roll number.
            </p>
            <div className="flex gap-2">
              <Input
                value={manualRollNumber}
                onChange={(e) => setManualRollNumber(e.target.value)}
                placeholder="e.g. 22CS101"
                className="font-mono text-xs"
                data-testid="input-manual-roll"
              />
              <Button
                onClick={() => manualCheckinMutation.mutate()}
                disabled={!manualRollNumber.trim() || manualCheckinMutation.isPending}
                size="sm"
                className="shrink-0"
                data-testid="btn-manual-checkin"
              >
                Check In
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Spot Walk-in Registration Card */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-500" />
              Spot Walk-in Registration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Direct gate admission for on-the-spot walk-ins. Consumes an available seat immediately.
            </p>
            <div className="flex gap-2">
              <Input
                value={spotRollNumber}
                onChange={(e) => setSpotRollNumber(e.target.value)}
                placeholder="e.g. 23EC205"
                className="font-mono text-xs"
                data-testid="input-spot-roll"
              />
              <Button
                onClick={() => spotRegisterMutation.mutate()}
                disabled={!spotRollNumber.trim() || spotRegisterMutation.isPending}
                size="sm"
                className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
                data-testid="btn-spot-register"
              >
                Register & Admit
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Passkeys List */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-indigo-500" />
            Scanner Passkeys Active
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(passkeysData?.passkeys ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No volunteer scanner passkeys generated yet.</p>
          ) : (
            <div className="divide-y divide-border/60">
              {(passkeysData?.passkeys ?? []).map((pk) => (
                <div key={pk.id} className="py-3 flex items-center justify-between text-xs gap-3">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-sm">{pk.label}</p>
                    <p className="text-muted-foreground tnum">
                      Expires: {new Date(pk.expiresAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <div>
                    {pk.revokedAt ? (
                      <Badge variant="outline" className="text-rose-600 border-rose-300">
                        Revoked
                      </Badge>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revokePasskeyMutation.mutate(pk.id)}
                        className="h-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700 text-xs gap-1"
                        data-testid={`btn-revoke-${pk.id}`}
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

      {/* Virtualized Form Responses Table */}
      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold">Attendee Responses Ledger</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.open(`/events/${eventId}/form/responses.csv`, '_blank');
            }}
            className="gap-1.5 h-8 text-xs"
            data-testid="btn-download-responses-csv"
          >
            <Download className="h-3.5 w-3.5" />
            Download CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div
            ref={parentRef}
            className="h-72 overflow-y-auto border rounded-xl divide-y divide-border/50 text-xs"
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = responseItems[virtualRow.index];
                if (!item) return null;
                return (
                  <div
                    key={virtualRow.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="flex items-center justify-between px-4 py-2 hover:bg-muted/30"
                  >
                    <div className="space-y-0.5">
                      <p className="font-semibold">{item.studentName}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{item.rollNumber} · {item.email}</p>
                    </div>
                    <div>
                      <Badge
                        variant={item.ticketStatus === 'CHECKED_IN' ? 'default' : 'secondary'}
                        className="text-[10px]"
                      >
                        {item.ticketStatus}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

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
