import * as React from 'react';
import { cn } from '@/lib/utils';

export interface StickyBottomSheetProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const StickyBottomSheet = React.forwardRef<HTMLDivElement, StickyBottomSheetProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-testid="sticky-bottom-sheet"
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 lg:hidden',
          'min-h-12',
          'bg-background/95 backdrop-blur-md border-t border-border',
          'shadow-[0_-4px_20px_rgba(0,0,0,0.15)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.5)]',
          'px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]',
          'flex items-center justify-between gap-3',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
StickyBottomSheet.displayName = 'StickyBottomSheet';
