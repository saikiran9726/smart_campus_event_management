import React from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'subtle' | 'amber-highlight' | 'teal-highlight';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-md border border-stone-200 bg-white text-stone-800 shadow-sm transition-shadow dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100',
          variant === 'subtle' && 'bg-stone-50 dark:bg-stone-900/50',
          variant === 'amber-highlight' && 'border-amber-400/50 bg-amber-50/50 dark:border-amber-500/40 dark:bg-amber-950/20',
          variant === 'teal-highlight' && 'border-teal-300 bg-gradient-to-br from-teal-50 via-teal-50/50 to-stone-50 dark:border-teal-700 dark:from-teal-950/30 dark:to-stone-900',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-5 pb-3', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('font-heading text-lg font-bold leading-tight tracking-tight text-stone-900 dark:text-stone-100', className)} {...props} />
  )
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-xs text-stone-600 dark:text-stone-400', className)} {...props} />
  )
);
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-5 pt-0 border-t border-stone-100 dark:border-stone-800/60 mt-4', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';
