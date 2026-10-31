import React, { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RoleBadge } from '@/components/primitives/role-badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  User,
  Mail,
  GraduationCap,
  Building,
  Phone,
  ShieldCheck,
  AlertTriangle,
  Clock,
  LogIn,
  LogOut,
  Save,
} from 'lucide-react';
import { SignInButton } from '@clerk/clerk-react';

export const ProfilePage: React.FC = () => {
  const { isSignedIn, user, clerkUser, refetchUser, signOut } = useAuth();

  const [fullName, setFullName] = useState(user?.fullName || clerkUser?.fullName || '');
  const [rollNumber, setRollNumber] = useState(user?.rollNumber || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [year, setYear] = useState<number | string>(user?.year ?? user?.yearOfStudy ?? 3);
  const [phone, setPhone] = useState(user?.phone || '');
  const [isSaving, setIsSaving] = useState(false);
  const [rollNumberError, setRollNumberError] = useState<string | null>(null);

  // Sync state if user changes
  React.useEffect(() => {
    if (user) {
      setFullName(user.fullName || clerkUser?.fullName || '');
      setRollNumber(user.rollNumber || '');
      setDepartment(user.department || '');
      setYear(user.year ?? user.yearOfStudy ?? 3);
      setPhone(user.phone || '');
    }
  }, [user?.id]);

  if (!isSignedIn) {
    return (
      <div className="container max-w-md px-4 py-16 mx-auto text-center space-y-6" data-testid="profile-unauth-view">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <LogIn className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Sign In to Eventora</h1>
          <p className="text-sm text-muted-foreground">
            Connect your university student account to manage your profile and active event passes.
          </p>
        </div>
        <SignInButton mode="modal">
          <Button className="w-full h-12 text-base font-semibold">
            Continue with Campus Auth
          </Button>
        </SignInButton>
      </div>
    );
  }

  const strikesCount = user?.strikeCount ?? user?.strikesCount ?? 0;
  const isCooldownActive = !!user?.cooldownUntil && new Date(user.cooldownUntil) > new Date();

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setRollNumberError(null);
    try {
      const payload: Record<string, unknown> = {
        fullName: fullName.trim(),
        rollNumber: rollNumber.trim().toUpperCase(),
        department: department.trim() || null,
        year: year ? Number(year) : null,
        phone: phone.trim() || null,
      };

      await api.patch('/me', payload);

      toast({
        title: 'Profile Updated',
        description: 'Your verified campus details have been saved.',
      });
      refetchUser();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 409) {
        const msg =
          'message' in err && typeof (err as { message: string }).message === 'string'
            ? (err as { message: string }).message
            : 'Roll number is already registered to another user.';
        setRollNumberError(msg);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container max-w-3xl px-4 sm:px-8 py-8 mx-auto space-y-6" data-testid="profile-page">
      <div className="space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight">Student Profile</h1>
        <p className="text-muted-foreground text-sm">
          Manage your verified academic credentials and event attendance standing.
        </p>
      </div>

      {/* Cooldown Banner (Amber) */}
      {isCooldownActive && (
        <div
          className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3"
          data-testid="cooldown-banner"
        >
          <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs text-amber-900 dark:text-amber-200">
            <h4 className="font-bold text-sm">Account Cooldown Active</h4>
            <p>
              Your account has 2 consecutive unexcused event no-shows. Seat reservations are paused until{' '}
              <strong className="tnum font-mono">
                {new Date(user.cooldownUntil!).toLocaleDateString()}
              </strong>.
            </p>
          </div>
        </div>
      )}

      {/* Strike Policy & Standing Card */}
      <Card className="border-border">
        <CardHeader className="p-6 pb-3">
          <CardTitle className="text-base font-bold flex items-center justify-between">
            <span>Attendance Standing & Strike Count</span>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              {strikesCount} / 2 Strikes
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-0 space-y-3 text-xs">
          <div className="p-4 rounded-lg bg-muted/30 border border-border/40 space-y-2">
            <h5 className="font-bold text-foreground flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              Eventora Campus Fair-Use Strike Policy
            </h5>
            <p className="text-muted-foreground leading-relaxed">
              To prevent ghost reservations and ensure all students have access to limited seats,
              Eventora enforces a campus attendance policy. If you reserve a confirmed seat but do not scan at the gate (without cancelling 2 hours prior), you accrue 1 strike.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Reaching <strong>2 strikes</strong> triggers a 30-day reservation cooldown.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Editable Profile Form */}
      <Card className="border-border shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row items-center gap-4 p-6 pb-4 border-b border-border/60">
          <Avatar className="h-16 w-16">
            <AvatarImage src={clerkUser?.imageUrl} alt={fullName || 'Avatar'} />
            <AvatarFallback className="text-lg font-bold">
              {(fullName || 'U').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1 text-center sm:text-left flex-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="text-xl font-bold text-foreground">{fullName || 'Campus Member'}</h2>
              <RoleBadge role={user?.role || 'ATTENDEE'} />
            </div>
            <p className="text-xs text-muted-foreground flex items-center justify-center sm:justify-start gap-1">
              <Mail className="h-3.5 w-3.5" />
              <span>{user?.email || clerkUser?.primaryEmailAddress?.emailAddress}</span>
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => signOut()}
            className="text-destructive hover:text-destructive text-xs"
          >
            <LogOut className="h-3.5 w-3.5 mr-1" />
            <span>Sign Out</span>
          </Button>
        </CardHeader>

        <form onSubmit={handleSaveProfile}>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="fullName" className="text-xs font-semibold">
                  Full Name
                </Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="h-11"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rollNumber" className="text-xs font-semibold">
                  Student Roll Number
                </Label>
                <Input
                  id="rollNumber"
                  value={rollNumber}
                  onChange={(e) => {
                    setRollNumber(e.target.value);
                    if (rollNumberError) setRollNumberError(null);
                  }}
                  placeholder="e.g. 22CS1049"
                  className={cn("h-11 font-mono uppercase", rollNumberError && "border-destructive focus-visible:ring-destructive")}
                  aria-invalid={!!rollNumberError}
                  required
                />
                {rollNumberError && (
                  <p className="text-xs text-destructive font-medium mt-1" role="alert" data-testid="roll-number-error">
                    {rollNumberError}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="department" className="text-xs font-semibold">
                  Academic Department
                </Label>
                <Input
                  id="department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Computer Science & Engineering"
                  className="h-11"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="collegeYear" className="text-xs font-semibold">
                  College Year
                </Label>
                <Input
                  id="collegeYear"
                  type="number"
                  min={1}
                  max={6}
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="h-11 tnum"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="phone" className="text-xs font-semibold">
                  Contact Mobile Number (WhatsApp ticket notifications)
                </Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="h-11 font-mono"
                />
              </div>
            </div>
          </CardContent>

          <CardFooter className="p-6 pt-0 border-t border-border/60 flex justify-end">
            <Button
              type="submit"
              disabled={isSaving}
              className="h-11 px-6 font-semibold shadow-sm inline-flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              <span>{isSaving ? 'Saving Changes...' : 'Save Profile'}</span>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default ProfilePage;
