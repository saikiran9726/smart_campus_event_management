import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Trophy,
  Users,
  Lock,
  Unlock,
  ExternalLink,
  Code2,
  FileText,
  CheckCircle2,
  Medal,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';

interface TeamMember {
  id: string;
  userId: string;
  role: string;
  fullName: string;
  email: string;
  rollNumber?: string;
  department?: string;
}

interface TeamItem {
  id: string;
  name: string;
  code: string;
  status: string;
  lockedAt?: string | null;
  members: TeamMember[];
  snapshot?: Array<{
    userId: string;
    fullName: string;
    rollNumber: string;
    role: string;
  }> | null;
}

interface SubmissionItem {
  teamId: string;
  teamName: string;
  projectTitle: string;
  abstract: string;
  repoUrl: string;
  demoUrl?: string | null;
  deckKey?: string | null;
  submittedAt: string;
}

export const TeamsPanel: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Snapshot modal state
  const [selectedSnapshotTeam, setSelectedSnapshotTeam] = useState<TeamItem | null>(null);

  // Winners selection state: ranks 1, 2, 3 teamIds
  const [rank1TeamId, setRank1TeamId] = useState<string>('');
  const [rank2TeamId, setRank2TeamId] = useState<string>('');
  const [rank3TeamId, setRank3TeamId] = useState<string>('');
  const [isConfirmWinnersOpen, setIsConfirmWinnersOpen] = useState(false);

  // 1. Fetch Teams
  const { data: teamsData, isLoading: isLoadingTeams } = useQuery<{ teams: TeamItem[] }>({
    queryKey: ['events', eventId, 'teams'],
    queryFn: async () => {
      try {
        const res = await api.get<{ teams: TeamItem[] }>(`/events/${eventId}/teams`);
        return res;
      } catch {
        return { teams: [] };
      }
    },
    enabled: !!eventId,
  });

  // 2. Fetch Submissions
  const { data: submissionsData } = useQuery<{ submissions: SubmissionItem[] }>({
    queryKey: ['events', eventId, 'submissions'],
    queryFn: async () => {
      try {
        const res = await api.get<{ submissions: SubmissionItem[] }>(`/events/${eventId}/submissions`);
        return res;
      } catch {
        return { submissions: [] };
      }
    },
    enabled: !!eventId,
  });

  // Publish Winners Mutation
  const publishWinnersMutation = useMutation({
    mutationFn: async () => {
      const placements = [
        { rank: 1 as const, teamId: rank1TeamId },
        { rank: 2 as const, teamId: rank2TeamId },
        { rank: 3 as const, teamId: rank3TeamId },
      ].filter((p) => !!p.teamId);

      if (placements.length === 0) {
        throw new Error('Select at least Rank 1 winner.');
      }

      return await api.post(`/events/${eventId}/winners`, {
        placements,
      });
    },
    onSuccess: () => {
      toast.success('Winners podium published to the public showcase!');
      setIsConfirmWinnersOpen(false);
      queryClient.invalidateQueries({ queryKey: ['events', eventId] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to publish winners podium.');
    },
  });

  const teams = teamsData?.teams ?? [];
  const submissions = submissionsData?.submissions ?? [];

  return (
    <div className="container max-w-6xl py-8 px-4 sm:px-8 mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center gap-3 border-b border-border/60 pb-6">
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
            <Trophy className="h-7 w-7 text-indigo-600" />
            Hackathon Teams, Submissions & Judging
          </h1>
          <p className="text-sm text-muted-foreground">
            Monitor competition rosters, inspect code repositories, and crown podium winners.
          </p>
        </div>
      </div>

      {/* Winners Podium Assignment Section */}
      <Card className="border-indigo-200 dark:border-indigo-900/60 bg-indigo-500/[0.02]">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Medal className="h-5 w-5 text-indigo-600" />
            Podium Winners Selection (Ranks 1 to 3)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Assign podium awards to teams. Publishing updates the public winners showcase and unlocks certificate generation.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Rank 1 */}
            <div className="space-y-1.5 p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-500/5">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white font-bold text-xs">
                  1
                </span>
                <span className="font-semibold text-xs uppercase tracking-wider text-amber-800 dark:text-amber-400">
                  Gold (1st Place)
                </span>
              </div>
              <Select value={rank1TeamId} onValueChange={setRank1TeamId}>
                <SelectTrigger className="text-xs" data-testid="select-rank-1">
                  <SelectValue placeholder="Select winning team..." />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.members.length} members)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Rank 2 */}
            <div className="space-y-1.5 p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-500/5">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-400 text-white font-bold text-xs">
                  2
                </span>
                <span className="font-semibold text-xs uppercase tracking-wider text-slate-800 dark:text-slate-400">
                  Silver (2nd Place)
                </span>
              </div>
              <Select value={rank2TeamId} onValueChange={setRank2TeamId}>
                <SelectTrigger className="text-xs" data-testid="select-rank-2">
                  <SelectValue placeholder="Select 2nd place team..." />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Rank 3 */}
            <div className="space-y-1.5 p-3.5 rounded-xl border border-amber-600/30 dark:border-amber-900 bg-amber-700/5">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-700 text-white font-bold text-xs">
                  3
                </span>
                <span className="font-semibold text-xs uppercase tracking-wider text-amber-900 dark:text-amber-500">
                  Bronze (3rd Place)
                </span>
              </div>
              <Select value={rank3TeamId} onValueChange={setRank3TeamId}>
                <SelectTrigger className="text-xs" data-testid="select-rank-3">
                  <SelectValue placeholder="Select 3rd place team..." />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button
            onClick={() => {
              if (!rank1TeamId) {
                toast.error('Select at least 1st place winner.');
                return;
              }
              setIsConfirmWinnersOpen(true);
            }}
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
            data-testid="btn-publish-podium"
          >
            <Sparkles className="h-4 w-4" />
            <span>Publish Winners Podium</span>
          </Button>
        </CardFooter>
      </Card>

      {/* Teams Roster Table */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-500" />
            Teams Roster ({teams.length} teams)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingTeams ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-16 bg-muted rounded-xl" />
              <div className="h-16 bg-muted rounded-xl" />
            </div>
          ) : teams.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No teams registered yet.</p>
          ) : (
            <div className="divide-y divide-border/60">
              {teams.map((t) => (
                <div key={t.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-sm">{t.name}</h4>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        Code: {t.code}
                      </Badge>
                      {t.status === 'LOCKED' ? (
                        <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300 text-[10px] flex items-center gap-1">
                          <Lock className="h-3 w-3" />
                          Roster Locked
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] flex items-center gap-1">
                          <Unlock className="h-3 w-3" />
                          Forming
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground">
                      Members ({t.members.length}):{' '}
                      {t.members.map((m) => `${m.fullName} (${m.role})`).join(', ')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {t.snapshot && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedSnapshotTeam(t)}
                        className="h-8 text-xs gap-1.5"
                        data-testid={`btn-view-snapshot-${t.id}`}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        View Snapshot
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submissions List */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Code2 className="h-4 w-4 text-indigo-500" />
            Project Deliverables & Repository Submissions ({submissions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {submissions.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No project submissions turned in yet.</p>
          ) : (
            submissions.map((sub, i) => (
              <div key={i} className="p-4 rounded-xl border border-border bg-card space-y-2 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <h4 className="font-bold text-sm">{sub.projectTitle}</h4>
                    <p className="text-muted-foreground font-medium">Team: {sub.teamName}</p>
                  </div>
                  <Badge variant="secondary" className="tnum text-[10px]">
                    Submitted {new Date(sub.submittedAt).toLocaleTimeString()}
                  </Badge>
                </div>

                <p className="text-muted-foreground">{sub.abstract}</p>

                <div className="flex items-center gap-4 pt-1">
                  <a
                    href={sub.repoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    Source Repository
                    <ExternalLink className="h-3 w-3" />
                  </a>

                  {sub.demoUrl && (
                    <a
                      href={sub.demoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Live Demo
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Roster Snapshot Viewer Modal */}
      <Dialog
        open={!!selectedSnapshotTeam}
        onOpenChange={() => setSelectedSnapshotTeam(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-600" />
              Locked Roster Snapshot
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Team: {selectedSnapshotTeam?.name} (Locked: {selectedSnapshotTeam?.lockedAt ? new Date(selectedSnapshotTeam.lockedAt).toLocaleString() : 'Yes'})
            </p>
          </DialogHeader>

          <div className="space-y-2 py-2 text-xs divide-y divide-border/60">
            {(selectedSnapshotTeam?.snapshot ?? []).map((m, idx) => (
              <div key={idx} className="pt-2 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{m.fullName}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">{m.rollNumber}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {m.role}
                </Badge>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button size="sm" onClick={() => setSelectedSnapshotTeam(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Winners Publish Dialog */}
      <Dialog open={isConfirmWinnersOpen} onOpenChange={setIsConfirmWinnersOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-600">
              <Trophy className="h-5 w-5" />
              Confirm Winners Announcement
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Are you sure you want to publish the winners podium? This will permanently stamp placement rankings and make results publicly visible to campus attendees.
          </p>
          <DialogFooter className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsConfirmWinnersOpen(false)}
              disabled={publishWinnersMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => publishWinnersMutation.mutate()}
              disabled={publishWinnersMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              data-testid="btn-confirm-publish-winners"
            >
              {publishWinnersMutation.isPending ? 'Publishing...' : 'Yes, Publish Podium'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamsPanel;
