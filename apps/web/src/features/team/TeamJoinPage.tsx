import React, { useState, useMemo } from 'react';
import { useSearchParams, useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SignInButton } from '@clerk/clerk-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatTeamCode, normalizeTeamCode } from '@eventora/shared';
import {
  Button,
  Card,
  Badge,
  StatusPill,
  CodeInput,
  CopyButton,
  ConfirmDialog,
  ProgressMeter,
  Avatar,
  PageHeader,
  ErrorState,
} from '@/components/shared';
import { toast } from '@/components/ui/use-toast';
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Lock,
  Calendar,
  LogOut,
  Sparkles,
} from 'lucide-react';

interface TeamPreviewData {
  teamId: string;
  teamName: string;
  eventId: string;
  eventTitle: string;
  leaderName: string;
  leaderAvatarUrl?: string;
  memberCount: number;
  minTeamSize: number;
  maxTeamSize: number;
  isLocked: boolean;
  isPaid: boolean;
  pricePaise: number;
  teamPaymentPolicy: 'PER_MEMBER' | 'PER_TEAM';
  formattedCode: string;
  inviteToken?: string;
}

const HUMAN_ERROR_MESSAGES: Record<
  string,
  { title: string; message: string; actionText?: string; actionHref?: string }
> = {
  INVALID: {
    title: 'Invalid Team Code',
    message: 'We could not find an active team with this code. Please check the code with your team leader.',
    actionText: 'Search Events',
    actionHref: '/',
  },
  EXPIRED: {
    title: 'Join Code Expired',
    message: 'This team code has passed its expiration time. Please ask your team leader to regenerate a fresh code.',
  },
  REVOKED: {
    title: 'Join Code Revoked',
    message: 'This code was revoked by the team leader and is no longer valid. Please request an updated invitation.',
  },
  TEAM_FULL: {
    title: 'Team is at Maximum Capacity',
    message: 'This team has already filled all available member spots and cannot accept additional teammates.',
    actionText: 'Find Other Teams',
    actionHref: '/',
  },
  ALREADY_MEMBER: {
    title: 'You Are Already a Member',
    message: 'You have already joined this team. Your registration and pass are active.',
    actionText: 'View in Passport',
    actionHref: '/passport',
  },
  ALREADY_IN_OTHER_TEAM_FOR_EVENT: {
    title: 'Already in Another Team',
    message: 'You are currently registered with another team for this event. You must leave that team first before joining.',
    actionText: 'Manage My Teams',
    actionHref: '/passport',
  },
  REGISTRATION_CLOSED: {
    title: 'Event Registration Concluded',
    message: 'The registration deadline for this event has passed and late joining is not allowed by organizers.',
    actionText: 'Explore Open Events',
    actionHref: '/',
  },
  NOT_ELIGIBLE: {
    title: 'Account Restricted or In Cooldown',
    message: 'Your campus account currently has active attendance strikes or a temporary cooldown restriction.',
    actionText: 'Check Profile Status',
    actionHref: '/profile',
  },
  NOT_AUTHENTICATED: {
    title: 'Authentication Required',
    message: 'You must be signed in with your university account to join a campus team.',
    actionText: 'Sign In Now',
    actionHref: '/profile',
  },
};

export const TeamJoinPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { token: routeToken } = useParams<{ token?: string }>();
  const navigate = useNavigate();
  const { user, isSignedIn } = useAuth();

  const codeParam = searchParams.get('code') || '';
  const tokenParam = routeToken || searchParams.get('token') || '';

  const [inputCode, setInputCode] = useState(codeParam);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<{ code: string; message: string } | null>(null);
  const [joinedTeam, setJoinedTeam] = useState<{ teamName: string; eventId: string; code: string } | null>(null);

  // Determine query target (token has precedence if in route)
  const isDirectToken = Boolean(tokenParam);
  const queryCodeOrToken = isDirectToken ? tokenParam : normalizeTeamCode(inputCode);

  // Fetch safe team preview
  const {
    data: preview,
    isLoading: isPreviewLoading,
    error: previewQueryError,
  } = useQuery<TeamPreviewData>({
    queryKey: ['team', 'preview', queryCodeOrToken],
    queryFn: async () => {
      const endpoint = isDirectToken
        ? `/teams/preview?token=${encodeURIComponent(queryCodeOrToken)}`
        : `/teams/preview?code=${encodeURIComponent(queryCodeOrToken)}`;

      const res = await api.get<{ team: TeamPreviewData }>(endpoint, { showToast: false });
      return res.team;
    },
    enabled: Boolean(
      (isDirectToken && queryCodeOrToken.length > 5) ||
      (!isDirectToken && queryCodeOrToken.length === 8)
    ),
    retry: false,
  });

  const activeError = joinError || (previewQueryError ? {
    code: (previewQueryError as any)?.code || 'INVALID',
    message: (previewQueryError as any)?.message || 'Invalid team code.',
  } : null);

  const errorInfo = activeError ? HUMAN_ERROR_MESSAGES[activeError.code] || {
    title: 'Unable to Join Team',
    message: activeError.message,
  } : null;

  const handleJoinConfirmed = async () => {
    if (!isSignedIn) {
      toast({
        variant: 'destructive',
        title: 'Authentication Required',
        description: 'Please sign in to join this team.',
      });
      return;
    }

    setIsJoining(true);
    setJoinError(null);
    try {
      const payload = isDirectToken ? { token: queryCodeOrToken } : { code: queryCodeOrToken };
      const res = await api.post<{ success: boolean; team: { name: string; id: string; inviteCode: string }; registration: any }>(
        '/teams/join',
        payload
      );

      setJoinedTeam({
        teamName: res.team?.name || preview?.teamName || 'Your Team',
        eventId: preview?.eventId || '',
        code: res.team?.inviteCode || preview?.formattedCode || queryCodeOrToken,
      });
      setIsConfirmOpen(false);
      toast({
        title: 'Joined Successfully!',
        description: `You are now a registered teammate in ${res.team?.name || preview?.teamName}.`,
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setJoinError({ code: err.code, message: err.message });
      } else {
        setJoinError({ code: 'ERROR', message: err instanceof Error ? err.message : 'Could not join team.' });
      }
      setIsConfirmOpen(false);
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8 text-left" data-testid="team-join-page">
      <PageHeader
        breadcrumbs={[
          { label: 'Campus Life', href: '/' },
          { label: 'Teams & Rosters', href: '/passport' },
          { label: 'Join Team' },
        ]}
        title={isDirectToken ? 'Team Invitation' : 'Join a Campus Team'}
        subtitle={
          isDirectToken
            ? 'You were invited to collaborate on a campus hackathon team.'
            : 'Enter an 8-character team code provided by your team leader to join their roster.'
        }
        badge={<Badge variant="primary" size="md" leftDot>Real-time Verification</Badge>}
      />

      {/* Outcome: Success Celebration Card */}
      {joinedTeam ? (
        <Card variant="teal-highlight" className="p-8 text-center space-y-6 max-w-lg mx-auto" data-testid="team-join-success-card">
          <div className="mx-auto h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="h-9 w-9 stroke-[2]" />
          </div>

          <div className="space-y-1.5">
            <h2 className="font-heading text-2xl font-extrabold text-stone-900 dark:text-stone-100">
              Welcome to Team {joinedTeam.teamName}!
            </h2>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Your registration seat is locked in and your digital gate pass has been issued.
            </p>
          </div>

          <div className="p-4 rounded-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500 font-medium">Team Code:</span>
              <span className="font-mono font-bold text-teal-800 dark:text-teal-300 tnum">
                {formatTeamCode(joinedTeam.code)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500 font-medium">Roster Status:</span>
              <StatusPill status="CONFIRMED" size="sm" />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              className="flex-1"
              onClick={() => navigate('/passport')}
              leftIcon={<Sparkles className="h-4 w-4 stroke-[1.75]" />}
            >
              Go to My Passport
            </Button>
            {joinedTeam.eventId && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => navigate(`/events/${joinedTeam.eventId}`)}
              >
                View Event Roster
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="max-w-xl mx-auto space-y-6">
          {/* 1. Code Input / Token Header Card */}
          <Card className="p-6 sm:p-8 space-y-6">
            {!isDirectToken ? (
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <h3 className="font-heading text-lg font-bold text-stone-900 dark:text-stone-100">
                    Enter 8-Character Join Code
                  </h3>
                  <p className="text-xs text-stone-500">
                    Crockford base32 format (e.g. K7M2-9QXA). Case-insensitive and hyphen-tolerant.
                  </p>
                </div>

                <div className="p-5 rounded-md bg-stone-50 dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800">
                  <CodeInput
                    value={inputCode}
                    onChange={(val) => {
                      setInputCode(val);
                      setJoinError(null);
                    }}
                    autoFocus
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 rounded-md bg-stone-50 dark:bg-stone-900 border border-stone-200">
                <div className="h-10 w-10 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-5 w-5 stroke-[2]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-stone-900 dark:text-stone-100">Verified Invitation Link</p>
                  <p className="text-[11px] text-stone-500 font-mono truncate">{tokenParam}</p>
                </div>
              </div>
            )}

            {/* Error Message Box */}
            {errorInfo && (
              <div className="p-4 rounded-md border border-red-200 bg-red-50/70 dark:border-red-900/50 dark:bg-red-950/20 space-y-2">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0 stroke-[2]" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-red-900 dark:text-red-300">{errorInfo.title}</p>
                    <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">{errorInfo.message}</p>
                  </div>
                </div>
                {'actionHref' in errorInfo && (errorInfo as any).actionHref && (
                  <div className="pt-1">
                    <Link
                      to={(errorInfo as any).actionHref}
                      className="inline-flex items-center justify-center rounded-md text-xs font-semibold h-7 px-3 border border-red-300 text-red-800 bg-white/80 hover:bg-white transition-colors"
                    >
                      {(errorInfo as any).actionText || 'Take Action'}
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* 2. Live Team Preview Card */}
            {preview && (
              <Card variant="teal-highlight" className="p-5 space-y-4" data-testid="team-preview-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-teal-800 dark:text-teal-400">
                      Target Team
                    </span>
                    <h4 className="font-heading text-xl font-extrabold text-stone-900 dark:text-stone-100">
                      {preview.teamName}
                    </h4>
                    <p className="text-xs text-stone-600 dark:text-stone-300">
                      For <span className="font-semibold">{preview.eventTitle}</span>
                    </p>
                  </div>
                  <StatusPill status="ACTIVE" size="sm" />
                </div>

                <div className="grid grid-cols-2 gap-3 p-3 rounded-md bg-white/90 dark:bg-stone-900/90 border border-stone-200 dark:border-stone-800 text-xs">
                  <div>
                    <span className="text-stone-500 block">Team Leader</span>
                    <div className="flex items-center gap-1.5 mt-1 font-semibold text-stone-800 dark:text-stone-200">
                      <Avatar name={preview.leaderName} size="xs" />
                      <span className="truncate">{preview.leaderName}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-stone-500 block">Payment Policy</span>
                    <span className="block mt-1 font-semibold text-stone-800 dark:text-stone-200">
                      {preview.isPaid
                        ? preview.teamPaymentPolicy === 'PER_MEMBER'
                          ? `₹${(preview.pricePaise / 100).toFixed(0)} / member`
                          : `₹${(preview.pricePaise / 100).toFixed(0)} / team`
                        : 'Free Entry'}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-stone-600">Roster Capacity</span>
                    <span className="font-mono font-semibold text-stone-800 dark:text-stone-200 tnum">
                      {preview.memberCount} / {preview.maxTeamSize} members
                    </span>
                  </div>
                  <ProgressMeter
                    value={preview.memberCount}
                    max={preview.maxTeamSize}
                    showPercentage={false}
                    variant="teal"
                  />
                </div>

                {/* Authentication Gate or Confirm Action */}
                {!isSignedIn ? (
                  <div className="pt-2">
                    <SignInButton mode="modal">
                      <Button className="w-full h-11 text-sm font-semibold shadow-sm">
                        Sign in to Accept & Join Team
                      </Button>
                    </SignInButton>
                  </div>
                ) : (
                  <div className="pt-2">
                    <Button
                      className="w-full h-11 text-sm font-bold shadow-sm"
                      onClick={() => setIsConfirmOpen(true)}
                      isLoading={isJoining}
                    >
                      {isDirectToken ? 'Accept Invitation & Join Team' : 'Confirm & Join Team'}
                    </Button>
                  </div>
                )}
              </Card>
            )}
          </Card>

          {/* Confirm Dialog */}
          <ConfirmDialog
            open={isConfirmOpen}
            onOpenChange={setIsConfirmOpen}
            title={`Join "${preview?.teamName}"?`}
            description={`You are about to register as a teammate for "${preview?.eventTitle}". Your pass will be created and your contact details will be shared with leader ${preview?.leaderName}.`}
            confirmLabel="Yes, Join Team"
            onConfirm={handleJoinConfirmed}
            isLoading={isJoining}
          />
        </div>
      )}
    </div>
  );
};

export default TeamJoinPage;
