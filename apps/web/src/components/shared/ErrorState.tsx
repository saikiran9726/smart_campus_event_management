import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './Button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message = 'An unexpected error occurred while loading this section. Please try again.',
  onRetry,
  isRetrying = false,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-md border border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20 space-y-4 max-w-lg mx-auto',
        className
      )}
    >
      <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 dark:bg-red-900/40 dark:text-red-400">
        <AlertTriangle className="h-6 w-6 stroke-[1.75]" />
      </div>
      <div className="space-y-1.5 max-w-sm">
        <h4 className="font-heading text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100">{title}</h4>
        <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed">{message}</p>
      </div>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          isLoading={isRetrying}
          leftIcon={<RefreshCw className="h-3.5 w-3.5 stroke-[1.75]" />}
        >
          Try Again
        </Button>
      )}
    </div>
  );
};
ErrorState.displayName = 'ErrorState';
