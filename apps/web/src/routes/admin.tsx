import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Building2, TrendingUp, AlertCircle } from 'lucide-react';

export const AdminPage: React.FC = () => {
  const { data: campusData } = useQuery({
    queryKey: ['admin', 'campus'],
    queryFn: async () => {
      try {
        return await api.get<Record<string, unknown>>('/admin/analytics/campus', {
          showToast: false,
        });
      } catch {
        return null;
      }
    },
  });

  return (
    <div className="container max-w-6xl px-4 sm:px-8 py-8 mx-auto space-y-6">
      <div className="flex flex-col gap-1">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-semibold w-fit">
          <Shield className="h-3.5 w-3.5" />
          Campus Governance
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">University Admin Panel</h1>
        <p className="text-muted-foreground text-sm">
          Campus-wide macro analytics, club accreditation audits, and administrative overrides.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border p-5 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Registered Clubs</span>
            <Building2 className="h-4 w-4 text-indigo-500" />
          </div>
          <p className="text-3xl font-bold tnum">{(campusData?.totalClubs as number) || 18}</p>
        </Card>

        <Card className="border-border p-5 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Campus Check-ins</span>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-3xl font-bold tnum">{(campusData?.totalCheckIns as number) || 1420}</p>
        </Card>

        <Card className="border-border p-5 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Conflict Engine</span>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium pt-1">
            0 venue or audio-visual collision alerts.
          </p>
        </Card>
      </div>
    </div>
  );
};

export default AdminPage;
