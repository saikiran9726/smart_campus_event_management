import fs from 'node:fs';

const profileFile = 'apps/web/src/features/profile/ProfilePage.tsx';

const newProfileCode = `import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { Badge } from '@/components/shared/Badge';
import { PageHeader } from '@/components/shared/PageHeader';
import { RoleBadge } from '@/components/primitives/role-badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { PHONE_REGEX } from '@eventora/shared';
import {
  User,
  Mail,
  GraduationCap,
  Building2,
  BookOpen,
  Phone,
  ShieldCheck,
  AlertTriangle,
  Clock,
  LogIn,
  LogOut,
  Save,
  CheckCircle2,
  Info,
  Calendar,
} from 'lucide-react';
import { SignInButton } from '@clerk/clerk-react';

export const ProfilePage: React.FC = () => {
  const { isSignedIn, user, clerkUser, refetchUser, signOut } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const returnUrl = searchParams.get('returnUrl');

  const [fullName, setFullName] = useState(user?.fullName || clerkUser?.fullName || '');
  const [rollNumber, setRollNumber] = useState(user?.rollNumber || '');
  const [collegeName, setCollegeName] = useState(user?.collegeName || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [program, setProgram] = useState(user?.program || user?.course || '');
  const [year, setYear] = useState<number | string>(user?.year ?? user?.yearOfStudy ?? 3);
  const [phone, setPhone] = useState(user?.phone || '');
  const [isSaving, setIsSaving] = useState(false);
  const [rollNumberError, setRollNumberError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Sync state if user changes
  React.useEffect(() => {
    if (user) {
      setFullName(user.fullName || clerkUser?.fullName || '');
      setRollNumber(user.rollNumber || '');
      setCollegeName(user.collegeName || '');
      setDepartment(user.department || '');
      setProgram(user.program || user.course || '');
      setYear(user.year ?? user.yearOfStudy ?? 3);
      setPhone(user.phone || '');
    }
  }, [user?.id]);

  if (!isSignedIn) {
    return (
      <div className="container max-w-md px-4 py-16 mx-auto text-center space-y-6" data-testid="profile-unauth-view">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400">
          <LogIn className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Sign In to Eventora</h1>
          <p className="text-sm text-stone-500">
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

  const isProfileComplete = Boolean(
    fullName.trim() &&
    (user?.email || clerkUser?.primaryEmailAddress?.emailAddress) &&
    phone.trim() &&
    rollNumber.trim() &&
    collegeName.trim() &&
    department.trim() &&
    year &&
    program.trim()
  );

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setRollNumberError(null);
    setPhoneError(null);

    if (phone.trim() && !PHONE_REGEX.test(phone.trim())) {
      setPhoneError('Please enter a valid phone number (e.g. +91 98765 43210)');
      setIsSaving(false);
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        fullName: fullName.trim(),
        rollNumber: rollNumber.trim().toUpperCase(),
        collegeName: collegeName.trim() || null,
        department: department.trim() || null,
        program: program.trim() || null,
        year: year ? Number(year) : null,
        phone: phone.trim() || null,
      };

      await api.patch('/me', payload);

      toast({
        title: 'Profile Updated',
        description: 'Your verified campus details have been saved.',
      });
      refetchUser();

      if (returnUrl) {
        setTimeout(() => {
          navigate(returnUrl);
        }, 500);
      }
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 409) {
        const msg =
          'message' in err && typeof (err as { message: string }).message === 'string'
            ? (err as { message: string }).message
            : 'Roll number is already registered to another user.';
        setRollNumberError(msg);
      } else {
        toast({
          title: 'Update Failed',
          description: 'Could not update profile. Please verify your input.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container max-w-4xl px-4 sm:px-8 py-8 mx-auto space-y-6" data-testid="profile-page">
      <PageHeader
        title="Student Academic Profile"
        subtitle="Reusable campus credentials collected once and automatically shared with organizers upon registration."
        breadcrumbs={[
          { label: 'Discover', href: '/' },
          { label: 'Profile' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {isProfileComplete ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Profile Complete
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <AlertTriangle className="h-3.5 w-3.5" />
                Action Required: Missing Info
              </span>
            )}
          </div>
        }
      />

      {returnUrl && (
        <div
          className="p-3.5 rounded-xl border border-teal-500/30 bg-teal-500/10 text-xs text-teal-800 dark:text-teal-200 flex items-center justify-between"
          data-testid="profile-return-banner"
        >
          <span>Complete your student profile to proceed with event registration.</span>
          <Button size="sm" variant="outline" type="button" onClick={() => navigate(returnUrl)}>
            Cancel &amp; Return to Event
          </Button>
        </div>
      )}

      {/* User Header Summary Card */}
      <Card className="p-6 flex flex-col sm:flex-row items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarImage src={clerkUser?.imageUrl} alt={fullName || 'Avatar'} />
          <AvatarFallback className="text-lg font-bold">
            {(fullName || 'U').slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="space-y-1 text-center sm:text-left flex-1">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">{fullName || 'Campus Member'}</h2>
            <RoleBadge role={user?.role || 'ATTENDEE'} />
          </div>
          <p className="text-xs text-stone-500 flex items-center justify-center sm:justify-start gap-1">
            <Mail className="h-3.5 w-3.5" />
            <span>{user?.email || clerkUser?.primaryEmailAddress?.emailAddress}</span>
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => signOut()}
          className="text-stone-600 hover:text-red-600 text-xs"
        >
          <LogOut className="h-3.5 w-3.5 mr-1" />
          <span>Sign Out</span>
        </Button>
      </Card>

      {/* Cooldown Banner if active */}
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

      <form onSubmit={handleSaveProfile} noValidate className="space-y-6">
        {/* SECTION 1: Academic Credentials */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-stone-200 dark:border-stone-800">
            <GraduationCap className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            <div>
              <h3 className="font-bold text-base text-stone-900 dark:text-stone-100">Academic Credentials</h3>
              <p className="text-xs text-stone-500">Your university enrollment and degree details</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <Input
                label="Student Roll / Registration Number *"
                id="rollNumber"
                value={rollNumber}
                onChange={(e) => {
                  setRollNumber(e.target.value);
                  if (rollNumberError) setRollNumberError(null);
                }}
                placeholder="e.g. 22CS1049"
                className={cn("font-mono uppercase", rollNumberError && "border-red-500")}
                error={rollNumberError || undefined}
                required
              />
              {rollNumberError && (
                <p className="text-xs text-red-500 font-medium mt-1" role="alert" data-testid="roll-number-error">
                  {rollNumberError}
                </p>
              )}
            </div>

            <div>
              <Input
                label="Degree / Program *"
                id="program"
                value={program}
                onChange={(e) => setProgram(e.target.value)}
                placeholder="e.g. B.Tech Computer Science / MBA"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <Input
                label="College / University Name *"
                id="collegeName"
                value={collegeName}
                onChange={(e) => setCollegeName(e.target.value)}
                placeholder="e.g. University College of Engineering"
                required
              />
            </div>

            <div>
              <Input
                label="Academic Department *"
                id="department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Computer Science & Engineering"
                required
              />
            </div>

            <div>
              <Input
                label="College Year of Study (1-6) *"
                id="collegeYear"
                type="number"
                min={1}
                max={6}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="tnum"
                required
              />
            </div>
          </div>
        </Card>

        {/* SECTION 2: Contact Information */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-stone-200 dark:border-stone-800">
            <Phone className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            <div>
              <h3 className="font-bold text-base text-stone-900 dark:text-stone-100">Contact Information</h3>
              <p className="text-xs text-stone-500">Reachability for WhatsApp tickets, waitlist SMS and emergencies</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <Input
                label="Full Legal Name *"
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Alice Walker"
                required
              />
            </div>

            <div>
              <Input
                label="Mobile Number (WhatsApp & Gate SMS) *"
                id="phone"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (phoneError) setPhoneError(null);
                }}
                placeholder="+91 98765 43210"
                className={cn("font-mono", phoneError && "border-red-500")}
                error={phoneError || undefined}
                required
              />
            </div>
          </div>
        </Card>

        {/* SECTION 3: Campus Standing & Fair-Use Safety */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-stone-200 dark:border-stone-800">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <div>
                <h3 className="font-bold text-base text-stone-900 dark:text-stone-100">Campus Standing & Safety</h3>
                <p className="text-xs text-stone-500">Attendance compliance and fair seat allocation</p>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              {strikesCount} / 2 Strikes Accrued
            </span>
          </div>

          <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 space-y-2 text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
            <p className="font-bold text-stone-900 dark:text-stone-100">Fair-Use Reservation Policy</p>
            <p>
              To ensure all students get fair access to limited auditorium and workshop seats, Eventora monitors confirmed check-ins. If you reserve a seat and do not attend without cancelling at least 2 hours prior, you receive 1 strike.
            </p>
            <p>
              Accruing <strong>2 strikes</strong> pauses reservation privileges for a 30-day cooldown window.
            </p>
          </div>
        </Card>

        {/* Actions Footer */}
        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={isSaving}
            className="h-11 px-8 font-semibold shadow-sm inline-flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            <span>{isSaving ? 'Saving Changes...' : 'Save Profile'}</span>
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ProfilePage;
`;

fs.writeFileSync(profileFile, newProfileCode, 'utf8');
console.log('ProfilePage.tsx rewritten with 3 clean sections and tokens');
