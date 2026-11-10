import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Star, ShieldCheck, Flag, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';

export interface ReviewItem {
  id: string;
  studentName?: string;
  authorName?: string;
  department?: string | null;
  stars: number;
  comment?: string | null;
  clubStars?: number | null;
  clubComment?: string | null;
  createdAt: string;
}

export interface ReviewsSummaryProps {
  average: number;
  count: number;
  histogram: Record<number, number>; // { 5: count, 4: count, ... }
  reviews?: ReviewItem[];
  canReview?: boolean;
  hasReviewed?: boolean;
  onOpenReviewModal?: () => void;
  className?: string;
}

export const ReviewsSummary: React.FC<ReviewsSummaryProps> = ({
  average = 0,
  count = 0,
  histogram = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  reviews = [],
  canReview = false,
  hasReviewed = false,
  onOpenReviewModal,
  className,
}) => {
  const [reportTargetId, setReportTargetId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<string>('');
  const [isSubmittingReport, setIsSubmittingReport] = useState<boolean>(false);

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTargetId || reportReason.trim().length < 3) {
      toast.error('Please provide a reason of at least 3 characters.');
      return;
    }

    setIsSubmittingReport(true);
    try {
      await api.post(`/reviews/${reportTargetId}/report`, {
        reason: reportReason.trim(),
      });
      toast.success('Review has been reported for moderation review.');
      setReportTargetId(null);
      setReportReason('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit report.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  return (
    <>
      <Card className={cn('border-border', className)} data-testid="reviews-summary">
        <CardHeader className="p-6 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl font-bold">Verified Attendee Reviews</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Only verified attendees with confirmed check-in scans can post evaluations.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800/60 shrink-0">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>100% Verified</span>
              </div>
              {canReview && onOpenReviewModal && (
                <Button
                  size="sm"
                  variant={hasReviewed ? 'outline' : 'default'}
                  onClick={onOpenReviewModal}
                  className="text-xs h-8"
                  data-testid="write-review-button"
                >
                  <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                  <span>{hasReviewed ? 'Edit My Review' : 'Rate Event & Club'}</span>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 pt-0 space-y-6">
          {count === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No reviews yet. Attendees will evaluate this event after check-in.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-center">
              {/* Average rating box */}
              <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-muted/40 text-center space-y-1">
                <span className="text-4xl font-extrabold tracking-tight text-foreground tnum">
                  {average.toFixed(1)}
                </span>
                <div className="flex items-center gap-1 text-amber-500">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={cn(
                        'h-4 w-4',
                        s <= Math.round(average) ? 'fill-amber-500 text-amber-500' : 'text-muted'
                      )}
                    />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground tnum">
                  Based on {count} attendee{count === 1 ? '' : 's'}
                </span>
              </div>

              {/* 5-star histogram */}
              <div className="sm:col-span-2 space-y-2">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const starCount = histogram[stars] || 0;
                  const percentage = count > 0 ? (starCount / count) * 100 : 0;
                  return (
                    <div key={stars} className="flex items-center gap-3 text-xs">
                      <span className="w-12 font-medium text-muted-foreground flex items-center gap-1">
                        <span>{stars}</span>
                        <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                      </span>
                      <Progress value={percentage} className="h-2 flex-1" />
                      <span className="w-8 text-right font-mono text-muted-foreground tnum">
                        {starCount}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent reviews list */}
          {reviews.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-border/60">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Attendee Feedback
              </h4>
              <div className="space-y-3" data-testid="reviews-list">
                {reviews.map((r) => {
                  const displayName = r.authorName || r.studentName || 'Anonymous Attendee';
                  return (
                    <div
                      key={r.id}
                      className="p-3.5 rounded-lg bg-muted/30 border border-border/40 space-y-2 text-left"
                      data-testid="review-card"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {displayName} {r.department && `(${r.department})`}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            • {new Date(r.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex text-amber-500">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={cn(
                                  'h-3 w-3',
                                  s <= r.stars ? 'fill-amber-500 text-amber-500' : 'text-muted'
                                )}
                              />
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => setReportTargetId(r.id)}
                            className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 p-0.5 ml-1"
                            title="Report review"
                            aria-label="Report review"
                          >
                            <Flag className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {r.comment && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          &quot;{r.comment}&quot;
                        </p>
                      )}

                      {/* Optional Club rating info */}
                      {r.clubStars && (
                        <div className="pt-1.5 border-t border-border/30 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span className="font-medium text-stone-600 dark:text-stone-400">
                            Club Rating: ★ {r.clubStars}
                          </span>
                          {r.clubComment && (
                            <span className="italic truncate max-w-[200px]">
                              &quot;{r.clubComment}&quot;
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Report Review Dialog */}
      <Dialog open={Boolean(reportTargetId)} onOpenChange={(open) => !open && setReportTargetId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Report Review</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Please tell us why this review violates campus conduct guidelines.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReport} className="space-y-4 py-2">
            <div className="space-y-1.5 text-left">
              <Label htmlFor="report-reason" className="text-xs font-semibold">
                Reason
              </Label>
              <Textarea
                id="report-reason"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Spam, harassment, hate speech, inappropriate language..."
                rows={3}
                className="text-xs"
                required
              />
            </div>
            <DialogFooter className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setReportTargetId(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" variant="destructive" disabled={isSubmittingReport}>
                {isSubmittingReport ? 'Submitting...' : 'Submit Report'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
