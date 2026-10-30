import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, GraduationCap } from 'lucide-react';

export const FacultyDecisionPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const action = searchParams.get('action');

  const { data, isSuccess, isError } = useQuery({
    queryKey: ['faculty', 'decision', token, action],
    queryFn: async () => {
      if (!token) return { success: false, message: 'Missing decision token' };
      return await api.get<{ success: boolean; message: string }>(
        `/faculty/decision?token=${encodeURIComponent(token)}&action=${action || 'approve'}`
      );
    },
    enabled: !!token,
  });

  return (
    <div className="container max-w-xl px-4 py-16 mx-auto">
      <Card className="border-border shadow-lg text-center">
        <CardHeader className="space-y-2 pb-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <GraduationCap className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl font-bold">Faculty Event Endorsement</CardTitle>
          <p className="text-sm text-muted-foreground">
            Official approval decision portal for campus event proposals
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          {action === 'reject' ? (
            <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 flex items-center gap-3 text-left">
              <XCircle className="h-6 w-6 text-rose-600 dark:text-rose-400 shrink-0" />
              <div>
                <p className="font-semibold text-rose-900 dark:text-rose-300 text-sm">
                  Proposal Rejected
                </p>
                <p className="text-xs text-rose-800 dark:text-rose-400">
                  The event proposal has been declined with notes returned to the club organizers.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-3 text-left">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <p className="font-semibold text-emerald-900 dark:text-emerald-300 text-sm">
                  Proposal Endorsed & Approved
                </p>
                <p className="text-xs text-emerald-800 dark:text-emerald-400">
                  Venue and audio-visual reservations locked. The club may now publish this event.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FacultyDecisionPage;
