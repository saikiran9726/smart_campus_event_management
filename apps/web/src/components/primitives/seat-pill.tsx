import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SeatPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  remaining: number;
  capacity?: number;
  label?: string;
}

export type SeatThreshold = 'many' | 'few' | 'sold-out';

export function getSeatThreshold(remaining: number, capacity?: number): SeatThreshold {
  if (remaining <= 0) return 'sold-out';
  if (capacity && capacity > 0) {
    const ratio = remaining / capacity;
    if (ratio <= 0.2 || remaining <= 20) return 'few';
    return 'many';
  }
  return remaining <= 20 ? 'few' : 'many';
}

export const SeatPill = React.forwardRef<HTMLSpanElement, SeatPillProps>(
  ({ remaining, capacity, label, className, ...props }, ref) => {
    const threshold = getSeatThreshold(remaining, capacity);

    const thresholdStyles: Record<SeatThreshold, string> = {
      many: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60',
      few: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60',
      'sold-out': 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60',
    };

    const defaultText =
      threshold === 'sold-out'
        ? 'Sold Out'
        : `${remaining} seat${remaining === 1 ? '' : 's'} left`;

    return (
      <span
        ref={ref}
        data-testid="seat-pill"
        data-threshold={threshold}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors tnum',
          thresholdStyles[threshold],
          className
        )}
        {...props}
      >
        <span
          className={cn('h-1.5 w-1.5 rounded-full', {
            'bg-emerald-600 dark:bg-emerald-400': threshold === 'many',
            'bg-amber-600 dark:bg-amber-400 animate-pulse': threshold === 'few',
            'bg-rose-600 dark:bg-rose-400': threshold === 'sold-out',
          })}
        />
        {label || defaultText}
      </span>
    );
  }
);
SeatPill.displayName = 'SeatPill';
