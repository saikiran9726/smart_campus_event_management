import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  ArrowLeft,
  BarChart3,
  Download,
  Users,
  Clock,
  QrCode,
  Utensils,
  Star,
  DollarSign,
  TrendingUp,
  FileCheck2,
  Calendar,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/components/ui/toast';
import { useActiveClub } from './ActiveClubContext';
import { ClubSwitcher } from './ClubSwitcher';
import { ZeroClubsEmptyState } from './ZeroClubsEmptyState';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface AnalyticsData {
  eventId: string;
  funnel: {
    registered: number;
    confirmed: number;
    checkedIn: number;
    noShow: number;
    waitlisted: number;
    cancellations: number;
    conversionRate: number;
  };
  arrivalCurve: Array<{
    bucket: string;
    count: number;
  }>;
  scanStats: {
    green: number;
    red: number;
    yellow: number;
    duplicateAttempts: number;
  };
  redemptions: {
    mealsCount: number;
    mealsPct: number;
    kitsCount: number;
    kitsPct: number;
  };
  demographics: Array<{
    group: string;
    count: number | null; // null if suppressed (< 3)
    displayLabel: string;
  }>;
  reviews: {
    average: number;
    count: number;
    histogram: Record<number, number>;
  };
  sandboxRevenue: {
    totalCollectedPaise: number;
    netPaise: number;
  };
  clubTrends?: Array<{
    eventTitle: string;
    registered: number;
    checkedIn: number;
    rating: number;
  }>;
}

const DONUT_COLORS = ['#10B981', '#F43F5E', '#F59E0B']; // Green, Red, Yellow

export const AnalyticsPage: React.FC = () => {
  const { eventId } = useParams<{ eventId?: string }>();
  const navigate = useNavigate();
  const { activeClubId, clubs, isLoading: isLoadingClubs } = useActiveClub();
  const clubId = activeClubId;

  // Export State
  const [exportFormat, setExportFormat] = useState<'pdf' | 'csv' | 'xlsx'>('pdf');
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);

  // 1. Fetch Event Analytics
  const {
    data: analytics,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<AnalyticsData>({
    queryKey: ['events', eventId, 'analytics'],
    queryFn: async () => {
      return await api.get<AnalyticsData>(`/events/${eventId}/analytics`);
    },
    enabled: !!eventId && !!clubId,
  });

  // Handle NAAC / NBA Export
  const handleExportNaac = async () => {
    if (!clubId) {
      toast.error('No active club selected.');
      return;
    }
    setIsExporting(true);
    setExportProgress(20);

    const params = new URLSearchParams();
    params.set('format', exportFormat);
    if (exportFrom) params.set('from', exportFrom);
    if (exportTo) params.set('to', exportTo);

    const exportUrl = `/clubs/${clubId}/reports/naac?${params.toString()}`;

    try {
      setExportProgress(60);
      await new Promise((r) => setTimeout(r, 600));
      setExportProgress(100);

      window.open(exportUrl, '_blank');
      toast.success(`Accreditation report download initiated (${exportFormat.toUpperCase()})`);
    } catch {
      toast.error('Failed to trigger export download.');
    } finally {
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(null);
      }, 500);
    }
  };

  if (isLoadingClubs) {
    return (
      <div className="container max-w-6xl py-12 px-4 mx-auto animate-pulse space-y-4">
        <div className="h-8 w-64 bg-muted rounded" />
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    );
  }

  if (!clubId) {
    return (
      <div className="container max-w-6xl py-8 px-4 mx-auto">
        <ZeroClubsEmptyState />
      </div>
    );
  }

  if (!eventId) {
    return (
      <div className="container max-w-6xl py-12 px-4 mx-auto space-y-4">
        <div className="flex items-center gap-3 border-b border-border/60 pb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate('/organizer')} className="h-8 w-8 p-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Event Analytics</h1>
            <p className="text-sm text-muted-foreground">Select an event from the organizer dashboard to inspect analytics.</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container max-w-6xl py-12 px-4 mx-auto animate-pulse space-y-4">
        <div className="h-8 w-64 bg-muted rounded" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="h-24 bg-muted rounded-xl" />
          <div className="h-24 bg-muted rounded-xl" />
          <div className="h-24 bg-muted rounded-xl" />
          <div className="h-24 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError || !analytics) {
    return (
      <div className="container max-w-6xl py-12 px-4 mx-auto space-y-4">
        <div className="flex items-center gap-3 border-b border-border/60 pb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate('/organizer')} className="h-8 w-8 p-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Event Analytics</h1>
          </div>
        </div>
        <div className="p-6 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            <h2 className="font-semibold">Unable to load event analytics</h2>
          </div>
          <p className="text-sm">{(error as any)?.message || 'An error occurred while loading analytics.'}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Demographics chart data (with privacy suppression rendered safely)
  let rawDemoList: Array<{ group: string; count: number | null; displayLabel: string }> = [];
  if (Array.isArray(analytics.demographics)) {
    rawDemoList = analytics.demographics;
  } else if ((analytics.demographics as any)?.buckets) {
    rawDemoList = (analytics.demographics as any).buckets.map((b: any) => ({
      group: `${b.department}${b.year ? ` (Yr ${b.year})` : ''}`,
      count: b.count,
      displayLabel: String(b.count),
    }));
    if ((analytics.demographics as any).suppressedCount > 0) {
      rawDemoList.push({
        group: 'Other Cohorts',
        count: null,
        displayLabel: 'Fewer than 3',
      });
    }
  }

  const demographicsChartData = rawDemoList.map((d) => ({
    name: d.group,
    count: d.count ?? 2, // clamp visually for suppression bucket
    displayLabel: d.displayLabel,
    isSuppressed: d.count === null,
  }));

  // Funnel Data
  const funnelData = [
    { stage: 'Registered', count: analytics.funnel.registered },
    { stage: 'Confirmed', count: analytics.funnel.confirmed },
    { stage: 'Checked In', count: analytics.funnel.checkedIn },
    { stage: 'No Show', count: analytics.funnel.noShow },
  ];

  // Review Histogram Data
  const reviewData = [5, 4, 3, 2, 1].map((stars) => ({
    stars: `${stars} ★`,
    count: analytics.reviews.histogram[stars] ?? 0,
  }));

  return (
    <div className="container max-w-6xl py-8 px-4 sm:px-8 mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div className="flex items-center gap-3">
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
              <BarChart3 className="h-7 w-7 text-indigo-600" />
              Post-Mortem Analytics & NAAC Audit
            </h1>
            <p className="text-sm text-muted-foreground">
              Conversion funnels, arrival peak histograms, privacy-suppressed demographics, and official accreditation report exports.
            </p>
          </div>
        </div>

        {/* NAAC/NBA Export Action */}
        <div className="flex items-center gap-2 flex-wrap">
          <ClubSwitcher />
          <Select
            value={exportFormat}
            onValueChange={(val: any) => setExportFormat(val)}
          >
            <SelectTrigger className="w-28 text-xs h-9" data-testid="select-export-format">
              <SelectValue placeholder="Format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pdf">PDF Report</SelectItem>
              <SelectItem value="csv">CSV Ledger</SelectItem>
              <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
            </SelectContent>
          </Select>

          <Button
            onClick={handleExportNaac}
            disabled={isExporting}
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm h-9 text-xs"
            data-testid="btn-naac-export"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{isExporting ? 'Generating...' : 'Export Accreditation Report'}</span>
          </Button>
        </div>
      </div>

      {exportProgress !== null && (
        <div className="space-y-1">
          <Progress value={exportProgress} className="h-1.5" />
          <p className="text-[10px] text-muted-foreground tnum text-right">
            Building report: {exportProgress}%
          </p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-border p-5 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Conversion</span>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-3xl font-extrabold tracking-tight tnum">
            {analytics.funnel.conversionRate}%
          </p>
          <p className="text-[11px] text-muted-foreground">Registered to checked in</p>
        </Card>

        <Card className="border-border p-5 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Arrivals</span>
            <Users className="h-4 w-4 text-indigo-500" />
          </div>
          <p className="text-3xl font-extrabold tracking-tight tnum">
            {analytics.funnel.checkedIn}
          </p>
          <p className="text-[11px] text-muted-foreground">Total verified check-ins</p>
        </Card>

        <Card className="border-border p-5 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Average Rating</span>
            <Star className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-3xl font-extrabold tracking-tight tnum">
            {analytics.reviews.average} ★
          </p>
          <p className="text-[11px] text-muted-foreground">{analytics.reviews.count} verified reviews</p>
        </Card>

        <Card className="border-border p-5 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Sandbox Revenue</span>
            <DollarSign className="h-4 w-4 text-violet-500" />
          </div>
          <p className="text-3xl font-extrabold tracking-tight tnum">
            ₹{(analytics.sandboxRevenue.netPaise / 100).toLocaleString()}
          </p>
          <p className="text-[11px] text-muted-foreground">Mock sandbox test payments</p>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Funnel Bar Chart */}
        <Card className="border-border p-5">
          <CardHeader className="p-0 pb-4">
            <CardTitle className="text-sm font-bold">Attendance Funnel</CardTitle>
          </CardHeader>
          <CardContent className="p-0 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} aria-label="Registration to check-in funnel">
                <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#4338CA" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Chart 2: Arrival Peak Line Chart */}
        <Card className="border-border p-5">
          <CardHeader className="p-0 pb-4">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span>Arrival Peak Distribution (5-min Buckets)</span>
              <Badge variant="outline" className="text-[10px]">Peak: 09:10 AM</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.arrivalCurve} aria-label="Gate arrival curve">
                <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#6366F1" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Chart 3: Scan Results Donut */}
        <Card className="border-border p-5">
          <CardHeader className="p-0 pb-4">
            <CardTitle className="text-sm font-bold">Gate Scan Results Distribution</CardTitle>
          </CardHeader>
          <CardContent className="p-0 h-64 flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height="80%">
              <PieChart aria-label="Scan outcome donut chart">
                <Pie
                  data={[
                    { name: 'Green (Valid)', value: analytics.scanStats.green },
                    { name: 'Red (Rejected)', value: analytics.scanStats.red },
                    { name: 'Yellow (Duplicate Attempt)', value: analytics.scanStats.yellow },
                  ]}
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {DONUT_COLORS.map((c, i) => (
                    <Cell key={i} fill={c} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 text-xs pt-1">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Green ({analytics.scanStats.green})</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" /> Red ({analytics.scanStats.red})</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Yellow ({analytics.scanStats.yellow})</span>
            </div>
          </CardContent>
        </Card>

        {/* Chart 4: Privacy-Suppressed Demographics (Fewer than 3 requirement) */}
        <Card className="border-border p-5" data-testid="demographics-card">
          <CardHeader className="p-0 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold">Attendee Department Demographics</CardTitle>
              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                k-anonymity privacy active
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0 space-y-3">
            <p className="text-xs text-muted-foreground">
              To safeguard student anonymity, departments with fewer than 3 attendees are privacy-suppressed.
            </p>
            <div className="space-y-2.5 pt-1 text-xs">
              {demographicsChartData.map((d, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{d.name}</span>
                    <span
                      className={`font-mono ${d.isSuppressed ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-foreground'}`}
                      data-testid={`demographic-value-${i}`}
                    >
                      {d.displayLabel}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      style={{ width: `${d.isSuppressed ? 8 : (d.count / 100) * 100}%` }}
                      className={`h-full rounded-full ${d.isSuppressed ? 'bg-amber-400/60' : 'bg-indigo-600'}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Club Historical Trends Chart */}
      {analytics.clubTrends && analytics.clubTrends.length > 0 && (
        <Card className="border-border p-5">
          <CardHeader className="p-0 pb-4">
            <CardTitle className="text-sm font-bold">Historical Club Event Performance</CardTitle>
          </CardHeader>
          <CardContent className="p-0 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.clubTrends}>
                <XAxis dataKey="eventTitle" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="registered" fill="#818CF8" name="Registered" radius={[3, 3, 0, 0]} />
                <Bar dataKey="checkedIn" fill="#4338CA" name="Checked In" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AnalyticsPage;
