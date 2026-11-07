import React from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  helperText?: string;
  error?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, helperText, error, id, disabled, checked, onChange, ...props }, ref) => {
    const generatedId = React.useId();
    const checkboxId = id || generatedId;

    return (
      <div className="flex items-start space-x-3 text-left">
        <div className="relative flex items-center justify-center pt-0.5">
          <input
            id={checkboxId}
            ref={ref}
            type="checkbox"
            disabled={disabled}
            checked={checked}
            onChange={onChange}
            className="peer sr-only"
            {...props}
          />
          <div
            className={cn(
              'h-5 w-5 rounded border border-stone-300 bg-white transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-teal-700/30 peer-focus-visible:ring-offset-1 peer-checked:bg-teal-700 peer-checked:border-teal-700 peer-disabled:cursor-not-allowed peer-disabled:bg-stone-100 peer-disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:peer-checked:bg-teal-600 flex items-center justify-center text-white',
              error && 'border-red-600',
              className
            )}
          >
            {checked && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
          </div>
        </div>
        {(label || helperText || error) && (
          <div className="space-y-0.5">
            {label && (
              <label
                htmlFor={checkboxId}
                className={cn(
                  'text-sm font-medium text-stone-800 dark:text-stone-200 select-none cursor-pointer',
                  disabled && 'cursor-not-allowed opacity-60'
                )}
              >
                {label}
              </label>
            )}
            {helperText && !error && (
              <p className="text-xs text-stone-500 dark:text-stone-400">{helperText}</p>
            )}
            {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
          </div>
        )}
      </div>
    );
  }
);
Checkbox.displayName = 'Checkbox';
