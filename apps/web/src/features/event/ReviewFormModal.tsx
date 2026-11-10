import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Star, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

export interface ReviewFormModalProps {
  eventId: string;
  eventTitle: string;
  clubName?: string;
  existingReview?: {
    id: string;
    stars: number;
    comment?: string | null;
    clubStars?: number | null;
    clubComment?: string | null;
    showName?: boolean;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ReviewFormModal: React.FC<ReviewFormModalProps> = ({
  eventId,
  eventTitle,
  clubName,
  existingReview,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [stars, setStars] = useState<number>(5);
  const [comment, setComment] = useState<string>('');
  const [clubStars, setClubStars] = useState<number>(5);
  const [clubComment, setClubComment] = useState<string>('');
  const [showName, setShowName] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  useEffect(() => {
    if (existingReview) {
      setStars(existingReview.stars || 5);
      setComment(existingReview.comment || '');
      setClubStars(existingReview.clubStars || 5);
      setClubComment(existingReview.clubComment || '');
      setShowName(Boolean(existingReview.showName));
    } else {
      setStars(5);
      setComment('');
      setClubStars(5);
      setClubComment('');
      setShowName(false);
    }
  }, [existingReview, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stars < 1 || stars > 5) {
      toast.error('Please select an event star rating between 1 and 5.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post(`/events/${eventId}/reviews`, {
        stars,
        comment: comment.trim() || null,
        clubStars: clubStars > 0 ? clubStars : null,
        clubComment: clubComment.trim() || null,
        showName,
      });

      toast.success(
        existingReview
          ? 'Your review has been updated successfully.'
          : 'Thank you! Your verified review has been published.'
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit review.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete your review?')) {
      return;
    }

    setIsDeleting(true);
    try {
      await api.delete(`/events/${eventId}/reviews/me`);
      toast.success('Your review has been deleted.');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete review.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            {existingReview ? 'Edit Your Review' : 'Rate Event & Organizing Club'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Share verified feedback for &quot;{eventTitle}&quot;.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          {/* 1. Event Rating */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Event Rating (Required)</Label>
            <div className="flex items-center gap-1.5" data-testid="event-stars-input">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setStars(s)}
                  className="p-1 rounded hover:bg-muted/50 focus:outline-none transition-transform hover:scale-110"
                  aria-label={`${s} star${s > 1 ? 's' : ''}`}
                >
                  <Star
                    className={cn(
                      'h-6 w-6',
                      s <= stars ? 'fill-amber-500 text-amber-500' : 'text-stone-300 dark:text-stone-700'
                    )}
                  />
                </button>
              ))}
              <span className="text-xs font-bold text-muted-foreground ml-2">{stars} / 5</span>
            </div>
          </div>

          {/* 2. Event Comment */}
          <div className="space-y-1.5">
            <Label htmlFor="event-comment" className="text-xs font-semibold">
              Event Comments (Optional)
            </Label>
            <Textarea
              id="event-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What did you learn or enjoy most about this event?"
              maxLength={1000}
              rows={3}
              className="text-xs"
            />
            <div className="text-[11px] text-muted-foreground text-right">
              {comment.length}/1000
            </div>
          </div>

          {/* 3. Club Rating */}
          <div className="space-y-1.5 pt-2 border-t border-border/60">
            <Label className="text-xs font-semibold">
              Organizing Club Rating ({clubName || 'Club'})
            </Label>
            <div className="flex items-center gap-1.5" data-testid="club-stars-input">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setClubStars(s)}
                  className="p-1 rounded hover:bg-muted/50 focus:outline-none transition-transform hover:scale-110"
                  aria-label={`Club ${s} star${s > 1 ? 's' : ''}`}
                >
                  <Star
                    className={cn(
                      'h-6 w-6',
                      s <= clubStars ? 'fill-amber-500 text-amber-500' : 'text-stone-300 dark:text-stone-700'
                    )}
                  />
                </button>
              ))}
              <span className="text-xs font-bold text-muted-foreground ml-2">{clubStars} / 5</span>
            </div>
          </div>

          {/* 4. Club Comment */}
          <div className="space-y-1.5">
            <Label htmlFor="club-comment" className="text-xs font-semibold">
              Club Feedback (Optional)
            </Label>
            <Textarea
              id="club-comment"
              value={clubComment}
              onChange={(e) => setClubComment(e.target.value)}
              placeholder="How well was the event organized by the club team?"
              maxLength={1000}
              rows={2}
              className="text-xs"
            />
          </div>

          {/* 5. Privacy Toggle */}
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="show-name-checkbox"
              checked={showName}
              onCheckedChange={(checked) => setShowName(Boolean(checked))}
            />
            <Label htmlFor="show-name-checkbox" className="text-xs font-normal cursor-pointer">
              Show my name publicly on reviews (leave unchecked to remain Anonymous)
            </Label>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between pt-3 gap-2">
            {existingReview ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting || isSubmitting}
                className="gap-1.5 text-xs"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete</span>
              </Button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting || isDeleting} data-testid="submit-review-button">
                {isSubmitting ? 'Submitting...' : existingReview ? 'Save Changes' : 'Submit Review'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
