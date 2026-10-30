import * as React from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  action,
  icon,
  className,
  ...props
}) => {
  return (
    <div
      data-testid="empty-state"
      className={cn(
        'flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center animate-in fade-in-50',
        className
      )}
      {...props}
    >
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
        {icon || (
          <svg
            className="h-12 w-12"
            fill="none"
            viewBox="0 0 48 48"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 12h32M8 20h32M8 28h20m-20 8h14M34 30l6 6m0-6l-6 6"
            />
            <circle cx="16" cy="12" r="2" fill="currentColor" />
            <circle cx="24" cy="12" r="2" fill="currentColor" />
            <circle cx="32" cy="12" r="2" fill="currentColor" />
          </svg>
        )}
      </div>
      <h3 className="text-lg font-semibold tracking-tight text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>
      {action && <div className="mt-6 flex items-center justify-center">{action}</div>}
    </div>
  );
};
