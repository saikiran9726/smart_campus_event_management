import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { CountdownTimer } from '@/components/primitives/countdown-timer';
import { toast } from '@/components/ui/use-toast';
import { copyToClipboard } from '@/lib/clipboard';
import { api } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { ProjectSubmissionConfig, formatTeamCode } from '@eventora/shared';
import {
  Users,
  Copy,
  Check,
  Lock,
  UploadCloud,
  FileCode,
  UserPlus,
  Sparkles,
  AlertCircle,
  Mail,
  XCircle,
  UserMinus,
  CheckCircle,
  Share2,
  RotateCw,
  Slash,
  Crown,
  LogOut,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

export interface TeamMember {
  id: string;
  userId?: string;
  name?: string;
  fullName?: string;
  role: 'LEADER' | 'MEMBER';
  department?: string;
  avatarUrl?: string;
  joinedAt?: string;
}

export interface TeamInvitationItem {
  id: string;
  teamId: string;
  eventId: string;
  status: string;
  invitedEmail?: string | null;
  invitedRollNumber?: string | null;
  createdAt: string;
  expiresAt?: string | null;
}

export interface MyInvitationItem {
  id: string;
  teamId: string;
  eventId: string;
  status: string;
  createdAt: string;
  expiresAt?: string | null;
  teamName: string;
  teamCode: string;
  eventTitle: string;
  inviterName: string;
  inviterEmail: string;
}

export interface TeamData {
  id: string;
  name: string;
  inviteCode: string;
  formattedCode?: string;
  inviteToken?: string;
  codeStatus?: string;
  codeExpiresAt?: string | null;
  leaderId?: string;
  isLocked: boolean;
  minSize: number;
  maxSize: number;
  members: TeamMember[];
  invitations?: TeamInvitationItem[];
  submission?: {
    projectTitle: string;
    abstract: string;
    demoUrl?: string;
    repoUrl?: string;
    submittedAt: string;
  } | null;
}

export interface TeamPanelProps {
  eventId: string;
  eventTitle?: string;
  isCompetition?: boolean;
  minTeamSize?: number;
  maxTeamSize?: number;
  submissionDeadline?: string;
  projectSubmissionConfig?: ProjectSubmissionConfig | null;
  initialTeam?: TeamData | null;
  currentUserId?: string;
}

export const TeamPanel: React.FC<TeamPanelProps> = ({
  eventId,
  eventTitle = 'Event',
  isCompetition = true,
  minTeamSize = 2,
  maxTeamSize = 4,
  submissionDeadline = new Date(Date.now() + 86400000 * 2).toISOString(),
  projectSubmissionConfig,
  initialTeam,
  currentUserId,
}) => {
  const [team, setTeam] = useState<TeamData | null>(initialTeam || null);
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);
  const [createTeamName, setCreateTeamName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [inTeammatePool, setInTeammatePool] = useState(false);

  // Dialog states
  const [isRegenerateModalOpen, setIsRegenerateModalOpen] = useState(false);
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);

  // Direct invitation states
  const [inviteTarget, setInviteTarget] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [teamInvitationsList, setTeamInvitationsList] = useState<TeamInvitationItem[]>(
    initialTeam?.invitations || []
  );
  const [myPendingInvitations, setMyPendingInvitations] = useState<MyInvitationItem[]>([]);

  // Project submission form state
  const [projectTitle, setProjectTitle] = useState(team?.submission?.projectTitle || '');
  const [abstract, setAbstract] = useState(team?.submission?.abstract || '');
  const [demoUrl, setDemoUrl] = useState(team?.submission?.demoUrl || '');
  const [repoUrl, setRepoUrl] = useState(team?.submission?.repoUrl || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const queryClient = useQueryClient();
  const { data: submissionData, refetch: refetchSubmission } = useQuery({
    queryKey: ['submissions', 'me', eventId],
    queryFn: async () => {
      try {
        return await api.get<{
          config: ProjectSubmissionConfig;
          submission: any;
          canEdit: boolean;
          isDeadlinePassed: boolean;
        }>(`/events/${eventId}/submissions/me`);
      } catch {
        return null;
      }
    },
    enabled: !!eventId,
  });

  const effectiveConfig = submissionData?.config || projectSubmissionConfig;

  useEffect(() => {
    if (submissionData?.submission) {
      const sub = submissionData.submission;
      if (sub.projectTitle) setProjectTitle(sub.projectTitle);
      if (sub.projectAbstract) setAbstract(sub.projectAbstract);
      if (sub.demoUrl) setDemoUrl(sub.demoUrl);
      if (sub.repoUrl) setRepoUrl(sub.repoUrl);
    }
  }, [submissionData?.submission]);

  const isLeader = Boolean(
    team &&
      (!currentUserId ||
        team.leaderId === currentUserId ||
        team.members?.some((m) => (m.userId === currentUserId || m.id === currentUserId) && m.role === 'LEADER'))
  );

  // ROOT CAUSE FIX: Auto-fetch student's team on mount & when event changes!
  const loadUserTeam = async () => {
    setIsLoadingTeam(true);
    try {
      const res = await api.get<{ team: TeamData }>(`/events/${eventId}/teams/me`);
      if (res?.team) {
        setTeam(res.team);
      }
    } catch {
      // not in team or unauthenticated
    } finally {
      setIsLoadingTeam(false);
    }
  };

  const loadMyInvitations = async () => {
    try {
      const res = await api.get<{ invitations: MyInvitationItem[] }>('/me/team-invitations');
      if (res?.invitations) {
        setMyPendingInvitations(res.invitations.filter((i) => i.eventId === eventId));
      }
    } catch {
      // Ignore if unauthenticated in preview
    }
  };

  const loadTeamInvitations = async (teamId: string) => {
    try {
      const res = await api.get<{ invitations: TeamInvitationItem[] }>(
        `/events/${eventId}/teams/${teamId}/invitations`
      );
      if (res?.invitations) {
        setTeamInvitationsList(res.invitations);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    if (!initialTeam) {
      loadUserTeam();
    }
    loadMyInvitations();
  }, [eventId, initialTeam]);

  useEffect(() => {
    if (team?.id) {
      loadTeamInvitations(team.id);
    }
  }, [team?.id]);

  // Realtime updates for team rosters and submission states
  useSocketEvent<any>('team:update', (data) => {
    if (data?.team) {
      setTeam(data.team);
    }
    if (team?.id) {
      loadTeamInvitations(team.id);
    }
  });

  const displayCode = team?.formattedCode || (team?.inviteCode ? formatTeamCode(team.inviteCode) : '');

  const copyInviteCode = async () => {
    if (!displayCode) return;
    const success = await copyToClipboard(displayCode);
    if (success) {
      setIsCopied(true);
      toast({
        title: 'Invite Code Copied',
        description: `Team code ${displayCode} copied to clipboard.`,
      });
      setTimeout(() => setIsCopied(false), 2000);
    } else {
      toast({
        title: 'Copy Failed',
        description: 'Clipboard access was restricted. Please copy the code manually.',
      });
    }
  };

  const handleShareLink = async () => {
    if (!team) return;
    const shareUrl = `${window.location.origin}/teams/join?code=${team.inviteCode}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join my team ${team.name} on Eventora`,
          text: `Use team code ${displayCode} to join our team for ${eventTitle}:`,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback
      }
    }
    await copyToClipboard(shareUrl);
    setIsCopied(true);
    toast({
      title: 'Invitation Link Copied',
      description: 'Direct team join link copied to clipboard.',
    });
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleRegenerateCode = async () => {
    if (!team?.id) return;
    try {
      const res = await api.post<{ team: TeamData; formattedCode: string }>(
        `/teams/${team.id}/code/regenerate`
      );
      if (res?.team) {
        setTeam(res.team);
      }
      setIsRegenerateModalOpen(false);
      toast({
        title: 'Code Regenerated!',
        description: `New join code: ${res.formattedCode || res.team?.formattedCode}. Previous code is now invalid.`,
      });
    } catch (err: any) {
      toast({
        title: 'Failed to Regenerate Code',
        description: err?.message || 'Could not regenerate team code.',
        variant: 'destructive',
      });
    }
  };

  const handleRevokeCode = async () => {
    if (!team?.id) return;
    try {
      await api.post(`/teams/${team.id}/code/revoke`);
      setTeam((prev) => (prev ? { ...prev, codeStatus: 'REVOKED' } : null));
      setIsRevokeModalOpen(false);
      toast({
        title: 'Code Revoked',
        description: 'Team join code has been revoked. No new members can join using it.',
      });
    } catch (err: any) {
      toast({
        title: 'Failed to Revoke Code',
        description: err?.message || 'Could not revoke team code.',
        variant: 'destructive',
      });
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTeamName.trim()) return;

    try {
      const res = await api.post<{ team: TeamData }>(`/events/${eventId}/teams`, {
        name: createTeamName.trim(),
        answers: {},
      });
      setTeam(res.team);
      toast({
        title: 'Team Created!',
        description: `Team created! Invite code: ${res.team.formattedCode || formatTeamCode(res.team.inviteCode)}`,
      });
      if (res.team?.id) {
        loadTeamInvitations(res.team.id);
      }
    } catch (err: any) {
      toast({
        title: 'Error creating team',
        description: err?.message || 'Failed to create team. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;

    try {
      const res = await api.post<{ team: TeamData }>(`/teams/join`, {
        code: joinCode.trim(),
      });
      setTeam(res.team);
      toast({
        title: 'Joined Team!',
        description: `Successfully joined ${res.team.name}`,
      });
    } catch (err: any) {
      toast({
        title: 'Error joining team',
        description: err?.message || 'Invalid invite code or failed to join team.',
        variant: 'destructive',
      });
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!team?.id || !inviteTarget.trim()) return;

    setIsInviting(true);
    try {
      const isEmail = inviteTarget.includes('@');
      await api.post(`/events/${eventId}/teams/${team.id}/invite`, {
        email: isEmail ? inviteTarget.trim().toLowerCase() : undefined,
        rollNumber: !isEmail ? inviteTarget.trim() : undefined,
      });
      setInviteTarget('');
      toast({
        title: 'Invitation Sent',
        description: `Teammate invitation sent to ${inviteTarget.trim()}.`,
      });
      await loadTeamInvitations(team.id);
    } catch (err: any) {
      toast({
        title: 'Invitation Failed',
        description: err?.message || 'Failed to send team invitation.',
        variant: 'destructive',
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleCancelInvite = async (invitationId: string) => {
    if (!team?.id) return;
    try {
      await api.post(`/events/${eventId}/teams/${team.id}/invitations/${invitationId}/cancel`);
      toast({
        title: 'Invitation Cancelled',
        description: 'The team invitation has been cancelled.',
      });
      await loadTeamInvitations(team.id);
    } catch (err: any) {
      toast({
        title: 'Cancel Failed',
        description: err?.message || 'Could not cancel invitation.',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveMember = async () => {
    if (!team?.id || !memberToRemove) return;
    const memberId = memberToRemove.userId || memberToRemove.id;
    try {
      await api.post(`/events/${eventId}/teams/${team.id}/members/${memberId}/remove`);
      toast({
        title: 'Member Removed',
        description: `${memberToRemove.fullName || 'Member'} has been removed from the team.`,
      });
      setMemberToRemove(null);
      await loadUserTeam();
    } catch (err: any) {
      toast({
        title: 'Removal Failed',
        description: err?.message || 'Failed to remove member.',
        variant: 'destructive',
      });
    }
  };

  const handleLeaveTeam = async () => {
    if (!team?.id) return;
    try {
      await api.post(`/teams/${team.id}/leave`);
      toast({
        title: 'Left Team',
        description: 'You have left the team.',
      });
      setIsLeaveModalOpen(false);
      setTeam(null);
      await loadUserTeam();
    } catch (err: any) {
      toast({
        title: 'Leave Failed',
        description: err?.message || 'Failed to leave team.',
        variant: 'destructive',
      });
    }
  };

  const handleAcceptInvite = async (invitationId: string) => {
    try {
      const res = await api.post<{ team: TeamData }>(`/team-invitations/${invitationId}/accept`);
      toast({
        title: 'Invitation Accepted!',
        description: 'You have joined the team.',
      });
      if (res.team) {
        setTeam(res.team);
      }
      await loadMyInvitations();
    } catch (err: any) {
      toast({
        title: 'Accept Failed',
        description: err?.message || 'Could not accept invitation.',
        variant: 'destructive',
      });
    }
  };

  const handleRejectInvite = async (invitationId: string) => {
    try {
      await api.post(`/team-invitations/${invitationId}/reject`);
      toast({
        title: 'Invitation Declined',
        description: 'You declined the team invitation.',
      });
      await loadMyInvitations();
    } catch (err: any) {
      toast({
        title: 'Decline Failed',
        description: err?.message || 'Could not decline invitation.',
        variant: 'destructive',
      });
    }
  };

  const handleSubmitProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!team?.id) return;

    if (effectiveConfig?.fields) {
      for (const field of effectiveConfig.fields) {
        if (!field.enabled || !field.required) continue;
        if (field.key === 'title' && !projectTitle.trim()) {
          toast({ title: 'Validation Error', description: `${field.label} is required.`, variant: 'destructive' });
          return;
        }
        if (field.key === 'abstract' && !abstract.trim()) {
          toast({ title: 'Validation Error', description: `${field.label} is required.`, variant: 'destructive' });
          return;
        }
        if (field.key === 'repoUrl' && !repoUrl.trim()) {
          toast({ title: 'Validation Error', description: `${field.label} is required.`, variant: 'destructive' });
          return;
        }
        if (field.key === 'demoUrl' && !demoUrl.trim()) {
          toast({ title: 'Validation Error', description: `${field.label} is required.`, variant: 'destructive' });
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      await api.post(`/events/${eventId}/submissions`, {
        projectTitle: projectTitle.trim() || null,
        abstract: abstract.trim() || null,
        demoUrl: demoUrl.trim() || null,
        repoUrl: repoUrl.trim() || null,
      });
      toast({
        title: 'Project Deliverables Submitted!',
        description: 'Your project evaluation entry has been recorded.',
      });
      queryClient.invalidateQueries({ queryKey: ['submissions', 'me', eventId] });
      refetchSubmission();
    } catch (err: any) {
      toast({
        title: 'Submission Failed',
        description: err?.message || 'Failed to submit project. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Next Step Banner Calculation
  const getNextStep = () => {
    if (!team) return null;
    const count = team.members?.length || 1;
    if (count < minTeamSize) {
      const needed = minTeamSize - count;
      return {
        type: 'warning' as const,
        title: `Needs ${needed} more teammate${needed > 1 ? 's' : ''} to meet minimum requirement (${minTeamSize})`,
        description: `Share your code ${displayCode} or send direct invitations to complete your roster.`,
      };
    }
    if (!team.isLocked) {
      return {
        type: 'ready' as const,
        title: 'Minimum team size met! Roster is competition-ready.',
        description: count < maxTeamSize
          ? `You have space for ${maxTeamSize - count} more teammate${maxTeamSize - count > 1 ? 's' : ''}, or you can lock your roster.`
          : 'Your roster is full. Verify all team details before the registration deadline.',
      };
    }
    if (team.isLocked) {
      if (effectiveConfig?.enabled && !team.submission && !submissionData?.submission) {
        return {
          type: 'action' as const,
          title: effectiveConfig.requirement === 'MANDATORY'
            ? 'Roster locked! Mandatory project submission pending.'
            : 'Roster locked! Optional project deliverables available.',
          description: 'Submit your project deliverables before the deadline for evaluation.',
        };
      }
      return {
        type: 'complete' as const,
        title: 'All set! Team registration confirmed.',
        description: 'Your team roster is locked and ready for event day.',
      };
    }
  };

  const nextStep = getNextStep();

  return (
    <Card className="border-border shadow-sm space-y-6 p-6" data-testid="team-panel">
      {/* Panel Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-500" />
            <CardTitle className="text-xl font-bold">Hackathon Team & Roster</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Team size: minimum {minTeamSize}, maximum {maxTeamSize} members.
          </p>
        </div>

        {/* Deadline countdown */}
        <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400">
          <span>Submission Deadline:</span>
          <CountdownTimer expiresAt={submissionDeadline} className="font-bold font-mono" />
        </div>
      </div>

      {/* Persistent Next Step Banner */}
      {nextStep && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 ${
            nextStep.type === 'warning'
              ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
              : nextStep.type === 'ready'
              ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : nextStep.type === 'action'
              ? 'bg-indigo-50/70 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200'
              : 'bg-muted/50 border-border text-foreground'
          }`}
        >
          <div className="mt-0.5">
            {nextStep.type === 'warning' ? (
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            ) : nextStep.type === 'ready' ? (
              <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            )}
          </div>
          <div className="space-y-0.5 text-xs">
            <p className="font-bold text-sm leading-tight">{nextStep.title}</p>
            <p className="opacity-90 leading-relaxed">{nextStep.description}</p>
          </div>
        </div>
      )}

      {/* Incoming Invitations Banner */}
      {myPendingInvitations.length > 0 && !team && (
        <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 space-y-3">
          <div className="flex items-center gap-2 text-indigo-800 dark:text-indigo-300 font-semibold text-sm">
            <Mail className="h-4 w-4" />
            <span>You have {myPendingInvitations.length} pending team invitation(s)</span>
          </div>
          <div className="space-y-2">
            {myPendingInvitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between p-3 rounded-lg bg-background border border-border text-xs"
              >
                <div>
                  <p className="font-bold text-foreground">
                    {inv.teamName}{' '}
                    <span className="font-mono text-[10px] text-muted-foreground">
                      ({formatTeamCode(inv.teamCode)})
                    </span>
                  </p>
                  <p className="text-muted-foreground text-[11px]">
                    Invited by {inv.inviterName} ({inv.inviterEmail})
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                    onClick={() => handleAcceptInvite(inv.id)}
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs text-rose-600 border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950/30 gap-1"
                    onClick={() => handleRejectInvite(inv.id)}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Team State: Create or Join */}
      {!team ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Create Team Card */}
          <div className="p-5 rounded-xl border border-border bg-muted/20 space-y-4">
            <div className="space-y-1">
              <h4 className="font-bold text-sm text-foreground">Create New Team</h4>
              <p className="text-xs text-muted-foreground">
                You will be the team leader and receive an 8-character join code.
              </p>
            </div>
            <form onSubmit={handleCreateTeam} className="space-y-3">
              <Input
                placeholder="Team Name (e.g. Neural Ninjas)"
                value={createTeamName}
                onChange={(e) => setCreateTeamName(e.target.value)}
                className="h-11"
              />
              <Button type="submit" className="w-full h-11 font-semibold" disabled={!createTeamName.trim()}>
                Create Team & Get Code
              </Button>
            </form>
          </div>

          {/* Join by Code Card */}
          <div className="p-5 rounded-xl border border-border bg-muted/20 space-y-4">
            <div className="space-y-1">
              <h4 className="font-bold text-sm text-foreground">Join with Team Code</h4>
              <p className="text-xs text-muted-foreground">
                Enter an 8-character code (e.g. K7M2-9QXA) from your team leader.
              </p>
            </div>
            <form onSubmit={handleJoinTeam} className="space-y-3">
              <Input
                placeholder="K7M2-9QXA"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className="h-11 uppercase font-mono tracking-wider"
              />
              <Button type="submit" variant="outline" className="w-full h-11 font-semibold" disabled={!joinCode.trim()}>
                Join Existing Team
              </Button>
            </form>
          </div>
        </div>
      ) : (
        /* Team Active Dashboard */
        <div className="space-y-6">
          {/* Header & Prominent Large Monospaced Code Card */}
          <div className="p-5 rounded-2xl bg-muted/30 border border-border space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl font-extrabold text-foreground">{team.name}</h3>
                  {team.isLocked && (
                    <Badge variant="destructive" className="gap-1 text-xs">
                      <Lock className="h-3 w-3" />
                      Locked
                    </Badge>
                  )}
                  {team.codeStatus === 'REVOKED' && (
                    <Badge variant="outline" className="text-rose-600 border-rose-300 text-xs">
                      Code Revoked
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Roster: {team.members?.length || 1} / {maxTeamSize} members (minimum required: {minTeamSize})
                </p>
              </div>

              {/* Leave Button */}
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-rose-600 gap-1.5"
                onClick={() => setIsLeaveModalOpen(true)}
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Leave Team</span>
              </Button>
            </div>

            {/* Amber-Tinted Code Card */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-xl border border-amber-300 bg-amber-50/70 dark:border-amber-700/60 dark:bg-amber-950/20 shadow-xs">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300 block">
                  Team Join Code
                </span>
                <span className="text-2xl sm:text-3xl font-extrabold font-mono tracking-widest text-amber-950 dark:text-amber-100 select-all tnum">
                  {displayCode}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copyInviteCode}
                  className="h-10 px-3.5 gap-1.5 font-medium border-amber-300 hover:bg-amber-100/50 text-amber-900 dark:border-amber-700 dark:text-amber-200"
                >
                  {isCopied ? <Check className="h-4 w-4 text-emerald-600 stroke-[2.2]" /> : <Copy className="h-4 w-4 stroke-[1.75]" />}
                  <span>{isCopied ? 'Copied' : 'Copy Code'}</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleShareLink}
                  className="h-10 px-3.5 gap-1.5 font-medium border-amber-300 hover:bg-amber-100/50 text-amber-900 dark:border-amber-700 dark:text-amber-200"
                >
                  <Share2 className="h-4 w-4 stroke-[1.75]" />
                  <span>Share Link</span>
                </Button>

                {isLeader && !team.isLocked && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setIsRegenerateModalOpen(true)}
                      className="h-10 px-2.5 text-amber-900 hover:bg-amber-200/50 dark:text-amber-300"
                      title="Regenerate team code"
                    >
                      <RotateCw className="h-4 w-4 stroke-[1.75]" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setIsRevokeModalOpen(true)}
                      className="h-10 px-2.5 text-red-600 hover:bg-red-50 dark:text-red-400"
                      title="Revoke team code"
                    >
                      <Slash className="h-4 w-4 stroke-[1.75]" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Capacity Meter */}
            <div className="space-y-2 pt-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium text-stone-600 dark:text-stone-400">Team Capacity</span>
                <span className="font-bold text-stone-900 dark:text-stone-100 font-mono tnum">
                  {team.members?.length || 1} / {maxTeamSize} Members
                  {(team.members?.length || 1) < minTeamSize && (
                    <span className="text-amber-700 dark:text-amber-400 font-sans ml-1.5 font-normal">
                      (needs {minTeamSize - (team.members?.length || 1)} more)
                    </span>
                  )}
                </span>
              </div>
              <Progress
                value={(((team.members?.length || 1)) / maxTeamSize) * 100}
                className="h-2.5"
              />
            </div>
          </div>

          {/* Members List */}
          <div className="space-y-3">
            <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Team Members ({team.members?.length || 1}/{maxTeamSize})
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {team.members?.map((m) => {
                const displayName = m.fullName || m.name || 'Member';
                const memberId = m.userId || m.id;
                const isMemberLeader = m.role === 'LEADER';
                const canRemove = isLeader && !team.isLocked && !isMemberLeader;

                return (
                  <div
                    key={memberId}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-card shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                        {displayName[0]?.toUpperCase()}
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-foreground">{displayName}</p>
                          {isMemberLeader && (
                            <span title="Team Leader">
                              <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            </span>
                          )}
                        </div>
                        {m.department && <p className="text-[10px] text-muted-foreground">{m.department}</p>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant={isMemberLeader ? 'default' : 'secondary'} className="text-[10px]">
                        {m.role}
                      </Badge>
                      {canRemove && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-600"
                          title="Remove teammate"
                          onClick={() => setMemberToRemove(m)}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Leader Invitation Form */}
          {isLeader && !team.isLocked && (team.members?.length || 1) < maxTeamSize && (
            <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
              <h5 className="text-xs font-bold text-foreground">Invite a Teammate Directly</h5>
              <form onSubmit={handleSendInvite} className="flex gap-2">
                <Input
                  placeholder="teammate@university.edu or roll number"
                  value={inviteTarget}
                  onChange={(e) => setInviteTarget(e.target.value)}
                  className="h-10 text-xs"
                />
                <Button type="submit" size="sm" className="h-10 px-4 font-semibold shrink-0" disabled={isInviting || !inviteTarget.trim()}>
                  {isInviting ? 'Sending...' : 'Send Invite'}
                </Button>
              </form>
            </div>
          )}

          {/* Pending Outgoing Invitations */}
          {teamInvitationsList.length > 0 && isLeader && (
            <div className="space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Pending Invitations ({teamInvitationsList.filter((i) => i.status === 'PENDING').length})
              </h5>
              <div className="space-y-2">
                {teamInvitationsList.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-card text-xs"
                  >
                    <div>
                      <p className="font-semibold">{inv.invitedEmail || inv.invitedRollNumber}</p>
                      <p className="text-[10px] text-muted-foreground">Status: {inv.status}</p>
                    </div>
                    {inv.status === 'PENDING' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                        onClick={() => handleCancelInvite(inv.id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Project Submission Form — Only rendered if enabled by organizer */}
          {effectiveConfig?.enabled && (
            <div className="p-5 rounded-2xl border border-border bg-stone-50/70 dark:bg-stone-900/60 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <FileCode className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                    <h4 className="font-bold text-sm text-foreground">Project Deliverables Submission</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Submit your demo link, code repository, and abstract for evaluation.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-bold ${
                      effectiveConfig.requirement === 'MANDATORY'
                        ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300'
                        : 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300'
                    }`}
                  >
                    {effectiveConfig.requirement === 'MANDATORY' ? 'Mandatory' : 'Optional'}
                  </Badge>
                  {submissionData?.submission && (
                    <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300">
                      Submitted
                    </Badge>
                  )}
                  {submissionData?.isDeadlinePassed && (
                    <Badge variant="outline" className="text-[10px] bg-stone-100 text-stone-600 border-stone-200">
                      Deadline Passed
                    </Badge>
                  )}
                </div>
              </div>

              {/* Locked / Deadline Warning */}
              {submissionData?.canEdit === false && submissionData?.submission && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200">
                  <Lock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>
                    {submissionData.isDeadlinePassed
                      ? 'The submission deadline for this event has passed. Deliverables are closed.'
                      : 'Submissions are locked for editing once submitted by organizer settings.'}
                  </span>
                </div>
              )}

              <form onSubmit={handleSubmitProject} className="space-y-3">
                {/* Dynamically render only enabled fields */}
                {effectiveConfig.fields?.map((field) => {
                  if (!field.enabled) return null;

                  if (field.key === 'title') {
                    return (
                      <div key="title" className="space-y-1">
                        <Label className="text-xs font-semibold">
                          {field.label} {field.required && <span className="text-rose-500">*</span>}
                        </Label>
                        <Input
                          placeholder="Project Title"
                          value={projectTitle}
                          onChange={(e) => setProjectTitle(e.target.value)}
                          className="h-10 text-xs"
                          disabled={submissionData?.canEdit === false}
                        />
                      </div>
                    );
                  }

                  if (field.key === 'abstract') {
                    return (
                      <div key="abstract" className="space-y-1">
                        <Label className="text-xs font-semibold">
                          {field.label} {field.required && <span className="text-rose-500">*</span>}
                        </Label>
                        <Textarea
                          placeholder="Project Abstract & Architecture Overview"
                          value={abstract}
                          onChange={(e) => setAbstract(e.target.value)}
                          className="text-xs min-h-[80px]"
                          disabled={submissionData?.canEdit === false}
                        />
                      </div>
                    );
                  }

                  if (field.key === 'demoUrl') {
                    return (
                      <div key="demoUrl" className="space-y-1">
                        <Label className="text-xs font-semibold">
                          {field.label} {field.required && <span className="text-rose-500">*</span>}
                        </Label>
                        <Input
                          placeholder="Demo URL (e.g. YouTube or live link)"
                          value={demoUrl}
                          onChange={(e) => setDemoUrl(e.target.value)}
                          className="h-10 text-xs"
                          disabled={submissionData?.canEdit === false}
                        />
                      </div>
                    );
                  }

                  if (field.key === 'repoUrl') {
                    return (
                      <div key="repoUrl" className="space-y-1">
                        <Label className="text-xs font-semibold">
                          {field.label} {field.required && <span className="text-rose-500">*</span>}
                        </Label>
                        <Input
                          placeholder="GitHub Repository URL (https://github.com/org/repo)"
                          value={repoUrl}
                          onChange={(e) => setRepoUrl(e.target.value)}
                          className="h-10 text-xs"
                          disabled={submissionData?.canEdit === false}
                        />
                      </div>
                    );
                  }

                  return null;
                })}

                {submissionData?.canEdit !== false && (
                  <Button type="submit" size="sm" className="w-full h-10 font-bold gap-2 bg-teal-600 hover:bg-teal-700 text-white" disabled={isSubmitting}>
                    <UploadCloud className="h-4 w-4" />
                    {isSubmitting ? 'Submitting...' : submissionData?.submission ? 'Update Deliverables' : 'Save Deliverables'}
                  </Button>
                )}
              </form>
            </div>
          )}
        </div>
      )}

      {/* Regenerate Code Confirm Dialog */}
      <Dialog open={isRegenerateModalOpen} onOpenChange={setIsRegenerateModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Regenerate Team Code?</DialogTitle>
            <DialogDescription>
              Generating a new code will <strong>instantly invalidate</strong> the previous code ({displayCode}). Teammates who have not yet joined will need the new code.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsRegenerateModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRegenerateCode} className="bg-primary hover:bg-primary/90 font-bold">
              Yes, Generate New Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Code Confirm Dialog */}
      <Dialog open={isRevokeModalOpen} onOpenChange={setIsRevokeModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke Team Join Code?</DialogTitle>
            <DialogDescription>
              Revoking the code prevents any new members from joining via this code. Existing members will remain on the team.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsRevokeModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRevokeCode} variant="destructive" className="font-bold">
              Revoke Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirm Dialog */}
      <Dialog open={Boolean(memberToRemove)} onOpenChange={() => setMemberToRemove(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Teammate?</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong>{memberToRemove?.fullName || 'this member'}</strong> from the team roster?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setMemberToRemove(null)}>
              Cancel
            </Button>
            <Button onClick={handleRemoveMember} variant="destructive" className="font-bold">
              Remove Teammate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave Team Confirm Dialog */}
      <Dialog open={isLeaveModalOpen} onOpenChange={setIsLeaveModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Leave Team?</DialogTitle>
            <DialogDescription>
              {isLeader
                ? 'As team leader, leaving will transfer leadership to the next teammate. If no other members remain, the team will be disbanded.'
                : 'Are you sure you want to leave this team? Your seat reservation will be released.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsLeaveModalOpen(false)}>
              Stay in Team
            </Button>
            <Button onClick={handleLeaveTeam} variant="destructive" className="font-bold">
              Confirm & Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default TeamPanel;
