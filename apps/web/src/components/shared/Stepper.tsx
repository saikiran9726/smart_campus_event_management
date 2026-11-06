import React from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

export interface StepItem {
  id: string | number;
  label: string;
  description?: string;
}

export interface StepperProps {
  steps: StepItem[];
  activeStep: number; // 0-indexed
  onStepClick?: (stepIndex: number) => void;
  className?: string;
}

export const Stepper: React.FC<StepperProps> = ({ steps, activeStep, onStepClick, className }) => {
  const progressPercent = Math.round(((activeStep + 1) / steps.length) * 100);

  return (
    <div className={cn('w-full', className)}>
      {/* Mobile Compact View (< 640px) */}
      <div className="block sm:hidden space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-stone-900 dark:text-stone-100">
            Step {activeStep + 1} of {steps.length}: {steps[activeStep]?.label}
          </span>
          <span className="font-mono text-stone-500 text-[11px] tnum">{progressPercent}%</span>
        </div>
        <div className="h-1.5 w-full bg-stone-200 dark:bg-stone-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-700 dark:bg-teal-500 rounded-full transition-all duration-200 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Desktop Horizontal View (>= 640px) */}
      <div className="hidden sm:flex items-center justify-between relative">
        <div className="absolute top-4 left-6 right-6 h-0.5 bg-stone-200 dark:bg-stone-800 -z-0" />
        <div
          className="absolute top-4 left-6 h-0.5 bg-teal-700 dark:bg-teal-500 transition-all duration-200 -z-0"
          style={{
            width: steps.length > 1 ? `${(activeStep / (steps.length - 1)) * 100}%` : '0%',
          }}
        />

        {steps.map((step, idx) => {
          const isDone = idx < activeStep;
          const isCurrent = idx === activeStep;
          const isClickable = Boolean(onStepClick && idx <= activeStep);

          return (
            <div
              key={step.id}
              onClick={() => isClickable && onStepClick?.(idx)}
              className={cn(
                'flex flex-col items-center relative z-10 select-none group',
                isClickable ? 'cursor-pointer' : 'cursor-default'
              )}
            >
              <div
                className={cn(
                  'h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors duration-150 ring-4 ring-white dark:ring-stone-950',
                  isDone
                    ? 'bg-teal-700 text-white dark:bg-teal-600'
                    : isCurrent
                    ? 'bg-white border-2 border-teal-700 text-teal-800 dark:bg-stone-900 dark:border-teal-500 dark:text-teal-300'
                    : 'bg-stone-200 border border-stone-300 text-stone-600 dark:bg-stone-800 dark:border-stone-700 dark:text-stone-400'
                )}
              >
                {isDone ? <Check className="h-4 w-4 stroke-[2.5]" /> : <span>{idx + 1}</span>}
              </div>
              <span
                className={cn(
                  'text-xs font-semibold mt-1.5 text-center truncate max-w-[100px]',
                  isCurrent ? 'text-teal-800 dark:text-teal-300' : isDone ? 'text-stone-800 dark:text-stone-200' : 'text-stone-400'
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
Stepper.displayName = 'Stepper';
