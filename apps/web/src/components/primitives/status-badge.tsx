import * as React from 'react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type EntityStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'PUBLISHED'
  | 'LIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'CONFIRMED'
  | 'WAITLISTED'
  | 'OFFERED'
  | 'EXPIRED'
  | 'NO_SHOW'
  | 'VALID'
  | 'CHECKED_IN'
  | 'REVOKED';

export interface StatusBadgeProps extends Omit<BadgeProps, 'variant'> {
  status: EntityStatus | string;
  customLabel?: string;
}

const statusVariantMap: Record<string, { label: string; className: string }> = {
  // Event statuses
  DRAFT: { label: 'Draft', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  SUBMITTED: { label: 'Pending Review', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400' },
  APPROVED: { label: 'Approved', className: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400' },
  REJECTED: { label: 'Rejected', className: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400' },
  PUBLISHED: { label: 'Published', className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-400' },
  LIVE: { label: 'Live Now', className: 'bg-emerald-500 text-white animate-pulse' },
  COMPLETED: { label: 'Completed', className: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300' },
  CANCELLED: { label: 'Cancelled', className: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400' },

  // Registration & Ticket statuses
  CONFIRMED: { label: 'Confirmed', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400' },
  WAITLISTED: { label: 'Waitlisted', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400' },
  OFFERED: { label: 'Seat Offered', className: 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-400' },
  EXPIRED: { label: 'Expired', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  NO_SHOW: { label: 'No Show', className: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400' },
  VALID: { label: 'Valid Ticket', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400' },
  CHECKED_IN: { label: 'Checked In', className: 'bg-emerald-600 text-white dark:bg-emerald-500' },
  REVOKED: { label: 'Revoked', className: 'bg-rose-600 text-white dark:bg-rose-500' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  customLabel,
  className,
  ...props
}) => {
  const meta = statusVariantMap[status.toUpperCase()] || {
    label: status,
    className: 'bg-muted text-muted-foreground',
  };

  return (
    <Badge
      data-testid="status-badge"
      data-status={status}
      className={cn('font-medium border-0 px-2.5 py-0.5 text-xs', meta.className, className)}
      {...props}
    >
      {customLabel || meta.label}
    </Badge>
  );
};
