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
} from 'lucide-react';
import { EventStatus } from '@eventora/shared';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  const [submissionDeadline, setSubmissionDeadline] = useState('');

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
      if (eventData.submissionDeadline) {
        setSubmissionDeadline(new Date(eventData.submissionDeadline).toISOString().slice(0, 16));
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
            reject(new Error(`Poster upload failed with status ${xhr.status}`));
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
  const handleAddAgenda = () => {
    const newItem: AgendaItem = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      time: '10:00 AM',
      title: 'Session Title',
      speakerOrLocation: 'Speaker Name',
    };
    setAgenda([...agenda, newItem]);
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
        submissionDeadline: isCompetition && submissionDeadline ? new Date(submissionDeadline).toISOString() : undefined,
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
    { label: 'Agenda scheduled (>= 1 session)', valid: agenda.length > 0 },
  ];

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
            <Label>Event Poster</Label>
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

              <div className="sm:col-span-2 space-y-1">
                <Label>Project Deliverables Submission Deadline</Label>
                <Input
                  type="datetime-local"
                  value={submissionDeadline}
                  onChange={(e) => setSubmissionDeadline(e.target.value)}
                />
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
    </div>
  );
};

export default EventEditorPage;
