import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Star, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ReviewItem {
  id: string;
  studentName: string;
  department?: string | null;
  stars: number;
  comment?: string | null;
  createdAt: string;
}

export interface ReviewsSummaryProps {
  average: number;
  count: number;
  histogram: Record<number, number>; // { 5: count, 4: count, ... }
  reviews?: ReviewItem[];
  className?: string;
}

export const ReviewsSummary: React.FC<ReviewsSummaryProps> = ({
  average = 0,
  count = 0,
  histogram = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  reviews = [],
  className,
}) => {
  return (
    <Card className={cn('border-border', className)} data-testid="reviews-summary">
      <CardHeader className="p-6 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-bold">Verified Attendee Reviews</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Only verified attendees with confirmed check-in scans can post evaluations.
            </p>
          </div>
          <div className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800/60">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>100% Verified</span>
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
              Recent Feedback
            </h4>
            {reviews.slice(0, 3).map((r) => (
              <div key={r.id} className="p-3.5 rounded-lg bg-muted/30 border border-border/40 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">
                    {r.studentName} {r.department && `(${r.department})`}
                  </span>
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
                </div>
                {r.comment && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    "{r.comment}"
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
