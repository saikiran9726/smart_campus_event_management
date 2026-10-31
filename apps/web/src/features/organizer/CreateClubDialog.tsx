import React, { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { useActiveClub } from './ActiveClubContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { PlusCircle, Loader2, AlertCircle } from 'lucide-react';

export interface CreateClubDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (clubId: string) => void;
}

export const CreateClubDialog: React.FC<CreateClubDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { refetchClubs, setActiveClubId } = useActiveClub();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [facultyAdvisorEmail, setFacultyAdvisorEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Global authorization check: Only ORGANIZER and ADMIN can create clubs
  const canCreate = user?.role === 'ORGANIZER' || user?.role === 'ADMIN';

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (!isSlugManuallyEdited) {
      setSlug(
        val
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;

    if (!name.trim() || !slug.trim() || !description.trim()) {
      setErrorMessage('Please fill in all required fields (Name, Slug, and Description).');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        description: description.trim(),
      };
      if (facultyAdvisorEmail.trim()) {
        payload.facultyAdvisorEmail = facultyAdvisorEmail.trim();
      }

      const res = await api.post<{ club: { id: string; name: string; slug: string } }>(
        '/clubs',
        payload
      );

      toast.success(`Club "${res.club.name}" created successfully!`);
      refetchClubs();
      setActiveClubId(res.club.id);

      // Reset form
      setName('');
      setSlug('');
      setDescription('');
      setFacultyAdvisorEmail('');
      setIsSlugManuallyEdited(false);

      onSuccess?.(res.club.id);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else if (err && typeof err === 'object' && 'message' in err) {
        setErrorMessage(String((err as { message: unknown }).message));
      } else {
        setErrorMessage('Failed to create campus club. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canCreate) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="create-club-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <PlusCircle className="h-5 w-5 text-indigo-600" />
            <span>Create Campus Club</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Register a student organization to manage events, gate attendance passes, and community discussion rooms.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {errorMessage && (
            <div
              className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2"
              role="alert"
              data-testid="create-club-error"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="club-name" className="text-xs font-semibold">
              Club / Society Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="club-name"
              placeholder="e.g. Distributed Systems & Cloud Guild"
              value={name}
              onChange={handleNameChange}
              required
              disabled={isSubmitting}
              data-testid="create-club-name-input"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="club-slug" className="text-xs font-semibold">
              URL Slug <span className="text-destructive">*</span>
            </Label>
            <Input
              id="club-slug"
              placeholder="e.g. cloud-guild"
              value={slug}
              onChange={(e) => {
                setIsSlugManuallyEdited(true);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
              }}
              required
              disabled={isSubmitting}
              className="font-mono text-xs"
              data-testid="create-club-slug-input"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="club-desc" className="text-xs font-semibold">
              Description & Mission <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="club-desc"
              placeholder="Detail your club's technical domain, regular activities, and student learning goals..."
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              disabled={isSubmitting}
              data-testid="create-club-desc-input"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="club-faculty" className="text-xs font-semibold">
              Faculty Advisor Email <span className="text-muted-foreground font-normal">(Optional)</span>
            </Label>
            <Input
              id="club-faculty"
              type="email"
              placeholder="faculty.advisor@campus.edu"
              value={facultyAdvisorEmail}
              onChange={(e) => setFacultyAdvisorEmail(e.target.value)}
              disabled={isSubmitting}
              data-testid="create-club-faculty-input"
            />
          </div>

          <DialogFooter className="pt-3 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              data-testid="create-club-submit-button"
              className="gap-2 font-semibold"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating Club...</span>
                </>
              ) : (
                <span>Create Organization</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
