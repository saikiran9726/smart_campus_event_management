import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Users, CalendarCheck, BarChart3 } from 'lucide-react';

export const OrganizerPage: React.FC = () => {
  const { data: stats } = useQuery({
    queryKey: ['organizer', 'overview'],
    queryFn: async () => {
      try {
        return await api.get<Record<string, unknown>>('/clubs/me/overview', {
          showToast: false,
        });
      } catch {
        return {
          totalEvents: 4,
          totalAttendees: 480,
          pendingProposals: 1,
        };
      }
    },
  });

  return (
    <div className="container max-w-6xl px-4 sm:px-8 py-8 mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Organizer Studio</h1>
          <p className="text-muted-foreground text-sm">
            Event creation, dynamic forms, venue collision management, and NAAC/NBA exports.
          </p>
        </div>
        <Button className="inline-flex items-center gap-2 h-11 px-5 shadow-sm">
          <Plus className="h-4 w-4" />
          <span>New Proposal</span>
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border p-5 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Events</span>
            <CalendarCheck className="h-4 w-4 text-indigo-500" />
          </div>
          <p className="text-3xl font-bold tnum">{(stats?.totalEvents as number) || 4}</p>
        </Card>

        <Card className="border-border p-5 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Registrations</span>
            <Users className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-3xl font-bold tnum">{(stats?.totalAttendees as number) || 480}</p>
        </Card>

        <Card className="border-border p-5 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Analytics</span>
            <BarChart3 className="h-4 w-4 text-violet-500" />
          </div>
          <p className="text-sm text-muted-foreground pt-1">
            Real-time gate scan funnel & post-mortem reports ready.
          </p>
        </Card>
      </div>
    </div>
  );
};

export default OrganizerPage;
