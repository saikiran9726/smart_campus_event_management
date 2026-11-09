import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Download,
  Search,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  FileSpreadsheet,
  FileText,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';

export interface ParticipantItem {
  id: string;
  registrationId: string;
  userId: string;
  fullName: string;
  email: string;
  rollNumber: string | null;
  department: string | null;
  year: number | null;
  phone: string | null;
  registeredAt: string;
  registrationStatus: string;
  paymentStatus: string;
  amountPaise: number;
  ticketId: string | null;
  ticketStatus: string | null;
  checkedInAt: string | null;
  checkedInVia: string | null;
  attended: boolean;
  isNoShow: boolean;
  attendanceStatus: string;
}

export interface ParticipantsApiResponse {
  event: {
    id: string;
    title: string;
    slug: string;
    isEnded: boolean;
  };
  items: ParticipantItem[];
  totals: {
    totalCount: number;
    registeredCount: number;
    attendedCount: number;
    noShowCount: number;
  };
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalItems: number;
  };
}

interface EventParticipantsTabProps {
  eventId: string;
  eventSlug?: string;
}

export const EventParticipantsTab: React.FC<EventParticipantsTabProps> = ({
  eventId,
  eventSlug,
}) => {
  const [statusTab, setStatusTab] = useState<'all' | 'registered' | 'attended' | 'no_show'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [department, setDepartment] = useState('ALL');
  const [year, setYear] = useState('ALL');
  const [page, setPage] = useState(1);
  const [isDownloading, setIsDownloading] = useState<'csv' | 'xlsx' | null>(null);

  const pageSize = 20;

  const { data, isLoading, isError, refetch, isFetching } = useQuery<ParticipantsApiResponse>({
    queryKey: ['events', eventId, 'participants', statusTab, searchQuery, department, year, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusTab !== 'all') params.set('status', statusTab);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (department !== 'ALL') params.set('department', department);
      if (year !== 'ALL') params.set('year', year);
      params.set('page', String(page));
      params.set('limit', String(pageSize));

      return await api.get<ParticipantsApiResponse>(
        `/events/${eventId}/participants?${params.toString()}`,
        { showToast: false }
      );
    },
    enabled: !!eventId,
  });

  const totals = data?.totals || {
    totalCount: 0,
    registeredCount: 0,
    attendedCount: 0,
    noShowCount: 0,
  };

  const handleDownload = async (format: 'csv' | 'xlsx') => {
    setIsDownloading(format);
    try {
      const params = new URLSearchParams();
      params.set('format', format);
      if (statusTab !== 'all') params.set('status', statusTab);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (department !== 'ALL') params.set('department', department);
      if (year !== 'ALL') params.set('year', year);

      const blob = await api.getBlob(`/events/${eventId}/participants/export?${params.toString()}`);
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const targetSlug = data?.event?.slug || eventSlug || eventId;
      a.download = `participants-${targetSlug}-${statusTab}-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);

      toast.success(
        `${format.toUpperCase()} downloaded`,
        `Exported participants file downloaded successfully.`
      );
    } catch (err: any) {
      toast.error(
        'Export failed',
        err?.message || `Unable to export participants as ${format.toUpperCase()}.`
      );
    } finally {
      setIsDownloading(null);
    }
  };

  const participants = data?.items || [];
  const pagination = data?.pagination || { page: 1, limit: pageSize, totalPages: 1, totalItems: 0 };

  const getAttendanceBadge = (p: ParticipantItem) => {
    if (p.attended) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60">
          <CheckCircle2 className="h-3 w-3" />
          <span>Attended</span>
        </span>
      );
    }
    if (p.isNoShow) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800/60">
          <XCircle className="h-3 w-3" />
          <span>No-show</span>
        </span>
      );
    }
    if (p.registrationStatus === 'CONFIRMED') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800/60">
          <Clock className="h-3 w-3" />
          <span>Not checked in</span>
        </span>
      );
    }
    return (
      <Badge variant="outline" className="text-[10px]">
        {p.registrationStatus}
      </Badge>
    );
  };

  return (
    <Card className="border-border space-y-4" data-testid="event-participants-tab">
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
        <div>
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-500" />
            <span>Event Participants & Attendance</span>
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Monitor real-time check-ins, attendance rates, and download attendee registries.
          </CardDescription>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-xs h-8 gap-1.5"
            title="Refresh participant list"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDownload('csv')}
            disabled={isDownloading !== null}
            className="text-xs h-8 gap-1.5 shadow-xs"
            data-testid="btn-download-participants-csv"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{isDownloading === 'csv' ? 'Exporting...' : 'Download CSV'}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDownload('xlsx')}
            disabled={isDownloading !== null}
            className="text-xs h-8 gap-1.5 shadow-xs"
            data-testid="btn-download-participants-excel"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{isDownloading === 'xlsx' ? 'Exporting...' : 'Download Excel'}</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* Status Segmented Tabs with Count Badges */}
        <div
          className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-lg border border-border/60 overflow-x-auto"
          role="tablist"
          data-testid="participant-status-tabs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={statusTab === 'all'}
            onClick={() => {
              setStatusTab('all');
              setPage(1);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all shrink-0 ${
              statusTab === 'all'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>All Participants</span>
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 tnum">
              {totals.totalCount}
            </Badge>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={statusTab === 'registered'}
            onClick={() => {
              setStatusTab('registered');
              setPage(1);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all shrink-0 ${
              statusTab === 'registered'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>Registered</span>
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 tnum">
              {totals.registeredCount}
            </Badge>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={statusTab === 'attended'}
            onClick={() => {
              setStatusTab('attended');
              setPage(1);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all shrink-0 ${
              statusTab === 'attended'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>Attended</span>
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 tnum">
              {totals.attendedCount}
            </Badge>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={statusTab === 'no_show'}
            onClick={() => {
              setStatusTab('no_show');
              setPage(1);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all shrink-0 ${
              statusTab === 'no_show'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>No-Show</span>
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 tnum">
              {totals.noShowCount}
            </Badge>
          </button>
        </div>

        {/* Filters Bar: Search, Department, Year */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, roll number..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="pl-8 h-8 text-xs"
              data-testid="input-participant-search"
            />
          </div>

          <Select
            value={department}
            onValueChange={(val) => {
              setDepartment(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 text-xs" data-testid="select-participant-department">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Departments</SelectItem>
              <SelectItem value="Computer Science">Computer Science</SelectItem>
              <SelectItem value="Information Technology">Information Technology</SelectItem>
              <SelectItem value="Electronics">Electronics</SelectItem>
              <SelectItem value="Mechanical">Mechanical</SelectItem>
              <SelectItem value="Civil">Civil</SelectItem>
              <SelectItem value="Biotechnology">Biotechnology</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={year}
            onValueChange={(val) => {
              setYear(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 text-xs" data-testid="select-participant-year">
              <SelectValue placeholder="Year of Study" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Years</SelectItem>
              <SelectItem value="1">1st Year</SelectItem>
              <SelectItem value="2">2nd Year</SelectItem>
              <SelectItem value="3">3rd Year</SelectItem>
              <SelectItem value="4">4th Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Participants Table (Desktop) & Cards (Mobile) */}
        {isLoading ? (
          <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">
            Loading event participants and attendance...
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-xs text-destructive">
            Failed to load participants. Please verify your permissions and try again.
          </div>
        ) : participants.length === 0 ? (
          <div className="p-8 text-center border rounded-lg bg-muted/20 text-xs text-muted-foreground">
            No participants found matching the current filters.
          </div>
        ) : (
          <div className="space-y-3">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-muted/50 border-b border-border text-muted-foreground font-semibold">
                  <tr>
                    <th className="p-2.5">Participant</th>
                    <th className="p-2.5">Roll No & Dept</th>
                    <th className="p-2.5">Year</th>
                    <th className="p-2.5">Registration Date</th>
                    <th className="p-2.5">Attendance Status</th>
                    <th className="p-2.5">Check-in Time</th>
                    <th className="p-2.5">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {participants.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-2.5">
                        <div className="font-semibold text-foreground">{p.fullName}</div>
                        <div className="text-[11px] text-muted-foreground">{p.email}</div>
                      </td>
                      <td className="p-2.5">
                        <div className="font-mono text-[11px]">{p.rollNumber || 'N/A'}</div>
                        <div className="text-[11px] text-muted-foreground">{p.department || 'N/A'}</div>
                      </td>
                      <td className="p-2.5 text-muted-foreground tnum">
                        {p.year ? `Year ${p.year}` : 'N/A'}
                      </td>
                      <td className="p-2.5 text-muted-foreground tnum">
                        {new Date(p.registeredAt).toLocaleDateString()}
                      </td>
                      <td className="p-2.5">
                        {getAttendanceBadge(p)}
                      </td>
                      <td className="p-2.5 text-muted-foreground text-[11px] tnum">
                        {p.checkedInAt ? new Date(p.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="p-2.5">
                        <Badge
                          variant={p.paymentStatus === 'SUCCEEDED' ? 'default' : 'secondary'}
                          className="text-[10px]"
                        >
                          {p.paymentStatus}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="md:hidden space-y-2.5">
              {participants.map((p) => (
                <div key={p.id} className="p-3 border rounded-lg bg-card space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-foreground text-sm">{p.fullName}</div>
                      <div className="text-[11px] text-muted-foreground">{p.email}</div>
                    </div>
                    {getAttendanceBadge(p)}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                    <div>
                      <span className="font-semibold text-foreground">Roll: </span>
                      <span className="font-mono">{p.rollNumber || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">Dept: </span>
                      <span>{p.department || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">Registered: </span>
                      <span>{new Date(p.registeredAt).toLocaleDateString()}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">Check-in: </span>
                      <span>{p.checkedInAt ? new Date(p.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                <span>
                  Showing {participants.length} of {pagination.totalItems} participants
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="h-7 px-2 text-xs"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline ml-1">Previous</span>
                  </Button>
                  <span className="px-2 tnum">
                    Page {page} of {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    className="h-7 px-2 text-xs"
                  >
                    <span className="hidden sm:inline mr-1">Next</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default EventParticipantsTab;
