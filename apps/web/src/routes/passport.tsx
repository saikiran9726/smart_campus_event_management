import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Ticket, FileCheck, Award, QrCode } from 'lucide-react';
import { StatusBadge } from '@/components/primitives/status-badge';

export const PassportPage: React.FC = () => {
  const { data: registrations, isLoading } = useQuery({
    queryKey: ['me', 'registrations'],
    queryFn: async () => {
      try {
        const res = await api.get<{ registrations: Record<string, unknown>[] }>('/me/registrations', {
          showToast: false,
        });
        return res.registrations || [];
      } catch {
        return [];
      }
    },
  });

  return (
    <div className="container max-w-5xl px-4 sm:px-8 py-8 mx-auto space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight">Event Passport</h1>
        <p className="text-muted-foreground text-sm">
          Your active event passes, gate check-in tickets, On-Duty (OD) records, and credentials.
        </p>
      </div>

      <Tabs defaultValue="tickets" className="space-y-6">
        <TabsList className="grid grid-cols-3 max-w-md h-11">
          <TabsTrigger value="tickets" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Ticket className="h-4 w-4" />
            <span>Passes</span>
          </TabsTrigger>
          <TabsTrigger value="od" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <FileCheck className="h-4 w-4" />
            <span>OD Letters</span>
          </TabsTrigger>
          <TabsTrigger value="certs" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Award className="h-4 w-4" />
            <span>Certificates</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tickets" className="space-y-4">
          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-bold">Smart Campus AI Hackathon</CardTitle>
              <StatusBadge status="CONFIRMED" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-muted/40">
                <div className="space-y-1 text-center sm:text-left">
                  <p className="text-xs text-muted-foreground">Entry Pass Token</p>
                  <p className="font-mono text-sm font-semibold tracking-wider">ev_tok_campus_active_pass</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    Valid for gate entry + meal redemption
                  </p>
                </div>
                <div className="flex items-center justify-center p-3 bg-white rounded-lg shadow-sm">
                  <QrCode className="h-16 w-16 text-slate-900" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="od">
          <Card className="border-border p-6 text-center text-muted-foreground text-sm">
            Check in at an ongoing event to generate verified academic On-Duty (OD) letters.
          </Card>
        </TabsContent>

        <TabsContent value="certs">
          <Card className="border-border p-6 text-center text-muted-foreground text-sm">
            Completed competitions and verified participant awards will appear here.
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PassportPage;
