import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ProjectSubmissionConfig } from '@eventora/shared';
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
import { toast } from '@/components/ui/use-toast';
import {
  FileCode,
  CheckCircle2,
  AlertTriangle,
  UploadCloud,
  ExternalLink,
  Clock,
  Lock,
  Sparkles,
} from 'lucide-react';

export interface ProjectSubmissionDialogProps {
  eventId: string;
  eventTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ProjectSubmissionDialog: React.FC<ProjectSubmissionDialogProps> = ({
  eventId,
  eventTitle,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();

  // Submission state
  const [projectTitle, setProjectTitle] = useState('');
  const [abstract, setAbstract] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [demoUrl, setDemoUrl] = useState('');
  const [deckKey, setDeckKey] = useState('');
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Query current submission & config
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['submissions', 'me', eventId],
    queryFn: async () => {
      return await api.get<{
        config: ProjectSubmissionConfig;
        submission: any;
        team: any;
        isRegistered: boolean;
        canEdit: boolean;
        isDeadlinePassed: boolean;
      }>(`/events/${eventId}/submissions/me`);
    },
    enabled: isOpen && !!eventId,
  });

  const config = data?.config;
  const submission = data?.submission;
  const canEdit = data?.canEdit ?? true;
  const isDeadlinePassed = data?.isDeadlinePassed ?? false;

  // Initialize fields when data loads
  useEffect(() => {
    if (submission) {
      setProjectTitle(submission.projectTitle || '');
      setAbstract(submission.projectAbstract || '');
      setRepoUrl(submission.repoUrl || '');
      setDemoUrl(submission.demoUrl || '');
      setDeckKey(submission.deckKey || '');
      if (submission.customFields && typeof submission.customFields === 'object') {
        setCustomFields(submission.customFields);
      }
    } else {
      setProjectTitle('');
      setAbstract('');
      setRepoUrl('');
      setDemoUrl('');
      setDeckKey('');
      setCustomFields({});
    }
    setFieldErrors({});
  }, [submission, isOpen]);

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async () => {
      // Validate enabled required fields
      const errors: Record<string, string> = {};
      for (const field of config?.fields || []) {
        if (!field.enabled || !field.required) continue;

        if (field.key === 'title' && !projectTitle.trim()) {
          errors.title = `${field.label} is required.`;
        }
        if (field.key === 'abstract' && !abstract.trim()) {
          errors.abstract = `${field.label} is required.`;
        }
        if (field.key === 'repoUrl') {
          if (!repoUrl.trim()) {
            errors.repoUrl = `${field.label} is required.`;
          } else if (!/^https:\/\/(www\.)?(github\.com|gitlab\.com)\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+.*$/i.test(repoUrl.trim())) {
            errors.repoUrl = 'Must be a valid GitHub or GitLab URL (e.g. https://github.com/org/repo).';
          }
        }
        if (field.key === 'demoUrl' && !demoUrl.trim()) {
          errors.demoUrl = `${field.label} is required.`;
        }
        if (field.key === 'deckKey' && !deckKey.trim()) {
          errors.deckKey = `${field.label} is required.`;
        }
        if (
          !['title', 'abstract', 'repoUrl', 'demoUrl', 'deckKey'].includes(field.key) &&
          !customFields[field.key]?.trim()
        ) {
          errors[field.key] = `${field.label} is required.`;
        }
      }

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        throw new Error('Please fill in all required fields marked with an asterisk (*).');
      }

      const payload = {
        projectTitle: projectTitle.trim() || null,
        abstract: abstract.trim() || null,
        repoUrl: repoUrl.trim() || null,
        demoUrl: demoUrl.trim() || null,
        deckKey: deckKey.trim() || null,
        customFields,
      };

      return await api.post(`/events/${eventId}/submissions`, payload);
    },
    onSuccess: () => {
      toast.success('Project deliverables submitted successfully!');
      queryClient.invalidateQueries({ queryKey: ['submissions', 'me', eventId] });
      queryClient.invalidateQueries({ queryKey: ['me', 'registrations'] });
      queryClient.invalidateQueries({ queryKey: ['events', eventId] });
      onSuccess?.();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to submit project deliverables.');
    },
  });

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300">
              <FileCode className="h-4 w-4" />
            </span>
            <DialogTitle className="text-lg font-bold">
              {submission ? 'Edit Project Deliverables' : 'Submit Project Deliverables'}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {eventTitle}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <div className="h-6 w-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground">Loading submission requirements...</p>
          </div>
        ) : !config?.enabled ? (
          <div className="py-8 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
            <div className="space-y-1">
              <h4 className="font-semibold text-sm">Submissions Not Enabled</h4>
              <p className="text-xs text-muted-foreground">
                Project submissions are not enabled for this event by the organizer.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Status & Deadline Banner */}
            <div className="flex flex-wrap items-center justify-between p-3 rounded-xl bg-stone-100 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                    config.requirement === 'MANDATORY'
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                      : 'bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300'
                  }`}
                >
                  {config.requirement === 'MANDATORY' ? 'Mandatory Submission' : 'Optional Submission'}
                </span>
                {submission && (
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Submitted
                  </span>
                )}
              </div>

              {config.deadline && (
                <div className="flex items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400">
                  <Clock className="h-3 w-3" />
                  <span>
                    Deadline: {new Date(config.deadline).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              )}
            </div>

            {/* Read-Only Notice if cannot edit */}
            {!canEdit && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200">
                <Lock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  {isDeadlinePassed
                    ? 'The submission deadline for this event has passed. Changes are no longer accepted.'
                    : 'Submissions are locked for editing once turned in by organizer settings.'}
                </span>
              </div>
            )}

            {/* Form Fields according to configured fields */}
            <div className="space-y-4">
              {config.fields.map((field) => {
                if (!field.enabled) return null;

                if (field.key === 'title') {
                  return (
                    <div key="title" className="space-y-1">
                      <Label className="text-xs font-semibold">
                        {field.label} {field.required && <span className="text-rose-500">*</span>}
                      </Label>
                      <Input
                        value={projectTitle}
                        onChange={(e) => {
                          setProjectTitle(e.target.value);
                          if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: '' }));
                        }}
                        disabled={!canEdit}
                        placeholder="e.g. SmartCampus Edge AI Attendance System"
                        className={`h-9 text-xs ${fieldErrors.title ? 'border-rose-500' : ''}`}
                      />
                      {fieldErrors.title && <p className="text-[11px] text-rose-500">{fieldErrors.title}</p>}
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
                          {abstract.length} / 2000
                        </span>
                      </div>
                      <Textarea
                        value={abstract}
                        onChange={(e) => {
                          setAbstract(e.target.value);
                          if (fieldErrors.abstract) setFieldErrors((prev) => ({ ...prev, abstract: '' }));
                        }}
                        disabled={!canEdit}
                        maxLength={2000}
                        placeholder="Briefly describe the problem solved, tech stack, and key architecture..."
                        className={`text-xs min-h-[90px] ${fieldErrors.abstract ? 'border-rose-500' : ''}`}
                      />
                      {fieldErrors.abstract && <p className="text-[11px] text-rose-500">{fieldErrors.abstract}</p>}
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
                        value={repoUrl}
                        onChange={(e) => {
                          setRepoUrl(e.target.value);
                          if (fieldErrors.repoUrl) setFieldErrors((prev) => ({ ...prev, repoUrl: '' }));
                        }}
                        disabled={!canEdit}
                        placeholder="https://github.com/org/repo"
                        className={`h-9 text-xs ${fieldErrors.repoUrl ? 'border-rose-500' : ''}`}
                      />
                      {fieldErrors.repoUrl && <p className="text-[11px] text-rose-500">{fieldErrors.repoUrl}</p>}
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
                        value={demoUrl}
                        onChange={(e) => {
                          setDemoUrl(e.target.value);
                          if (fieldErrors.demoUrl) setFieldErrors((prev) => ({ ...prev, demoUrl: '' }));
                        }}
                        disabled={!canEdit}
                        placeholder="https://youtu.be/... or https://demo.domain.com"
                        className={`h-9 text-xs ${fieldErrors.demoUrl ? 'border-rose-500' : ''}`}
                      />
                      {fieldErrors.demoUrl && <p className="text-[11px] text-rose-500">{fieldErrors.demoUrl}</p>}
                    </div>
                  );
                }

                if (field.key === 'deckKey') {
                  return (
                    <div key="deckKey" className="space-y-1">
                      <Label className="text-xs font-semibold">
                        {field.label} {field.required && <span className="text-rose-500">*</span>}
                      </Label>
                      <Input
                        value={deckKey}
                        onChange={(e) => {
                          setDeckKey(e.target.value);
                          if (fieldErrors.deckKey) setFieldErrors((prev) => ({ ...prev, deckKey: '' }));
                        }}
                        disabled={!canEdit}
                        placeholder="Document/presentation storage key or link"
                        className={`h-9 text-xs ${fieldErrors.deckKey ? 'border-rose-500' : ''}`}
                      />
                      {fieldErrors.deckKey && <p className="text-[11px] text-rose-500">{fieldErrors.deckKey}</p>}
                    </div>
                  );
                }

                // Custom Field
                return (
                  <div key={field.key} className="space-y-1">
                    <Label className="text-xs font-semibold">
                      {field.label} {field.required && <span className="text-rose-500">*</span>}
                    </Label>
                    <Input
                      value={customFields[field.key] || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomFields((prev) => ({ ...prev, [field.key]: val }));
                        if (fieldErrors[field.key]) setFieldErrors((prev) => ({ ...prev, [field.key]: '' }));
                      }}
                      disabled={!canEdit}
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                      className={`h-9 text-xs ${fieldErrors[field.key] ? 'border-rose-500' : ''}`}
                    />
                    {fieldErrors[field.key] && (
                      <p className="text-[11px] text-rose-500">{fieldErrors[field.key]}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-border flex items-center justify-between">
              <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-xs">
                {canEdit ? 'Cancel' : 'Close'}
              </Button>

              {canEdit && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => submitMutation.mutate()}
                  disabled={submitMutation.isPending}
                  className="h-9 px-4 text-xs font-bold gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  <span>{submitMutation.isPending ? 'Saving...' : submission ? 'Update Deliverables' : 'Submit Deliverables'}</span>
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
