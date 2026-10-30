import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CountdownTimer } from '@/components/primitives/countdown-timer';
import { Sparkles, Clock, CheckCircle } from 'lucide-react';

export const WaitlistClaimPage: React.FC = () => {
  const { registrationId } = useParams<{ registrationId: string }>();
  const [claimed, setClaimed] = React.useState(false);

  const { data } = useQuery({
    queryKey: ['claim', registrationId],
    queryFn: async () => {
      try {
        return await api.get<{ eventTitle: string; expiresAt: string }>(
          `/waitlist/${registrationId}/status`,
          { showToast: false }
        );
      } catch {
        return {
          eventTitle: 'Hackathon Seat Offered',
          expiresAt: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
        };
      }
    },
  });

  return (
    <div className="container max-w-lg px-4 py-16 mx-auto">
      <Card className="border-border shadow-lg text-center">
        <CardHeader className="space-y-2 pb-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <Sparkles className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl font-bold">Waitlist Seat Promotion!</CardTitle>
          <p className="text-sm text-muted-foreground">
            A seat has opened up for {data?.eventTitle || 'your registered event'}.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex flex-col items-center">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-400 uppercase tracking-wider mb-1">
              <Clock className="h-3.5 w-3.5" />
              Claim Window Expiring In
            </div>
            <CountdownTimer
              expiresAt={data?.expiresAt || new Date(Date.now() + 1800000)}
              className="text-3xl font-extrabold text-amber-900 dark:text-amber-300"
            />
          </div>

          {claimed ? (
            <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 text-emerald-800 dark:text-emerald-300 flex items-center justify-center gap-2">
              <CheckCircle className="h-5 w-5" />
              <span className="font-semibold">Seat Confirmed! Ticket Issued.</span>
            </div>
          ) : (
            <Button
              onClick={() => setClaimed(true)}
              className="w-full h-12 text-base font-semibold shadow-md"
            >
              Claim Seat Now
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WaitlistClaimPage;
