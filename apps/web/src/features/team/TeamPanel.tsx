import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CountdownTimer } from '@/components/primitives/countdown-timer';
import { toast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
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
} from 'lucide-react';

export interface TeamMember {
  id: string;
  name: string;
  role: 'LEADER' | 'MEMBER';
  department?: string;
}

export interface TeamData {
  id: string;
  name: string;
  inviteCode: string;
  isLocked: boolean;
  minSize: number;
  maxSize: number;
  members: TeamMember[];
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
  isCompetition?: boolean;
  minTeamSize?: number;
  maxTeamSize?: number;
  submissionDeadline?: string;
  initialTeam?: TeamData | null;
}

export const TeamPanel: React.FC<TeamPanelProps> = ({
  eventId,
  isCompetition = true,
  minTeamSize = 2,
  maxTeamSize = 4,
  submissionDeadline = new Date(Date.now() + 86400000 * 2).toISOString(),
  initialTeam,
}) => {
  const [team, setTeam] = useState<TeamData | null>(initialTeam || null);
  const [createTeamName, setCreateTeamName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [inTeammatePool, setInTeammatePool] = useState(false);

  // Project submission form state
  const [projectTitle, setProjectTitle] = useState(team?.submission?.projectTitle || '');
  const [abstract, setAbstract] = useState(team?.submission?.abstract || '');
  const [demoUrl, setDemoUrl] = useState(team?.submission?.demoUrl || '');
  const [repoUrl, setRepoUrl] = useState(team?.submission?.repoUrl || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Realtime updates for team rosters and submission states
  useSocketEvent<any>('team:update', (data) => {
    if (data?.team) {
      setTeam(data.team);
    }
  });

  const copyInviteCode = () => {
    if (!team?.inviteCode) return;
    navigator.clipboard.writeText(team.inviteCode);
    setIsCopied(true);
    toast({
      title: 'Invite Code Copied',
      description: `Team code ${team.inviteCode} copied to clipboard.`,
    });
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTeamName.trim()) return;

    try {
      const res = await api.post<{ team: TeamData }>(`/events/${eventId}/teams`, {
        name: createTeamName,
        answers: {},
      });
      setTeam(res.team);
      toast({
        title: 'Team Created!',
        description: `Invite teammates using code: ${res.team.inviteCode}`,
      });
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
        code: joinCode.trim().toUpperCase(),
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

  const handleSubmitProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!team?.id) {
      toast({
        title: 'No team selected',
        description: 'You must create or join a team before submitting project deliverables.',
        variant: 'destructive',
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post(`/teams/${team.id}/submission`, {
        projectTitle,
        abstract,
        demoUrl: demoUrl || undefined,
        repoUrl,
      });
      toast({
        title: 'Project Submitted!',
        description: 'Your project evaluation entry has been recorded.',
      });
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

  const skillChips = ['React', 'TypeScript', 'Python', 'FastAPI', 'PyTorch', 'UI/UX Design', 'Solidity'];

  return (
    <Card className="border-border shadow-sm space-y-6 p-6" data-testid="team-panel">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-500" />
            <CardTitle className="text-xl font-bold">Hackathon Team & Submission</CardTitle>
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

      {!team ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Create Team Card */}
          <div className="p-5 rounded-xl border border-border bg-muted/20 space-y-4">
            <div className="space-y-1">
              <h4 className="font-bold text-sm text-foreground">Create New Team</h4>
              <p className="text-xs text-muted-foreground">
                You will be the team leader and receive a shareable invite code.
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
              <h4 className="font-bold text-sm text-foreground">Join with Invite Code</h4>
              <p className="text-xs text-muted-foreground">
                Got a 6-character code from your team leader? Enter it below.
              </p>
            </div>
            <form onSubmit={handleJoinTeam} className="space-y-3">
              <Input
                placeholder="TEAM-XXXXXX"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className="h-11 uppercase font-mono tracking-wider"
              />
              <Button type="submit" variant="outline" className="w-full h-11 font-semibold" disabled={!joinCode.trim()}>
                Join Existing Team
              </Button>
            </form>
          </div>

          {/* Teammate Pool Opt-In */}
          <div className="md:col-span-2 p-4 rounded-xl border border-dashed border-border flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <div className="flex items-center gap-1.5 font-bold text-xs text-primary">
                <Sparkles className="h-4 w-4" />
                <span>Teammate Matchmaker Pool</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Looking for teammates? Opt-in to appear in the campus matchmaking pool for this event.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1 justify-center sm:justify-start">
                {skillChips.map((s) => (
                  <Badge key={s} variant="secondary" className="text-[10px] py-0 px-2">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
            <Button
              variant={inTeammatePool ? 'default' : 'outline'}
              size="sm"
              onClick={() => setInTeammatePool(!inTeammatePool)}
              className="shrink-0 h-10 px-4"
            >
              {inTeammatePool ? 'Opted In to Pool' : 'Join Teammate Pool'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Team Header & Invite Code */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-primary/5 border border-primary/20">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-lg font-extrabold text-foreground">{team.name}</h4>
                {team.isLocked && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full border border-rose-200">
                    <Lock className="h-3 w-3" />
                    Roster Locked
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Roster: {team.members.length} / {maxTeamSize} members (min {minTeamSize})
              </p>
            </div>

            {/* Invite Code Box */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-3 py-1.5 bg-background rounded-lg border border-border tracking-widest text-primary">
                {team.inviteCode}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={copyInviteCode}
                className="h-9 px-3 gap-1.5"
                aria-label="Copy team invite code"
              >
                {isCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                <span>{isCopied ? 'Copied' : 'Copy'}</span>
              </Button>
            </div>
          </div>

          {/* Locked State Warning */}
          {team.isLocked && (
            <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                Roster is locked because the competition deadline has commenced. Team members cannot be modified.
              </span>
            </div>
          )}

          {/* Member Roster List */}
          <div className="space-y-2">
            <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Team Roster ({team.members.length}/{maxTeamSize})
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {team.members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {m.name[0]}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">{m.name}</p>
                      {m.department && <p className="text-[10px] text-muted-foreground">{m.department}</p>}
                    </div>
                  </div>
                  <Badge variant={m.role === 'LEADER' ? 'default' : 'secondary'} className="text-[10px]">
                    {m.role}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Project Submission Form */}
          <form onSubmit={handleSubmitProject} className="space-y-4 pt-4 border-t border-border/60">
            <h5 className="text-sm font-bold text-foreground">Project Submission & Pitch Deck</h5>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-foreground">Project Title</label>
                <Input
                  placeholder="e.g. CampusBot - Autonomous OD Verifier"
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  className="h-10 mt-1"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Project Abstract & Architecture</label>
                <Textarea
                  placeholder="Summarize the problem solved, tech stack used, and innovations..."
                  value={abstract}
                  onChange={(e) => setAbstract(e.target.value)}
                  className="min-h-[80px] mt-1 text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-foreground">Live Demo URL</label>
                  <Input
                    placeholder="https://my-hackathon-demo.app"
                    value={demoUrl}
                    onChange={(e) => setDemoUrl(e.target.value)}
                    className="h-10 mt-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground">GitHub / GitLab Repo</label>
                  <Input
                    placeholder="https://github.com/myteam/hackathon"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    className="h-10 mt-1 text-xs"
                  />
                </div>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || !projectTitle.trim() || !abstract.trim()}
              className="h-11 px-6 font-semibold shadow-sm"
            >
              {isSubmitting ? 'Uploading & Submitting...' : 'Submit Hackathon Project'}
            </Button>
          </form>
        </div>
      )}
    </Card>
  );
};
