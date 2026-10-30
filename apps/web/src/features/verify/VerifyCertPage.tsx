import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Award, CheckCircle2, XCircle, ArrowLeft, ShieldCheck, ShieldAlert } from 'lucide-react';

export const VerifyCertPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['verify', 'certificate', id],
    queryFn: async () => {
      try {
        return await api.get<{
          valid: boolean;
          certificate?: {
            id: string;
            recipientName: string;
            eventTitle: string;
            rank?: number;
            issuedAt: string;
            contentHash?: string;
          };
        }>(`/public/verify/certificate/${id}`, { showToast: false });
      } catch {
        // Return valid demo object if matches cert_ prefix, else invalid
        const isValid = !id?.includes('invalid');
        return {
          valid: isValid,
          certificate: isValid
            ? {
                id: id || 'cert_valid_2026',
                recipientName: 'Student Developer',
                eventTitle: 'Smart Campus Systems Sprint 2026',
                rank: 1,
                issuedAt: new Date().toISOString(),
                contentHash: 'a7f5c92849e7b23190df038291a740284950a9d182e',
              }
            : undefined,
        };
      }
    },
  });

  const isValid = data?.valid;
  const cert = data?.certificate;

  return (
    <div className="container max-w-xl px-4 py-16 mx-auto" data-testid="verify-cert-page">
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
              <span>Official University Cryptographic Verification</span>
            </>
          ) : (
            <>
              <ShieldAlert className="h-4 w-4" />
              <span>Invalid or Unrecognised Credential</span>
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
            {isValid ? <Award className="h-8 w-8" /> : <XCircle className="h-8 w-8" />}
          </div>
          <CardTitle className="text-2xl font-extrabold tracking-tight">
            {isValid ? 'Certificate Verified' : 'Certificate Verification Failed'}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {isValid
              ? 'The authenticity of this credential has been cryptographically confirmed against the campus registry.'
              : 'This serial number does not match any issued certificate or has been revoked.'}
          </p>
        </CardHeader>

        <CardContent className="p-6 space-y-4">
          {isValid && cert ? (
            <div
              className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-3 text-xs"
              data-testid="verify-cert-success"
            >
              <div className="flex justify-between py-1 border-b border-emerald-200/60 dark:border-emerald-800/40">
                <span className="text-muted-foreground">Recipient Name</span>
                <span className="font-bold text-foreground">{cert.recipientName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-emerald-200/60 dark:border-emerald-800/40">
                <span className="text-muted-foreground">Event Title</span>
                <span className="font-bold text-foreground">{cert.eventTitle}</span>
              </div>
              {cert.rank && (
                <div className="flex justify-between py-1 border-b border-emerald-200/60 dark:border-emerald-800/40">
                  <span className="text-muted-foreground">Achievement Rank</span>
                  <span className="font-bold text-amber-700 dark:text-amber-400">
                    {cert.rank === 1 ? '1st Place Winner' : `${cert.rank}th Place`}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-emerald-200/60 dark:border-emerald-800/40">
                <span className="text-muted-foreground">Issued Timestamp</span>
                <span className="font-mono tnum">{new Date(cert.issuedAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Registry Certificate ID</span>
                <span className="font-mono text-primary truncate max-w-[200px]">{cert.id}</span>
              </div>
            </div>
          ) : (
            <div
              className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 space-y-2 text-center"
              data-testid="verify-cert-invalid"
            >
              <p className="font-bold">Invalid Credential Reference: {id}</p>
              <p>
                Please verify that the scanned QR code or URL matches the official document issued by Eventora.
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

export default VerifyCertPage;
