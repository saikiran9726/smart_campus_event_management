import React, { useState } from 'react';
import { Button, ButtonProps } from './Button';
import { Check, Copy } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

export interface CopyButtonProps extends Omit<ButtonProps, 'onClick'> {
  textToCopy: string;
  toastTitle?: string;
  toastDescription?: string;
  label?: string;
  copiedLabel?: string;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  textToCopy,
  toastTitle = 'Copied to clipboard',
  toastDescription,
  label = 'Copy',
  copiedLabel = 'Copied!',
  variant = 'outline',
  size = 'sm',
  className,
  ...props
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast({
        title: toastTitle,
        description: toastDescription || textToCopy,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Copy failed',
        description: 'Unable to write to clipboard.',
      });
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleCopy}
      className={cn('transition-all duration-150', className)}
      leftIcon={
        copied ? (
          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 stroke-[2.2]" />
        ) : (
          <Copy className="h-4 w-4 stroke-[1.75]" />
        )
      }
      {...props}
    >
      {copied ? copiedLabel : label}
    </Button>
  );
};
CopyButton.displayName = 'CopyButton';
