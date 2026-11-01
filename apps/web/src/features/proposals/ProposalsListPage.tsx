import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Plus,
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Users,
  FileText,
} from 'lucide-react';
import { ProposalStatus } from '@eventora/shared';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ProposalItem {
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

export const ProposalsListPage: React.FC = () => {
  const navigate = useNavigate();

  const { data: proposals, isLoading } = useQuery<ProposalItem[]>({
    queryKey: ['organizer', 'proposals'],
    queryFn: async () => {
      try {
        const res = await api.get<{ items: ProposalItem[] }>('/organizer/proposals');
        return res.items;
      } catch {
        return [];
      }
    },
  });

  const getStatusBadge = (status: ProposalStatus) => {
    switch (status) {
      case ProposalStatus.APPROVED:
        return (
          <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Approved
          </Badge>
        );
      case ProposalStatus.REJECTED:
        return (
          <Badge className="bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800 flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            Rejected
          </Badge>
        );
      case ProposalStatus.PENDING:
      default:
        return (
          <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Pending Review
          </Badge>
        );
    }
  };

  return (
    <div className="container max-w-5xl py-8 px-4 sm:px-8 mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Event Proposals</h1>
          <p className="text-muted-foreground text-sm">
            Track club proposals, faculty endorsements, and venue hold reservations.
          </p>
        </div>
        <Button
          onClick={() => navigate('/organizer/proposals/new')}
          className="gap-2 shadow-sm"
          data-testid="btn-new-proposal"
        >
          <Plus className="h-4 w-4" />
          <span>New Proposal</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 animate-pulse">
          <div className="h-28 bg-muted rounded-xl" />
          <div className="h-28 bg-muted rounded-xl" />
        </div>
      ) : (proposals ?? []).length === 0 ? (
        <Card className="border-dashed p-12 text-center text-muted-foreground space-y-3">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-semibold">No proposals submitted yet</p>
          <p className="text-xs">
            Submit a proposal to request venue dates and audio-visual equipment.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/organizer/proposals/new')}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Create First Proposal
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {(proposals ?? []).map((p) => (
            <Card key={p.id} className="border-border hover:border-border/80 transition-all p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base">{p.title}</h3>
                    {getStatusBadge(p.status)}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
                </div>
                <div className="text-xs text-muted-foreground sm:text-right space-y-1 shrink-0">
                  <p className="flex items-center sm:justify-end gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(p.startAt).toLocaleDateString()}
                  </p>
                  <p className="flex items-center sm:justify-end gap-1 tnum">
                    <Users className="h-3.5 w-3.5" />
                    {p.expectedAttendance} attendees expected
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProposalsListPage;
