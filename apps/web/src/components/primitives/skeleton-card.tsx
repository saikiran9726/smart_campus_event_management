import * as React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export const POSTER_CARD_HEIGHT_CLASSES = 'h-[440px] min-h-[440px] max-h-[440px]';

export interface SkeletonCardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({ className, ...props }) => {
  return (
    <Card
      data-testid="skeleton-card"
      className={cn('w-full flex flex-col overflow-hidden', POSTER_CARD_HEIGHT_CLASSES, className)}
      {...props}
    >
      {/* 16:9 Image container */}
      <div className="relative aspect-video w-full shrink-0">
        <Skeleton className="h-full w-full rounded-none" />
      </div>

      <CardHeader className="space-y-2 p-5 flex-1">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-6 w-3/4 rounded-md" />
        <Skeleton className="h-4 w-full rounded-md" />
      </CardHeader>

      <CardFooter className="p-5 pt-0 mt-auto flex items-center justify-between border-t border-border/40 pt-4">
        <div className="flex items-center space-x-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-9 w-24 rounded-md" />
      </CardFooter>
    </Card>
  );
};

export interface RealPosterCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  category?: string;
  date?: string;
  clubName?: string;
  seatsRemaining?: number;
  bannerUrl?: string;
  action?: React.ReactNode;
}

export const RealPosterCard: React.FC<RealPosterCardProps> = ({
  title = 'Event Title',
  category = 'Workshop',
  date = 'Tomorrow at 10:00 AM',
  clubName = 'Developer Student Club',
  action,
  className,
  ...props
}) => {
  return (
    <Card
      data-testid="real-poster-card"
      className={cn('w-full flex flex-col overflow-hidden', POSTER_CARD_HEIGHT_CLASSES, className)}
      {...props}
    >
      <div className="relative aspect-video w-full shrink-0 bg-muted flex items-center justify-center">
        <span className="text-xs text-muted-foreground font-medium">16:9 Banner</span>
      </div>

      <CardHeader className="space-y-2 p-5 flex-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">{category}</span>
          <span className="text-xs text-muted-foreground tnum">{date}</span>
        </div>
        <h3 className="font-bold text-lg leading-tight line-clamp-1">{title}</h3>
        <p className="text-sm text-muted-foreground line-clamp-2">
          Join us for an exciting campus session exploring emerging technology and engineering.
        </p>
      </CardHeader>

      <CardFooter className="p-5 pt-0 mt-auto flex items-center justify-between border-t border-border/40 pt-4">
        <div className="flex items-center space-x-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
            {clubName[0]}
          </div>
          <span className="text-xs font-medium text-muted-foreground">{clubName}</span>
        </div>
        {action || <div className="text-xs font-semibold text-primary">Register &rarr;</div>}
      </CardFooter>
    </Card>
  );
};

export interface SkeletonChatBubbleProps extends React.HTMLAttributes<HTMLDivElement> {
  isSender?: boolean;
}

export const SkeletonChatBubble: React.FC<SkeletonChatBubbleProps> = ({
  isSender = false,
  className,
  ...props
}) => {
  return (
    <div
      data-testid="skeleton-chat-bubble"
      className={cn(
        'flex w-full items-start gap-2.5 my-2',
        isSender ? 'flex-row-reverse' : 'flex-row',
        className
      )}
      {...props}
    >
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
      <div
        className={cn(
          'flex flex-col space-y-1.5 max-w-[70%]',
          isSender ? 'items-end' : 'items-start'
        )}
      >
        <Skeleton className="h-3 w-20" />
        <Skeleton className={cn('h-14 rounded-2xl', isSender ? 'w-48' : 'w-64')} />
      </div>
    </div>
  );
};

export interface SkeletonFormFieldProps extends React.HTMLAttributes<HTMLDivElement> {}

export const SkeletonFormField: React.FC<SkeletonFormFieldProps> = ({
  className,
  ...props
}) => {
  return (
    <div
      data-testid="skeleton-form-field"
      className={cn('space-y-2 w-full', className)}
      {...props}
    >
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-12 w-full rounded-md" />
      <Skeleton className="h-3 w-40" />
    </div>
  );
};
