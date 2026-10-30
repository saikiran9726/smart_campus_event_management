import * as React from 'react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Shield, Sparkles, GraduationCap, UserCheck, Crown, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export type UserRole =
  | 'ADMIN'
  | 'FACULTY'
  | 'ORGANIZER'
  | 'OWNER'
  | 'VOLUNTEER'
  | 'ATTENDEE';

export interface RoleBadgeProps extends Omit<BadgeProps, 'variant'> {
  role: UserRole | string;
  showIcon?: boolean;
}

const roleMap: Record<
  string,
  { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  ADMIN: {
    label: 'Campus Admin',
    className: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-900',
    icon: Shield,
  },
  FACULTY: {
    label: 'Faculty Coordinator',
    className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900',
    icon: GraduationCap,
  },
  OWNER: {
    label: 'Club Lead',
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-900',
    icon: Crown,
  },
  ORGANIZER: {
    label: 'Organizer',
    className: 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300 border-violet-200 dark:border-violet-900',
    icon: Sparkles,
  },
  VOLUNTEER: {
    label: 'Volunteer',
    className: 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-900',
    icon: UserCheck,
  },
  ATTENDEE: {
    label: 'Student',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    icon: User,
  },
};

export const RoleBadge: React.FC<RoleBadgeProps> = ({
  role,
  showIcon = true,
  className,
  ...props
}) => {
  const normalized = role.toUpperCase();
  const config = roleMap[normalized] || {
    label: role,
    className: 'bg-muted text-muted-foreground border-border',
    icon: User,
  };
  const Icon = config.icon;

  return (
    <Badge
      data-testid="role-badge"
      data-role={normalized}
      variant="outline"
      className={cn('inline-flex items-center gap-1 font-semibold text-xs py-0.5 px-2.5', config.className, className)}
      {...props}
    >
      {showIcon && <Icon className="h-3 w-3 shrink-0" />}
      <span>{config.label}</span>
    </Badge>
  );
};
