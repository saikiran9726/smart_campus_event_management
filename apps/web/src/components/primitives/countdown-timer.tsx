import React, { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface CountdownTimerProps extends React.HTMLAttributes<HTMLSpanElement> {
  expiresAt: string | Date | number;
  onExpire?: () => void;
  showSeconds?: boolean;
}

export function formatRemainingTime(ms: number, showSeconds = true): string {
  if (ms <= 0) return showSeconds ? '00:00' : '0m';

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${showSeconds ? `${seconds.toString().padStart(2, '0')}s` : ''}`.trim();
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({
  expiresAt,
  onExpire,
  showSeconds = true,
  className,
  ...props
}) => {
  const targetMs = new Date(expiresAt).getTime();
  const [remainingMs, setRemainingMs] = useState<number>(() =>
    Math.max(0, targetMs - Date.now())
  );
  const hasExpiredRef = useRef(false);

  useEffect(() => {
    hasExpiredRef.current = false;

    const checkTime = () => {
      const now = Date.now();
      const diff = Math.max(0, targetMs - now);
      setRemainingMs(diff);

      if (diff <= 0 && !hasExpiredRef.current) {
        hasExpiredRef.current = true;
        onExpire?.();
      }
    };

    checkTime();
    const interval = setInterval(checkTime, 1000);

    // Recompute on window visibility change to counter background throttling
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkTime();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [targetMs, onExpire]);

  return (
    <span
      data-testid="countdown-timer"
      className={cn('tnum font-mono font-medium', className)}
      {...props}
    >
      {formatRemainingTime(remainingMs, showSeconds)}
    </span>
  );
};
