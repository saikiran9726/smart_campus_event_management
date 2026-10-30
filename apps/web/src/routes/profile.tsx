import React from 'react';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RoleBadge } from '@/components/primitives/role-badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Mail, GraduationCap, Building, ShieldCheck, LogIn, LogOut } from 'lucide-react';
import { SignInButton } from '@clerk/clerk-react';

export const ProfilePage: React.FC = () => {
  const { isSignedIn, user, clerkUser, signOut } = useAuth();

  if (!isSignedIn) {
    return (
      <div className="container max-w-md px-4 py-16 mx-auto text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <LogIn className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Sign in to Eventora</h1>
          <p className="text-sm text-muted-foreground">
            Connect your university student account to access your tickets, channels, and passport.
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

  return (
    <div className="container max-w-3xl px-4 sm:px-8 py-8 mx-auto space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight">Student Profile</h1>
        <p className="text-muted-foreground text-sm">
          Verified academic profile information and campus affiliations.
        </p>
      </div>

      <Card className="border-border">
        <CardHeader className="flex flex-col sm:flex-row items-center gap-4 pb-4 border-b border-border/60">
          <Avatar className="h-20 w-20">
            <AvatarImage src={clerkUser?.imageUrl} alt={user?.fullName || 'Avatar'} />
            <AvatarFallback className="text-xl font-bold">
              {(user?.fullName || clerkUser?.fullName || 'U').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1.5 text-center sm:text-left flex-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="text-xl font-bold text-foreground">
                {user?.fullName || clerkUser?.fullName || 'Campus Member'}
              </h2>
              <RoleBadge role={user?.role || 'ATTENDEE'} />
            </div>
            <p className="text-sm text-muted-foreground flex items-center justify-center sm:justify-start gap-1.5">
              <Mail className="h-4 w-4" />
              <span>{user?.email || clerkUser?.primaryEmailAddress?.emailAddress}</span>
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => signOut()}
            className="flex items-center gap-2 text-destructive hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </Button>
        </CardHeader>

        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-muted/40 space-y-1">
              <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <GraduationCap className="h-3.5 w-3.5" />
                Roll Number
              </span>
              <p className="font-mono font-semibold text-sm">
                {user?.rollNumber || '22CS1049'}
              </p>
            </div>

            <div className="p-4 rounded-lg bg-muted/40 space-y-1">
              <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <Building className="h-3.5 w-3.5" />
                Department & Year
              </span>
              <p className="font-semibold text-sm">
                {user?.department || 'Computer Science & Engineering'} • Year {user?.collegeYear || 3}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <p className="font-semibold text-emerald-900 dark:text-emerald-300 text-sm">
                Account in Good Standing
              </p>
              <p className="text-xs text-emerald-800 dark:text-emerald-400">
                0 strikes. Eligible for instant ticket reservations and competition teams.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfilePage;
