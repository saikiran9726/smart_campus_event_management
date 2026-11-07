import React from 'react';
import { Card } from './Card';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

export interface StatCardProps {
  title: string;
  value: string | number;
  helperText?: string;
  change?: {
    value: string | number;
    trend: 'up' | 'down' | 'neutral';
  };
  icon?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  helperText,
  change,
  icon,
  className,
  onClick,
}) => {
  return (
    <Card
      onClick={onClick}
      className={cn(
        'p-5 text-left transition-all duration-150',
        onClick && 'cursor-pointer hover:border-stone-300 dark:hover:border-stone-700',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          {title}
        </span>
        {icon && (
          <div className="h-8 w-8 rounded-md bg-stone-100 flex items-center justify-center text-stone-600 dark:bg-stone-800 dark:text-stone-300 shrink-0">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2.5">
        <div className="font-heading text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-stone-100 tnum tracking-tight">
          {value}
        </div>
        {change && (
          <div
            className={cn(
              'flex items-center text-xs font-semibold tnum',
              change.trend === 'up' && 'text-emerald-700 dark:text-emerald-400',
              change.trend === 'down' && 'text-red-700 dark:text-red-400',
              change.trend === 'neutral' && 'text-stone-500'
            )}
          >
            {change.trend === 'up' ? (
              <TrendingUp className="h-3.5 w-3.5 mr-0.5 stroke-[2]" />
            ) : change.trend === 'down' ? (
              <TrendingDown className="h-3.5 w-3.5 mr-0.5 stroke-[2]" />
            ) : null}
            <span>{change.value}</span>
          </div>
        )}
      </div>

      {helperText && (
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          {helperText}
        </p>
      )}
    </Card>
  );
};
StatCard.displayName = 'StatCard';
