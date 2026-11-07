import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './Button';
import { Compass } from 'lucide-react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  secondaryAction?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
  secondaryAction,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-md border border-dashed border-stone-300 bg-stone-50/50 dark:border-stone-800 dark:bg-stone-900/30 space-y-4 max-w-lg mx-auto',
        className
      )}
    >
      <div className="h-12 w-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 dark:bg-stone-800 dark:text-stone-400">
        {icon || <Compass className="h-6 w-6 stroke-[1.75]" />}
      </div>
      <div className="space-y-1.5 max-w-sm">
        <h4 className="font-heading text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100">{title}</h4>
        <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed">{description}</p>
      </div>
      {(actionLabel || secondaryAction) && (
        <div className="flex items-center gap-3 pt-1">
          {actionLabel && (
            <Button size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryAction}
        </div>
      )}
    </div>
  );
};
EmptyState.displayName = 'EmptyState';
