import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { FormQuestionDef, QuestionType, buildAnswerValidator } from '@eventora/shared';
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
import { TurnstileWidget } from '@/components/turnstile-widget';
import { SandboxCheckout } from './SandboxCheckout';
import { toast } from '@/components/ui/use-toast';
import {
  UploadCloud,
  CheckCircle2,
  Calendar,
  Clock,
  AlertTriangle,
  FileText,
  Ticket,
} from 'lucide-react';

export interface RegisterDialogProps {
  eventId: string;
  eventTitle: string;
  pricePaise?: number | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (registration: Record<string, unknown>) => void;
}

export type RegistrationOutcome = 'CONFIRMED' | 'PAYMENT_REQUIRED' | 'WAITLISTED' | null;

export const RegisterDialog: React.FC<RegisterDialogProps> = ({
  eventId,
  eventTitle,
  pricePaise = 0,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [turnstileToken, setTurnstileToken] = useState<string>('test-pass');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<{ code: string; message: string; details?: unknown } | null>(null);

  // Upload states: { [questionId]: { progress: number; fileName: string; isUploading: boolean } }
  const [uploadStates, setUploadStates] = useState<
    Record<string, { progress: number; fileName: string; isUploading: boolean }>
  >({});

  // Registration outcome state
  const [outcome, setOutcome] = useState<RegistrationOutcome>(null);
  const [activeRegistration, setActiveRegistration] = useState<Record<string, unknown> | null>(null);

  // Fetch form questions
  const { data: formData, isLoading: isFormLoading } = useQuery({
    queryKey: ['events', eventId, 'form'],
    queryFn: async () => {
      try {
        const res = await api.get<{ questions: FormQuestionDef[] }>(`/events/${eventId}/form`, {
          showToast: false,
        });
        return res.questions || [];
      } catch {
        // Default minimal questions if no custom questions configured
        return [] as FormQuestionDef[];
      }
    },
    enabled: isOpen,
  });

  const questions: FormQuestionDef[] = formData || [];

  const handleFileUpload = async (question: FormQuestionDef, file: File) => {
    // 1. Client-side mime & size check
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
      // 2. Request presigned PUT URL
      const presign = await api.post<{ uploadUrl: string; key: string }>('/uploads/presign', {
        purpose: 'GENERAL',
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      });

      // 3. XMLHttpRequest PUT with upload progress tracking
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

      // 4. Confirm upload
      await api.post('/uploads/confirm', { key: presign.key });

      setUploadStates((prev) => ({
        ...prev,
        [question.id]: { progress: 100, fileName: file.name, isUploading: false },
      }));

      // Store answer object
      setAnswers((prev) => ({
        ...prev,
        [question.id]: {
          objectKey: presign.key,
          sizeBytes: file.size,
          mimeType: file.type || 'application/octet-stream',
        },
      }));

      // Clear field error
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

    // 2. Submit to backend
    setIsSubmitting(true);
    try {
      const res = await api.post<{
        status: RegistrationOutcome;
        registration: Record<string, unknown>;
        paymentRequired?: boolean;
      }>(`/events/${eventId}/registrations`, {
        answers,
        turnstileToken,
      });

      setActiveRegistration(res.registration);
      if (res.status === 'CONFIRMED' || res.status === 'WAITLISTED') {
        setOutcome(res.status);
      } else if (res.paymentRequired || (pricePaise && pricePaise > 0)) {
        setOutcome('PAYMENT_REQUIRED');
      } else {
        setOutcome('CONFIRMED');
      }

      onSuccess?.(res.registration);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setServerError({
          code: err.code,
          message: err.message,
          details: err.details,
        });

        // Map VALIDATION_FAILED details to field errors
        if (err.code === 'VALIDATION_FAILED' && typeof err.details === 'object' && err.details) {
          const detailsObj = err.details as Record<string, string>;
          setFieldErrors(detailsObj);
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
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
                <span className="text-xs font-semibold text-muted-foreground">Pass Token</span>
                <span className="font-mono text-xs font-bold text-primary">
                  {(activeRegistration?.ticketToken as string) || 'ev_tok_confirmed_seat'}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 h-12 inline-flex items-center justify-center gap-2"
                onClick={handleDownloadIcs}
              >
                <Calendar className="h-4 w-4" />
                <span>Add to Calendar (.ics)</span>
              </Button>
              <Button className="flex-1 h-12" onClick={onClose}>
                Done & View Passport
              </Button>
            </div>
          </div>
        )}

        {/* Outcome 2: PAYMENT_REQUIRED Sandbox Screen */}
        {outcome === 'PAYMENT_REQUIRED' && (
          <SandboxCheckout
            eventId={eventId}
            registrationId={(activeRegistration?.id as string) || 'reg_demo_1'}
            eventTitle={eventTitle}
            amountPaise={pricePaise || 19900}
            onSuccess={() => setOutcome('CONFIRMED')}
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
                #{(activeRegistration?.waitlistPosition as number) || 4}
              </p>
              <p className="text-[11px] text-muted-foreground pt-1">
                If an attendee cancels, you will receive an alert with a 20-minute claim window.
              </p>
            </div>

            <Button className="w-full h-12" onClick={onClose}>
              Got It
            </Button>
          </div>
        )}

        {/* Normal Registration Form View */}
        {!outcome && (
          <>
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-xl font-bold">Register for {eventTitle}</DialogTitle>
              <DialogDescription>
                Complete required registration details to secure your attendance pass.
              </DialogDescription>
            </DialogHeader>

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

            <form onSubmit={handleSubmit} className="space-y-5" data-testid="registration-form">
              {questions.length === 0 ? (
                <div className="p-4 rounded-lg bg-muted/30 text-xs text-muted-foreground">
                  No additional custom questions. Click continue to reserve your seat.
                </div>
              ) : (
                questions.map((q) => {
                  const error = fieldErrors[q.id];
                  const upload = uploadStates[q.id];

                  return (
                    <div key={q.id} className="space-y-1.5" data-testid={`form-question-${q.id}`}>
                      <Label className="text-sm font-semibold flex items-center gap-1">
                        <span>{q.label}</span>
                        {q.required && <span className="text-rose-500">*</span>}
                      </Label>

                      {q.description && (
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

                      {/* SINGLE_SELECT */}
                      {q.type === QuestionType.SINGLE_SELECT && (
                        <div className="space-y-2 pt-1">
                          {q.options?.map((opt) => (
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
                          {q.options?.map((opt) => {
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
                                Uploading to R2 storage... {upload.progress}%
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
                  onClick={onClose}
                  className="flex-1 h-12 min-h-12"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 h-12 min-h-12 font-semibold shadow-md"
                >
                  {isSubmitting
                    ? 'Confirming...'
                    : pricePaise && pricePaise > 0
                    ? `Proceed to Pay ₹${(pricePaise / 100).toFixed(2)}`
                    : 'Confirm Registration'}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
