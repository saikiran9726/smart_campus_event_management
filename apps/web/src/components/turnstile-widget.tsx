import React, { useEffect, useRef } from 'react';
import { env } from '@/env';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        params: {
          sitekey: string;
          callback?: (token: string) => void;
          'error-callback'?: () => void;
          'expired-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
        }
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
    onloadTurnstileCallback?: () => void;
  }
}

export interface TurnstileWidgetProps {
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  className?: string;
  testMode?: boolean;
}

export const TurnstileWidget: React.FC<TurnstileWidgetProps> = ({
  onSuccess,
  onError,
  onExpire,
  className,
  testMode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const isTest = testMode || env.MODE === 'test' || typeof window !== 'undefined' && 'vitest' in window;

  useEffect(() => {
    if (isTest) {
      // In test mode, immediately return deterministic token
      onSuccess('test-pass');
      return;
    }

    let isMounted = true;

    const renderWidget = () => {
      if (!containerRef.current || !window.turnstile || widgetIdRef.current) return;

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: env.VITE_TURNSTILE_SITE_KEY,
        callback: (token: string) => {
          if (isMounted) onSuccess(token);
        },
        'error-callback': () => {
          if (isMounted) onError?.();
        },
        'expired-callback': () => {
          if (isMounted) onExpire?.();
        },
        theme: 'auto',
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const scriptId = 'cloudflare-turnstile-script';
      if (!document.getElementById(scriptId)) {
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.onload = () => {
          renderWidget();
        };
        document.head.appendChild(script);
      } else {
        const checkInterval = setInterval(() => {
          if (window.turnstile) {
            clearInterval(checkInterval);
            renderWidget();
          }
        }, 100);
        return () => clearInterval(checkInterval);
      }
    }

    return () => {
      isMounted = false;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore cleanup errors
        }
        widgetIdRef.current = null;
      }
    };
  }, [isTest, onSuccess, onError, onExpire]);

  if (isTest) {
    return (
      <div data-testid="turnstile-test-bypass" className="text-xs text-muted-foreground p-2 bg-muted/40 rounded">
        Security verification active (test mode bypass)
      </div>
    );
  }

  return <div ref={containerRef} className={className} data-testid="turnstile-widget" />;
};
