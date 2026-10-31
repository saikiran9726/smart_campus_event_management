import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Settings,
  Users,
  ShieldAlert,
  MessageSquare,
  UserPlus,
  Crown,
  Hash,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { ClubMemberRole } from '@eventora/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useActiveClub } from './ActiveClubContext';
import { ClubSwitcher } from './ClubSwitcher';
import { ZeroClubsEmptyState } from './ZeroClubsEmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';

interface MemberItem {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  rollNumber?: string;
  role: ClubMemberRole;
  joinedAt?: string;
}

interface ChannelItem {
  id: string;
  name: string;
  slug: string;
  kind: string;
  description?: string;
  postingPolicy?: string;
}

export const ClubSettingsPage: React.FC = () => {
  const { clubId: routeClubId } = useParams<{ clubId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();
  const { clubs, activeClubId, setActiveClubId, isLoading: isLoadingClubs } = useActiveClub();

  const clubId = routeClubId || activeClubId;

  // Sync route club to active club if user belongs to it
  useEffect(() => {
    if (routeClubId && routeClubId !== activeClubId && clubs.some((c) => c.id === routeClubId)) {
      setActiveClubId(routeClubId);
    }
  }, [routeClubId, activeClubId, clubs, setActiveClubId]);

  // Add Member Modal State
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<ClubMemberRole>(ClubMemberRole.MEMBER);

  // 1. Fetch Members
  const {
    data: membersData,
    isLoading: isLoadingMembers,
    isError: isMembersError,
    error: membersError,
    refetch: refetchMembers,
  } = useQuery<{ members: MemberItem[] }>({
    queryKey: ['clubs', clubId, 'members'],
    queryFn: async () => {
      return await api.get<{ members: MemberItem[] }>(`/clubs/${clubId}/members`);
    },
    enabled: !!clubId,
  });

  // 2. Fetch Channels
  const {
    data: channelsData,
    isLoading: isLoadingChannels,
    isError: isChannelsError,
    error: channelsError,
    refetch: refetchChannels,
  } = useQuery<{ channels: ChannelItem[] }>({
    queryKey: ['clubs', clubId, 'channels'],
    queryFn: async () => {
      return await api.get<{ channels: ChannelItem[] }>(`/clubs/${clubId}/channels`);
    },
    enabled: !!clubId,
  });

  // Role Update Mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: ClubMemberRole }) => {
      return await api.patch(`/clubs/${clubId}/members/${userId}`, { role });
    },
    onSuccess: () => {
      toast.success('Member permissions updated.');
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'members'] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to update member role.');
    },
  });

  // Add Member Mutation
  const addMemberMutation = useMutation({
    mutationFn: async () => {
      return await api.post(`/clubs/${clubId}/members`, {
        email: newMemberEmail.trim(),
        role: newMemberRole,
      });
    },
    onSuccess: () => {
      toast.success(`Invitation sent to ${newMemberEmail}`);
      setIsAddMemberOpen(false);
      setNewMemberEmail('');
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'members'] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to add member.');
    },
  });

  if (isLoadingClubs) {
    return (
      <div className="container max-w-5xl py-12 px-4 mx-auto space-y-4">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  // If a routeClubId was provided, verify caller belongs to that club (or is admin)
  if (routeClubId && !isAdmin && !clubs.some((c) => c.id === routeClubId)) {
    return (
      <div className="container max-w-xl py-16 px-4 mx-auto text-center space-y-4">
        <div className="inline-flex p-3 rounded-full bg-destructive/10 text-destructive mb-2">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold">Access Denied</h2>
        <p className="text-sm text-muted-foreground">
          You are not an authorized member of this club and do not have permission to access its settings.
        </p>
        <div className="pt-2">
          <Button asChild variant="outline">
            <Link to="/organizer">Return to Organizer Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  // If no club exists at all
  if (!clubId) {
    return (
      <div className="container max-w-5xl py-8 px-4 mx-auto">
        <ZeroClubsEmptyState />
      </div>
    );
  }

  const currentClub = clubs.find((c) => c.id === clubId);
  const members = membersData?.members ?? [];
  const channels = channelsData?.channels ?? [];

  return (
    <div className="container max-w-5xl py-8 px-4 sm:px-8 mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/organizer')}
            className="h-8 w-8 p-0"
            aria-label="Back to organizer dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
              <Settings className="h-7 w-7 text-indigo-600" />
              Club Settings & Governance
            </h1>
            <p className="text-sm text-muted-foreground">
              Member role delegation, institutional coordination, and channel permissions for{' '}
              <span className="font-semibold text-foreground">{currentClub?.name || 'Club'}</span>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <ClubSwitcher />
          <Button
            onClick={() => setIsAddMemberOpen(true)}
            className="gap-2 shadow-sm shrink-0"
            data-testid="btn-add-club-member"
          >
            <UserPlus className="h-4 w-4" />
            <span>Invite Member</span>
          </Button>
        </div>
      </div>

      {/* Members & Roles Table */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-500" />
              Club Roster & Roles ({members.length} members)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingMembers ? (
            <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">
              Loading club members...
            </div>
          ) : isMembersError ? (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Failed to load club roster: {(membersError as any)?.message || 'Network error'}</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => refetchMembers()} className="gap-1">
                <RotateCcw className="h-3 w-3" /> Retry
              </Button>
            </div>
          ) : members.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No members found for this club. Click &quot;Invite Member&quot; to add collaborators.
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {members.map((mem) => (
                <div
                  key={mem.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{mem.fullName || mem.email}</span>
                      {mem.role === ClubMemberRole.OWNER && (
                        <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300 text-[10px] flex items-center gap-1">
                          <Crown className="h-3 w-3" />
                          Owner
                        </Badge>
                      )}
                      {mem.role === ClubMemberRole.ADMIN && (
                        <Badge variant="outline" className="text-indigo-600 border-indigo-300 text-[10px]">
                          Admin
                        </Badge>
                      )}
                      {mem.role === ClubMemberRole.MEMBER && (
                        <Badge variant="secondary" className="text-[10px]">
                          Member
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground font-mono text-[11px]">
                      {mem.rollNumber ? `${mem.rollNumber} · ` : ''}{mem.email}
                    </p>
                  </div>

                  {mem.role !== ClubMemberRole.OWNER && (
                    <div className="w-36">
                      <Select
                        value={mem.role}
                        onValueChange={(val: any) =>
                          updateRoleMutation.mutate({ userId: mem.userId, role: val })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ClubMemberRole.ADMIN}>Admin</SelectItem>
                          <SelectItem value={ClubMemberRole.MEMBER}>Member</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Realtime Channels Overview */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-indigo-500" />
            Club Chat Channels
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingChannels ? (
            <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">
              Loading chat channels...
            </div>
          ) : isChannelsError ? (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Failed to load channels: {(channelsError as any)?.message || 'Network error'}</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => refetchChannels()} className="gap-1">
                <RotateCcw className="h-3 w-3" /> Retry
              </Button>
            </div>
          ) : channels.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No chat channels configured for this club yet.
            </div>
          ) : (
            <div className="space-y-3">
              {channels.map((ch) => (
                <div
                  key={ch.id}
                  className="p-3.5 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 font-bold text-sm">
                      <Hash className="h-4 w-4 text-muted-foreground" />
                      <span>{ch.name}</span>
                    </div>
                    {ch.description && <p className="text-muted-foreground">{ch.description}</p>}
                  </div>

                  {ch.postingPolicy && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {ch.postingPolicy}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Member Dialog */}
      <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite New Club Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label htmlFor="mem-email">Student Campus Email</Label>
              <Input
                id="mem-email"
                type="email"
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
                placeholder="student@campus.edu"
              />
            </div>

            <div className="space-y-1">
              <Label>Assigned Role</Label>
              <Select
                value={newMemberRole}
                onValueChange={(val: any) => setNewMemberRole(val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ClubMemberRole.MEMBER}>Member</SelectItem>
                  <SelectItem value={ClubMemberRole.ADMIN}>Club Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsAddMemberOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => addMemberMutation.mutate()}
              disabled={!newMemberEmail.trim() || addMemberMutation.isPending}
            >
              Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClubSettingsPage;
