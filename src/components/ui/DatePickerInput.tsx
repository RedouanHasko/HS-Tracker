import React, { useRef } from 'react';
import { CalendarDays } from 'lucide-react';

interface DatePickerInputProps {
  type?: 'date' | 'month';
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  pickerLabel?: string;
  className?: string;
  inputClassName?: string;
}

/**
 * A native date field with an explicit picker button. The input remains editable,
 * so keyboard entry and the browser calendar are available in the same control.
 */
export default function DatePickerInput({
  type = 'date',
  value,
  onChange,
  min,
  max,
  required = false,
  disabled = false,
  ariaLabel,
  pickerLabel = ariaLabel,
  className = '',
  inputClassName = '',
}: DatePickerInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input || disabled) return;
    input.focus();
    try {
      input.showPicker?.();
    } catch {
      input.click();
    }
  };

  return (
    <div className={`relative min-w-0 ${className}`}>
      <input
        ref={inputRef}
        type={type}
        value={value}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        className={`hs-date-picker-input h-9 w-full rounded-md border border-slate-200 bg-white px-2 pr-10 font-mono text-[11px] font-semibold text-slate-700 outline-none transition-colors focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 ${inputClassName}`}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={openPicker}
        title={pickerLabel}
        aria-label={pickerLabel}
        className="absolute right-0 top-0 flex h-full w-9 items-center justify-center rounded-r-md border-l border-slate-200 text-slate-400 transition-colors hover:bg-slate-50 hover:text-teal-600 disabled:pointer-events-none dark:border-slate-700 dark:hover:bg-slate-900 dark:hover:text-teal-400"
      >
        <CalendarDays className="h-4 w-4" />
      </button>
    </div>
  );
}
