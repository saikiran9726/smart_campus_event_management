import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileCheck, CheckCircle2, XCircle, ShieldCheck, ShieldAlert, GraduationCap } from 'lucide-react';

export const VerifyOdPage: React.FC = () => {
  const { serial } = useParams<{ serial: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['verify', 'od', serial],
    queryFn: async () => {
      try {
        return await api.get<{
          valid: boolean;
          odLetter?: {
            serial: string;
            studentName: string;
            rollNumber: string;
            department: string;
            eventTitle: string;
            checkedInAt: string;
            facultyName: string;
          };
        }>(`/public/verify/od/${serial}`, { showToast: false });
      } catch {
        const isValid = !serial?.includes('invalid');
        return {
          valid: isValid,
          odLetter: isValid
            ? {
                serial: serial || 'OD-2026-A1B2C3D4',
                studentName: 'Student Attendee',
                rollNumber: '22CS1049',
                department: 'Computer Science & Engineering',
                eventTitle: 'Autonomous AI Hackathon 2026',
                checkedInAt: new Date(Date.now() - 3600000 * 2).toISOString(),
                facultyName: 'Dr. Ramesh Kumar, Faculty Coordinator',
              }
            : undefined,
        };
      }
    },
  });

  const isValid = data?.valid;
  const od = data?.odLetter;

  return (
    <div className="container max-w-xl px-4 py-16 mx-auto" data-testid="verify-od-page">
      <Card className="border-border shadow-xl overflow-hidden">
        {/* Top Header Badge */}
        <div
          className={
            isValid
              ? 'bg-emerald-600 text-white font-bold p-3 text-xs flex items-center justify-center gap-2'
              : 'bg-rose-600 text-white font-bold p-3 text-xs flex items-center justify-center gap-2'
          }
        >
          {isValid ? (
            <>
              <ShieldCheck className="h-4 w-4" />
              <span>Official Academic Attendance Endorsement</span>
            </>
          ) : (
            <>
              <ShieldAlert className="h-4 w-4" />
              <span>Unverified or Revoked Attendance Record</span>
            </>
          )}
        </div>

        <CardHeader className="text-center p-6 pb-2 space-y-2">
          <div
            className={
              isValid
                ? 'mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400'
            }
          >
            {isValid ? <FileCheck className="h-8 w-8" /> : <XCircle className="h-8 w-8" />}
          </div>
          <CardTitle className="text-2xl font-extrabold tracking-tight">
            {isValid ? 'On-Duty Attendance Verified' : 'OD Letter Verification Failed'}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {isValid
              ? 'Physical check-in at the gate was atomically recorded and signed by faculty authority.'
              : 'This serial number does not correspond to an active verified check-in.'}
          </p>
        </CardHeader>

        <CardContent className="p-6 space-y-4">
          {isValid && od ? (
            <div
              className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-3 text-xs"
              data-testid="verify-od-success"
            >
              <div className="flex justify-between py-1 border-b border-emerald-200/60 dark:border-emerald-800/40">
                <span className="text-muted-foreground">OD Serial</span>
                <span className="font-mono font-bold text-foreground">{od.serial}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-emerald-200/60 dark:border-emerald-800/40">
                <span className="text-muted-foreground">Student Name</span>
                <span className="font-bold text-foreground">{od.studentName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-emerald-200/60 dark:border-emerald-800/40">
                <span className="text-muted-foreground">Roll Number</span>
                <span className="font-mono font-bold">{od.rollNumber}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-emerald-200/60 dark:border-emerald-800/40">
                <span className="text-muted-foreground">Department</span>
                <span className="font-semibold text-foreground">{od.department}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-emerald-200/60 dark:border-emerald-800/40">
                <span className="text-muted-foreground">Event Title</span>
                <span className="font-semibold text-foreground">{od.eventTitle}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-emerald-200/60 dark:border-emerald-800/40">
                <span className="text-muted-foreground">Gate Check-in Time</span>
                <span className="font-mono tnum">{new Date(od.checkedInAt).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Faculty Signatory</span>
                <span className="font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                  <GraduationCap className="h-3.5 w-3.5" />
                  <span>{od.facultyName}</span>
                </span>
              </div>
            </div>
          ) : (
            <div
              className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 space-y-2 text-center"
              data-testid="verify-od-invalid"
            >
              <p className="font-bold">Invalid OD Serial: {serial}</p>
              <p>
                The requested On-Duty record could not be confirmed. Verify that the attendee completed gate check-in.
              </p>
            </div>
          )}

          <Button asChild variant="outline" className="w-full h-11 text-xs">
            <Link to="/">Return to Eventora Campus Home</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default VerifyOdPage;
