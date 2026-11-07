import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center rounded-full font-semibold transition-colors focus:outline-none select-none',
  {
    variants: {
      variant: {
        neutral: 'bg-stone-100 text-stone-700 border border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700',
        primary: 'bg-teal-50 text-teal-800 border border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800',
        amber: 'bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-700',
        success: 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
        warning: 'bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
        danger: 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
        info: 'bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
      },
      size: {
        sm: 'px-2 py-0.5 text-[11px] leading-tight',
        md: 'px-2.5 py-1 text-xs leading-none',
        lg: 'px-3 py-1.5 text-sm',
      },
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'sm',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  leftDot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({ className, variant, size, leftDot, children, ...props }) => {
  return (
    <span className={cn(badgeVariants({ variant, size, className }))} {...props}>
      {leftDot && (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full mr-1.5 shrink-0',
            variant === 'primary' && 'bg-teal-600',
            variant === 'amber' && 'bg-amber-600',
            variant === 'success' && 'bg-emerald-600',
            variant === 'warning' && 'bg-amber-600',
            variant === 'danger' && 'bg-red-600',
            variant === 'info' && 'bg-blue-600',
            (!variant || variant === 'neutral') && 'bg-stone-500'
          )}
        />
      )}
      <span>{children}</span>
    </span>
  );
};
Badge.displayName = 'Badge';

export interface StatusPillProps {
  status: 'ACTIVE' | 'CONFIRMED' | 'PENDING' | 'WAITLISTED' | 'CANCELLED' | 'REJECTED' | 'COMPLETED' | string;
  size?: 'sm' | 'md';
  className?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status, size = 'sm', className }) => {
  const norm = (status || '').toUpperCase();
  let variant: 'neutral' | 'primary' | 'amber' | 'success' | 'warning' | 'danger' | 'info' = 'neutral';
  let label = status;

  if (['CONFIRMED', 'ACTIVE', 'APPROVED', 'ATTENDED'].includes(norm)) {
    variant = 'success';
    label = norm === 'CONFIRMED' ? 'Confirmed' : norm === 'ACTIVE' ? 'Active' : status;
  } else if (['PENDING', 'SUBMITTED', 'UNDER_REVIEW'].includes(norm)) {
    variant = 'warning';
    label = norm === 'PENDING' ? 'Pending' : 'In Review';
  } else if (['WAITLISTED'].includes(norm)) {
    variant = 'info';
    label = 'Waitlisted';
  } else if (['CANCELLED', 'REJECTED', 'DECLINED', 'EXPIRED', 'REVOKED'].includes(norm)) {
    variant = 'danger';
    label = norm === 'CANCELLED' ? 'Cancelled' : norm === 'REJECTED' ? 'Rejected' : norm === 'REVOKED' ? 'Revoked' : status;
  } else if (['LEADER'].includes(norm)) {
    variant = 'primary';
    label = 'Leader';
  } else if (['MEMBER'].includes(norm)) {
    variant = 'neutral';
    label = 'Member';
  }

  return (
    <Badge variant={variant} size={size} leftDot className={className}>
      {label}
    </Badge>
  );
};
StatusPill.displayName = 'StatusPill';
