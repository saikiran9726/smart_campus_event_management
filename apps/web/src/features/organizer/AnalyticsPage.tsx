import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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
  AlertTriangle,
  RotateCcw,
  Building2,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/components/ui/use-toast';
import { ErrorBoundary } from '@/components/primitives/error-boundary';
import { useActiveClub } from './ActiveClubContext';
import { ClubSwitcher } from './ClubSwitcher';
import { ZeroClubsEmptyState } from './ZeroClubsEmptyState';

export interface EventAnalyticsData {
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  funnel: {
    registered: number;
    checkedIn: number;
    conversionRate: number;
    noShowCount?: number;
    waitlisted?: number;
    promotionsClaimed?: number;
    promotionsExpired?: number;
    cancellations?: number;
  };
  arrivalCurve: {
    buckets: Array<{ bucket: string; count: number }>;
    peakBucket?: { bucket: string; count: number } | null;
  } | Array<{ bucket: string; count: number }>;
  scanStats: {
    green: number;
    red: number;
    yellow: number;
    duplicateAttempts: number;
  };
  redemptions?: {
    meals: number;
    kits: number;
    mealsPercentage: number;
    kitsPercentage: number;
  };
  demographics?: {
    buckets: Array<{ department: string; year?: number; count: number }>;
    suppressedCount: number;
  } | Array<{ group: string; count: number | null; displayLabel: string }>;
  reviews: {
    average: number;
    count: number;
    histogram: Record<number, number>;
  };
  revenueSandbox?: {
    grossPaise: number;
    refundsPaise: number;
    netPaise: number;
    isSandbox?: boolean;
  };
  clubTrends?: Array<{
    eventTitle: string;
    registered: number;
    checkedIn: number;
    rating: number;
  }>;
}

export interface ClubNaacAnalyticsData {
  club: {
    id: string;
    name: string;
    slug: string;
  };
  academicYear: string;
  eventsCount: number;
  totalRegistered: number;
  totalAttended: number;
  overallAttendanceRate: number;
  ratings: {
    averageEventRating: number;
    averageClubRating: number;
    reviewCount: number;
  };
  demographics: {
    buckets: Array<{ department: string; count: number | null; displayLabel: string }>;
    suppressedCount: number;
  };
  events: Array<{
    id: string;
    title: string;
    slug: string;
    category: string;
    date: string | null;
    registered: number;
    attended: number;
    attendanceRate: number;
    eventRating: number;
    clubRating: number;
  }>;
}

const DONUT_COLORS = ['#0f766e', '#dc2626', '#d97706']; // Green, Red, Yellow

export const AnalyticsPage: React.FC = () => {
  const { eventId } = useParams<{ eventId?: string }>();
  const navigate = useNavigate();
  const { activeClubId, clubs, setActiveClubId, isLoading: isLoadingClubs } = useActiveClub();
  const [selectedClubId, setSelectedClubId] = useState<string>(activeClubId || '');

  // Synchronize selectedClubId with activeClubId if initialized later
  useEffect(() => {
    if (!selectedClubId && activeClubId) {
      setSelectedClubId(activeClubId);
    }
  }, [activeClubId, selectedClubId]);

  const clubId = selectedClubId || activeClubId;

  // Academic Year State for Club-Wide View
  const [academicYear, setAcademicYear] = useState<string>('ALL');

  // Accreditation Export State
  const [exportFormat, setExportFormat] = useState<'pdf' | 'csv' | 'xlsx'>('pdf');
  const [exportFrom, setExportFrom] = useState<string>('');
  const [exportTo, setExportTo] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);

  // 1. Single Event Post-Mortem Query
  const {
    data: analytics,
    isLoading: isEventLoading,
    isError: isEventError,
    error: eventError,
    refetch: refetchEvent,
  } = useQuery<EventAnalyticsData>({
    queryKey: ['events', eventId, 'analytics'],
    queryFn: async () => {
      return await api.get<EventAnalyticsData>(`/events/${eventId}/analytics`);
    },
    enabled: Boolean(eventId && clubId),
  });

  // 2. Club-Wide NAAC Analytics Query
  const {
    data: clubNaac,
    isLoading: isClubLoading,
    isError: isClubError,
    error: clubError,
    refetch: refetchClub,
  } = useQuery<ClubNaacAnalyticsData>({
    queryKey: ['clubs', clubId, 'analytics', 'naac', academicYear],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (academicYear !== 'ALL') params.set('academicYear', academicYear);
      return await api.get<ClubNaacAnalyticsData>(
        `/clubs/${clubId}/analytics/naac?${params.toString()}`
      );
    },
    enabled: Boolean(!eventId && clubId),
  });

  // Authenticated NAAC / NBA Export using api.getBlob
  const handleExportNaac = async () => {
    if (!clubId) {
      toast.error('No active club selected.');
      return;
    }
    setIsExporting(true);
    setExportProgress(30);

    const params = new URLSearchParams();
    params.set('format', exportFormat);
    if (exportFrom) params.set('from', exportFrom);
    if (exportTo) params.set('to', exportTo);

    const exportUrl = `/clubs/${clubId}/reports/naac?${params.toString()}`;

    try {
      setExportProgress(70);
      const blob = await api.getBlob(exportUrl);
      setExportProgress(100);

      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `naac-report-${clubId}-${exportFormat}-${dateStr}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);

      toast.success(
        'Accreditation report downloaded',
        `Official NAAC report exported as ${exportFormat.toUpperCase()}.`
      );
    } catch (err: any) {
      toast.error(
        'Export download failed',
        err?.message || 'Could not download accreditation report.'
      );
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

  // ==========================================
  // VIEW A: CLUB-WIDE NAAC DASHBOARD (!eventId)
  // ==========================================
  if (!eventId) {
    return (
      <ErrorBoundary>
        <div className="container max-w-6xl py-8 px-4 sm:px-8 mx-auto space-y-6" data-testid="club-naac-dashboard">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/organizer')}
                className="h-8 w-8 p-0"
                aria-label="Back to organizer dashboard"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
                  <ShieldCheck className="h-7 w-7 text-teal-600 dark:text-teal-400" />
                  Club NAAC Accreditation & Analytics
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Academic year audit metrics, cohort privacy-suppressed distributions, and verified institutional reports.
                </p>
              </div>
            </div>

            {/* Club Filter & Academic Year Filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={clubId}
                onValueChange={(val) => {
                  setSelectedClubId(val);
                  if (setActiveClubId) setActiveClubId(val);
                }}
              >
                <SelectTrigger className="w-48 text-xs h-9 bg-background" data-testid="select-club-filter">
                  <SelectValue placeholder={clubs.length === 0 ? 'No clubs joined' : 'Filter by Club'} />
                </SelectTrigger>
                <SelectContent>
                  {clubs.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={academicYear} onValueChange={setAcademicYear}>
                <SelectTrigger className="w-32 text-xs h-9 bg-background" data-testid="select-academic-year">
                  <SelectValue placeholder="Academic Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Academic Years</SelectItem>
                  <SelectItem value="2026-27">2026-27</SelectItem>
                  <SelectItem value="2025-26">2025-26</SelectItem>
                  <SelectItem value="2024-25">2024-25</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isClubLoading ? (
            <div className="py-12 space-y-4 animate-pulse">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="h-24 bg-muted rounded-xl" />
                <div className="h-24 bg-muted rounded-xl" />
                <div className="h-24 bg-muted rounded-xl" />
                <div className="h-24 bg-muted rounded-xl" />
              </div>
              <div className="h-64 bg-muted rounded-xl" />
            </div>
          ) : isClubError ? (
            <Card className="p-8 text-center border-destructive/40 space-y-3">
              <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
              <p className="text-sm font-semibold text-foreground">
                Failed to load club NAAC analytics
              </p>
              <p className="text-xs text-muted-foreground">
                {(clubError as any)?.message || 'An error occurred while fetching accreditation records.'}
              </p>
              <Button size="sm" variant="outline" onClick={() => refetchClub()} className="gap-1.5 text-xs">
                <RotateCcw className="h-3.5 w-3.5" />
                Try Again
              </Button>
            </Card>
          ) : (
            <>
              {/* NAAC KPI Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card className="border-border p-4 sm:p-5 space-y-1">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[11px] font-semibold uppercase tracking-wider">Events Organised</span>
                    <Calendar className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  <p className="text-2xl sm:text-3xl font-extrabold tracking-tight tnum" data-testid="metric-events-count">
                    {clubNaac?.eventsCount ?? 0}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {academicYear === 'ALL' ? 'Total all-time events' : `Academic Year ${academicYear}`}
                  </p>
                </Card>

                <Card className="border-border p-4 sm:p-5 space-y-1">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[11px] font-semibold uppercase tracking-wider">Total Registered</span>
                    <Users className="h-4 w-4 text-indigo-500" />
                  </div>
                  <p className="text-2xl sm:text-3xl font-extrabold tracking-tight tnum" data-testid="metric-total-registered">
                    {clubNaac?.totalRegistered ?? 0}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Student registrations</p>
                </Card>

                <Card className="border-border p-4 sm:p-5 space-y-1">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[11px] font-semibold uppercase tracking-wider">Attendance Rate</span>
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  </div>
                  <p className="text-2xl sm:text-3xl font-extrabold tracking-tight tnum" data-testid="metric-attendance-rate">
                    {clubNaac?.overallAttendanceRate ?? 0}%
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {clubNaac?.totalAttended ?? 0} verified check-ins
                  </p>
                </Card>

                <Card className="border-border p-4 sm:p-5 space-y-1">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[11px] font-semibold uppercase tracking-wider">Feedback Scores</span>
                    <Star className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl sm:text-3xl font-extrabold tracking-tight tnum text-foreground">
                      ★ {clubNaac?.ratings.averageEventRating ?? 0}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      (Club ★ {clubNaac?.ratings.averageClubRating ?? 0})
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {clubNaac?.ratings.reviewCount ?? 0} attendee evaluations
                  </p>
                </Card>
              </div>

              {/* Department Participation & Suppression Chart */}
              <Card className="border-border p-5">
                <CardHeader className="p-0 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-teal-600" />
                        <span>Department-Wise Participation (NAAC Criterion 5)</span>
                      </CardTitle>
                      <CardDescription className="text-xs text-muted-foreground mt-0.5">
                        Cohorts with fewer than 3 participants are aggregated into &quot;Other Cohorts&quot; for student privacy compliance.
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 self-start sm:self-auto">
                      k-anonymity privacy active
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0 pt-2">
                  <div className="space-y-3">
                    {(clubNaac?.demographics.buckets || []).map((b, i) => {
                      const isSuppressed = b.count === null;
                      const maxCount = Math.max(
                        ...((clubNaac?.demographics.buckets || []).map((x) => x.count || 2)),
                        1
                      );
                      const displayPct = isSuppressed
                        ? 10
                        : Math.min(100, Math.round(((b.count || 0) / maxCount) * 100));

                      return (
                        <div key={i} className="space-y-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">{b.department}</span>
                            <span
                              className={`font-mono ${
                                isSuppressed ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-foreground'
                              }`}
                            >
                              {b.displayLabel}
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              style={{ width: `${displayPct}%` }}
                              className={`h-full rounded-full ${
                                isSuppressed ? 'bg-amber-400/70' : 'bg-teal-600'
                              }`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Events Audit Table */}
              <Card className="border-border">
                <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
                  <div>
                    <CardTitle className="text-sm font-bold">Academic Year Event Ledger</CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Individual post-mortem records and verified attendance totals.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {(clubNaac?.events || []).length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      No events recorded for this organization in the selected academic window.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-muted/50 border-y border-border text-muted-foreground font-semibold">
                          <tr>
                            <th className="p-3">Event Title</th>
                            <th className="p-3">Date</th>
                            <th className="p-3">Category</th>
                            <th className="p-3">Registrations</th>
                            <th className="p-3">Attended</th>
                            <th className="p-3">Attendance Rate</th>
                            <th className="p-3">Feedback</th>
                            <th className="p-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {(clubNaac?.events || []).map((evt) => (
                            <tr key={evt.id} className="hover:bg-muted/30 transition-colors">
                              <td className="p-3 font-semibold text-foreground">{evt.title}</td>
                              <td className="p-3 text-muted-foreground tnum">
                                {evt.date ? new Date(evt.date).toLocaleDateString() : '—'}
                              </td>
                              <td className="p-3">
                                <Badge variant="secondary" className="text-[10px]">
                                  {evt.category}
                                </Badge>
                              </td>
                              <td className="p-3 tnum font-medium">{evt.registered}</td>
                              <td className="p-3 tnum font-medium">{evt.attended}</td>
                              <td className="p-3 tnum">
                                <span className="font-bold text-teal-600 dark:text-teal-400">
                                  {evt.attendanceRate}%
                                </span>
                              </td>
                              <td className="p-3 tnum text-amber-500 font-semibold">
                                ★ {evt.eventRating}
                              </td>
                              <td className="p-3 text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1"
                                  onClick={() => navigate(`/organizer/events/${evt.id}/analytics`)}
                                >
                                  <span>Inspect</span>
                                  <ArrowRight className="h-3 w-3" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* NAAC / NBA Institutional Accreditation Report Export Card */}
              <Card className="border-border p-5 space-y-4 bg-muted/20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <FileCheck2 className="h-4 w-4 text-teal-600" />
                      <span>Export Official NAAC / NBA Accreditation Dossier</span>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Generates cryptographically signed audit bundles with student registries, verified attendance signatures, and budget allocations.
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    <Select
                      value={exportFormat}
                      onValueChange={(val: any) => setExportFormat(val)}
                    >
                      <SelectTrigger className="w-32 text-xs h-9 bg-background" data-testid="select-export-format">
                        <SelectValue placeholder="Format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pdf">PDF Dossier</SelectItem>
                        <SelectItem value="csv">CSV Ledger</SelectItem>
                        <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      onClick={handleExportNaac}
                      disabled={isExporting}
                      className="gap-2 bg-teal-600 hover:bg-teal-700 text-white shadow-xs h-9 text-xs"
                      data-testid="btn-naac-export"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>{isExporting ? 'Generating...' : 'Download Report'}</span>
                    </Button>
                  </div>
                </div>

                {exportProgress !== null && (
                  <div className="space-y-1 pt-1">
                    <Progress value={exportProgress} className="h-1.5" />
                    <p className="text-[10px] text-muted-foreground tnum text-right">
                      Generating document: {exportProgress}%
                    </p>
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </ErrorBoundary>
    );
  }

  // ==========================================
  // VIEW B: EVENT POST-MORTEM ANALYTICS (eventId)
  // ==========================================
  if (isEventLoading) {
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

  if (isEventError || !analytics) {
    return (
      <div className="container max-w-6xl py-12 px-4 mx-auto space-y-4">
        <Card className="p-8 text-center border-destructive/40 space-y-3">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-sm font-semibold text-foreground">Failed to load event post-mortem analytics</p>
          <p className="text-xs text-muted-foreground">
            {(eventError as any)?.message || 'Unable to retrieve event analytics from the campus server.'}
          </p>
          <Button size="sm" variant="outline" onClick={() => refetchEvent()} className="gap-1.5 text-xs">
            <RotateCcw className="h-3.5 w-3.5" />
            Try Again
          </Button>
        </Card>
      </div>
    );
  }

  // Demographics normalisation with privacy rule (< 3)
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
    count: d.count ?? 2,
    displayLabel: d.displayLabel,
    isSuppressed: d.count === null,
  }));

  // Funnel Data (aligned with backend fields)
  const funnelData = [
    { stage: 'Registered', count: analytics.funnel?.registered ?? 0 },
    { stage: 'Confirmed', count: analytics.funnel?.registered ?? 0 },
    { stage: 'Checked In', count: analytics.funnel?.checkedIn ?? 0 },
    { stage: 'No Show', count: analytics.funnel?.noShowCount ?? 0 },
  ];

  // Arrival curve data
  const arrivalCurveData = Array.isArray(analytics.arrivalCurve)
    ? analytics.arrivalCurve
    : (analytics.arrivalCurve?.buckets ?? []);

  // Review Histogram Data
  const reviewHistogram = analytics.reviews?.histogram ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const reviewData = [5, 4, 3, 2, 1].map((stars) => ({
    stars: `${stars} ★`,
    count: reviewHistogram[stars] ?? 0,
  }));

  const netRevenuePaise = analytics.revenueSandbox?.netPaise ?? 0;

  return (
    <ErrorBoundary>
      <div className="container max-w-6xl py-8 px-4 sm:px-8 mx-auto space-y-6" data-testid="event-analytics-page">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/organizer/analytics')}
              className="h-8 w-8 p-0"
              aria-label="Back to club analytics"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
                <BarChart3 className="h-7 w-7 text-teal-600" />
                Post-Mortem: {analytics.eventTitle}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Conversion funnels, arrival peak histograms, privacy-suppressed demographics, and official report exports.
              </p>
            </div>
          </div>

          {/* NAAC/NBA Export Action */}
          <div className="flex items-center gap-2 flex-wrap">
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
              className="gap-2 bg-teal-600 hover:bg-teal-700 text-white shadow-xs h-9 text-xs"
              data-testid="btn-naac-export"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{isExporting ? 'Generating...' : 'Export Report'}</span>
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
              {analytics.funnel?.conversionRate ?? 0}%
            </p>
            <p className="text-[11px] text-muted-foreground">Registered to checked in</p>
          </Card>

          <Card className="border-border p-5 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold uppercase tracking-wider">Arrivals</span>
              <Users className="h-4 w-4 text-teal-600" />
            </div>
            <p className="text-3xl font-extrabold tracking-tight tnum">
              {analytics.funnel?.checkedIn ?? 0}
            </p>
            <p className="text-[11px] text-muted-foreground">Total verified check-ins</p>
          </Card>

          <Card className="border-border p-5 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold uppercase tracking-wider">Average Rating</span>
              <Star className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-3xl font-extrabold tracking-tight tnum">
              {analytics.reviews?.average ?? 0} ★
            </p>
            <p className="text-[11px] text-muted-foreground">{analytics.reviews?.count ?? 0} verified reviews</p>
          </Card>

          <Card className="border-border p-5 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold uppercase tracking-wider">Sandbox Revenue</span>
              <DollarSign className="h-4 w-4 text-violet-500" />
            </div>
            <p className="text-3xl font-extrabold tracking-tight tnum" data-testid="metric-net-revenue">
              ₹{(netRevenuePaise / 100).toLocaleString()}
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
                  <Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Chart 2: Arrival Peak Line Chart */}
          <Card className="border-border p-5">
            <CardHeader className="p-0 pb-4">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>Arrival Peak Distribution (5-min Buckets)</span>
                <Badge variant="outline" className="text-[10px]">Gate Traffic</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={arrivalCurveData} aria-label="Gate arrival curve">
                  <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#0d9488" strokeWidth={2.5} dot={{ r: 4 }} />
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
                      { name: 'Green (Valid)', value: analytics.scanStats?.green ?? 0 },
                      { name: 'Red (Rejected)', value: analytics.scanStats?.red ?? 0 },
                      { name: 'Yellow (Duplicate Attempt)', value: analytics.scanStats?.yellow ?? 0 },
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
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Green ({analytics.scanStats?.green ?? 0})</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" /> Red ({analytics.scanStats?.red ?? 0})</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Yellow ({analytics.scanStats?.yellow ?? 0})</span>
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
                        className={`h-full rounded-full ${d.isSuppressed ? 'bg-amber-400/60' : 'bg-teal-600'}`}
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
                  <Bar dataKey="registered" fill="#a8a29e" name="Registered" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="checkedIn" fill="#0f766e" name="Checked In" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default AnalyticsPage;
