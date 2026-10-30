import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GraduationCap,
  Calendar,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { ProposalStatus } from '@eventora/shared';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';

interface FacultyProposalItem {
  id: string;
  clubId: string;
  title: string;
  description: string;
  expectedAttendance: number;
  venueId: string;
  startAt: string;
  endAt: string;
  status: ProposalStatus;
  decidedAt?: string | null;
  decisionNote?: string | null;
  createdAt: string;
}

interface PendingExpenseItem {
  id: string;
  category: string;
  description: string;
  amountPaise: number;
  receiptKey: string;
  facultySignedAt?: string | null;
  createdAt: string;
}

export const FacultyDashboardPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'proposals' | 'budget'>('proposals');

  // Fetch pending proposals
  const { data: proposals, isLoading: isLoadingProposals } = useQuery<FacultyProposalItem[]>({
    queryKey: ['faculty', 'proposals'],
    queryFn: async () => {
      try {
        const res = await api.get<{ items: FacultyProposalItem[] }>('/faculty/proposals');
        return res.items;
      } catch {
        return [];
      }
    },
  });

  // Fetch pending budget expenses
  const { data: expenses, isLoading: isLoadingExpenses } = useQuery<PendingExpenseItem[]>({
    queryKey: ['faculty', 'budget-signoffs'],
    queryFn: async () => {
      try {
        const res = await api.get<{ items: PendingExpenseItem[] }>('/faculty/pending-expenses');
        return res.items;
      } catch {
        return [];
      }
    },
  });

  // Decision mutation for proposal
  const proposalDecisionMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' }) => {
      return await api.post(`/faculty/proposals/${id}/decision`, {
        status,
      });
    },
    onSuccess: () => {
      toast.success('Proposal status updated.');
      queryClient.invalidateQueries({ queryKey: ['faculty', 'proposals'] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to update proposal status.');
    },
  });

  // Expense sign-off mutation
  const signOffMutation = useMutation({
    mutationFn: async (id: string) => {
      return await api.post(`/expenses/${id}/sign-off`, {});
    },
    onSuccess: () => {
      toast.success('Expense sign-off recorded.');
      queryClient.invalidateQueries({ queryKey: ['faculty', 'budget-signoffs'] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to sign off on expense.');
    },
  });

  const pendingProposals = (proposals ?? []).filter(
    (p) => p.status === ProposalStatus.PENDING
  );

  return (
    <div className="container max-w-5xl py-8 px-4 sm:px-8 mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-indigo-600" />
            <h1 className="text-3xl font-extrabold tracking-tight">Faculty Dashboard</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Event proposal endorsements, budget sign-off queue, and compliance governance.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-4">
        <TabsList className="grid w-full sm:w-80 grid-cols-2">
          <TabsTrigger value="proposals" className="text-xs">
            Proposals ({pendingProposals.length})
          </TabsTrigger>
          <TabsTrigger value="budget" className="text-xs">
            Budget Queue ({(expenses ?? []).length})
          </TabsTrigger>
        </TabsList>

        {/* Proposals Tab */}
        <TabsContent value="proposals" className="space-y-4">
          {isLoadingProposals ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-24 bg-muted rounded-xl" />
              <div className="h-24 bg-muted rounded-xl" />
            </div>
          ) : pendingProposals.length === 0 ? (
            <Card className="border-dashed p-12 text-center text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500 mb-2" />
              <p className="text-sm font-semibold">All proposals reviewed</p>
              <p className="text-xs">No pending student event proposals require your endorsement right now.</p>
            </Card>
          ) : (
            pendingProposals.map((p) => (
              <Card key={p.id} className="border-border p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base">{p.title}</h3>
                      <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300 text-[11px]">
                        Pending
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 tnum">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(p.startAt).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {p.expectedAttendance} attendees
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        proposalDecisionMutation.mutate({ id: p.id, status: 'REJECTED' })
                      }
                      disabled={proposalDecisionMutation.isPending}
                      className="border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 text-xs"
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        proposalDecisionMutation.mutate({ id: p.id, status: 'APPROVED' })
                      }
                      disabled={proposalDecisionMutation.isPending}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                    >
                      Approve
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Budget Queue Tab */}
        <TabsContent value="budget" className="space-y-4">
          {isLoadingExpenses ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-20 bg-muted rounded-xl" />
            </div>
          ) : (expenses ?? []).length === 0 ? (
            <Card className="border-dashed p-12 text-center text-muted-foreground">
              <DollarSign className="h-10 w-10 mx-auto text-emerald-500 mb-2" />
              <p className="text-sm font-semibold">Budget sign-off queue empty</p>
              <p className="text-xs">No pending reimbursement or expense claims require endorsement.</p>
            </Card>
          ) : (
            (expenses ?? []).map((exp) => (
              <Card key={exp.id} className="border-border p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{exp.description}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {exp.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Amount: <strong className="tnum">₹{(exp.amountPaise / 100).toFixed(2)}</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => signOffMutation.mutate(exp.id)}
                      disabled={signOffMutation.isPending}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Sign Off
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FacultyDashboardPage;
