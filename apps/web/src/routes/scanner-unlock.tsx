import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QrCode, ShieldCheck } from 'lucide-react';

export const ScannerUnlockPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [passkey, setPasskey] = React.useState(searchParams.get('passkey') || '');
  const [unlocked, setUnlocked] = React.useState(false);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (passkey.trim()) {
      setUnlocked(true);
    }
  };

  return (
    <div className="container max-w-md px-4 py-16 mx-auto">
      <Card className="border-border shadow-lg">
        <CardHeader className="text-center space-y-2 pb-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <QrCode className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl font-bold">Gate Scanner Access</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter event passkey or volunteer code to unlock the gate scanning session
          </p>
        </CardHeader>
        <CardContent>
          {unlocked ? (
            <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 space-y-3 text-center">
              <ShieldCheck className="h-8 w-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
              <p className="font-semibold text-emerald-900 dark:text-emerald-300">
                Gate Scanner Active
              </p>
              <p className="text-xs text-muted-foreground">
                Camera scanner ready for atomic entry pass verification.
              </p>
            </div>
          ) : (
            <form onSubmit={handleUnlock} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Session Passkey</label>
                <Input
                  type="password"
                  placeholder="Enter 6-digit gate PIN"
                  value={passkey}
                  onChange={(e) => setPasskey(e.target.value)}
                  className="h-12 text-center text-lg tracking-widest font-mono"
                />
              </div>
              <Button type="submit" className="w-full h-12 font-semibold">
                Unlock Scanner Session
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ScannerUnlockPage;
