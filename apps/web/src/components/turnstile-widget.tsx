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
  resetKey?: number | string;
}

export const TurnstileWidget: React.FC<TurnstileWidgetProps> = ({
  onSuccess,
  onError,
  onExpire,
  className,
  testMode,
  resetKey,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
    onExpireRef.current = onExpire;
  });

  const isTest =
    testMode ||
    env.MODE === 'test' ||
    (typeof process !== 'undefined' && (process.env?.NODE_ENV === 'test' || process.env?.VITEST === 'true')) ||
    typeof (globalThis as any).vi !== 'undefined' ||
    (typeof window !== 'undefined' && ('vitest' in window || '__vitest_worker__' in window || (window as any).isTestEnv));

  useEffect(() => {
    if (resetKey !== undefined && widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        // ignore reset errors
      }
    }
  }, [resetKey]);

  useEffect(() => {
    if (isTest) {
      // In test mode, immediately return deterministic token
      onSuccessRef.current?.('test-pass');
      return;
    }

    let isMounted = true;

    const renderWidget = () => {
      if (!containerRef.current || !window.turnstile || widgetIdRef.current) return;

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: env.VITE_TURNSTILE_SITE_KEY,
        callback: (token: string) => {
          if (isMounted) onSuccessRef.current?.(token);
        },
        'error-callback': () => {
          if (isMounted) onErrorRef.current?.();
        },
        'expired-callback': () => {
          if (isMounted) onExpireRef.current?.();
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
  }, [isTest]);

  if (!isTest && env.PROD && /^[123]x0{4,}/.test(env.VITE_TURNSTILE_SITE_KEY)) {
    return (
      <div role="alert" className="text-xs text-destructive p-2 rounded bg-destructive/10">
        Security check is misconfigured on this site (test key in a production build). Please contact the organizers.
      </div>
    );
  }

  if (isTest) {
    return (
      <div data-testid="turnstile-test-bypass" className="text-xs text-muted-foreground p-2 bg-muted/40 rounded">
        Security verification active (test mode bypass)
      </div>
    );
  }

  return <div ref={containerRef} className={className} data-testid="turnstile-widget" />;
};
