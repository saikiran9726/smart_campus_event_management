import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import {
  ArrowLeft,
  Upload,
  Calendar,
  Users,
  Clock,
  DollarSign,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Eye,
  FileText,
  Trophy,
  Save,
  FileCode,
} from 'lucide-react';
import {
  DEFAULT_PROJECT_SUBMISSION_CONFIG,
  DEFAULT_SUBMISSION_FIELDS,
  EventStatus,
  ProjectSubmissionConfig,
  ProjectSubmissionFieldConfig,
} from '@eventora/shared';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/components/ui/toast';

interface AgendaItem {
  id: string;
  time: string;
  title: string;
  speakerOrLocation?: string;
}

export const EventEditorPage: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Tech');
  const [capacity, setCapacity] = useState<number>(100);
  const [registrationOpensAt, setRegistrationOpensAt] = useState('');
  const [registrationClosesAt, setRegistrationClosesAt] = useState('');

  // Paid & Pricing
  const [isPaid, setIsPaid] = useState(false);
  const [priceRupees, setPriceRupees] = useState<number>(0);

  // Poster & Upload
  const [posterKey, setPosterKey] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Agenda
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);

  // Competition Settings
  const [isCompetition, setIsCompetition] = useState(false);
  const [minTeamSize, setMinTeamSize] = useState<number>(2);
  const [maxTeamSize, setMaxTeamSize] = useState<number>(4);

  // Project Submission Configuration
  const [submissionEnabled, setSubmissionEnabled] = useState(false);
  const [submissionRequirement, setSubmissionRequirement] = useState<'OPTIONAL' | 'MANDATORY'>('OPTIONAL');
  const [submissionTiming, setSubmissionTiming] = useState<'DURING_REGISTRATION' | 'AFTER_REGISTRATION'>('AFTER_REGISTRATION');
  const [submissionDeadline, setSubmissionDeadline] = useState('');
  const [allowEditAfterSubmission, setAllowEditAfterSubmission] = useState(true);
  const [submissionFields, setSubmissionFields] = useState<ProjectSubmissionFieldConfig[]>(DEFAULT_SUBMISSION_FIELDS);

  const handleToggleFieldEnabled = (index: number, enabled: boolean) => {
    setSubmissionFields((prev) => {
      const next = [...prev];
      const curr = next[index];
      if (!curr) return prev;
      next[index] = {
        key: curr.key,
        label: curr.label,
        type: curr.type || 'text',
        enabled,
        required: enabled ? curr.required : false,
      };
      return next;
    });
  };

  const handleToggleFieldRequired = (index: number, required: boolean) => {
    setSubmissionFields((prev) => {
      const next = [...prev];
      const curr = next[index];
      if (!curr) return prev;
      next[index] = {
        key: curr.key,
        label: curr.label,
        type: curr.type || 'text',
        enabled: curr.enabled,
        required,
      };
      return next;
    });
  };

  const handleAddCustomField = () => {
    const label = window.prompt('Enter field label (e.g. Slide Deck Link, Figma Design URL):');
    if (!label?.trim()) return;
    const key = label.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30) || `custom_${Date.now()}`;
    setSubmissionFields((prev) => [
      ...prev,
      { key, label: label.trim(), enabled: true, required: false, type: 'text' },
    ]);
  };

  const handleRemoveField = (index: number) => {
    setSubmissionFields((prev) => prev.filter((_, i) => i !== index));
  };

  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');

  // Fetch event details
  const { data: eventData, isLoading } = useQuery({
    queryKey: ['events', eventId],
    queryFn: async () => {
      try {
        const res = await api.get<{ event: any }>(`/events/${eventId}`);
        return res.event;
      } catch {
        return null;
      }
    },
    enabled: !!eventId && eventId !== 'new',
  });

  useEffect(() => {
    if (eventData) {
      setTitle(eventData.title || '');
      setDescription(eventData.description || '');
      setCategory(eventData.category || 'Tech');
      setCapacity(eventData.capacity || 100);
      setIsPaid(!!eventData.isPaid);
      setPriceRupees(eventData.pricePaise ? eventData.pricePaise / 100 : 0);
      setPosterKey(eventData.posterKey || null);
      setIsCompetition(!!eventData.isCompetition);
      setMinTeamSize(eventData.minTeamSize || 2);
      setMaxTeamSize(eventData.maxTeamSize || 4);
      if (eventData.registrationOpensAt) {
        setRegistrationOpensAt(new Date(eventData.registrationOpensAt).toISOString().slice(0, 16));
      }
      if (eventData.registrationClosesAt) {
        setRegistrationClosesAt(new Date(eventData.registrationClosesAt).toISOString().slice(0, 16));
      }
      if (eventData.projectSubmissionConfig) {
        const psc = eventData.projectSubmissionConfig;
        setSubmissionEnabled(Boolean(psc.enabled));
        setSubmissionRequirement(psc.requirement || 'OPTIONAL');
        setSubmissionTiming(psc.timing || 'AFTER_REGISTRATION');
        setAllowEditAfterSubmission(psc.allowEditAfterSubmission !== undefined ? Boolean(psc.allowEditAfterSubmission) : true);
        if (Array.isArray(psc.fields) && psc.fields.length > 0) {
          setSubmissionFields(psc.fields);
        }
        if (psc.deadline) {
          setSubmissionDeadline(new Date(psc.deadline).toISOString().slice(0, 16));
        }
      } else if (eventData.submissionDeadlineAt || eventData.submissionDeadline) {
        setSubmissionDeadline(new Date(eventData.submissionDeadlineAt || eventData.submissionDeadline).toISOString().slice(0, 16));
      }
      if (Array.isArray(eventData.agenda)) {
        setAgenda(eventData.agenda);
      }
    }
  }, [eventData]);

  // Poster Upload Handler (Direct-to-R2 presigned upload with progress)
  const handlePosterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are permitted for event posters.');
      return;
    }

    try {
      setUploadProgress(0);
      const presign = await api.post<{ uploadUrl: string; objectKey: string }>(
        '/uploads/presign',
        {
          purpose: 'POSTER',
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }
      );

      // Direct R2 upload via XMLHttpRequest
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', presign.uploadUrl, true);
        xhr.setRequestHeader('Content-Type', file.type);

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            console.error('Poster upload response:', xhr.status, xhr.responseText);
            reject(
              new Error(
                `Poster upload failed (${xhr.status}): ${xhr.responseText || 'No response body'}`
              )
            );
          }
        };
        xhr.onerror = () => reject(new Error('Network error during poster upload.'));
        xhr.send(file);
      });

      setPosterKey(presign.objectKey);
      toast.success('Event poster uploaded successfully.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to upload poster.');
    } finally {
      setUploadProgress(null);
    }
  };

  // Add Agenda Item
  // Add Agenda Item
const handleAddAgenda = () => {
  const newItem: AgendaItem = {
    id: crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now()),
    time: '',
    title: '',
    speakerOrLocation: '',
  };

  setAgenda((previous) => [...previous, newItem]);
};
  const handleRemoveAgenda = (id: string) => {
    setAgenda(agenda.filter((a) => a.id !== id));
  };

  // Save Event Mutation
  const saveEventMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title,
        description,
        category,
        capacity: Number(capacity),
        pricePaise: isPaid ? Math.round(priceRupees * 100) : 0,
        isPaid,
        posterKey,
        agenda,
        registrationOpensAt: registrationOpensAt ? new Date(registrationOpensAt).toISOString() : undefined,
        registrationClosesAt: registrationClosesAt ? new Date(registrationClosesAt).toISOString() : undefined,
        isCompetition,
        minTeamSize: isCompetition ? Number(minTeamSize) : undefined,
        maxTeamSize: isCompetition ? Number(maxTeamSize) : undefined,
        submissionDeadlineAt: submissionDeadline ? new Date(submissionDeadline).toISOString() : undefined,
        projectSubmissionConfig: {
          enabled: submissionEnabled,
          requirement: submissionRequirement,
          timing: submissionTiming,
          deadline: submissionDeadline ? new Date(submissionDeadline).toISOString() : null,
          allowEditAfterSubmission,
          fields: submissionFields,
        },
      };

      if (eventId && eventId !== 'new') {
        return await api.patch(`/events/${eventId}`, payload);
      }
      return await api.post('/events', payload);
    },
    onSuccess: () => {
      toast.success('Event details saved successfully.');
      queryClient.invalidateQueries({ queryKey: ['events', eventId] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to save event details.');
    },
  });

  // Publish Event Mutation with Checklist
  const publishMutation = useMutation({
    mutationFn: async () => {
      return await api.post(`/events/${eventId}/publish`, {});
    },
    onSuccess: () => {
      toast.success('Event is now LIVE and published for campus discovery!');
      queryClient.invalidateQueries({ queryKey: ['events', eventId] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to publish event.');
    },
  });

  // Validation Checklist
  const checklist = [
    { label: 'Event title provided', valid: title.trim().length >= 3 },
    { label: 'Description provided', valid: description.trim().length >= 10 },
    { label: 'Registration window configured', valid: !!registrationOpensAt && !!registrationClosesAt && new Date(registrationClosesAt) > new Date(registrationOpensAt) },
    { label: 'Capacity is positive', valid: capacity > 0 },
    { label: 'Poster image uploaded', valid: !!posterKey },
    {
      label: 'Agenda scheduled (>= 1 session)',
      valid: agenda.some((item) => item.title.trim().length > 0),
    },  ];

  const canPublish = checklist.every((c) => c.valid);

  if (isLoading) {
    return (
      <div className="container max-w-4xl py-12 px-4 mx-auto animate-pulse space-y-4">
        <div className="h-8 w-64 bg-muted rounded" />
        <div className="h-48 bg-muted rounded-xl" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8 px-4 sm:px-6 mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/organizer')}
            className="h-8 w-8 p-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Event Editor</h1>
            <p className="text-sm text-muted-foreground">
              Configure poster, description markdown, agenda, pricing, and hackathon competition rules.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => saveEventMutation.mutate()}
            disabled={saveEventMutation.isPending}
            className="gap-2 shadow-sm"
          >
            <Save className="h-4 w-4" />
            <span>Save Draft</span>
          </Button>

          <Button
            type="button"
            onClick={() => publishMutation.mutate()}
            disabled={!canPublish || publishMutation.isPending}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            data-testid="btn-publish-event"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Publish Event</span>
          </Button>
        </div>
      </div>

      {/* Main Details Card */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold">General Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="evt-title">Event Title</Label>
            <Input
              id="evt-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Autonomous AI Hackathon 2026"
            />
          </div>

          <div className="space-y-1">
            <Label>Category</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Tech, Cultural, Sports, Workshop, Hackathon"
            />
          </div>

          {/* Markdown Narrative with Live Preview Tab */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Description / Event Narrative (Markdown Supported)</Label>
              <div className="flex items-center gap-1 border rounded-lg p-0.5 text-xs bg-muted/40">
                <button
                  type="button"
                  onClick={() => setActiveTab('write')}
                  className={`px-2.5 py-1 rounded font-medium ${
                    activeTab === 'write' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  Write
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={`px-2.5 py-1 rounded font-medium ${
                    activeTab === 'preview' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  Preview
                </button>
              </div>
            </div>

            {activeTab === 'write' ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                placeholder="Write rich narrative in markdown format (supports **bold**, lists, headers)..."
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono text-xs"
              />
            ) : (
              <div className="p-4 rounded-md border bg-muted/20 min-h-[140px] prose prose-sm dark:prose-invert max-w-none">
                {description ? (
                  <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                    {description}
                  </ReactMarkdown>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No description provided yet.</p>
                )}
              </div>
            )}
          </div>

          {/* Poster Upload */}
          <div className="space-y-2 pt-2">
            <div className="flex items-baseline justify-between">
              <Label>Event Poster <span className="text-destructive">*</span></Label>
              <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Required to publish</span>
            </div>
            <p className="text-xs text-muted-foreground">
              A promotional poster image (JPEG/PNG/WebP) is mandatory for event publication to guarantee high visual fidelity across the campus Discover feed and ticket passports.
            </p>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer border border-dashed rounded-lg px-4 py-3 hover:bg-muted/40 text-xs text-muted-foreground transition-colors">
                <Upload className="h-4 w-4" />
                <span>Upload Poster Image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePosterUpload}
                  className="hidden"
                />
              </label>

              {posterKey && (
                <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Poster uploaded ({posterKey.split('/').pop()})</span>
                </div>
              )}
            </div>

            {uploadProgress !== null && (
              <div className="space-y-1 pt-1">
                <Progress value={uploadProgress} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground tnum">Uploading: {uploadProgress}%</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pricing & Capacity */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Capacity & Ticketing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Attendee Capacity</Label>
              <Input
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
              />
            </div>

            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Ticket Pricing</Label>
                  <p className="text-xs text-muted-foreground">Free or paid entry</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">{isPaid ? 'Paid' : 'Free'}</span>
                  <Switch checked={isPaid} onCheckedChange={setIsPaid} />
                </div>
              </div>

              {isPaid && (
                <div className="space-y-1 pt-2">
                  <Label htmlFor="price-rupees">Price (in ₹ Rupees)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-muted-foreground">₹</span>
                    <Input
                      id="price-rupees"
                      type="number"
                      min={1}
                      value={priceRupees}
                      onChange={(e) => setPriceRupees(Number(e.target.value))}
                      className="pl-7"
                    />
                  </div>
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Sandbox mode active: mock payments simulated with zero real charges.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1">
              <Label>Registration Opens</Label>
              <Input
                type="datetime-local"
                value={registrationOpensAt}
                onChange={(e) => setRegistrationOpensAt(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Registration Closes</Label>
              <Input
                type="datetime-local"
                value={registrationClosesAt}
                onChange={(e) => setRegistrationClosesAt(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agenda Editor */}
      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Agenda & Schedule</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddAgenda}
            className="gap-1.5 h-8 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Session
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {agenda.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No agenda sessions scheduled yet.</p>
          ) : (
            agenda.map((item, idx) => (
              <div key={item.id} className="flex items-center gap-2 p-2.5 rounded-lg border bg-muted/20">
                <Input
                  value={item.time}
                  onChange={(e) => {
                    const next = [...agenda];
                    if (next[idx]) {
                      next[idx] = { ...next[idx], time: e.target.value };
                      setAgenda(next);
                    }
                  }}
                  placeholder="10:00 AM"
                  className="w-28 text-xs h-8"
                />
                <Input
                  value={item.title}
                  onChange={(e) => {
                    const next = [...agenda];
                    if (next[idx]) {
                      next[idx] = { ...next[idx], title: e.target.value };
                      setAgenda(next);
                    }
                  }}
                  placeholder="Keynote Presentation"
                  className="flex-1 text-xs h-8 font-medium"
                />
                <Input
                  value={item.speakerOrLocation ?? ''}
                  onChange={(e) => {
                    const next = [...agenda];
                    if (next[idx]) {
                      next[idx] = { ...next[idx], speakerOrLocation: e.target.value };
                      setAgenda(next);
                    }
                  }}
                  placeholder="Speaker / Location"
                  className="w-36 text-xs h-8 text-muted-foreground"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveAgenda(item.id)}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Hackathon Competition Settings */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Trophy className="h-4 w-4 text-indigo-500" />
                Hackathon / Competition Mode
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Enable team formations, roster snapshots, and deliverables submissions.
              </p>
            </div>
            <Switch checked={isCompetition} onCheckedChange={setIsCompetition} />
          </div>
        </CardHeader>
        {isCompetition && (
          <CardContent className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Min Team Size</Label>
                <Input
                  type="number"
                  min={1}
                  value={minTeamSize}
                  onChange={(e) => setMinTeamSize(Number(e.target.value))}
                />
              </div>

              <div className="space-y-1">
                <Label>Max Team Size</Label>
                <Input
                  type="number"
                  min={minTeamSize}
                  value={maxTeamSize}
                  onChange={(e) => setMaxTeamSize(Number(e.target.value))}
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Project Submission Configuration Card (Independent per Event) */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <FileCode className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <span>Project Submission Configuration</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Configure project deliverables, submission timing, deadlines, and field requirements independently for this event.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="submission-enabled-toggle" className="text-xs font-semibold cursor-pointer">
                {submissionEnabled ? (
                  <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300">
                    Enabled
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800 dark:text-stone-400">
                    Disabled
                  </Badge>
                )}
              </Label>
              <Switch
                id="submission-enabled-toggle"
                checked={submissionEnabled}
                onCheckedChange={setSubmissionEnabled}
              />
            </div>
          </div>
        </CardHeader>

        {submissionEnabled && (
          <CardContent className="space-y-6 pt-2 border-t border-border/60">
            {/* Requirement & Timing Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Submission Requirement</Label>
                <Select
                  value={submissionRequirement}
                  onValueChange={(val) => setSubmissionRequirement(val as 'OPTIONAL' | 'MANDATORY')}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPTIONAL">Optional — Participants can submit if ready</SelectItem>
                    <SelectItem value="MANDATORY">Mandatory — Required to complete evaluation</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Optional submissions provide &quot;Skip for Now&quot; and never block student registration.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Submission Timing</Label>
                <Select
                  value={submissionTiming}
                  onValueChange={(val) => setSubmissionTiming(val as 'DURING_REGISTRATION' | 'AFTER_REGISTRATION')}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AFTER_REGISTRATION">After Registration — Collect deliverables before event</SelectItem>
                    <SelectItem value="DURING_REGISTRATION">During Registration — Collect during signup</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {submissionTiming === 'AFTER_REGISTRATION'
                    ? 'Students register first, then submit deliverables from their Passport or Team page.'
                    : 'Collected inside the registration modal before ticket issuance.'}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Submission Deadline</Label>
                <Input
                  type="datetime-local"
                  value={submissionDeadline}
                  onChange={(e) => setSubmissionDeadline(e.target.value)}
                  className="h-9 text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Submissions and edits are locked after this timestamp.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Allow Editing After Submission</Label>
                <div className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/20">
                  <span className="text-xs text-foreground">
                    {allowEditAfterSubmission ? 'Students can update their submission until deadline' : 'Locked once submitted'}
                  </span>
                  <Switch
                    checked={allowEditAfterSubmission}
                    onCheckedChange={setAllowEditAfterSubmission}
                  />
                </div>
              </div>
            </div>

            {/* Configurable Submission Fields List */}
            <div className="space-y-3 pt-2 border-t border-border/60">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Configurable Submission Fields
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Choose which fields are enabled and whether each is optional or required.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={handleAddCustomField}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Custom Field</span>
                </Button>
              </div>

              <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/60">
                {submissionFields.map((field, idx) => (
                  <div key={field.key} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 gap-2 bg-white dark:bg-stone-900">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={`field-enabled-${field.key}`}
                        checked={field.enabled}
                        onCheckedChange={(checked) => handleToggleFieldEnabled(idx, Boolean(checked))}
                      />
                      <div>
                        <Label htmlFor={`field-enabled-${field.key}`} className="text-xs font-semibold cursor-pointer">
                          {field.label}
                        </Label>
                        <span className="ml-2 text-[10px] font-mono text-muted-foreground">({field.key})</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 sm:ml-auto">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`field-req-${field.key}`}
                          checked={field.required}
                          disabled={!field.enabled}
                          onCheckedChange={(checked) => handleToggleFieldRequired(idx, Boolean(checked))}
                        />
                        <Label htmlFor={`field-req-${field.key}`} className="text-xs text-muted-foreground cursor-pointer">
                          Required
                        </Label>
                      </div>

                      {/* Remove custom field */}
                      {!['title', 'abstract', 'demoUrl', 'repoUrl', 'deckKey'].includes(field.key) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                          onClick={() => handleRemoveField(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Publish Checklist Card */}
      <Card className="border-border bg-muted/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Publishing Readiness Checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {checklist.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {item.valid ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
              )}
              <span className={item.valid ? 'text-foreground' : 'text-muted-foreground'}>
                {item.label}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
      {/* Sticky Bottom Save Bar */}
      <div className="sticky bottom-0 z-30 -mx-4 -mb-8 px-4 sm:px-8 py-3.5 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-border flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">
            {checklist.filter((c) => c.valid).length} / {checklist.length} readiness requirements met
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/organizer')}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => saveEventMutation.mutate()}
            disabled={saveEventMutation.isPending}
            className="gap-2 shadow-sm font-semibold"
          >
            <Save className="h-4 w-4" />
            <span>{saveEventMutation.isPending ? 'Saving...' : 'Save & Update Event'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EventEditorPage;
