import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { normalizeTeamCode } from '@eventora/shared';

export interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  error?: string;
  autoFocus?: boolean;
}

export const CodeInput: React.FC<CodeInputProps> = ({
  value,
  onChange,
  length = 8,
  disabled = false,
  error,
  autoFocus = false,
}) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const rawCode = normalizeTeamCode(value || '').slice(0, length);
  const chars = Array.from({ length }, (_, i) => rawCode[i] || '');

  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]/g, '');
    if (!val) {
      // deleted
      const nextChars = [...chars];
      nextChars[index] = '';
      onChange(nextChars.join(''));
      return;
    }

    const charToInsert = val[val.length - 1] || '';
    const nextChars = [...chars];
    nextChars[index] = charToInsert;
    const newCode = nextChars.join('');
    onChange(newCode);

    // advance focus
    if (index < length - 1 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !chars[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    const cleaned = normalizeTeamCode(pasted).slice(0, length);
    onChange(cleaned);
    const targetIdx = Math.min(cleaned.length, length - 1);
    inputRefs.current[targetIdx]?.focus();
  };

  const midPoint = Math.floor(length / 2);

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-center gap-1.5 sm:gap-2 select-none" onPaste={handlePaste}>
        {chars.map((char, i) => (
          <React.Fragment key={i}>
            {i === midPoint && (
              <span className="text-stone-400 font-bold text-lg select-none px-0.5">-</span>
            )}
            <input
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              inputMode="text"
              maxLength={2}
              value={char}
              disabled={disabled}
              onChange={(e) => handleChange(i, e)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className={cn(
                'w-9 h-12 sm:w-11 sm:h-14 text-center font-mono text-lg sm:text-xl font-bold uppercase rounded-md border border-stone-300 bg-white text-stone-900 focus-ring transition-all dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100',
                char && 'border-teal-600 bg-teal-50/30 text-teal-900 dark:border-teal-500 dark:bg-teal-950/20 dark:text-teal-200',
                error && 'border-red-600 dark:border-red-500',
                disabled && 'opacity-50 cursor-not-allowed bg-stone-100'
              )}
            />
          </React.Fragment>
        ))}
      </div>
      {error && <p className="text-xs font-medium text-red-600 text-center">{error}</p>}
    </div>
  );
};
CodeInput.displayName = 'CodeInput';
