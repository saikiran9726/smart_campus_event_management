import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { QrCode, ShieldCheck, ArrowRight, UserCheck } from 'lucide-react';

interface ScannerUnlockResponse {
  token: string;
  eventId: string;
  eventTitle: string;
  volunteerName: string;
}

export const ScannerUnlockPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const codeParam = searchParams.get('c') || searchParams.get('code') || searchParams.get('passkey') || '';
  const initialDigits = codeParam.toUpperCase().replace(/^SCAN-/, '').slice(0, 6);

  const [digits, setDigits] = useState(initialDigits);
  const [volunteerName, setVolunteerName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileToken] = useState('test-pass');

  useEffect(() => {
    if (codeParam) {
      const parsed = codeParam.toUpperCase().replace(/^SCAN-/, '').slice(0, 6);
      if (parsed) {
        setDigits(parsed);
      }
    }
  }, [codeParam]);

  const handleDigitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setDigits(val);
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();

    if (digits.length !== 6) {
      toast({
        title: 'Invalid Passkey',
        description: 'Please enter the full 6-digit numeric passkey.',
        variant: 'destructive',
      });
      return;
    }

    if (!volunteerName.trim()) {
      toast({
        title: 'Volunteer Name Required',
        description: 'Please enter your name for check-in audit logs.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    const formattedPasskey = `SCAN-${digits}`;

    try {
      const res = await api.post<ScannerUnlockResponse>(
        '/public/scanner/unlock',
        {
          code: formattedPasskey,
          volunteerName: volunteerName.trim(),
          turnstileToken,
        },
        {
          headers: {
            'cf-turnstile-response': turnstileToken,
          },
          showToast: false,
        }
      );

      sessionStorage.setItem('eventora_scanner_token', res.token);
      sessionStorage.setItem(
        'eventora_scanner_event',
        JSON.stringify({
          eventId: res.eventId,
          eventTitle: res.eventTitle,
          volunteerName: res.volunteerName,
        })
      );

      toast({
        title: 'Scanner Session Activated',
        description: `Unlocked for "${res.eventTitle}". Gate camera ready.`,
      });

      navigate('/scanner', { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid or expired passkey.';
      toast({
        title: 'Passkey Verification Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-12 text-slate-50">
      <Card className="w-full max-w-md border-slate-800 bg-slate-900 shadow-2xl text-slate-100">
        <CardHeader className="text-center space-y-3 pb-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20">
            <QrCode className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-white">
            Gate Scanner Passkey
          </CardTitle>
          <CardDescription className="text-slate-400 text-sm">
            Enter the 6-digit event gate passkey to unlock the volunteer scanner camera.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleUnlock} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="passkey-input" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 text-center">
                6-Digit PIN (SCAN-######)
              </label>
              <div className="relative flex items-center justify-center">
                <span className="absolute left-4 font-mono font-bold text-slate-500 select-none text-xl">
                  SCAN-
                </span>
                <Input
                  id="passkey-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={digits}
                  onChange={handleDigitChange}
                  placeholder="000000"
                  autoFocus
                  data-testid="scanner-passkey-input"
                  className="h-16 pl-24 text-center font-mono text-3xl font-bold tracking-widest tabular-nums bg-slate-950 border-slate-700 text-white focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="volunteer-name-input" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Volunteer Full Name
              </label>
              <div className="relative">
                <Input
                  id="volunteer-name-input"
                  type="text"
                  placeholder="e.g. Maya Chen"
                  value={volunteerName}
                  onChange={(e) => setVolunteerName(e.target.value)}
                  data-testid="scanner-volunteer-name-input"
                  className="h-12 bg-slate-950 border-slate-700 text-white placeholder:text-slate-600 focus:border-indigo-500"
                />
                <UserCheck className="absolute right-3.5 top-3.5 h-5 w-5 text-slate-500 pointer-events-none" />
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Scoped least-privilege token. Session active for 8 hours.</span>
            </div>

            <Button
              type="submit"
              disabled={digits.length !== 6 || !volunteerName.trim() || isSubmitting}
              data-testid="scanner-unlock-submit-button"
              className="w-full h-14 text-base font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-lg shadow-indigo-600/30 gap-2"
            >
              {isSubmitting ? 'Authenticating Passkey...' : 'Unlock Camera Scanner'}
              <ArrowRight className="h-5 w-5" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ScannerUnlockPage;
