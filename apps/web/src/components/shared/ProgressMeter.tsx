import React from 'react';
import { cn } from '@/lib/utils';

export interface ProgressMeterProps {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'teal' | 'amber' | 'dynamic';
  className?: string;
}

export const ProgressMeter: React.FC<ProgressMeterProps> = ({
  value,
  max = 100,
  label,
  showPercentage = true,
  size = 'md',
  variant = 'teal',
  className,
}) => {
  const clampedValue = Math.min(Math.max(value, 0), max);
  const percentage = Math.round((clampedValue / (max || 1)) * 100);

  const sizeClasses = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  };

  // Determine dynamic color based on progress threshold
  let fillClass = 'bg-teal-700 dark:bg-teal-500';
  if (variant === 'amber') {
    fillClass = 'bg-amber-500 dark:bg-amber-400';
  } else if (variant === 'dynamic') {
    if (percentage >= 90) {
      fillClass = 'bg-red-600 dark:bg-red-500';
    } else if (percentage >= 70) {
      fillClass = 'bg-amber-500 dark:bg-amber-400';
    } else {
      fillClass = 'bg-teal-700 dark:bg-teal-500';
    }
  }

  return (
    <div className={cn('w-full space-y-1.5 text-left', className)}>
      {(label || showPercentage) && (
        <div className="flex items-center justify-between text-xs font-medium text-stone-700 dark:text-stone-300">
          {label && <span>{label}</span>}
          {showPercentage && (
            <span className="font-mono text-stone-500 dark:text-stone-400 tnum text-[11px] ml-auto">
              {percentage}%
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={max}
        className={cn(
          'w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800 transition-all',
          sizeClasses[size]
        )}
      >
        <div
          className={cn('h-full rounded-full transition-all duration-300 ease-out', fillClass)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
ProgressMeter.displayName = 'ProgressMeter';
