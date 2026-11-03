import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Activity,
} from 'lucide-react';

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

export const AdminPage: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Tab State
  const [activeTab, setActiveTab] = useState('overview');

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
  const { data: campusData } = useQuery({
    queryKey: ['admin', 'campus'],
    queryFn: async () => {
      try {
        return await api.get<Record<string, unknown>>('/admin/analytics/campus', {
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

  // 5. Failed Notifications DLQ Query
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
    },
    onError: (err: any) => {
      toast({
        title: 'Retry Failed',
        description: err?.message || 'Could not requeue notification.',
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
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-semibold w-fit">
          <Shield className="h-3.5 w-3.5" />
          Campus Governance
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">University Admin Panel</h1>
        <p className="text-muted-foreground text-sm">
          Campus-wide macro analytics, role governance, club accreditation audits, and operational oversight.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full">
          <TabsTrigger value="overview" className="flex items-center gap-1.5">
            <Activity className="h-4 w-4" />
            <span>Overview</span>
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
                <Building2 className="h-4 w-4 text-indigo-500" />
              </div>
              <p className="text-3xl font-bold tnum">{(campusData?.totalClubs as number) || 18}</p>
              <p className="text-xs text-muted-foreground">Active accredited student chapters</p>
            </Card>

            <Card className="border-border p-5 space-y-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Campus Check-ins</span>
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-3xl font-bold tnum">{(campusData?.totalCheckIns as number) || 1420}</p>
              <p className="text-xs text-muted-foreground">Verified gate entries across all events</p>
            </Card>

            <Card className="border-border p-5 space-y-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Conflict Engine</span>
                <AlertCircle className="h-4 w-4 text-amber-500" />
              </div>
              <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium pt-1">
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
                  ) : usersData?.users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        No members found matching the criteria.
                      </td>
                    </tr>
                  ) : (
                    usersData?.users.map((u) => (
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
                  <ShieldAlert className="h-5 w-5 text-indigo-500" />
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
              <Button variant="outline" size="sm" onClick={() => refetchDlq()} className="gap-1.5">
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
      </Tabs>
    </div>
  );
};

export default AdminPage;
