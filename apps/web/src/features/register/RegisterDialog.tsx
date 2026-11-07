import React, { useState, useEffect } from 'react';
import { SignInButton } from '@clerk/clerk-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FormQuestionDef, QuestionType, buildAnswerValidator, formatTeamCode, ProjectSubmissionConfig } from '@eventora/shared';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TurnstileWidget } from '@/components/turnstile-widget';
import { SandboxCheckout } from './SandboxCheckout';
import { toast } from '@/components/ui/use-toast';
import {
  UploadCloud,
  CheckCircle2,
  Calendar,
  Clock,
  AlertTriangle,
  Globe,
  User,
  Users,
  Info,
  ShieldCheck,
  ChevronDown,
  Edit2,
  Check,
  ArrowLeft,
  Copy,
  Share2,
  ArrowRight,
  FileCode,
} from 'lucide-react';

const PHONE_REGEX = /^[6-9]\d{9}$/;

export interface RegisterDialogProps {
  eventId: string;
  eventTitle: string;
  pricePaise?: number | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (registration: Record<string, unknown>) => void;
}

export type RegistrationOutcome = 'CONFIRMED' | 'PAYMENT_REQUIRED' | 'WAITLISTED' | null;

interface EventFormData {
  questions: FormQuestionDef[];
  formVersion: number;
  formPublished: boolean;
  registrationMode: string;
  approvalRequired: boolean;
  minTeamSize?: number | null;
  maxTeamSize?: number | null;
  isCompetition?: boolean;
  projectSubmissionConfig?: ProjectSubmissionConfig | null;
}

export const RegisterDialog: React.FC<RegisterDialogProps> = ({
  eventId,
  eventTitle,
  pricePaise = 0,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const { user, refetchUser, isSignedIn } = useAuth();

  const [step, setStep] = useState<'FORM' | 'SUBMISSION' | 'REVIEW'>('FORM');
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [turnstileToken, setTurnstileToken] = useState<string>('test-pass');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<{ code: string; message: string; details?: unknown } | null>(null);

  // Optional / Mandatory Project Submission during registration
  const [projectSubmissionDraft, setProjectSubmissionDraft] = useState({
    projectTitle: '',
    abstract: '',
    repoUrl: '',
    demoUrl: '',
    deckKey: '',
  });
  const [projectSubmissionErrors, setProjectSubmissionErrors] = useState<Record<string, string>>({});

  // Registration Mode: 'INDIVIDUAL' | 'TEAM_CREATE' | 'TEAM_JOIN'
  const [regMode, setRegMode] = useState<'INDIVIDUAL' | 'TEAM_CREATE' | 'TEAM_JOIN'>('INDIVIDUAL');
  const [teamName, setTeamName] = useState('');
  const [teamJoinCode, setTeamJoinCode] = useState('');

  // Student Profile inline completion state
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [profileDraft, setProfileDraft] = useState({
    fullName: '',
    rollNumber: '',
    collegeName: '',
    department: '',
    year: '',
    program: '',
    phone: '',
  });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});

  // Sync profileDraft with user
  useEffect(() => {
    if (user) {
      setProfileDraft((prev) => {
        const next = {
          fullName: user.fullName || '',
          rollNumber: user.rollNumber || '',
          collegeName: user.collegeName || '',
          department: user.department || '',
          year: user.year ? String(user.year) : (user.collegeYear ? String(user.collegeYear) : ''),
          program: user.program || user.course || '',
          phone: user.phone || '',
        };
        if (
          prev.fullName === next.fullName &&
          prev.rollNumber === next.rollNumber &&
          prev.collegeName === next.collegeName &&
          prev.department === next.department &&
          prev.year === next.year &&
          prev.program === next.program &&
          prev.phone === next.phone
        ) {
          return prev;
        }
        return next;
      });
    }
  }, [
    user?.id,
    user?.fullName,
    user?.rollNumber,
    user?.collegeName,
    user?.department,
    user?.year,
    user?.collegeYear,
    user?.program,
    user?.course,
    user?.phone,
  ]);

  const isProfileComplete = Boolean(
    user?.fullName &&
    user?.rollNumber &&
    user?.collegeName &&
    user?.department &&
    (user?.year || user?.collegeYear) &&
    (user?.program || user?.course) &&
    user?.phone
  );

  // Upload states: { [questionId]: { progress: number; fileName: string; isUploading: boolean } }
  const [uploadStates, setUploadStates] = useState<
    Record<string, { progress: number; fileName: string; isUploading: boolean }>
  >({});

  // Registration outcome state
  const [outcome, setOutcome] = useState<RegistrationOutcome>(null);
  const [activeRegistration, setActiveRegistration] = useState<Record<string, unknown> | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const DRAFT_KEY = `eventora_reg_draft_${eventId}`;

  // Restore draft from localStorage when modal opens
  useEffect(() => {
    if (!isOpen) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.answers && typeof draft.answers === 'object') {
          setAnswers(draft.answers);
        }
        if (draft.regMode) setRegMode(draft.regMode);
        if (draft.teamName) setTeamName(draft.teamName);
        if (draft.teamJoinCode) setTeamJoinCode(draft.teamJoinCode);
      }
    } catch {
      // Ignore corrupted draft
    }
  }, [isOpen, eventId]);

  // Persist draft to localStorage as user types
  useEffect(() => {
    if (!isOpen || outcome) return;
    try {
      const hasContent =
        Object.keys(answers).length > 0 ||
        teamName.trim().length > 0 ||
        teamJoinCode.trim().length > 0;
      if (hasContent) {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            answers,
            regMode,
            teamName,
            teamJoinCode,
            step,
          })
        );
      }
    } catch {
      // Storage unavailable or full
    }
  }, [isOpen, outcome, answers, regMode, teamName, teamJoinCode, step, eventId]);

  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Ignore
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast({ title: 'Code Copied!', description: 'Team join code copied to clipboard.' });
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleShareCode = async (code: string, teamLabel: string) => {
    const shareText = `Join my team "${teamLabel}" for ${eventTitle} on Eventora! Use team code: ${formatTeamCode(code)} or join here: ${window.location.origin}/teams/join`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join team "${teamLabel}"`,
          text: shareText,
          url: `${window.location.origin}/teams/join`,
        });
        return;
      } catch {
        // user dismissed or share unsupported, fallback to clipboard
      }
    }
    navigator.clipboard.writeText(shareText);
    toast({ title: 'Invite Copied!', description: 'Team invite message copied to clipboard.' });
  };

  // Fetch form questions and metadata
  const { data: formData, isLoading: isFormLoading } = useQuery<EventFormData>({
    queryKey: ['events', eventId, 'form'],
    queryFn: async () => {
      try {
        const res = await api.get<EventFormData>(`/events/${eventId}/form`, {
          showToast: false,
        });
        return res;
      } catch {
        return {
          questions: [],
          formVersion: 1,
          formPublished: true,
          registrationMode: 'INDIVIDUAL',
          approvalRequired: false,
        };
      }
    },
    enabled: isOpen,
  });

  const questions: FormQuestionDef[] = Array.isArray(formData) ? formData : (formData?.questions || []);
  const formPublished = formData?.formPublished ?? true;
  const supportsTeams = Boolean(
    formData?.isCompetition ||
    formData?.registrationMode === 'TEAM' ||
    formData?.registrationMode === 'BOTH' ||
    (formData?.minTeamSize && formData.minTeamSize > 1)
  );

  const handleFileUpload = async (question: FormQuestionDef, file: File) => {
    const maxBytes = question.maxFileBytes || 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast({
        variant: 'destructive',
        title: 'File Too Large',
        description: `File size exceeds the limit of ${(maxBytes / 1024 / 1024).toFixed(1)} MB.`,
      });
      return;
    }

    setUploadStates((prev) => ({
      ...prev,
      [question.id]: { progress: 10, fileName: file.name, isUploading: true },
    }));

    try {
      const presign = await api.post<{ uploadUrl: string; key: string }>('/uploads/presign', {
        purpose: 'GENERAL',
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      });

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', presign.uploadUrl, true);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 90);
            setUploadStates((prev) => ({
              ...prev,
              [question.id]: { progress: percent, fileName: file.name, isUploading: true },
            }));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error('Network error during file upload'));
        xhr.send(file);
      });

      await api.post('/uploads/confirm', { key: presign.key });

      setUploadStates((prev) => ({
        ...prev,
        [question.id]: { progress: 100, fileName: file.name, isUploading: false },
      }));

      setAnswers((prev) => ({
        ...prev,
        [question.id]: {
          objectKey: presign.key,
          sizeBytes: file.size,
          mimeType: file.type || 'application/octet-stream',
        },
      }));

      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[question.id];
        return next;
      });
    } catch (err: unknown) {
      setUploadStates((prev) => ({
        ...prev,
        [question.id]: { progress: 0, fileName: '', isUploading: false },
      }));
      toast({
        variant: 'destructive',
        title: 'Upload Failed',
        description: err instanceof Error ? err.message : 'Could not upload file.',
      });
    }
  };

  const handleFieldChange = (questionId: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  };

  const validateProfile = (): boolean => {
    const errors: Record<string, string> = {};
    if (!profileDraft.fullName.trim()) errors.fullName = 'Full name is required';
    if (!profileDraft.rollNumber.trim()) errors.rollNumber = 'Roll number / ID is required';
    if (!profileDraft.collegeName.trim()) errors.collegeName = 'College name is required';
    if (!profileDraft.department.trim()) errors.department = 'Department is required';
    if (!profileDraft.year.trim()) errors.year = 'Year is required';
    if (!profileDraft.program.trim()) errors.program = 'Program is required';
    if (!profileDraft.phone.trim()) {
      errors.phone = 'Mobile number is required';
    } else if (!PHONE_REGEX.test(profileDraft.phone.replace(/[\s-]/g, ''))) {
      errors.phone = 'Enter a valid 10-digit mobile number';
    }
    setProfileErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleClose = () => {
    setStep('FORM');
    setServerError(null);
    setFieldErrors({});
    onClose();
  };

  const handleProceedToReview = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setServerError(null);
    setFieldErrors({});

    // 1. Client-side Zod validation with buildAnswerValidator
    if (questions.length > 0) {
      try {
        const validator = buildAnswerValidator(questions);
        validator.parse(answers);
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'errors' in err && Array.isArray((err as { errors: unknown[] }).errors)) {
          const errors = (err as { errors: Array<{ path: (string | number)[]; message: string }> }).errors;
          const mapped: Record<string, string> = {};
          for (const error of errors) {
            const key = String(error.path[0] || '');
            if (key) mapped[key] = error.message;
          }
          setFieldErrors(mapped);
          toast({
            variant: 'destructive',
            title: 'Please check your inputs',
            description: 'One or more required fields have invalid answers.',
          });
          return;
        }
      }
    }

    // 2. Profile Completeness Check
    if ((!isProfileComplete && user?.role === 'STUDENT') || showProfileEdit) {
      if (!validateProfile()) {
        toast({
          variant: 'destructive',
          title: 'Complete Profile Required',
          description: 'Please fill in all student profile fields to proceed with registration.',
        });
        setShowProfileEdit(true);
        return;
      }
    }

    // 3. Team Code / Name Validation
    if (regMode === 'TEAM_CREATE' && !teamName.trim()) {
      setServerError({
        code: 'VALIDATION_FAILED',
        message: 'Please enter a team name to register as a team.',
      });
      return;
    }
    if (regMode === 'TEAM_JOIN' && !teamJoinCode.trim()) {
      setServerError({
        code: 'VALIDATION_FAILED',
        message: 'Please enter the team invite code to join.',
      });
      return;
    }

    const subConfig = formData?.projectSubmissionConfig;
    if (subConfig?.enabled && subConfig?.timing === 'DURING_REGISTRATION') {
      setStep('SUBMISSION');
      return;
    }

    setStep('REVIEW');
  };

  const handleProceedFromSubmission = (skip = false) => {
    setProjectSubmissionErrors({});
    const subConfig = formData?.projectSubmissionConfig;
    if (!subConfig || skip) {
      if (skip) {
        setProjectSubmissionDraft({
          projectTitle: '',
          abstract: '',
          repoUrl: '',
          demoUrl: '',
          deckKey: '',
        });
      }
      setStep('REVIEW');
      return;
    }

    const errors: Record<string, string> = {};
    for (const field of subConfig.fields || []) {
      if (!field.enabled || !field.required) continue;

      if (field.key === 'title' && !projectSubmissionDraft.projectTitle.trim()) {
        errors.title = `${field.label} is required.`;
      }
      if (field.key === 'abstract' && !projectSubmissionDraft.abstract.trim()) {
        errors.abstract = `${field.label} is required.`;
      }
      if (field.key === 'repoUrl') {
        if (!projectSubmissionDraft.repoUrl.trim()) {
          errors.repoUrl = `${field.label} is required.`;
        } else if (
          !/^https:\/\/(www\.)?(github\.com|gitlab\.com)\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+.*$/i.test(
            projectSubmissionDraft.repoUrl.trim()
          )
        ) {
          errors.repoUrl = 'Must be a valid GitHub or GitLab URL.';
        }
      }
      if (field.key === 'demoUrl' && !projectSubmissionDraft.demoUrl.trim()) {
        errors.demoUrl = `${field.label} is required.`;
      }
    }

    if (Object.keys(errors).length > 0) {
      setProjectSubmissionErrors(errors);
      return;
    }

    setStep('REVIEW');
  };

  const handleFinalSubmit = async () => {
    if (isSubmitting) return;
    setServerError(null);

    // Save profile if changed
    if ((!isProfileComplete && user?.role === 'STUDENT') || showProfileEdit) {
      try {
        await api.patch('/me', {
          fullName: profileDraft.fullName.trim(),
          rollNumber: profileDraft.rollNumber.trim(),
          collegeName: profileDraft.collegeName.trim(),
          department: profileDraft.department.trim(),
          year: parseInt(profileDraft.year, 10),
          program: profileDraft.program.trim(),
          phone: profileDraft.phone.trim(),
        });
        refetchUser();
        setShowProfileEdit(false);
      } catch (err: unknown) {
        toast({
          variant: 'destructive',
          title: 'Profile Update Failed',
          description: err instanceof Error ? err.message : 'Could not save student profile.',
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (regMode === 'TEAM_CREATE') {
        const teamRes = await api.post<{
          team: { id: string; name: string; inviteCode: string };
          registration: Record<string, unknown>;
        }>(`/events/${eventId}/teams`, {
          name: teamName.trim(),
          answers,
        });

        if (projectSubmissionDraft.projectTitle?.trim() || projectSubmissionDraft.repoUrl?.trim()) {
          try {
            await api.post(`/events/${eventId}/submissions`, {
              projectTitle: projectSubmissionDraft.projectTitle?.trim() || null,
              abstract: projectSubmissionDraft.abstract?.trim() || null,
              repoUrl: projectSubmissionDraft.repoUrl?.trim() || null,
              demoUrl: projectSubmissionDraft.demoUrl?.trim() || null,
            });
          } catch {
            // Non-critical background save
          }
        }

        const effectiveOutcome: RegistrationOutcome =
          pricePaise && pricePaise > 0 ? 'PAYMENT_REQUIRED' : 'CONFIRMED';

        setActiveRegistration({
          ...teamRes.registration,
          teamName: teamRes.team.name,
          inviteCode: teamRes.team.inviteCode,
        });
        setOutcome(effectiveOutcome);
        clearDraft();

        queryClient.invalidateQueries({ queryKey: ['events'] });
        queryClient.invalidateQueries({ queryKey: ['events', eventId, 'teams'] });
        queryClient.invalidateQueries({ queryKey: ['me', 'registrations'] });
        toast({
          title: 'Team Created!',
          description: `Team "${teamRes.team.name}" registered. Share invite code: ${formatTeamCode(teamRes.team.inviteCode)}`,
        });
        onSuccess?.(teamRes.registration);
        return;
      }

      if (regMode === 'TEAM_JOIN') {
        await api.post('/teams/join', {
          code: teamJoinCode.trim(),
        });
        clearDraft();
        toast({
          title: 'Joined Team!',
          description: 'You have joined the team. Your pass is now active in your Passport.',
        });
        queryClient.invalidateQueries({ queryKey: ['events'] });
        queryClient.invalidateQueries({ queryKey: ['events', eventId, 'teams'] });
        queryClient.invalidateQueries({ queryKey: ['me', 'registrations'] });
        handleClose();
        return;
      }

      // Individual registration
      const res = await api.post<{
        outcome?: 'CONFIRMED' | 'PAYMENT_REQUIRED' | 'WAITLISTED';
        status?: RegistrationOutcome;
        registration: Record<string, unknown>;
        ticket?: {
          id: string;
          token?: string;
          status?: string;
        };
        position?: number;
        paymentRequired?: boolean;
      }>(`/events/${eventId}/registrations`, {
        answers,
        turnstileToken,
        projectSubmission:
          projectSubmissionDraft.projectTitle?.trim() || projectSubmissionDraft.repoUrl?.trim()
            ? projectSubmissionDraft
            : undefined,
      });

      const effectiveOutcome: RegistrationOutcome =
        res.outcome ||
        res.status ||
        (res.registration?.status as RegistrationOutcome) ||
        (res.paymentRequired || (pricePaise && pricePaise > 0) ? 'PAYMENT_REQUIRED' : 'CONFIRMED');

      const registrationRecord = {
        ...res.registration,
        ticket: res.ticket,
        position: res.position,
        ticketToken: res.ticket?.token,
      };

      setActiveRegistration(registrationRecord);
      setOutcome(effectiveOutcome);
      clearDraft();

      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['me', 'registrations'] });
      queryClient.invalidateQueries({ queryKey: ['me', 'passport'] });

      onSuccess?.(registrationRecord);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setServerError({
          code: err.code,
          message: err.message,
          details: err.details,
        });

        if (err.code === 'VALIDATION_FAILED' && typeof err.details === 'object' && err.details) {
          const detailsObj = err.details as Record<string, string>;
          setFieldErrors(detailsObj);
          setStep('FORM');
        }
      } else {
        setServerError({
          code: 'ERROR',
          message: err instanceof Error ? err.message : 'Registration failed.',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadIcs = () => {
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Eventora//Campus Event OS//EN',
      'BEGIN:VEVENT',
      `SUMMARY:${eventTitle}`,
      `DESCRIPTION:Verified Campus Event Ticket via Eventora`,
      `DTSTART:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTEND:${new Date(Date.now() + 7200000).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${eventTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const isAuthenticated = Boolean(user && isSignedIn !== false);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-6">
        {/* Outcome 1: CONFIRMED Screen */}
        {outcome === 'CONFIRMED' && (
          <div className="py-6 text-center space-y-5" data-testid="registration-confirmed-view">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div className="space-y-1">
              <DialogTitle className="text-2xl font-bold">You are Confirmed!</DialogTitle>
              <DialogDescription>
                Your registration seat is reserved and your ticket has been issued.
              </DialogDescription>
            </div>

            <div className="p-4 rounded-xl border border-border bg-muted/30 text-left space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Event</span>
                <span className="text-xs font-bold text-foreground">{eventTitle}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Registration Status</span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  Confirmed
                </span>
              </div>
              {((activeRegistration?.ticket as any)?.token as string) || (activeRegistration?.ticketToken as string) ? (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Pass Code</span>
                  <span className="font-mono text-xs font-bold text-primary">
                    {(((activeRegistration?.ticket as any)?.token as string) || (activeRegistration?.ticketToken as string))}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Prominent Team Join Code Card */}
            {activeRegistration?.inviteCode ? (
              <div className="p-5 rounded-2xl border-2 border-primary/30 bg-primary/5 dark:bg-primary/10 text-left space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-wide uppercase text-primary">
                    Your Team Join Code
                  </span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                    ACTIVE
                  </span>
                </div>

                <div className="text-center py-3 bg-background/90 rounded-xl border border-primary/20 shadow-inner">
                  <div className="font-mono text-3xl sm:text-4xl font-extrabold tracking-widest text-primary select-all">
                    {formatTeamCode(String(activeRegistration.inviteCode))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 px-4">
                    Share this 8-character code with your teammates to let them join your team instantly.
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5 h-10 font-medium"
                    onClick={() => handleCopyCode(String(activeRegistration.inviteCode))}
                  >
                    {copiedCode ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="flex-1 gap-1.5 h-10 font-medium"
                    onClick={() => handleShareCode(String(activeRegistration.inviteCode), String(activeRegistration.teamName || 'Your Team'))}
                  >
                    <Share2 className="h-4 w-4" />
                    <span>Share Invite</span>
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 h-12 inline-flex items-center justify-center gap-2"
                onClick={handleDownloadIcs}
              >
                <Calendar className="h-4 w-4" />
                <span>Add to Calendar (.ics)</span>
              </Button>
              <Button
                className="flex-1 h-12 inline-flex items-center justify-center gap-2"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ['events', eventId, 'teams'] });
                  handleClose();
                }}
              >
                {activeRegistration?.inviteCode ? (
                  <>
                    <span>View Team in Event</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                ) : (
                  <span>Done & View Passport</span>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Outcome 2: PAYMENT_REQUIRED Sandbox Screen */}
        {outcome === 'PAYMENT_REQUIRED' && (
          <SandboxCheckout
            eventId={eventId}
            registrationId={(activeRegistration?.id as string) || ''}
            eventTitle={eventTitle}
            amountPaise={pricePaise || 19900}
            onSuccess={(receipt) => {
              setOutcome('CONFIRMED');
              queryClient.invalidateQueries({ queryKey: ['events'] });
              queryClient.invalidateQueries({ queryKey: ['me', 'registrations'] });
              queryClient.invalidateQueries({ queryKey: ['me', 'passport'] });
              onSuccess?.({ ...activeRegistration, receipt });
            }}
            onFailure={() => {
              setServerError({
                code: 'PAYMENT_FAILED',
                message: 'Simulated payment was declined. You may re-attempt.',
              });
              setOutcome(null);
            }}
            onCancel={() => setOutcome(null)}
          />
        )}

        {/* Outcome 3: WAITLISTED Screen */}
        {outcome === 'WAITLISTED' && (
          <div className="py-6 text-center space-y-5" data-testid="registration-waitlisted-view">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock className="h-8 w-8" />
            </div>

            <div className="space-y-1">
              <DialogTitle className="text-2xl font-bold">Added to Live Waitlist</DialogTitle>
              <DialogDescription>
                This event is currently at maximum capacity. You hold an active queue slot.
              </DialogDescription>
            </div>

            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-center space-y-1">
              <span className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
                Current Queue Position
              </span>
              <p className="text-3xl font-extrabold text-amber-900 dark:text-amber-200 tnum">
                {typeof activeRegistration?.position === 'number'
                  ? `#${activeRegistration.position}`
                  : typeof activeRegistration?.waitlistPosition === 'number'
                  ? `#${activeRegistration.waitlistPosition}`
                  : 'Waitlisted'}
              </p>
              <p className="text-[11px] text-muted-foreground pt-1">
                If an attendee cancels, you will receive an alert with a 20-minute claim window.
              </p>
            </div>

            <Button className="w-full h-12" onClick={handleClose}>
              Got It
            </Button>
          </div>
        )}

        {/* Unauthenticated State */}
        {!outcome && !isAuthenticated && (
          <div className="py-6 text-center space-y-5" data-testid="auth-required-view">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="h-7 w-7" />
            </div>

            <div className="space-y-1">
              <DialogTitle className="text-xl font-bold">Sign in to Register</DialogTitle>
              <DialogDescription>
                You must be signed in with your university account to register for {eventTitle}.
              </DialogDescription>
            </div>

            <div className="p-4 rounded-xl border border-border bg-muted/30 text-xs text-muted-foreground space-y-1.5 text-left">
              <p className="font-semibold text-foreground">Why authentication is required:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Issues verified digital attendance pass linked to your student ID.</li>
                <li>Ensures fair queue positioning and prevents duplicate registrations.</li>
                <li>Pre-fills your academic credentials and verified department details.</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button variant="outline" className="flex-1 h-12 min-h-12" onClick={handleClose}>
                Cancel
              </Button>
              <SignInButton mode="modal">
                <Button className="flex-1 h-12 min-h-12 font-semibold">Sign In with Student Account</Button>
              </SignInButton>
            </div>
          </div>
        )}

        {/* Step: Project Deliverables Submission (During Registration) */}
        {!outcome && isAuthenticated && step === 'SUBMISSION' && (
          <div className="space-y-5" data-testid="registration-submission-step">
            <DialogHeader className="space-y-1 text-left">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-md bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300">
                  <FileCode className="h-4 w-4" />
                </span>
                <DialogTitle className="text-xl font-bold">
                  {formData?.projectSubmissionConfig?.requirement === 'MANDATORY'
                    ? 'Mandatory Project Submission'
                    : 'Optional Project Submission'}
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-muted-foreground">
                {formData?.projectSubmissionConfig?.requirement === 'MANDATORY'
                  ? 'This event requires project deliverables during registration for jury evaluation.'
                  : 'You may submit project deliverables now, or skip and provide them later before the deadline.'}
              </DialogDescription>
            </DialogHeader>

            {/* Requirement / Deadline Pill */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-stone-100 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 text-xs">
              <span
                className={`font-bold px-2 py-0.5 rounded-md text-[11px] ${
                  formData?.projectSubmissionConfig?.requirement === 'MANDATORY'
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                    : 'bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300'
                }`}
              >
                {formData?.projectSubmissionConfig?.requirement === 'MANDATORY'
                  ? 'Required for Registration'
                  : 'Optional Step'}
              </span>

              {formData?.projectSubmissionConfig?.deadline && (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Deadline: {new Date(formData.projectSubmissionConfig.deadline).toLocaleDateString()}
                </span>
              )}
            </div>

            {/* Configured Fields */}
            <div className="space-y-3.5 max-h-[50vh] overflow-y-auto pr-1">
              {formData?.projectSubmissionConfig?.fields?.map((field) => {
                if (!field.enabled) return null;

                if (field.key === 'title') {
                  return (
                    <div key="title" className="space-y-1">
                      <Label className="text-xs font-semibold">
                        {field.label} {field.required && <span className="text-rose-500">*</span>}
                      </Label>
                      <Input
                        value={projectSubmissionDraft.projectTitle}
                        onChange={(e) =>
                          setProjectSubmissionDraft((prev) => ({
                            ...prev,
                            projectTitle: e.target.value,
                          }))
                        }
                        placeholder="e.g. SmartCampus AI Navigation"
                        className={`h-9 text-xs ${
                          projectSubmissionErrors.title ? 'border-rose-500' : ''
                        }`}
                      />
                      {projectSubmissionErrors.title && (
                        <p className="text-[11px] text-rose-500">{projectSubmissionErrors.title}</p>
                      )}
                    </div>
                  );
                }

                if (field.key === 'abstract') {
                  return (
                    <div key="abstract" className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">
                          {field.label} {field.required && <span className="text-rose-500">*</span>}
                        </Label>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {projectSubmissionDraft.abstract.length} / 2000
                        </span>
                      </div>
                      <Textarea
                        value={projectSubmissionDraft.abstract}
                        onChange={(e) =>
                          setProjectSubmissionDraft((prev) => ({
                            ...prev,
                            abstract: e.target.value,
                          }))
                        }
                        maxLength={2000}
                        placeholder="Brief problem statement, solution overview, tech stack..."
                        className={`text-xs min-h-[80px] ${
                          projectSubmissionErrors.abstract ? 'border-rose-500' : ''
                        }`}
                      />
                      {projectSubmissionErrors.abstract && (
                        <p className="text-[11px] text-rose-500">
                          {projectSubmissionErrors.abstract}
                        </p>
                      )}
                    </div>
                  );
                }

                if (field.key === 'repoUrl') {
                  return (
                    <div key="repoUrl" className="space-y-1">
                      <Label className="text-xs font-semibold">
                        {field.label} {field.required && <span className="text-rose-500">*</span>}
                      </Label>
                      <Input
                        value={projectSubmissionDraft.repoUrl}
                        onChange={(e) =>
                          setProjectSubmissionDraft((prev) => ({
                            ...prev,
                            repoUrl: e.target.value,
                          }))
                        }
                        placeholder="https://github.com/org/repo"
                        className={`h-9 text-xs ${
                          projectSubmissionErrors.repoUrl ? 'border-rose-500' : ''
                        }`}
                      />
                      {projectSubmissionErrors.repoUrl && (
                        <p className="text-[11px] text-rose-500">
                          {projectSubmissionErrors.repoUrl}
                        </p>
                      )}
                    </div>
                  );
                }

                if (field.key === 'demoUrl') {
                  return (
                    <div key="demoUrl" className="space-y-1">
                      <Label className="text-xs font-semibold">
                        {field.label} {field.required && <span className="text-rose-500">*</span>}
                      </Label>
                      <Input
                        value={projectSubmissionDraft.demoUrl}
                        onChange={(e) =>
                          setProjectSubmissionDraft((prev) => ({
                            ...prev,
                            demoUrl: e.target.value,
                          }))
                        }
                        placeholder="https://youtu.be/... or live link"
                        className={`h-9 text-xs ${
                          projectSubmissionErrors.demoUrl ? 'border-rose-500' : ''
                        }`}
                      />
                      {projectSubmissionErrors.demoUrl && (
                        <p className="text-[11px] text-rose-500">
                          {projectSubmissionErrors.demoUrl}
                        </p>
                      )}
                    </div>
                  );
                }

                return null;
              })}
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-border flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep('FORM')}
                className="text-xs gap-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </Button>

              <div className="flex items-center gap-2">
                {formData?.projectSubmissionConfig?.requirement === 'OPTIONAL' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleProceedFromSubmission(true)}
                    className="text-xs text-stone-600 dark:text-stone-400 hover:text-stone-900"
                    data-testid="skip-project-submission-btn"
                  >
                    Skip for Now
                  </Button>
                )}

                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleProceedFromSubmission(false)}
                  className="text-xs font-bold gap-1 bg-teal-600 hover:bg-teal-700 text-white"
                  data-testid="save-project-submission-btn"
                >
                  <span>Continue to Review</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Review Answers View */}
        {!outcome && isAuthenticated && step === 'REVIEW' && (
          <div className="space-y-5" data-testid="registration-review-view">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-xl font-bold">Review Registration Details</DialogTitle>
              <DialogDescription>
                Please verify your details before confirming your attendance pass for {eventTitle}.
              </DialogDescription>
            </DialogHeader>

            {serverError && (
              <div
                className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2.5"
                data-testid="registration-server-error"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">{serverError.message}</p>
                </div>
              </div>
            )}

            {/* Event & Pass Summary */}
            <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-muted-foreground">Event</span>
                <span className="font-bold text-foreground">{eventTitle}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-muted-foreground">Registration Fee</span>
                <span className="font-bold text-foreground">
                  {pricePaise && pricePaise > 0 ? `₹${(pricePaise / 100).toFixed(2)}` : 'Free Entry'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-muted-foreground">Registration Mode</span>
                <span className="font-medium text-foreground">
                  {regMode === 'INDIVIDUAL'
                    ? 'Individual'
                    : regMode === 'TEAM_CREATE'
                    ? `Team Lead · "${teamName}"`
                    : `Team Member · Code: ${teamJoinCode}`}
                </span>
              </div>
              {projectSubmissionDraft.projectTitle && (
                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <span className="font-semibold text-muted-foreground">Project Deliverables</span>
                  <span className="font-medium text-teal-600 dark:text-teal-400">
                    {projectSubmissionDraft.projectTitle}
                  </span>
                </div>
              )}
            </div>

            {/* Verified Student Details */}
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-2 text-xs">
              <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 font-semibold">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Student Credentials</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-1">
                <div>
                  <span className="font-medium text-foreground">Name:</span> {profileDraft.fullName || user?.fullName}
                </div>
                <div>
                  <span className="font-medium text-foreground">Roll No:</span> {profileDraft.rollNumber || user?.rollNumber}
                </div>
                <div>
                  <span className="font-medium text-foreground">Dept & Year:</span>{' '}
                  {profileDraft.department || user?.department} (Yr {profileDraft.year || user?.year || user?.collegeYear})
                </div>
                <div>
                  <span className="font-medium text-foreground">Program:</span> {profileDraft.program || user?.program || user?.course}
                </div>
                <div>
                  <span className="font-medium text-foreground">Mobile:</span> {profileDraft.phone || user?.phone}
                </div>
                <div className="truncate">
                  <span className="font-medium text-foreground">College:</span> {profileDraft.collegeName || user?.collegeName}
                </div>
              </div>
            </div>

            {/* Questionnaire Answers Review */}
            {questions.length > 0 && regMode !== 'TEAM_JOIN' && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Questionnaire Answers ({questions.length})
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setStep('FORM')}
                    className="h-7 text-xs text-primary gap-1 px-2"
                  >
                    <Edit2 className="h-3 w-3" />
                    <span>Edit Answers</span>
                  </Button>
                </div>

                <div className="space-y-2 rounded-xl border border-border bg-card p-3.5 text-xs divide-y divide-border/60">
                  {questions.map((q) => {
                    if (q.type === QuestionType.INSTRUCTION) return null;
                    const val = answers[q.id];
                    let displayVal: React.ReactNode = (
                      <span className="text-muted-foreground italic">Not answered</span>
                    );

                    if (val !== undefined && val !== null && val !== '') {
                      if (Array.isArray(val)) {
                        displayVal = (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {val.map((item) => (
                              <span
                                key={item}
                                className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-medium"
                              >
                                {item}
                              </span>
                            ))}
                          </div>
                        );
                      } else if (typeof val === 'boolean') {
                        displayVal = (
                          <span className="font-semibold text-foreground">{val ? 'Yes' : 'No'}</span>
                        );
                      } else if (typeof val === 'object' && 'fileName' in (val as Record<string, unknown>)) {
                        displayVal = (
                          <span className="font-mono text-[11px] text-foreground">
                            {(val as { fileName: string }).fileName}
                          </span>
                        );
                      } else if (typeof val === 'object' && 'objectKey' in (val as Record<string, unknown>)) {
                        displayVal = (
                          <span className="font-mono text-[11px] text-foreground">
                            File attached ({(val as { sizeBytes?: number }).sizeBytes ? `${Math.round((val as { sizeBytes: number }).sizeBytes / 1024)} KB` : 'Uploaded'})
                          </span>
                        );
                      } else {
                        displayVal = <span className="font-medium text-foreground">{String(val)}</span>;
                      }
                    }

                    return (
                      <div key={q.id} className="pt-2 first:pt-0 pb-1.5 space-y-0.5" data-testid={`review-answer-${q.id}`}>
                        <p className="font-semibold text-foreground text-xs">{q.label}</p>
                        <div className="text-xs">{displayVal}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action Buttons: Back vs Confirm */}
            <div className="flex gap-3 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('FORM')}
                className="flex-1 h-12 min-h-12 inline-flex items-center justify-center gap-2"
                data-testid="back-to-form-btn"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Edit Answers</span>
              </Button>
              <Button
                type="button"
                disabled={isSubmitting}
                onClick={handleFinalSubmit}
                className="flex-1 h-12 min-h-12 font-semibold shadow-md"
                data-testid="confirm-registration-btn"
              >
                {isSubmitting
                  ? 'Confirming...'
                  : regMode === 'TEAM_CREATE'
                  ? 'Confirm & Register Team'
                  : regMode === 'TEAM_JOIN'
                  ? 'Confirm & Join Team'
                  : pricePaise && pricePaise > 0
                  ? `Proceed to Pay ₹${(pricePaise / 100).toFixed(2)}`
                  : 'Confirm Registration'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Normal Registration Form View */}
        {!outcome && isAuthenticated && step === 'FORM' && (
          <>
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-xl font-bold">Register for {eventTitle}</DialogTitle>
              <DialogDescription>
                Complete required registration details to secure your attendance pass.
              </DialogDescription>
            </DialogHeader>

            {/* Unpublish Warning Banner */}
            {!formPublished && (
              <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Form Currently Unpublished</p>
                  <p className="text-[11px] opacity-90">
                    The organizer is currently reviewing this registration form. You may still preview or submit, but submissions may be subject to review.
                  </p>
                </div>
              </div>
            )}

            {/* Inline Server Error Banner */}
            {serverError && (
              <div
                className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2.5"
                data-testid="registration-server-error"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">{serverError.message}</p>
                  {serverError.code === 'COOLDOWN_ACTIVE' && (
                    <p className="text-[11px] opacity-90">
                      Your account is currently in cooldown due to previous consecutive no-shows.
                    </p>
                  )}
                  {serverError.code === 'SOLD_OUT' && (
                    <p className="text-[11px] opacity-90">
                      Capacity has filled up. Submitting will place you on the waitlist queue.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Academic Profile Verification Card */}
            <div className="space-y-3">
              {isProfileComplete && !showProfileEdit ? (
                <div
                  className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-xs space-y-2"
                  data-testid="profile-verified-card"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold">
                      <ShieldCheck className="h-4 w-4" />
                      <span>Verified Academic Profile (Auto-Prefilled)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowProfileEdit(true)}
                      className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      <Edit2 className="h-3 w-3" />
                      <span>Edit</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-muted-foreground pt-1">
                    <div>
                      <span className="font-medium text-foreground">Name:</span> {user?.fullName}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Roll No:</span> {user?.rollNumber}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Dept:</span> {user?.department} (Yr {user?.year || user?.collegeYear})
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Program:</span> {user?.program || user?.course}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Mobile:</span> {user?.phone}
                    </div>
                    <div className="col-span-2 truncate">
                      <span className="font-medium text-foreground">College:</span> {user?.collegeName}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground border-t border-emerald-500/10 pt-1.5">
                    Organizers see this verified profile for attendance, certification, and gate check-in.
                  </p>
                </div>
              ) : (
                <div
                  className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs space-y-3"
                  data-testid="profile-incomplete-card"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>Complete Your Student Profile</span>
                    </div>
                    <a
                      href={`/profile?returnUrl=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname + window.location.search : '')}`}
                      className="text-[11px] text-primary hover:underline whitespace-nowrap font-medium"
                    >
                      Open Profile Page &rarr;
                    </a>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Event organizers require verified student credentials for entry verification and certificates. Fill in the details below to proceed.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <Label className="text-xs">Full Name *</Label>
                      <Input
                        value={profileDraft.fullName}
                        onChange={(e) => setProfileDraft((p) => ({ ...p, fullName: e.target.value }))}
                        placeholder="John Doe"
                        className={profileErrors.fullName ? 'border-rose-500 h-9' : 'h-9'}
                      />
                      {profileErrors.fullName && <p className="text-[10px] text-rose-500">{profileErrors.fullName}</p>}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Roll Number / Student ID *</Label>
                      <Input
                        value={profileDraft.rollNumber}
                        onChange={(e) => setProfileDraft((p) => ({ ...p, rollNumber: e.target.value }))}
                        placeholder="22CS01042"
                        className={profileErrors.rollNumber ? 'border-rose-500 h-9' : 'h-9'}
                      />
                      {profileErrors.rollNumber && <p className="text-[10px] text-rose-500">{profileErrors.rollNumber}</p>}
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">College / University Name *</Label>
                      <Input
                        value={profileDraft.collegeName}
                        onChange={(e) => setProfileDraft((p) => ({ ...p, collegeName: e.target.value }))}
                        placeholder="National Institute of Technology"
                        className={profileErrors.collegeName ? 'border-rose-500 h-9' : 'h-9'}
                      />
                      {profileErrors.collegeName && <p className="text-[10px] text-rose-500">{profileErrors.collegeName}</p>}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Department *</Label>
                      <Input
                        value={profileDraft.department}
                        onChange={(e) => setProfileDraft((p) => ({ ...p, department: e.target.value }))}
                        placeholder="Computer Science"
                        className={profileErrors.department ? 'border-rose-500 h-9' : 'h-9'}
                      />
                      {profileErrors.department && <p className="text-[10px] text-rose-500">{profileErrors.department}</p>}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Year of Study *</Label>
                      <Select
                        value={profileDraft.year}
                        onValueChange={(val) => setProfileDraft((p) => ({ ...p, year: val }))}
                      >
                        <SelectTrigger className={profileErrors.year ? 'border-rose-500 h-9' : 'h-9'}>
                          <SelectValue placeholder="Select year" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1st Year</SelectItem>
                          <SelectItem value="2">2nd Year</SelectItem>
                          <SelectItem value="3">3rd Year</SelectItem>
                          <SelectItem value="4">4th Year</SelectItem>
                          <SelectItem value="5">5th Year</SelectItem>
                        </SelectContent>
                      </Select>
                      {profileErrors.year && <p className="text-[10px] text-rose-500">{profileErrors.year}</p>}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Program / Degree *</Label>
                      <Input
                        value={profileDraft.program}
                        onChange={(e) => setProfileDraft((p) => ({ ...p, program: e.target.value }))}
                        placeholder="B.Tech, MCA, M.Sc"
                        className={profileErrors.program ? 'border-rose-500 h-9' : 'h-9'}
                      />
                      {profileErrors.program && <p className="text-[10px] text-rose-500">{profileErrors.program}</p>}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Mobile Number (10 digits) *</Label>
                      <Input
                        type="tel"
                        value={profileDraft.phone}
                        onChange={(e) => setProfileDraft((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="9876543210"
                        className={profileErrors.phone ? 'border-rose-500 h-9' : 'h-9'}
                      />
                      {profileErrors.phone && <p className="text-[10px] text-rose-500">{profileErrors.phone}</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Team vs Individual Toggle */}
            {supportsTeams && (
              <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-3">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-primary" />
                  <span>Registration Mode</span>
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setRegMode('INDIVIDUAL')}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border text-center transition-all ${
                      regMode === 'INDIVIDUAL'
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-background hover:bg-muted border-border'
                    }`}
                  >
                    Individual
                  </button>
                  <button
                    type="button"
                    onClick={() => setRegMode('TEAM_CREATE')}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border text-center transition-all ${
                      regMode === 'TEAM_CREATE'
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-background hover:bg-muted border-border'
                    }`}
                  >
                    Create Team
                  </button>
                  <button
                    type="button"
                    onClick={() => setRegMode('TEAM_JOIN')}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border text-center transition-all ${
                      regMode === 'TEAM_JOIN'
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-background hover:bg-muted border-border'
                    }`}
                  >
                    Join Team
                  </button>
                </div>

                {regMode === 'TEAM_CREATE' && (
                  <div className="space-y-1.5 pt-1">
                    <Label className="text-xs">Team Name *</Label>
                    <Input
                      placeholder="e.g. Code Ninjas"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      className="h-9"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      You will receive an invite code to share with your teammates after confirmation.
                    </p>
                  </div>
                )}

                {regMode === 'TEAM_JOIN' && (
                  <div className="space-y-1.5 pt-1">
                    <Label className="text-xs">Team Invite Code *</Label>
                    <Input
                      placeholder="e.g. HACK-9821"
                      value={teamJoinCode}
                      onChange={(e) => setTeamJoinCode(e.target.value.toUpperCase())}
                      className="h-9 uppercase font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Enter the 6 to 10 character invite code provided by your team leader.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Custom Registration Form Fields */}
            {regMode !== 'TEAM_JOIN' && (
              <form onSubmit={handleProceedToReview} className="space-y-5" data-testid="registration-form">
                {questions.length === 0 ? (
                  <div className="p-3.5 rounded-lg bg-muted/30 text-xs text-muted-foreground">
                    No custom questionnaire required. Review your verified student profile and confirm below.
                  </div>
                ) : (
                  questions.map((q) => {
                    const error = fieldErrors[q.id];
                    const upload = uploadStates[q.id];

                    return (
                      <div key={q.id} className="space-y-1.5" data-testid={`form-question-${q.id}`}>
                        {q.type !== QuestionType.INSTRUCTION && (
                          <Label className="text-sm font-semibold flex items-center gap-1">
                            <span>{q.label}</span>
                            {q.required && <span className="text-rose-500">*</span>}
                          </Label>
                        )}

                        {q.description && q.type !== QuestionType.INSTRUCTION && (
                          <p className="text-xs text-muted-foreground">{q.description}</p>
                        )}

                        {/* SHORT_TEXT */}
                        {q.type === QuestionType.SHORT_TEXT && (
                          <Input
                            placeholder={q.placeholder || 'Your answer'}
                            value={(answers[q.id] as string) || ''}
                            onChange={(e) => handleFieldChange(q.id, e.target.value)}
                            className={error ? 'border-rose-500' : ''}
                          />
                        )}

                        {/* LONG_TEXT */}
                        {q.type === QuestionType.LONG_TEXT && (
                          <Textarea
                            placeholder={q.placeholder || 'Your detailed answer'}
                            value={(answers[q.id] as string) || ''}
                            onChange={(e) => handleFieldChange(q.id, e.target.value)}
                            className={error ? 'border-rose-500' : ''}
                          />
                        )}

                        {/* EMAIL */}
                        {q.type === QuestionType.EMAIL && (
                          <Input
                            type="email"
                            placeholder={q.placeholder || 'name@university.edu'}
                            value={(answers[q.id] as string) || ''}
                            onChange={(e) => handleFieldChange(q.id, e.target.value)}
                            className={error ? 'border-rose-500' : ''}
                          />
                        )}

                        {/* PHONE */}
                        {q.type === QuestionType.PHONE && (
                          <Input
                            type="tel"
                            placeholder={q.placeholder || '9876543210'}
                            value={(answers[q.id] as string) || ''}
                            onChange={(e) => handleFieldChange(q.id, e.target.value)}
                            className={error ? 'border-rose-500' : ''}
                          />
                        )}

                        {/* NUMBER */}
                        {q.type === QuestionType.NUMBER && (
                          <Input
                            type="number"
                            placeholder={q.placeholder || '0'}
                            value={answers[q.id] !== undefined ? String(answers[q.id]) : ''}
                            onChange={(e) =>
                              handleFieldChange(q.id, e.target.value === '' ? undefined : Number(e.target.value))
                            }
                            className={error ? 'border-rose-500' : ''}
                          />
                        )}

                        {/* DATE */}
                        {q.type === QuestionType.DATE && (
                          <Input
                            type="date"
                            value={(answers[q.id] as string) || ''}
                            onChange={(e) => handleFieldChange(q.id, e.target.value)}
                            className={error ? 'border-rose-500' : ''}
                          />
                        )}

                        {/* URL */}
                        {q.type === QuestionType.URL && (
                          <div className="relative">
                            <Globe className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              type="url"
                              placeholder={q.placeholder || 'https://github.com/...'}
                              value={(answers[q.id] as string) || ''}
                              onChange={(e) => handleFieldChange(q.id, e.target.value)}
                              className={`pl-9 ${error ? 'border-rose-500' : ''}`}
                            />
                          </div>
                        )}

                        {/* DROPDOWN */}
                        {q.type === QuestionType.DROPDOWN && (
                          <Select
                            value={(answers[q.id] as string) || ''}
                            onValueChange={(val) => handleFieldChange(q.id, val)}
                          >
                            <SelectTrigger className={error ? 'border-rose-500' : ''}>
                              <SelectValue placeholder={q.placeholder || 'Select an option...'} />
                            </SelectTrigger>
                            <SelectContent>
                              {q.options?.map((opt: string) => (
                                <SelectItem key={opt} value={opt}>
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}

                        {/* RADIO & SINGLE_SELECT */}
                        {(q.type === QuestionType.RADIO || q.type === QuestionType.SINGLE_SELECT) && (
                          <div className="space-y-2 pt-1">
                            {q.options?.map((opt: string) => (
                              <label
                                key={opt}
                                className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer"
                              >
                                <input
                                  type="radio"
                                  name={q.id}
                                  value={opt}
                                  checked={answers[q.id] === opt}
                                  onChange={(e) => handleFieldChange(q.id, e.target.value)}
                                  className="h-4 w-4 text-primary"
                                />
                                <span>{opt}</span>
                              </label>
                            ))}
                          </div>
                        )}

                        {/* MULTI_SELECT */}
                        {q.type === QuestionType.MULTI_SELECT && (
                          <div className="space-y-2 pt-1">
                            {q.options?.map((opt: string) => {
                              const current = (answers[q.id] as string[]) || [];
                              const isChecked = current.includes(opt);
                              return (
                                <label
                                  key={opt}
                                  className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer"
                                >
                                  <Checkbox
                                    checked={isChecked}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        handleFieldChange(q.id, [...current, opt]);
                                      } else {
                                        handleFieldChange(
                                          q.id,
                                          current.filter((item) => item !== opt)
                                        );
                                      }
                                    }}
                                  />
                                  <span>{opt}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}

                        {/* YES_NO */}
                        {q.type === QuestionType.YES_NO && (
                          <div className="flex items-center gap-3 pt-1">
                            <button
                              type="button"
                              onClick={() => handleFieldChange(q.id, true)}
                              className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
                                answers[q.id] === true
                                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                  : 'bg-background hover:bg-muted border-border'
                              }`}
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              onClick={() => handleFieldChange(q.id, false)}
                              className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
                                answers[q.id] === false
                                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                  : 'bg-background hover:bg-muted border-border'
                              }`}
                            >
                              No
                            </button>
                          </div>
                        )}

                        {/* CHECKBOX */}
                        {q.type === QuestionType.CHECKBOX && (
                          <div className="flex items-center gap-2.5 pt-1">
                            <Checkbox
                              checked={!!answers[q.id]}
                              onCheckedChange={(checked) => handleFieldChange(q.id, !!checked)}
                            />
                            <span className="text-xs text-foreground">
                              {q.placeholder || 'I confirm and agree to this condition'}
                            </span>
                          </div>
                        )}

                        {/* INSTRUCTION */}
                        {q.type === QuestionType.INSTRUCTION && (
                          <div className="p-3.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs space-y-1">
                            <div className="flex items-center gap-2 font-semibold text-blue-600 dark:text-blue-400">
                              <Info className="h-4 w-4 shrink-0" />
                              <span>{q.label}</span>
                            </div>
                            {q.description && (
                              <p className="text-muted-foreground pl-6 whitespace-pre-wrap">{q.description}</p>
                            )}
                          </div>
                        )}

                        {/* FILE_UPLOAD (Direct-to-R2) */}
                        {q.type === QuestionType.FILE_UPLOAD && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background hover:bg-muted text-xs font-semibold">
                                <UploadCloud className="h-4 w-4 text-primary" />
                                <span>Select File</span>
                                <input
                                  type="file"
                                  className="sr-only"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(q, file);
                                  }}
                                />
                              </label>
                              {upload?.fileName && (
                                <span className="text-xs text-muted-foreground truncate max-w-xs">
                                  {upload.fileName}
                                </span>
                              )}
                            </div>
                            {upload?.isUploading && (
                              <div className="space-y-1">
                                <Progress value={upload.progress} className="h-1.5" />
                                <span className="text-[10px] text-muted-foreground tnum">
                                  Uploading to storage... {upload.progress}%
                                </span>
                              </div>
                            )}
                            {upload && !upload.isUploading && upload.progress === 100 && (
                              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Uploaded successfully
                              </span>
                            )}
                          </div>
                        )}

                        {/* Field validation error message */}
                        {error && (
                          <p className="text-xs font-medium text-rose-500 mt-1" role="alert">
                            {error}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}

                {/* Turnstile Security Widget */}
                <div className="pt-2">
                  <TurnstileWidget onSuccess={(token) => setTurnstileToken(token)} />
                </div>

                {/* Submit Buttons */}
                <div className="flex gap-3 pt-3 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    className="flex-1 h-12 min-h-12"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 h-12 min-h-12 font-semibold shadow-md"
                    data-testid="proceed-to-review-btn"
                  >
                    {regMode === 'TEAM_CREATE'
                      ? 'Review & Register Team'
                      : pricePaise && pricePaise > 0
                      ? `Review & Proceed to Pay ₹${(pricePaise / 100).toFixed(2)}`
                      : 'Review & Confirm Registration'}
                  </Button>
                </div>
              </form>
            )}

            {/* Team Join Submit */}
            {regMode === 'TEAM_JOIN' && (
              <div className="flex gap-3 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  className="flex-1 h-12 min-h-12"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isSubmitting || !teamJoinCode.trim()}
                  onClick={() => handleProceedToReview()}
                  className="flex-1 h-12 min-h-12 font-semibold shadow-md"
                  data-testid="team-join-review-btn"
                >
                  Review & Join Team
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};