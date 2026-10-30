import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Settings,
  Users,
  Shield,
  MessageSquare,
  UserPlus,
  Crown,
  CheckCircle2,
  Lock,
  Hash,
} from 'lucide-react';
import { ClubMemberRole } from '@eventora/shared';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
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
  rollNumber: string;
  role: ClubMemberRole;
  joinedAt: string;
}

interface ChannelItem {
  id: string;
  name: string;
  slug: string;
  kind: string;
  description: string;
  postingPolicy: string;
}

export const ClubSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const clubId = '11111111-1111-1111-1111-111111111111';

  // Add Member Modal State
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<ClubMemberRole>(ClubMemberRole.MEMBER);

  // 1. Fetch Members
  const { data: membersData, isLoading: isLoadingMembers } = useQuery<{ members: MemberItem[] }>({
    queryKey: ['clubs', clubId, 'members'],
    queryFn: async () => {
      try {
        return await api.get<{ members: MemberItem[] }>(`/clubs/${clubId}/members`);
      } catch {
        return {
          members: [
            {
              id: 'mem-1',
              userId: 'u-1',
              fullName: 'Alex Vance',
              email: 'alex@campus.edu',
              rollNumber: '21CS001',
              role: ClubMemberRole.OWNER,
              joinedAt: new Date(Date.now() - 86400000 * 180).toISOString(),
            },
            {
              id: 'mem-2',
              userId: 'u-2',
              fullName: 'Devon Singh',
              email: 'devon@campus.edu',
              rollNumber: '22CS045',
              role: ClubMemberRole.ADMIN,
              joinedAt: new Date(Date.now() - 86400000 * 90).toISOString(),
            },
            {
              id: 'mem-3',
              userId: 'u-3',
              fullName: 'Priya Sharma',
              email: 'priya@campus.edu',
              rollNumber: '23EC102',
              role: ClubMemberRole.MEMBER,
              joinedAt: new Date(Date.now() - 86400000 * 20).toISOString(),
            },
          ],
        };
      }
    },
  });

  // 2. Fetch Channels
  const { data: channelsData } = useQuery<{ channels: ChannelItem[] }>({
    queryKey: ['clubs', clubId, 'channels'],
    queryFn: async () => {
      try {
        return await api.get<{ channels: ChannelItem[] }>(`/clubs/${clubId}/channels`);
      } catch {
        return {
          channels: [
            {
              id: 'ch-announcements',
              name: 'announcements',
              slug: 'announcements',
              kind: 'CLUB',
              description: 'Official club broadcast feed',
              postingPolicy: 'Owner & Admin only',
            },
            {
              id: 'ch-general',
              name: 'general',
              slug: 'general',
              kind: 'CLUB',
              description: 'Open discussion forum for all club members',
              postingPolicy: 'All members',
            },
            {
              id: 'ch-events',
              name: 'events',
              slug: 'events',
              kind: 'CLUB',
              description: 'Automated campus event cards & live updates',
              postingPolicy: 'Read-only automated system feed',
            },
          ],
        };
      }
    },
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
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
              <Settings className="h-7 w-7 text-indigo-600" />
              Club Settings & Governance
            </h1>
            <p className="text-sm text-muted-foreground">
              Member role delegation, institutional coordination, and channel permissions.
            </p>
          </div>
        </div>

        <Button
          onClick={() => setIsAddMemberOpen(true)}
          className="gap-2 shadow-sm"
          data-testid="btn-add-club-member"
        >
          <UserPlus className="h-4 w-4" />
          <span>Invite Member</span>
        </Button>
      </div>

      {/* Members & Roles Table */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-500" />
            Club Roster & Roles ({members.length} members)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border/60">
            {members.map((mem) => (
              <div
                key={mem.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{mem.fullName}</span>
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
                    {mem.rollNumber} · {mem.email}
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
        <CardContent className="space-y-3">
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
                <p className="text-muted-foreground">{ch.description}</p>
              </div>

              <Badge variant="secondary" className="text-[10px] shrink-0">
                {ch.postingPolicy}
              </Badge>
            </div>
          ))}
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
