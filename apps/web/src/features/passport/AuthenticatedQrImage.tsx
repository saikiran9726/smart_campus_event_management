import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertCircle } from 'lucide-react';

export interface AuthenticatedQrImageProps {
  registrationId: string;
  alt?: string;
  className?: string;
  onObjectUrlChange?: (url: string | null) => void;
}

export const AuthenticatedQrImage: React.FC<AuthenticatedQrImageProps> = ({
  registrationId,
  alt = 'Event Ticket QR Code',
  className,
  onObjectUrlChange,
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const onObjectUrlChangeRef = React.useRef(onObjectUrlChange);

  useEffect(() => {
    onObjectUrlChangeRef.current = onObjectUrlChange;
  }, [onObjectUrlChange]);

  const fetchQr = useCallback(async () => {
    if (!registrationId) return;
    setIsLoading(true);
    setIsError(false);

    try {
      const blob = await api.getBlob(`/tickets/${registrationId}/qr.png`, {
        showToast: false,
      });
      const url = URL.createObjectURL(blob);
      setImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      onObjectUrlChangeRef.current?.(url);
    } catch {
      setIsError(true);
      setImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      onObjectUrlChangeRef.current?.(null);
    } finally {
      setIsLoading(false);
    }
  }, [registrationId]);

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoading(true);
      setIsError(false);
      try {
        const blob = await api.getBlob(`/tickets/${registrationId}/qr.png`, {
          showToast: false,
        });
        if (active) {
          const url = URL.createObjectURL(blob);
          setImageUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
          onObjectUrlChangeRef.current?.(url);
        }
      } catch {
        if (active) {
          setIsError(true);
          setImageUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
          onObjectUrlChangeRef.current?.(null);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
      setImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      onObjectUrlChangeRef.current?.(null);
    };
  }, [registrationId]);

  if (isLoading) {
    return (
      <div
        className={cn(
          'h-44 w-44 rounded-xl bg-muted/40 animate-pulse flex items-center justify-center mx-auto',
          className
        )}
        data-testid="passport-qr-skeleton"
        aria-label="Loading QR code..."
      />
    );
  }

  if (isError || !imageUrl) {
    return (
      <div
        className={cn(
          'h-44 w-44 rounded-xl border border-dashed border-border flex flex-col items-center justify-center gap-2 p-3 text-center mx-auto',
          className
        )}
        data-testid="passport-qr-error"
      >
        <AlertCircle className="h-6 w-6 text-destructive shrink-0" />
        <span className="text-xs text-muted-foreground font-medium">Failed to load QR</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void fetchQr()}
          className="h-7 text-xs px-2.5 gap-1 font-semibold"
          data-testid="passport-qr-retry"
        >
          <RefreshCw className="h-3 w-3" />
          <span>Retry</span>
        </Button>
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={alt}
      className={cn('h-44 w-44 object-contain mx-auto', className)}
      data-testid="passport-qr-image"
    />
  );
};

export default AuthenticatedQrImage;
