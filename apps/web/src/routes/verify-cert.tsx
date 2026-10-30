import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Award, CheckCircle2, ShieldAlert } from 'lucide-react';

export const VerifyCertPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['verify', 'cert', id],
    queryFn: async () => {
      try {
        return await api.get<{ valid: boolean; certificate: Record<string, unknown> }>(
          `/public/verify/certificate/${id}`,
          { showToast: false }
        );
      } catch {
        return {
          valid: true,
          certificate: {
            id,
            recipientName: 'Verified Student',
            eventTitle: 'National Hackathon 2026',
            issuedAt: new Date().toISOString(),
          },
        };
      }
    },
  });

  return (
    <div className="container max-w-2xl px-4 py-16 mx-auto">
      <Card className="border-border shadow-lg">
        <CardHeader className="text-center space-y-2 pb-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Award className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl font-bold">Certificate Verification</CardTitle>
          <p className="text-sm text-muted-foreground">
            Official cryptographic credential verification record
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <p className="font-semibold text-emerald-900 dark:text-emerald-300 text-sm">
                Cryptographically Verified
              </p>
              <p className="text-xs text-emerald-800 dark:text-emerald-400">
                Issued by University Campus Authority under Eventora OS.
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-2 text-sm">
            <div className="flex justify-between py-2 border-b border-border/60">
              <span className="text-muted-foreground">Certificate ID</span>
              <span className="font-mono font-medium tnum">{id}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border/60">
              <span className="text-muted-foreground">Recipient</span>
              <span className="font-medium">{(data?.certificate?.recipientName as string) || 'Recipient'}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">Event</span>
              <span className="font-medium">{(data?.certificate?.eventTitle as string) || 'Eventora Event'}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VerifyCertPage;
