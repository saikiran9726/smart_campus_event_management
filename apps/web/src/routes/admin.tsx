import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { copyToClipboard } from '@/lib/clipboard';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Shield,
  Building2,
  TrendingUp,
  AlertCircle,
  Users,
  FileText,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Mail,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Activity,
  UserCheck,
  Plus,
  DoorOpen,
  Copy,
  Check,
} from 'lucide-react';

interface VolunteerItem {
  id: string;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  userId: string;
  fullName: string;
  email: string;
  rollNumber: string | null;
  department: string | null;
  gate: string;
  role: string;
  status: 'ACTIVE' | 'REVOKED';
  notes: string | null;
  totalScans: number;
  createdAt: string;
}

interface UserItem {
  id: string;
  email: string;
  fullName: string;
  rollNumber: string | null;
  department: string | null;
  year: number | null;
  phone: string | null;
  role: 'STUDENT' | 'ORGANIZER' | 'FACULTY' | 'ADMIN';
  strikeCount: number;
  consecutiveNoShows: number;
  cooldownUntil: string | null;
  createdAt: string;
}

interface ClubItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  coordinatorName: string | null;
  coordinatorEmail: string | null;
  memberCount: number;
  eventCount: number;
  createdAt: string;
}

interface AuditLogItem {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId: string;
  diff: Record<string, unknown> | null;
  createdAt: string;
}

interface NotificationItem {
  id: string;
  userId: string;
  userEmail: string;
  userFullName: string;
  eventId: string | null;
  kind: string;
  channel: string;
  status: string;
  attempts: number;
  error?: string | null;
  lastError?: string | null;
  createdAt?: string;
  runAt?: string;
}

interface CampusMacroAnalytics {
  overview: {
    totalClubs: number;
    totalEvents: number;
    totalRegistrations: number;
    totalCheckedIn: number;
    campusAttendanceRate: number;
  };
  clubs: Array<{
    clubId: string;
    clubName: string;
    clubSlug: string;
    totalEvents: number;
    totalRegistrations: number;
    totalCheckedIn: number;
    averageAttendanceRate: number;
  }>;
  topEvents: Array<{
    eventId: string;
    title: string;
    clubName: string;
    date: string | null;
    registrations: number;
    checkedIn: number;
  }>;
}

export const AdminPage: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Tab State
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'overview');

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', val);
      return next;
    }, { replace: true });
  };

  // User Governance State
  const [userPage, setUserPage] = useState(1);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('ALL');

  // Club Governance State
  const [clubPage, setClubPage] = useState(1);
  const [clubSearch, setClubSearch] = useState('');

  // Audit Logs State
  const [auditPage, setAuditPage] = useState(1);
  const [auditActionFilter, setAuditActionFilter] = useState<string>('ALL');

  // 1. Campus Macro Analytics
  const { data: campusData } = useQuery<CampusMacroAnalytics | null>({
    queryKey: ['admin', 'campus'],
    queryFn: async () => {
      try {
        return await api.get<CampusMacroAnalytics>('/admin/analytics/campus', {
          showToast: false,
        });
      } catch {
        return null;
      }
    },
  });

  // 2. User Directory Query
  const { data: usersData, isLoading: isUsersLoading } = useQuery({
    queryKey: ['admin', 'users', userPage, userSearch, userRoleFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', String(userPage));
      params.set('limit', '15');
      if (userSearch.trim()) params.set('q', userSearch.trim());
      if (userRoleFilter !== 'ALL') params.set('role', userRoleFilter);

      return await api.get<{
        users: UserItem[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`/admin/users?${params.toString()}`, { showToast: false });
    },
    enabled: activeTab === 'users',
  });

  // Role Update Mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return await api.patch<{ success: boolean; user: UserItem }>(
        `/admin/users/${userId}/role`,
        { role }
      );
    },
    onSuccess: (_, variables) => {
      toast({
        title: 'Role Updated',
        description: `User role has been updated to ${variables.role}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
    },
    onError: (err: any) => {
      toast({
        title: 'Role Update Failed',
        description: err?.message || 'Could not update user role.',
        variant: 'destructive',
      });
    },
  });

  // 3. Clubs Directory Query
  const { data: clubsData, isLoading: isClubsLoading } = useQuery({
    queryKey: ['admin', 'clubs', clubPage, clubSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', String(clubPage));
      params.set('limit', '25');
      if (clubSearch.trim()) params.set('q', clubSearch.trim());

      return await api.get<{
        clubs: ClubItem[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`/admin/clubs?${params.toString()}`, { showToast: false });
    },
    enabled: activeTab === 'clubs',
  });

  // 4. Audit Logs Query
  const { data: auditData, isLoading: isAuditLoading } = useQuery({
    queryKey: ['admin', 'audit-logs', auditPage, auditActionFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', String(auditPage));
      params.set('limit', '20');
      if (auditActionFilter !== 'ALL') params.set('action', auditActionFilter);

      return await api.get<{
        logs: AuditLogItem[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`/admin/audit-logs?${params.toString()}`, { showToast: false });
    },
    enabled: activeTab === 'audit',
  });

  // 5. Failed Notifications DLQ Query & Stats
  const {
    data: commsStats,
    refetch: refetchCommsStats,
  } = useQuery({
    queryKey: ['admin', 'notifications', 'stats'],
    queryFn: async () => {
      return await api.get<{
        total: number;
        queued: number;
        sent: number;
        failed: number;
        read: number;
        dlq: number;
        totalRetries: number;
        email: { queued: number; sent: number; delivered: number; failed: number };
        whatsapp: { queued: number; accepted: number; delivered: number; read: number; failed: number; skipped: number };
        inApp: { created: number; read: number };
      }>('/admin/notifications/stats', { showToast: false });
    },
    enabled: activeTab === 'deadletter',
  });

  const {
    data: providerHealth,
    refetch: refetchProviders,
  } = useQuery({
    queryKey: ['admin', 'notifications', 'providers'],
    queryFn: async () => {
      return await api.get<{
        email: { provider: string; isConfigured: boolean; sender: string; status: string };
        whatsapp: { provider: string; isConfigured: boolean; apiVersion: string; phoneNumberIdMasked: string | null; webhookVerified: boolean; status: string };
      }>('/admin/notifications/providers', { showToast: false });
    },
    enabled: activeTab === 'deadletter',
  });

  const {
    data: dlqData,
    isLoading: isDlqLoading,
    refetch: refetchDlq,
  } = useQuery({
    queryKey: ['admin', 'notifications', 'FAILED'],
    queryFn: async () => {
      return await api.get<{
        notifications: NotificationItem[];
        total: number;
      }>('/admin/notifications?status=FAILED', { showToast: false });
    },
    enabled: activeTab === 'deadletter',
  });

  // Retry Notification Mutation
  const retryNotificationMutation = useMutation({
    mutationFn: async (id: string) => {
      return await api.post<{ success: boolean }>(`/admin/notifications/${id}/retry`);
    },
    onSuccess: () => {
      toast({
        title: 'Retry Enqueued',
        description: 'Notification has been requeued for background delivery.',
      });
      refetchDlq();
      refetchCommsStats();
    },
    onError: (err: any) => {
      toast({
        title: 'Retry Failed',
        description: err?.message || 'Could not requeue notification.',
        variant: 'destructive',
      });
    },
  });

  // 6. Volunteer Management
  const [volunteerSearch, setVolunteerSearch] = useState('');
  const [volunteerStatusFilter, setVolunteerStatusFilter] = useState('ALL');
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [newVolEmail, setNewVolEmail] = useState('');
  const [newVolName, setNewVolName] = useState('');
  const [newVolRoll, setNewVolRoll] = useState('');
  const [newVolEventId, setNewVolEventId] = useState('');
  const [newVolGate, setNewVolGate] = useState('Main Gate');
  const [newVolRole, setNewVolRole] = useState('SCANNER');
  const [newVolNotes, setNewVolNotes] = useState('');
  const [createdVolunteerToken, setCreatedVolunteerToken] = useState<string | null>(null);
  const [hasCopiedVolToken, setHasCopiedVolToken] = useState(false);
  const [hasCopiedVolUrl, setHasCopiedVolUrl] = useState(false);

  const {
    data: volunteerData,
    isLoading: isVolunteerLoading,
    refetch: refetchVolunteers,
  } = useQuery({
    queryKey: ['admin', 'volunteers', volunteerSearch, volunteerStatusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (volunteerSearch) params.set('q', volunteerSearch);
      if (volunteerStatusFilter !== 'ALL') params.set('status', volunteerStatusFilter);
      return await api.get<{
        items: VolunteerItem[];
        total: number;
      }>(`/admin/volunteers?${params.toString()}`, { showToast: false });
    },
    enabled: activeTab === 'volunteers',
  });

  const inviteVolunteerMutation = useMutation({
    mutationFn: async () => {
      return await api.post<{
        volunteer: any;
        invitationToken: string;
      }>('/admin/volunteers', {
        eventId: newVolEventId.trim(),
        email: newVolEmail.trim(),
        fullName: newVolName.trim(),
        rollNumber: newVolRoll.trim() || undefined,
        gate: newVolGate.trim() || 'Main Gate',
        role: newVolRole.trim() || 'SCANNER',
        notes: newVolNotes.trim() || undefined,
      });
    },
    onSuccess: (res) => {
      setCreatedVolunteerToken(res.invitationToken);
      refetchVolunteers();
      toast({
        title: 'Volunteer Assigned!',
        description: `Duty assigned. Code: ${res.invitationToken}`,
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Assignment Failed',
        description: err?.message || 'Could not assign volunteer.',
        variant: 'destructive',
      });
    },
  });

  const revokeVolunteerMutation = useMutation({
    mutationFn: async (id: string) => {
      return await api.delete(`/admin/volunteers/${id}`);
    },
    onSuccess: () => {
      toast({
        title: 'Volunteer Revoked',
        description: 'Volunteer assignment marked revoked.',
      });
      refetchVolunteers();
    },
    onError: (err: any) => {
      toast({
        title: 'Revocation Failed',
        description: err?.message || 'Could not revoke volunteer.',
        variant: 'destructive',
      });
    },
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return <Badge variant="destructive">ADMIN</Badge>;
      case 'FACULTY':
        return <Badge className="bg-purple-600 hover:bg-purple-700 text-white">FACULTY</Badge>;
      case 'ORGANIZER':
        return <Badge className="bg-blue-600 hover:bg-blue-700 text-white">ORGANIZER</Badge>;
      default:
        return <Badge variant="secondary">STUDENT</Badge>;
    }
  };

  return (
    <div className="container max-w-6xl px-4 sm:px-8 py-8 mx-auto space-y-6">
      <div className="flex flex-col gap-1">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs font-bold w-fit">
          <Shield className="h-3.5 w-3.5" />
          Campus Governance
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">University Admin Panel</h1>
        <p className="text-muted-foreground text-sm">
          Campus-wide macro analytics, role governance, club accreditation audits, and operational oversight.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid grid-cols-2 sm:grid-cols-6 w-full">
          <TabsTrigger value="overview" className="flex items-center gap-1.5">
            <Activity className="h-4 w-4" />
            <span>Overview</span>
          </TabsTrigger>
          <TabsTrigger value="volunteers" className="flex items-center gap-1.5">
            <UserCheck className="h-4 w-4" />
            <span>Volunteers</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            <span>Users & Roles</span>
          </TabsTrigger>
          <TabsTrigger value="clubs" className="flex items-center gap-1.5">
            <Building2 className="h-4 w-4" />
            <span>Clubs</span>
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-1.5">
            <FileText className="h-4 w-4" />
            <span>Audit Trail</span>
          </TabsTrigger>
          <TabsTrigger value="deadletter" className="flex items-center gap-1.5">
            <Mail className="h-4 w-4" />
            <span>DLQ Alerts</span>
          </TabsTrigger>
        </TabsList>

        {/* 1. Macro Analytics Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-border p-5 space-y-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Registered Clubs</span>
                <Building2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              </div>
              <p className="text-3xl font-bold tnum">{campusData?.overview?.totalClubs ?? 0}</p>
              <p className="text-xs text-muted-foreground">Active accredited student chapters</p>
            </Card>

            <Card className="border-border p-5 space-y-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Campus Check-ins</span>
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-3xl font-bold tnum">{campusData?.overview?.totalCheckedIn ?? 0}</p>
              <p className="text-xs text-muted-foreground">Verified gate entries across all events</p>
            </Card>

            <Card className="border-border p-5 space-y-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Conflict Engine</span>
                <AlertCircle className="h-4 w-4 text-amber-500" />
              </div>
              <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium pt-1">
                0 venue or audio-visual collisions detected.
              </p>
              <p className="text-xs text-muted-foreground">Continuous spatial & resource scheduling guard</p>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Governance Policy & Safety Envelope</CardTitle>
              <CardDescription>
                System automated rules enforcing campus attendance integrity and role isolation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">3-Strike Attendance Rule Active</div>
                  <p className="text-muted-foreground text-xs">
                    Students accumulating 3 unexcused no-shows enter an automated 14-day registration cooldown.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Dual-Party Approval Hierarchy</div>
                  <p className="text-muted-foreground text-xs">
                    Events requiring budget allocation or academic OD exemptions mandate independent faculty advisor approval.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Cryptographic Gate Passkeys</div>
                  <p className="text-muted-foreground text-xs">
                    Volunteer scanning sessions are restricted to hardware-isolated passkey tokens with local audit logs.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. User & Role Governance Tab */}
        <TabsContent value="users" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, roll..."
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value);
                  setUserPage(1);
                }}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Filter Role:</span>
              <Select
                value={userRoleFilter}
                onValueChange={(val) => {
                  setUserRoleFilter(val);
                  setUserPage(1);
                }}
              >
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Roles</SelectItem>
                  <SelectItem value="STUDENT">Student</SelectItem>
                  <SelectItem value="ORGANIZER">Organizer</SelectItem>
                  <SelectItem value="FACULTY">Faculty</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border text-xs uppercase font-medium">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Academic Info</th>
                    <th className="px-4 py-3">Current Role</th>
                    <th className="px-4 py-3">Strikes / Penalty</th>
                    <th className="px-4 py-3 text-right">Change Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isUsersLoading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        Loading campus members...
                      </td>
                    </tr>
                  ) : (usersData?.users || []).filter((u) => u.id !== '00000000-0000-0000-0000-000000000000').length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        No members found matching the criteria.
                      </td>
                    </tr>
                  ) : (
                    (usersData?.users || [])
                      .filter((u) => u.id !== '00000000-0000-0000-0000-000000000000')
                      .map((u) => (
                      <tr key={u.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{u.fullName}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div>Roll: {u.rollNumber || 'N/A'}</div>
                          <div className="text-muted-foreground">
                            {u.department ? `${u.department} ${u.year ? `• Year ${u.year}` : ''}` : 'General'}
                          </div>
                        </td>
                        <td className="px-4 py-3">{getRoleBadge(u.role)}</td>
                        <td className="px-4 py-3 text-xs">
                          {u.cooldownUntil && new Date(u.cooldownUntil) > new Date() ? (
                            <Badge variant="warning" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Cooldown
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">
                              {u.strikeCount} strikes ({u.consecutiveNoShows} no-shows)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Select
                            value={u.role}
                            onValueChange={(newRole) => {
                              if (newRole !== u.role) {
                                updateRoleMutation.mutate({ userId: u.id, role: newRole });
                              }
                            }}
                          >
                            <SelectTrigger className="w-[130px] h-8 text-xs ml-auto">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="STUDENT">Student</SelectItem>
                              <SelectItem value="ORGANIZER">Organizer</SelectItem>
                              <SelectItem value="FACULTY">Faculty</SelectItem>
                              <SelectItem value="ADMIN">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {usersData && usersData.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  Showing page {usersData.page} of {usersData.totalPages} ({usersData.total} members)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={userPage <= 1}
                    onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={userPage >= usersData.totalPages}
                    onClick={() => setUserPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* 3. Clubs Directory Tab */}
        <TabsContent value="clubs" className="space-y-4">
          <div className="flex gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clubs by name or slug..."
                value={clubSearch}
                onChange={(e) => {
                  setClubSearch(e.target.value);
                  setClubPage(1);
                }}
                className="pl-9"
              />
            </div>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border text-xs uppercase font-medium">
                  <tr>
                    <th className="px-4 py-3">Club Name</th>
                    <th className="px-4 py-3">Faculty Coordinator</th>
                    <th className="px-4 py-3">Members</th>
                    <th className="px-4 py-3">Events</th>
                    <th className="px-4 py-3">Accreditation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isClubsLoading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        Loading accredited clubs...
                      </td>
                    </tr>
                  ) : clubsData?.clubs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        No clubs found matching the criteria.
                      </td>
                    </tr>
                  ) : (
                    clubsData?.clubs.map((c) => (
                      <tr key={c.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-foreground">{c.name}</div>
                          <div className="text-xs text-muted-foreground">/{c.slug}</div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {c.coordinatorName ? (
                            <div>
                              <div className="font-medium">{c.coordinatorName}</div>
                              <div className="text-muted-foreground">{c.coordinatorEmail}</div>
                            </div>
                          ) : (
                            <span className="text-amber-500 font-medium">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary">{c.memberCount} active</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{c.eventCount} hosted</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="success">Accredited</Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {clubsData && clubsData.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  Showing page {clubsData.page} of {clubsData.totalPages} ({clubsData.total} clubs)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={clubPage <= 1}
                    onClick={() => setClubPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={clubPage >= clubsData.totalPages}
                    onClick={() => setClubPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* 4. Audit Trail Tab */}
        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  Immutable System Security Log
                </CardTitle>
                <CardDescription>
                  Chronological record of role updates, club status changes, and certificate revocations.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Filter Action:</span>
                <Select
                  value={auditActionFilter}
                  onValueChange={(val) => {
                    setAuditActionFilter(val);
                    setAuditPage(1);
                  }}
                >
                  <SelectTrigger className="w-[180px] h-8 text-xs">
                    <SelectValue placeholder="All Actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Actions</SelectItem>
                    <SelectItem value="USER_ROLE_UPDATED">USER_ROLE_UPDATED</SelectItem>
                    <SelectItem value="CLUB_UPDATED">CLUB_UPDATED</SelectItem>
                    <SelectItem value="CERTIFICATE_REVOKED">CERTIFICATE_REVOKED</SelectItem>
                    <SelectItem value="NOTIFICATION_RETRY_ENQUEUED">NOTIFICATION_RETRY_ENQUEUED</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border text-xs uppercase font-medium">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Entity & Target</th>
                    <th className="px-4 py-3">Diff Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isAuditLoading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        Loading security audit trail...
                      </td>
                    </tr>
                  ) : auditData?.logs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        No audit events recorded yet.
                      </td>
                    </tr>
                  ) : (
                    auditData?.logs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div className="font-medium text-foreground">{log.actorName || 'System'}</div>
                          <div className="text-muted-foreground">{log.actorEmail || 'automated'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="font-mono text-xs">
                            {log.action}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono">
                          {log.entity} / {log.entityId.slice(0, 8)}...
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <pre className="text-[11px] font-mono bg-muted p-1.5 rounded max-w-xs truncate">
                            {JSON.stringify(log.diff)}
                          </pre>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {auditData && auditData.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  Page {auditData.page} of {auditData.totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={auditPage <= 1}
                    onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={auditPage >= auditData.totalPages}
                    onClick={() => setAuditPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* 5. Dead-Letter Queue (DLQ) Tab */}
        <TabsContent value="deadletter" className="space-y-4">
          {/* Provider Health & Config Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="p-4 border-border/80 bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Email Channel (Resend)</span>
                </div>
                <Badge variant={providerHealth?.email.isConfigured ? 'default' : 'secondary'}>
                  {providerHealth?.email.isConfigured ? 'Configured' : 'Console Mode'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Sender: <span className="font-mono">{providerHealth?.email.sender || 'events@eventora.campus.edu'}</span>
              </p>
              <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-border/60 text-center">
                <div>
                  <div className="text-xs text-muted-foreground">Queued</div>
                  <div className="font-bold text-sm">{commsStats?.email?.queued ?? 0}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Sent</div>
                  <div className="font-bold text-sm text-emerald-600">{commsStats?.email?.sent ?? 0}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Delivered</div>
                  <div className="font-bold text-sm text-blue-600">{commsStats?.email?.delivered ?? 0}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                  <div className="font-bold text-sm text-rose-600">{commsStats?.email?.failed ?? 0}</div>
                </div>
              </div>
            </Card>

            <Card className="p-4 border-border/80 bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-semibold">WhatsApp Cloud API (Meta)</span>
                </div>
                <Badge variant={providerHealth?.whatsapp.isConfigured ? 'default' : 'secondary'}>
                  {providerHealth?.whatsapp.isConfigured ? 'Meta Cloud API' : 'Console Mode'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                API Version: <span className="font-mono">{providerHealth?.whatsapp.apiVersion || 'v21.0'}</span> • Webhook: <span className="font-mono">{providerHealth?.whatsapp.webhookVerified ? 'Verified' : 'Ready'}</span>
              </p>
              <div className="grid grid-cols-5 gap-2 mt-3 pt-3 border-t border-border/60 text-center">
                <div>
                  <div className="text-[11px] text-muted-foreground">Queued</div>
                  <div className="font-bold text-sm">{commsStats?.whatsapp?.queued ?? 0}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Accepted</div>
                  <div className="font-bold text-sm text-amber-600">{commsStats?.whatsapp?.accepted ?? 0}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Delivered</div>
                  <div className="font-bold text-sm text-emerald-600">{commsStats?.whatsapp?.delivered ?? 0}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Read</div>
                  <div className="font-bold text-sm text-blue-600">{commsStats?.whatsapp?.read ?? 0}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Failed</div>
                  <div className="font-bold text-sm text-rose-600">{commsStats?.whatsapp?.failed ?? 0}</div>
                </div>
              </div>
            </Card>
          </div>

          {/* Quick Engine Queue Health Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4 border-border/80">
              <div className="text-xs font-medium text-muted-foreground">Queued Dispatches</div>
              <div className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">
                {commsStats?.queued ?? 0}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Awaiting worker pickup</div>
            </Card>

            <Card className="p-4 border-border/80">
              <div className="text-xs font-medium text-muted-foreground">Delivered / Accepted</div>
              <div className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                {commsStats?.sent ?? 0}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Outbound dispatches</div>
            </Card>

            <Card className="p-4 border-border/80">
              <div className="text-xs font-medium text-muted-foreground">In-App Notices Read</div>
              <div className="text-2xl font-bold mt-1 text-teal-600 dark:text-teal-400">
                {commsStats?.read ?? 0}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Total created: {commsStats?.inApp?.created ?? 0}</div>
            </Card>

            <Card className="p-4 border-border/80">
              <div className="text-xs font-medium text-muted-foreground">Dead-Letter / Failed</div>
              <div className="text-2xl font-bold mt-1 text-rose-600 dark:text-rose-400">
                {commsStats?.dlq ?? 0}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Exhausted retry threshold</div>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-5 w-5 text-rose-500" />
                  Dead-Letter Notification Queue
                </CardTitle>
                <CardDescription>
                  Notifications that encountered delivery failures after maximum background retries.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  refetchDlq();
                  refetchCommsStats();
                  refetchProviders();
                }}
                className="gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border text-xs uppercase font-medium">
                  <tr>
                    <th className="px-4 py-3">Recipient</th>
                    <th className="px-4 py-3">Kind & Channel</th>
                    <th className="px-4 py-3">Attempts</th>
                    <th className="px-4 py-3">Last Error</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isDlqLoading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        Checking failed notification queue...
                      </td>
                    </tr>
                  ) : dlqData?.notifications?.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                        Dead-letter queue is clear. Zero failed outbound dispatches.
                      </td>
                    </tr>
                  ) : (
                    dlqData?.notifications?.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{item.userFullName}</div>
                          <div className="text-xs text-muted-foreground">{item.userEmail}</div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <Badge variant="outline" className="mr-1">{item.channel}</Badge>
                          <span className="text-muted-foreground">{item.kind}</span>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono">
                          {item.attempts} attempts
                        </td>
                        <td className="px-4 py-3 text-xs text-rose-600 dark:text-rose-400 max-w-xs truncate">
                          {item.error || item.lastError || 'Delivery failure'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-8"
                            onClick={() => retryNotificationMutation.mutate(item.id)}
                            disabled={retryNotificationMutation.isPending}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Retry
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* 6. Volunteer Field Operations Tab */}
        <TabsContent value="volunteers" className="space-y-6">
          <Card className="border-border">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4">
              <div>
                <CardTitle className="text-base font-semibold">Campus Volunteers & Gate Duty</CardTitle>
                <CardDescription className="text-xs">
                  Assign student volunteers to events, configure access gates, and monitor check-in scan activity.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setCreatedVolunteerToken(null);
                    setIsInviteModalOpen(true);
                  }}
                  className="gap-1.5 h-8 text-xs"
                  data-testid="btn-assign-volunteer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Assign Volunteer
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchVolunteers()}
                  className="h-8 w-8 p-0"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search volunteers by name, email, roll, gate..."
                    value={volunteerSearch}
                    onChange={(e) => setVolunteerSearch(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
                <Select value={volunteerStatusFilter} onValueChange={setVolunteerStatusFilter}>
                  <SelectTrigger className="w-full sm:w-44 h-8 text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Statuses</SelectItem>
                    <SelectItem value="ACTIVE">Active Only</SelectItem>
                    <SelectItem value="REVOKED">Revoked</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b text-muted-foreground font-semibold">
                    <tr>
                      <th className="px-4 py-3">Volunteer</th>
                      <th className="px-4 py-3">Event</th>
                      <th className="px-4 py-3">Duty Station</th>
                      <th className="px-4 py-3">Scans</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {isVolunteerLoading ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-muted-foreground">
                          Loading volunteers directory...
                        </td>
                      </tr>
                    ) : (volunteerData?.items?.length ?? 0) === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-muted-foreground">
                          No volunteer duty assignments found. Click "Assign Volunteer" to provision one.
                        </td>
                      </tr>
                    ) : (
                      volunteerData?.items?.map((vol) => (
                        <tr key={vol.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <span className="font-semibold block">{vol.fullName}</span>
                            <span className="text-muted-foreground text-[11px] font-mono">
                              {vol.rollNumber ? `${vol.rollNumber} · ` : ''}{vol.email}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium block">{vol.eventTitle}</span>
                            <span className="text-muted-foreground text-[11px] font-mono">{vol.eventSlug}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <DoorOpen className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                              <span className="font-medium">{vol.gate}</span>
                            </div>
                            <span className="text-muted-foreground text-[11px]">Role: {vol.role}</span>
                          </td>
                          <td className="px-4 py-3 font-mono font-semibold">
                            {vol.totalScans}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={vol.status === 'ACTIVE' ? 'default' : 'secondary'}
                              className={vol.status === 'ACTIVE' ? 'bg-emerald-600 text-white' : ''}
                            >
                              {vol.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {vol.status === 'ACTIVE' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => revokeVolunteerMutation.mutate(vol.id)}
                                disabled={revokeVolunteerMutation.isPending}
                                className="text-rose-500 hover:text-rose-600 h-7 text-xs"
                              >
                                Revoke
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Assign Volunteer Dialog */}
          <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Assign Campus Volunteer</DialogTitle>
                <DialogDescription className="text-xs">
                  Provision event duty station and generate immediate activation code.
                </DialogDescription>
              </DialogHeader>

              {createdVolunteerToken ? (
                <div className="space-y-4 py-3">
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 rounded-xl space-y-2 text-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
                    <h3 className="font-bold text-sm text-emerald-900 dark:text-emerald-200">
                      Volunteer Assigned Successfully!
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Share this activation code or direct link with the student to unlock scanning:
                    </p>
                    <div className="p-3 bg-background border rounded-lg font-mono font-extrabold text-xl text-emerald-600 dark:text-emerald-400 tracking-wider">
                      {createdVolunteerToken}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await copyToClipboard(createdVolunteerToken);
                          setHasCopiedVolToken(true);
                          setTimeout(() => setHasCopiedVolToken(false), 2000);
                        }}
                        className="gap-1.5 flex-1 text-xs"
                      >
                        {hasCopiedVolToken ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        {hasCopiedVolToken ? 'Copied Code' : 'Copy Code'}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/volunteer?code=${createdVolunteerToken}`;
                          await copyToClipboard(url);
                          setHasCopiedVolUrl(true);
                          setTimeout(() => setHasCopiedVolUrl(false), 2000);
                        }}
                        className="gap-1.5 flex-1 text-xs"
                      >
                        {hasCopiedVolUrl ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        {hasCopiedVolUrl ? 'Copied Link' : 'Copy Activation Link'}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 py-2 text-xs">
                  <div className="space-y-1">
                    <Label htmlFor="vol-event-id">Target Event ID</Label>
                    <Input
                      id="vol-event-id"
                      placeholder="UUID of target event"
                      value={newVolEventId}
                      onChange={(e) => setNewVolEventId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="vol-name">Student Full Name</Label>
                    <Input
                      id="vol-name"
                      placeholder="e.g. Alex Rivera"
                      value={newVolName}
                      onChange={(e) => setNewVolName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="vol-email">Email Address</Label>
                    <Input
                      id="vol-email"
                      type="email"
                      placeholder="alex.rivera@campus.edu"
                      value={newVolEmail}
                      onChange={(e) => setNewVolEmail(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="vol-roll">Roll Number (Optional)</Label>
                      <Input
                        id="vol-roll"
                        placeholder="e.g. 21CS099"
                        value={newVolRoll}
                        onChange={(e) => setNewVolRoll(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="vol-gate">Duty Gate</Label>
                      <Input
                        id="vol-gate"
                        placeholder="e.g. North Gate"
                        value={newVolGate}
                        onChange={(e) => setNewVolGate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="vol-role">Operational Role</Label>
                    <Select value={newVolRole} onValueChange={setNewVolRole}>
                      <SelectTrigger id="vol-role" className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SCANNER">Ticket Scanner</SelectItem>
                        <SelectItem value="REGISTRATION">Registration Desk</SelectItem>
                        <SelectItem value="CROWD_CONTROL">Crowd Control</SelectItem>
                        <SelectItem value="HELP_DESK">Help Desk</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="vol-notes">Instructions / Notes</Label>
                    <Input
                      id="vol-notes"
                      placeholder="e.g. Report to Gate 2 by 8:30 AM"
                      value={newVolNotes}
                      onChange={(e) => setNewVolNotes(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsInviteModalOpen(false)}
                >
                  {createdVolunteerToken ? 'Done' : 'Cancel'}
                </Button>
                {!createdVolunteerToken && (
                  <Button
                    size="sm"
                    onClick={() => inviteVolunteerMutation.mutate()}
                    disabled={!newVolEventId.trim() || !newVolEmail.trim() || !newVolName.trim() || inviteVolunteerMutation.isPending}
                  >
                    Assign Volunteer
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
        </Tabs>
    </div>
  );
};


interface ReportedReviewItem {
  reportId: string;
  reviewId: string;
  eventId: string;
  eventTitle: string;
  stars: number;
  comment?: string | null;
  clubStars?: number | null;
  clubComment?: string | null;
  hiddenAt?: string | null;
  authorId: string;
  authorName: string;
  reason: string;
  reportedAt: string;
}

const AdminModerationPanel: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery<{ reports: ReportedReviewItem[] }>({
    queryKey: ['admin', 'reviews', 'reported'],
    queryFn: async () => {
      const res = await api.get<{ reports: ReportedReviewItem[] }>('/admin/reviews/reported', {
        showToast: false,
      });
      return res;
    },
  });

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleToggleHide = async (reviewId: string, currentHidden: boolean) => {
    setTogglingId(reviewId);
    try {
      await api.patch(`/admin/reviews/${reviewId}/hide`, {
        hidden: !currentHidden,
      });
      toast({
        title: !currentHidden ? 'Review Hidden' : 'Review Restored',
        description: !currentHidden
          ? 'Review is now hidden from public view.'
          : 'Review has been restored to public view.',
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'reviews', 'reported'] });
      refetch();
    } catch (err: any) {
      toast({
        title: 'Action Failed',
        description: err?.message || 'Failed to update review moderation status.',
        variant: 'destructive',
      });
    } finally {
      setTogglingId(null);
    }
  };

  const reports = data?.reports || [];

  return (
    <div className="space-y-4" data-testid="admin-moderation-panel">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading text-lg font-bold">Reported Reviews Moderation</h3>
          <p className="text-xs text-muted-foreground">
            Review user reports on comments, and hide or unhide reviews from public event listings and metrics.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="text-xs">
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          Loading reported reviews...
        </Card>
      ) : reports.length === 0 ? (
        <Card className="p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-foreground">Zero Reported Reviews</p>
          <p className="text-xs text-muted-foreground">
            No reviews have been flagged for abusive or inappropriate content.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const isHidden = Boolean(r.hiddenAt);
            return (
              <Card key={r.reportId} className="p-4 border-border space-y-3 text-left">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-foreground">{r.eventTitle}</span>
                    <span className="text-xs text-muted-foreground">• by {r.authorName}</span>
                    {isHidden ? (
                      <Badge variant="destructive" className="text-[10px]">
                        Hidden
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        Active Public
                      </Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={isHidden ? 'outline' : 'destructive'}
                    disabled={togglingId === r.reviewId}
                    onClick={() => handleToggleHide(r.reviewId, isHidden)}
                    className="text-xs h-7 self-start sm:self-auto"
                  >
                    {togglingId === r.reviewId
                      ? 'Updating...'
                      : isHidden
                      ? 'Restore / Unhide'
                      : 'Hide Review'}
                  </Button>
                </div>

                <div className="p-2.5 rounded bg-muted/40 border border-border/40 text-xs space-y-1">
                  <div className="flex items-center gap-2 text-amber-500 font-semibold">
                    <span>Event: ★ {r.stars}</span>
                    {r.clubStars && <span>• Club: ★ {r.clubStars}</span>}
                  </div>
                  {r.comment && <p className="text-muted-foreground italic">&quot;{r.comment}&quot;</p>}
                  {r.clubComment && <p className="text-muted-foreground italic">&quot;Club: {r.clubComment}&quot;</p>}
                </div>

                <div className="text-xs bg-amber-500/10 border border-amber-500/20 rounded p-2 text-amber-800 dark:text-amber-200">
                  <span className="font-bold">Flagged Reason: </span>
                  <span>{r.reason}</span>
                  <span className="text-[11px] text-muted-foreground ml-2">
                    ({new Date(r.reportedAt).toLocaleDateString()})
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminPage;
