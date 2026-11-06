import React from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps {
  id?: string;
  label?: React.ReactNode;
  helperText?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  id,
  label,
  helperText,
  checked,
  onCheckedChange,
  disabled,
  className,
}) => {
  const generatedId = React.useId();
  const switchId = id || generatedId;

  return (
    <div className="flex items-center justify-between gap-4 text-left">
      {(label || helperText) && (
        <div className="space-y-0.5">
          {label && (
            <label
              htmlFor={switchId}
              className={cn(
                'text-sm font-medium text-stone-800 dark:text-stone-200 select-none cursor-pointer',
                disabled && 'cursor-not-allowed opacity-60'
              )}
            >
              {label}
            </label>
          )}
          {helperText && <p className="text-xs text-stone-500 dark:text-stone-400">{helperText}</p>}
        </div>
      )}
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-ring disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-teal-700 dark:bg-teal-600' : 'bg-stone-300 dark:bg-stone-700',
          className
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out',
            checked ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </button>
    </div>
  );
};
Switch.displayName = 'Switch';
