import React from 'react';
import { cn } from '@/lib/utils';

export interface AvatarProps {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ src, alt, name, size = 'md', className }) => {
  const [imageError, setImageError] = React.useState(false);

  const getInitials = (text?: string) => {
    if (!text) return 'U';
    const parts = text.trim().split(/\s+/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return text.slice(0, 2).toUpperCase();
  };

  const sizeClasses = {
    xs: 'h-6 w-6 text-[10px]',
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
    xl: 'h-16 w-16 text-xl',
  };

  const initials = getInitials(name || alt);

  return (
    <div
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-stone-200 bg-stone-100 font-semibold text-stone-700 select-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300',
        sizeClasses[size],
        className
      )}
    >
      {src && !imageError ? (
        <img
          src={src}
          alt={alt || name || 'Avatar'}
          onError={() => setImageError(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
};
Avatar.displayName = 'Avatar';

export interface AvatarItem {
  src?: string | null;
  name: string;
}

export interface AvatarStackProps {
  items: AvatarItem[];
  max?: number;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export const AvatarStack: React.FC<AvatarStackProps> = ({ items, max = 4, size = 'sm', className }) => {
  const visible = items.slice(0, max);
  const remaining = items.length - max;

  const overlapClasses = {
    xs: '-ml-1.5',
    sm: '-ml-2',
    md: '-ml-2.5',
  };

  return (
    <div className={cn('flex items-center', className)}>
      {visible.map((item, idx) => (
        <div key={idx} className={cn(idx > 0 && overlapClasses[size], 'ring-2 ring-white dark:ring-stone-900 rounded-full')}>
          <Avatar src={item.src} name={item.name} size={size} />
        </div>
      ))}
      {remaining > 0 && (
        <div
          className={cn(
            'relative inline-flex shrink-0 items-center justify-center rounded-full border border-stone-300 bg-stone-200 font-bold text-stone-700 ring-2 ring-white dark:ring-stone-900 dark:bg-stone-800 dark:text-stone-300',
            overlapClasses[size],
            size === 'xs' ? 'h-6 w-6 text-[10px]' : size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm'
          )}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
};
AvatarStack.displayName = 'AvatarStack';
