import React, { useState, useEffect, useId, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Lock,
  GripVertical,
  Plus,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Eye,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  FileText,
  Save,
  HelpCircle,
  Sparkles,
  Layers,
  Send,
  Globe,
  Check,
} from 'lucide-react';
import { QuestionType } from '@eventora/shared';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';

export interface FormQuestionItem {
  id: string;
  eventId: string;
  position: number;
  type: QuestionType;
  label: string;
  helpText?: string | null;
  placeholder?: string | null;
  defaultValue?: string | null;
  visibility?: string | null;
  required: boolean;
  options?: string[] | null;
  validation?: Record<string, any> | null;
  addedAfterFreeze?: boolean;
}

interface FormResponse {
  eventId: string;
  frozen: boolean;
  frozenAt: string | null;
  formVersion?: number;
  formPublished?: boolean;
  registrationMode?: string;
  approvalRequired?: boolean;
  registeredCount: number;
  questions: FormQuestionItem[];
}

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  [QuestionType.SHORT_TEXT]: 'Short Text',
  [QuestionType.LONG_TEXT]: 'Long Text / Paragraph',
  [QuestionType.NUMBER]: 'Number',
  [QuestionType.EMAIL]: 'Email Address',
  [QuestionType.PHONE]: 'Phone Number',
  [QuestionType.SINGLE_SELECT]: 'Single Choice (Select)',
  [QuestionType.MULTI_SELECT]: 'Multiple Choice (Checkboxes)',
  [QuestionType.CHECKBOX]: 'Single Checkbox (Agreement)',
  [QuestionType.DATE]: 'Date Picker',
  [QuestionType.FILE_UPLOAD]: 'File Upload',
  [QuestionType.DROPDOWN]: 'Dropdown (Select One)',
  [QuestionType.RADIO]: 'Radio (Option Buttons)',
  [QuestionType.URL]: 'Website / Portfolio URL',
  [QuestionType.YES_NO]: 'Yes / No Choice',
  [QuestionType.INSTRUCTION]: 'Instruction / Notice Text',
};

// Sortable Question Row
interface SortableQuestionCardProps {
  question: FormQuestionItem;
  index: number;
  totalCount: number;
  isFrozen: boolean;
  onUpdate: (id: string, updates: Partial<FormQuestionItem>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
}

function SortableQuestionCard({
  question,
  index,
  totalCount,
  isFrozen,
  onUpdate,
  onDelete,
  onDuplicate,
  onMove,
}: SortableQuestionCardProps) {
  const isQuestionLocked = isFrozen && !question.addedAfterFreeze;
  const isInstruction = question.type === QuestionType.INSTRUCTION;
  const hasOptions =
    question.type === QuestionType.SINGLE_SELECT ||
    question.type === QuestionType.MULTI_SELECT ||
    question.type === QuestionType.DROPDOWN ||
    question.type === QuestionType.RADIO;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: question.id,
    disabled: isQuestionLocked,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [newOption, setNewOption] = useState('');
  const [showValidation, setShowValidation] = useState(false);

  const handleAddOption = () => {
    if (!newOption.trim()) return;
    const currentOptions = question.options ?? [];
    onUpdate(question.id, { options: [...currentOptions, newOption.trim()] });
    setNewOption('');
  };

  const handleRemoveOption = (optIndex: number) => {
    const currentOptions = question.options ?? [];
    const next = currentOptions.filter((_, i) => i !== optIndex);
    onUpdate(question.id, { options: next });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative rounded-xl border bg-card p-4 shadow-sm transition-all ${
        isQuestionLocked
          ? 'border-amber-200/60 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-950/10'
          : 'border-border hover:border-border/80'
      }`}
      data-testid={`question-card-${question.id}`}
    >
      <div className="flex items-start gap-3">
        {/* Drag Handle & Move Controls */}
        <div className="flex flex-col items-center gap-1 pt-1 shrink-0">
          {!isQuestionLocked ? (
            <button
              type="button"
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground touch-none"
              aria-label="Reorder question"
              data-testid={`drag-handle-${question.id}`}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          ) : (
            <Lock className="h-4 w-4 text-amber-500/70" />
          )}

          {!isFrozen && (
            <div className="flex flex-col gap-0.5 mt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={index === 0}
                onClick={() => onMove(question.id, 'up')}
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                aria-label="Move question up"
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={index === totalCount - 1}
                onClick={() => onMove(question.id, 'down')}
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                aria-label="Move question down"
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        {/* Question Details */}
        <div className="flex-1 space-y-3 min-w-0">
          {/* Header Row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-muted-foreground tnum">
                #{index + 1}
              </span>
              <Badge variant="outline" className="text-[10px] font-medium uppercase tracking-wider">
                {QUESTION_TYPE_LABELS[question.type] || question.type}
              </Badge>
              {isQuestionLocked && (
                <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300" data-testid="question-locked-icon">
                  Locked
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Required Switch (Hidden for INSTRUCTION) */}
              {!isInstruction && (
                <div className="flex items-center gap-1.5">
                  <Switch
                    id={`required-${question.id}`}
                    checked={question.required}
                    disabled={isFrozen}
                    onCheckedChange={(val) => {
                      if (isFrozen && val) {
                        toast.error('Form is frozen: only optional questions are permitted.');
                        return;
                      }
                      onUpdate(question.id, { required: val });
                    }}
                    data-testid={`switch-required-${question.id}`}
                  />
                  <Label
                    htmlFor={`required-${question.id}`}
                    className="text-xs font-medium cursor-pointer"
                  >
                    Required
                  </Label>
                </div>
              )}

              {/* Duplicate Button */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onDuplicate(question.id)}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                aria-label={`Duplicate question ${question.label}`}
                title="Duplicate question"
              >
                <Copy className="h-4 w-4" />
              </Button>

              {/* Delete Button */}
              {!isQuestionLocked && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(question.id)}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  aria-label={`Delete question ${question.label}`}
                  data-testid={`btn-delete-${question.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Question Label & Type */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2 space-y-1">
              <Label className="text-xs text-muted-foreground">
                {isInstruction ? 'Notice Heading / Title' : 'Question Label'}
              </Label>
              <Input
                value={question.label}
                disabled={isQuestionLocked}
                onChange={(e) => onUpdate(question.id, { label: e.target.value })}
                placeholder={isInstruction ? 'e.g. Hackathon Code of Conduct Notice' : 'e.g. What is your GitHub profile?'}
                className="font-medium"
                data-testid={`input-label-${question.id}`}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Field Type</Label>
              <Select
                value={question.type}
                disabled={isQuestionLocked}
                onValueChange={(val) =>
                  onUpdate(question.id, { type: val as QuestionType })
                }
              >
                <SelectTrigger data-testid={`select-type-${question.id}`}>
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(QUESTION_TYPE_LABELS).map(([t, l]) => (
                    <SelectItem key={t} value={t}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Placeholder (if applicable) & Help Text */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Placeholder Text (optional)</Label>
              <Input
                value={question.placeholder ?? ''}
                disabled={isQuestionLocked}
                onChange={(e) => onUpdate(question.id, { placeholder: e.target.value })}
                placeholder="e.g. https://github.com/..."
                className="text-xs text-muted-foreground"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <HelpCircle className="h-3 w-3" />
                Help Text / Subtitle (optional)
              </Label>
              <Input
                value={question.helpText ?? ''}
                onChange={(e) => onUpdate(question.id, { helpText: e.target.value })}
                placeholder="e.g. Minimum 20 characters required"
                className="text-xs text-muted-foreground"
                data-testid={`input-helptext-${question.id}`}
              />
            </div>
          </div>

          {/* Special notice for INSTRUCTION type */}
          {isInstruction && (
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50 text-xs text-muted-foreground">
              ðŸ’¡ <strong>Display-Only Notice:</strong> This text block will be shown prominently to attendees during registration. No response input will be collected.
            </div>
          )}

          {/* Type-Specific: Select Options */}
          {hasOptions && (
            <div className="space-y-2 pt-2 border-t border-border/50">
              <Label className="text-xs font-semibold">Options List</Label>
              <div className="space-y-1.5">
                {(question.options ?? []).map((opt, optIdx) => (
                  <div key={optIdx} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-4 tnum">
                      {optIdx + 1}.
                    </span>
                    <Input
                      value={opt}
                      disabled={isQuestionLocked}
                      onChange={(e) => {
                        const next = [...(question.options ?? [])];
                        next[optIdx] = e.target.value;
                        onUpdate(question.id, { options: next });
                      }}
                      className="h-8 text-xs flex-1"
                    />
                    {!isQuestionLocked && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveOption(optIdx)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {!isQuestionLocked && (
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddOption();
                      }
                    }}
                    placeholder="Add option and press Enter..."
                    className="h-8 text-xs"
                    data-testid={`input-new-option-${question.id}`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddOption}
                    className="h-8 text-xs shrink-0"
                  >
                    Add
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Validation Rules Toggle */}
          {!isInstruction && (
            <div className="pt-2 border-t border-border/40">
              <button
                type="button"
                onClick={() => setShowValidation(!showValidation)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5"
              >
                <Sliders className="h-3 w-3" />
                <span>{showValidation ? 'Hide validation rules' : 'Configure validation rules'}</span>
              </button>

              {showValidation && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                  {(question.type === QuestionType.SHORT_TEXT ||
                    question.type === QuestionType.LONG_TEXT) && (
                    <>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Min Length</Label>
                        <Input
                          type="number"
                          value={question.validation?.minLength ?? ''}
                          onChange={(e) =>
                            onUpdate(question.id, {
                              validation: {
                                ...question.validation,
                                minLength: e.target.value ? Number(e.target.value) : undefined,
                              },
                            })
                          }
                          className="h-8 text-xs mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Max Length</Label>
                        <Input
                          type="number"
                          value={question.validation?.maxLength ?? ''}
                          onChange={(e) =>
                            onUpdate(question.id, {
                              validation: {
                                ...question.validation,
                                maxLength: e.target.value ? Number(e.target.value) : undefined,
                              },
                            })
                          }
                          className="h-8 text-xs mt-1"
                        />
                      </div>
                    </>
                  )}

                  {question.type === QuestionType.NUMBER && (
                    <>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Min Value</Label>
                        <Input
                          type="number"
                          value={question.validation?.minNumber ?? ''}
                          onChange={(e) =>
                            onUpdate(question.id, {
                              validation: {
                                ...question.validation,
                                minNumber: e.target.value ? Number(e.target.value) : undefined,
                              },
                            })
                          }
                          className="h-8 text-xs mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Max Value</Label>
                        <Input
                          type="number"
                          value={question.validation?.maxNumber ?? ''}
                          onChange={(e) =>
                            onUpdate(question.id, {
                              validation: {
                                ...question.validation,
                                maxNumber: e.target.value ? Number(e.target.value) : undefined,
                              },
                            })
                          }
                          className="h-8 text-xs mt-1"
                        />
                      </div>
                    </>
                  )}

                  {question.type === QuestionType.MULTI_SELECT && (
                    <>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Min Selections</Label>
                        <Input
                          type="number"
                          value={question.validation?.minSelect ?? ''}
                          onChange={(e) =>
                            onUpdate(question.id, {
                              validation: {
                                ...question.validation,
                                minSelect: e.target.value ? Number(e.target.value) : undefined,
                              },
                            })
                          }
                          className="h-8 text-xs mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Max Selections</Label>
                        <Input
                          type="number"
                          value={question.validation?.maxSelect ?? ''}
                          onChange={(e) =>
                            onUpdate(question.id, {
                              validation: {
                                ...question.validation,
                                maxSelect: e.target.value ? Number(e.target.value) : undefined,
                              },
                            })
                          }
                          className="h-8 text-xs mt-1"
                        />
                      </div>
                    </>
                  )}

                  {question.type === QuestionType.FILE_UPLOAD && (
                    <>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Max File Size (Bytes)</Label>
                        <Input
                          type="number"
                          value={question.validation?.maxFileBytes ?? 10485760}
                          onChange={(e) =>
                            onUpdate(question.id, {
                              validation: {
                                ...question.validation,
                                maxFileBytes: e.target.value ? Number(e.target.value) : undefined,
                              },
                            })
                          }
                          className="h-8 text-xs mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Allowed MIME Types (comma separated)</Label>
                        <Input
                          value={(question.validation?.allowedMimeTypes ?? []).join(', ')}
                          onChange={(e) =>
                            onUpdate(question.id, {
                              validation: {
                                ...question.validation,
                                allowedMimeTypes: e.target.value
                                  ? e.target.value.split(',').map((s) => s.trim())
                                  : undefined,
                              },
                            })
                          }
                          placeholder="application/pdf, image/png"
                          className="h-8 text-xs mt-1"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const FormBuilderPage: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dndId = useId();

  const [questions, setQuestions] = useState<FormQuestionItem[]>([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('HACKATHON');
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, any>>({});
  const [previewErrors, setPreviewErrors] = useState<Record<string, string>>({});
  const [isValidatingPreview, setIsValidatingPreview] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Fetch form data
  const { data: formData, isLoading, isError, refetch } = useQuery<FormResponse>({
    queryKey: ['events', eventId, 'form'],
    queryFn: async () => {
      const res = await api.get<FormResponse>(`/events/${eventId}/form`);
      return res;
    },
    enabled: !!eventId,
  });

  // Fetch templates
  const { data: templatesData } = useQuery<{ templates: any[] }>({
    queryKey: ['events', eventId, 'form', 'templates'],
    queryFn: async () => {
      return await api.get<{ templates: any[] }>(`/events/${eventId}/form/templates`);
    },
    enabled: !!eventId,
  });

  useEffect(() => {
    if (formData?.questions) {
      setQuestions([...formData.questions].sort((a, b) => a.position - b.position));
    }
  }, [formData]);

  const isFrozen = formData?.frozen ?? false;
  const isPublished = formData?.formPublished ?? true;
  const formVersion = formData?.formVersion ?? 1;
  const registeredCount = formData?.registeredCount ?? 0;

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle Drag Reorder
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = questions.findIndex((q) => q.id === active.id);
    const newIndex = questions.findIndex((q) => q.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    if (isFrozen) {
      const activeQuestion = questions[oldIndex];
      const overQuestion = questions[newIndex];
      if (activeQuestion && overQuestion) {
        if (!activeQuestion.addedAfterFreeze || !overQuestion.addedAfterFreeze) {
          toast.error('Form is frozen: pre-freeze questions cannot be reordered.');
          return;
        }
      }
    }

    const previousQuestions = [...questions];
    const reordered = arrayMove(questions, oldIndex, newIndex).map((q, idx) => ({
      ...q,
      position: idx + 1,
    }));

    setQuestions(reordered);

    try {
      await api.put(`/events/${eventId}/form/order`, {
        orderedIds: reordered.map((q) => q.id),
      });
      toast.success('Question order updated.');
    } catch (err: any) {
      setQuestions(previousQuestions);
      toast.error(err?.message || 'Failed to update order. Reverted.');
    }
  };

  // Move Question Up/Down Button Handler
  const handleMoveQuestion = async (id: string, direction: 'up' | 'down') => {
    const index = questions.findIndex((q) => q.id === id);
    if (index === -1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= questions.length) return;

    if (isFrozen) {
      const q1 = questions[index];
      const q2 = questions[targetIndex];
      if (!q1?.addedAfterFreeze || !q2?.addedAfterFreeze) {
        toast.error('Form is frozen: cannot reorder existing pre-freeze questions.');
        return;
      }
    }

    const previousQuestions = [...questions];
    const reordered = arrayMove(questions, index, targetIndex).map((q, idx) => ({
      ...q,
      position: idx + 1,
    }));

    setQuestions(reordered);

    try {
      await api.put(`/events/${eventId}/form/order`, {
        orderedIds: reordered.map((q) => q.id),
      });
      toast.success('Question order updated.');
    } catch (err: any) {
      setQuestions(previousQuestions);
      toast.error(err?.message || 'Failed to move question.');
    }
  };

  // Duplicate Question Handler
  const handleDuplicateQuestion = async (id: string) => {
    try {
      const res = await api.post<{ question: FormQuestionItem }>(
        `/events/${eventId}/form/questions/${id}/duplicate`,
        {}
      );
      setQuestions((prev) => [...prev, res.question]);
      queryClient.invalidateQueries({ queryKey: ['events', eventId, 'form'] });
      toast.success('Question duplicated.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to duplicate question.');
    }
  };

  // Add Question Mutation
  const addQuestionMutation = useMutation({
    mutationFn: async (payload: Partial<FormQuestionItem>) => {
      return await api.post<{ question: FormQuestionItem }>(
        `/events/${eventId}/form/questions`,
        payload
      );
    },
    onSuccess: (res) => {
      setQuestions((prev) => [...prev, res.question]);
      queryClient.invalidateQueries({ queryKey: ['events', eventId, 'form'] });
      toast.success('Question added successfully.');
    },
    onError: (err: any) => {
      if (err?.code === 'FORM_FROZEN' || err?.message?.includes('frozen')) {
        toast.error(
          err.message || 'Form frozen: only optional questions can be added.'
        );
      } else {
        toast.error(err?.message || 'Failed to add question.');
      }
    },
  });

  const handleAddQuestion = (forcedOptional = false) => {
    const nextPosition = questions.length + 1;
    addQuestionMutation.mutate({
      type: QuestionType.SHORT_TEXT,
      label: `Question #${nextPosition}`,
      required: forcedOptional || isFrozen ? false : true,
      position: nextPosition,
    });
  };

  // Update Question Handlers
  const handleUpdateQuestion = async (
    id: string,
    updates: Partial<FormQuestionItem>
  ) => {
    if (isFrozen && updates.required === true) {
      toast.error('Form is frozen: questions cannot be made required.');
      return;
    }

    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...updates } : q))
    );

    try {
      await api.patch(`/events/${eventId}/form/questions/${id}`, updates);
    } catch (err: any) {
      if (err?.code === 'FORM_FROZEN' || err?.message?.includes('frozen')) {
        toast.error('Form frozen: modifications to locked questions are forbidden.');
      } else {
        toast.error(err?.message || 'Failed to save question update.');
      }
      refetch();
    }
  };

  // Delete Question Handler
  const handleDeleteQuestion = async (id: string) => {
    if (isFrozen) {
      const q = questions.find((item) => item.id === id);
      if (!q?.addedAfterFreeze) {
        toast.error('Cannot delete questions from a frozen form.');
        return;
      }
    }

    const previous = [...questions];
    setQuestions((prev) => prev.filter((q) => q.id !== id));

    try {
      await api.delete(`/events/${eventId}/form/questions/${id}`);
      toast.success('Question removed.');
      queryClient.invalidateQueries({ queryKey: ['events', eventId, 'form'] });
    } catch (err: any) {
      setQuestions(previous);
      toast.error(err?.message || 'Failed to delete question.');
    }
  };

  // Apply Template Handler
  const handleApplyTemplate = async () => {
    try {
      await api.post(`/events/${eventId}/form/apply-template`, {
        templateKey: selectedTemplateKey,
        replaceExisting,
      });
      setIsTemplateModalOpen(false);
      toast.success('Template applied successfully!');
      refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to apply template.');
    }
  };

  // Publish / Unpublish Toggle
  const handleTogglePublish = async () => {
    setIsPublishing(true);
    try {
      if (isPublished) {
        await api.post(`/events/${eventId}/form/unpublish`, {});
        toast.success('Form unpublished. Registrations are paused.');
      } else {
        const res = await api.post<{ formVersion: number }>(`/events/${eventId}/form/publish`, {});
        toast.success(`Form published! Active schema snapshot saved (v${res.formVersion}).`);
      }
      refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to change publish status.');
    } finally {
      setIsPublishing(false);
    }
  };

  // Test Preview Validation
  const handleTestValidation = async () => {
    setIsValidatingPreview(true);
    setPreviewErrors({});
    try {
      const res = await api.post<{ valid: boolean; errors: Record<string, string> }>(
        `/events/${eventId}/form/preview-validate`,
        { answers: previewAnswers }
      );
      if (res.valid) {
        toast.success('All answers are valid according to schema rules!');
      } else {
        setPreviewErrors(res.errors);
        toast.error('Form validation failed: inspect flagged fields below.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Validation request failed.');
    } finally {
      setIsValidatingPreview(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container max-w-4xl py-12 px-4 mx-auto animate-pulse space-y-4">
        <div className="h-8 w-64 bg-muted rounded" />
        <div className="h-4 w-96 bg-muted rounded" />
        <div className="h-48 bg-muted rounded-xl" />
      </div>
    );
  }

  const selectedTemplate = templatesData?.templates?.find(
    (t: any) => t.key === selectedTemplateKey
  );

  return (
    <div className="container max-w-4xl py-8 px-4 sm:px-6 mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="h-8 w-8 p-0"
              aria-label="Go back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">Registration Form Builder</h1>
            <Badge variant="outline" className="font-mono text-xs">
              v{formVersion}
            </Badge>
            {isPublished ? (
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[11px]">
                Published
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[11px]">
                Draft (Unpublished)
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Configure attendee questions, presets, and validation. Historical versions are automatically preserved.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Apply Template Button */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsTemplateModalOpen(true)}
            className="gap-2 shadow-sm"
          >
            <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <span>Templates</span>
          </Button>

          {/* Preview Form Button */}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setPreviewAnswers({});
              setPreviewErrors({});
              setIsPreviewOpen(true);
            }}
            className="gap-2 shadow-sm"
            data-testid="btn-preview-modal"
          >
            <Eye className="h-4 w-4" />
            <span>Preview</span>
          </Button>

          {/* Publish / Unpublish Toggle */}
          <Button
            type="button"
            variant={isPublished ? 'outline' : 'default'}
            disabled={isPublishing}
            onClick={handleTogglePublish}
            className="gap-2 shadow-sm"
          >
            <Send className="h-4 w-4" />
            <span>{isPublished ? 'Unpublish Form' : 'Publish Form'}</span>
          </Button>

          {/* Add Question Button */}
          {!isFrozen ? (
            <Button
              type="button"
              onClick={() => handleAddQuestion(false)}
              className="gap-2 shadow-sm"
              data-testid="btn-add-question"
            >
              <Plus className="h-4 w-4" />
              <span>Add Field</span>
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => handleAddQuestion(true)}
              className="gap-2 bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
              data-testid="btn-add-optional-question"
            >
              <Plus className="h-4 w-4" />
              <span>Add Optional Field</span>
            </Button>
          )}
        </div>
      </div>

      {/* Persistent Frozen State Amber Banner */}
      {isFrozen && (
        <div
          className="rounded-xl border border-amber-300 bg-amber-500/10 p-4 text-amber-950 dark:border-amber-800 dark:text-amber-200 shadow-sm flex items-start gap-3"
          data-testid="form-frozen-banner"
        >
          <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">
              Form frozen: {registeredCount} attendees registered
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Editing locked questions is restricted to preserve historical submissions. Any new question appended will automatically be optional.
            </p>
          </div>
        </div>
      )}

      {/* Sortable Questions List */}
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={questions.map((q) => q.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3" role="list" aria-label="Registration form questions">
            {questions.length === 0 ? (
              <Card className="border-dashed p-12 text-center text-muted-foreground space-y-3">
                <FileText className="h-10 w-10 mx-auto text-muted-foreground/50" />
                <p className="text-sm font-medium">No questions defined yet.</p>
                <p className="text-xs">
                  Apply a standard template or add custom questions to build your registration form.
                </p>
                <div className="flex justify-center gap-3 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsTemplateModalOpen(true)}
                    className="gap-1.5"
                  >
                    <Sparkles className="h-4 w-4 text-purple-600" />
                    Load Template
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleAddQuestion(false)}
                    className="gap-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    Add Custom Field
                  </Button>
                </div>
              </Card>
            ) : (
              questions.map((q, idx) => (
                <SortableQuestionCard
                  key={q.id}
                  question={q}
                  index={idx}
                  totalCount={questions.length}
                  isFrozen={isFrozen}
                  onUpdate={handleUpdateQuestion}
                  onDelete={handleDeleteQuestion}
                  onDuplicate={handleDuplicateQuestion}
                  onMove={handleMoveQuestion}
                />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* Floating Add Optional Question Button when Frozen */}
      {isFrozen && (
        <div className="fixed bottom-6 right-6 z-40">
          <Button
            type="button"
            onClick={() => handleAddQuestion(true)}
            size="lg"
            className="rounded-full shadow-lg bg-amber-600 hover:bg-amber-700 text-white gap-2 px-5 h-12"
            data-testid="floating-add-optional-btn"
          >
            <Plus className="h-5 w-5" />
            <span className="font-semibold text-sm">Add Optional Question</span>
          </Button>
        </div>
      )}

      {/* Template Selection Modal */}
      <Dialog open={isTemplateModalOpen} onOpenChange={setIsTemplateModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              Apply Event Form Template
            </DialogTitle>
            <DialogDescription className="text-xs">
              Select an editable industry-standard template curated for university campus events.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(templatesData?.templates ?? []).map((t: any) => {
                const isSelected = selectedTemplateKey === t.key;
                return (
                  <div
                    key={t.key}
                    onClick={() => setSelectedTemplateKey(t.key)}
                    className={`cursor-pointer p-3.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                        : 'border-border hover:border-border/80 bg-card'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-bold text-sm text-foreground">{t.name}</h4>
                      <Badge variant="outline" className="text-[10px]">
                        {t.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                    <span className="text-[11px] font-semibold text-primary mt-2 block">
                      {t.questionCount} preconfigured questions
                    </span>
                  </div>
                );
              })}
            </div>

            {selectedTemplate && (
              <div className="p-3.5 rounded-lg border border-border/70 bg-muted/20 space-y-2">
                <h5 className="text-xs font-bold text-foreground">Preview of Template Fields:</h5>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  {selectedTemplate.questions.map((q: any, i: number) => (
                    <li key={i}>
                      <span className="font-medium text-foreground">{q.label}</span>{' '}
                      <span className="text-[11px] text-muted-foreground">({q.type})</span>
                      {q.required && <span className="text-rose-500 font-bold ml-1">*</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!isFrozen && (
              <div className="flex items-center gap-2 pt-2 border-t border-border/60">
                <input
                  type="checkbox"
                  id="replaceExisting"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                  className="rounded border-gray-300 text-primary focus:ring-primary"
                />
                <Label htmlFor="replaceExisting" className="text-xs cursor-pointer font-medium">
                  Replace all existing questions with this template
                </Label>
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsTemplateModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleApplyTemplate} className="gap-2">
              <Check className="h-4 w-4" />
              Apply Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Real Form Preview Modal with Live Server Validation */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-indigo-600" />
              Live Registration Form Preview
            </DialogTitle>
            <DialogDescription className="text-xs">
              Experience the form exactly as attendees see it. Fill in test answers and test schema validation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {questions.map((q) => {
              const fieldError = previewErrors[q.id];

              if (q.type === QuestionType.INSTRUCTION) {
                return (
                  <div key={q.id} className="p-4 rounded-xl border border-indigo-200/60 dark:border-indigo-900/40 bg-indigo-50/30 dark:bg-indigo-950/20 space-y-1">
                    <h4 className="text-sm font-bold text-foreground">{q.label}</h4>
                    {q.helpText && <p className="text-xs text-muted-foreground">{q.helpText}</p>}
                  </div>
                );
              }

              return (
                <div key={q.id} className="space-y-1.5 p-3 rounded-lg border border-border/60 bg-card">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">
                      {q.label}
                      {q.required && <span className="text-rose-500 ml-1">*</span>}
                    </Label>
                    <Badge variant="secondary" className="text-[10px]">
                      {QUESTION_TYPE_LABELS[q.type] || q.type}
                    </Badge>
                  </div>

                  {q.helpText && (
                    <p className="text-xs text-muted-foreground">{q.helpText}</p>
                  )}

                  {/* Field Input Rendering */}
                  {q.type === QuestionType.SHORT_TEXT ||
                  q.type === QuestionType.EMAIL ||
                  q.type === QuestionType.PHONE ? (
                    <Input
                      value={previewAnswers[q.id] ?? ''}
                      onChange={(e) =>
                        setPreviewAnswers({ ...previewAnswers, [q.id]: e.target.value })
                      }
                      placeholder={q.placeholder || q.label}
                      className={fieldError ? 'border-rose-500' : ''}
                    />
                  ) : q.type === QuestionType.URL ? (
                    <div className="relative">
                      <Globe className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                      <Input
                        type="url"
                        value={previewAnswers[q.id] ?? ''}
                        onChange={(e) =>
                          setPreviewAnswers({ ...previewAnswers, [q.id]: e.target.value })
                        }
                        placeholder={q.placeholder || 'https://...'}
                        className={`pl-9 ${fieldError ? 'border-rose-500' : ''}`}
                      />
                    </div>
                  ) : q.type === QuestionType.LONG_TEXT ? (
                    <textarea
                      value={previewAnswers[q.id] ?? ''}
                      onChange={(e) =>
                        setPreviewAnswers({ ...previewAnswers, [q.id]: e.target.value })
                      }
                      rows={3}
                      placeholder={q.placeholder || q.label}
                      className={`w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                        fieldError ? 'border-rose-500' : ''
                      }`}
                    />
                  ) : q.type === QuestionType.NUMBER ? (
                    <Input
                      type="number"
                      value={previewAnswers[q.id] ?? ''}
                      onChange={(e) =>
                        setPreviewAnswers({
                          ...previewAnswers,
                          [q.id]: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      placeholder={q.placeholder || '0'}
                      className={fieldError ? 'border-rose-500' : ''}
                    />
                  ) : q.type === QuestionType.CHECKBOX ? (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        id={`prev-chk-${q.id}`}
                        checked={!!previewAnswers[q.id]}
                        onChange={(e) =>
                          setPreviewAnswers({ ...previewAnswers, [q.id]: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <Label htmlFor={`prev-chk-${q.id}`} className="text-xs cursor-pointer">
                        {q.placeholder || 'I confirm and agree'}
                      </Label>
                    </div>
                  ) : q.type === QuestionType.YES_NO ? (
                    <div className="flex items-center gap-4 pt-1">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name={`yesno-${q.id}`}
                          value="true"
                          checked={previewAnswers[q.id] === true}
                          onChange={() =>
                            setPreviewAnswers({ ...previewAnswers, [q.id]: true })
                          }
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>Yes</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name={`yesno-${q.id}`}
                          value="false"
                          checked={previewAnswers[q.id] === false}
                          onChange={() =>
                            setPreviewAnswers({ ...previewAnswers, [q.id]: false })
                          }
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>No</span>
                      </label>
                    </div>
                  ) : q.type === QuestionType.SINGLE_SELECT || q.type === QuestionType.RADIO ? (
                    <div className="space-y-1.5 pt-1">
                      {(q.options ?? []).map((opt) => (
                        <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="radio"
                            name={`radio-${q.id}`}
                            value={opt}
                            checked={previewAnswers[q.id] === opt}
                            onChange={() =>
                              setPreviewAnswers({ ...previewAnswers, [q.id]: opt })
                            }
                            className="text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  ) : q.type === QuestionType.DROPDOWN ? (
                    <Select
                      value={previewAnswers[q.id] ?? ''}
                      onValueChange={(val) =>
                        setPreviewAnswers({ ...previewAnswers, [q.id]: val })
                      }
                    >
                      <SelectTrigger className={fieldError ? 'border-rose-500' : ''}>
                        <SelectValue placeholder={q.placeholder || 'Select an option'} />
                      </SelectTrigger>
                      <SelectContent>
                        {(q.options ?? []).map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : q.type === QuestionType.MULTI_SELECT ? (
                    <div className="space-y-1.5 pt-1">
                      {(q.options ?? []).map((opt) => {
                        const current = Array.isArray(previewAnswers[q.id])
                          ? previewAnswers[q.id]
                          : [];
                        const checked = current.includes(opt);
                        return (
                          <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...current, opt]
                                  : current.filter((x: string) => x !== opt);
                                setPreviewAnswers({ ...previewAnswers, [q.id]: next });
                              }}
                              className="text-indigo-600 rounded"
                            />
                            <span>{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : q.type === QuestionType.FILE_UPLOAD ? (
                    <div className="p-3 border border-dashed rounded-lg text-center text-xs text-muted-foreground bg-muted/20">
                      Upload simulation: PDF or image accepted (up to 10MB)
                    </div>
                  ) : (
                    <Input
                      type="date"
                      value={previewAnswers[q.id] ?? ''}
                      onChange={(e) =>
                        setPreviewAnswers({ ...previewAnswers, [q.id]: e.target.value })
                      }
                    />
                  )}

                  {fieldError && (
                    <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                      {fieldError}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsPreviewOpen(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={handleTestValidation}
              disabled={isValidatingPreview}
              className="gap-2 shadow-sm"
              data-testid="btn-test-preview-validation"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{isValidatingPreview ? 'Validating...' : 'Validate Answers'}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FormBuilderPage;
