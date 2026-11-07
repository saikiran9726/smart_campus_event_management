import React from 'react';
import { cn } from '@/lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rounded' | 'card';
}

export const Skeleton: React.FC<SkeletonProps> = ({ className, variant = 'rounded', ...props }) => {
  return (
    <div
      className={cn(
        'animate-pulse bg-stone-200/80 dark:bg-stone-800',
        variant === 'text' && 'h-4 w-full rounded',
        variant === 'circular' && 'rounded-full',
        variant === 'rounded' && 'rounded-md',
        variant === 'card' && 'h-36 w-full rounded-md border border-stone-200/50',
        className
      )}
      {...props}
    />
  );
};
Skeleton.displayName = 'Skeleton';
