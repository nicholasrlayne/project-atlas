import { forwardRef, useImperativeHandle, useRef, type KeyboardEvent } from 'react';

export interface OtpInputHandle {
  focus: () => void;
}

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number; // default 6 — matches Supabase's numeric OTP length
  autoFocus?: boolean;
  disabled?: boolean;
}

export const OtpInput = forwardRef<OtpInputHandle, OtpInputProps>(
  function OtpInput({ value, onChange, length = 6, autoFocus, disabled }, ref) {
    const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

    useImperativeHandle(ref, () => ({
      focus: () => {
        const first = inputsRef.current[0];
        first?.focus();
        first?.select();
      },
    }));

    const digits = Array.from({ length }, (_, i) => value[i] ?? '');

    function handleChange(index: number, raw: string) {
      const clean = raw.replace(/\D/g, '');
      if (clean.length > 1) {
        const arr = digits.slice();
        for (let i = 0; i < clean.length && index + i < length; i++) {
          arr[index + i] = clean[i];
        }
        onChange(arr.join(''));
        const nextIndex = Math.min(index + clean.length, length - 1);
        inputsRef.current[nextIndex]?.focus();
        return;
      }
      const digit = clean.slice(-1);
      const arr = digits.slice();
      arr[index] = digit;
      onChange(arr.join(''));
      if (digit && index < length - 1) {
        inputsRef.current[index + 1]?.focus();
      }
    }

    function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
      if (e.key === 'Backspace' && !digits[index] && index > 0) {
        e.preventDefault();
        const arr = digits.slice();
        arr[index - 1] = '';
        onChange(arr.join(''));
        inputsRef.current[index - 1]?.focus();
      }
    }

    return (
      <div className="flex justify-center gap-2">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { inputsRef.current[i] = el; }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            autoFocus={autoFocus && i === 0}
            disabled={disabled}
            maxLength={1}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className="h-[48px] w-full max-w-[44px] flex-1 rounded-[10px] border border-border bg-cell text-center font-head text-[20px] font-bold text-chalk placeholder:text-mist-dim focus:border-amber focus:outline-none disabled:opacity-50"
          />
        ))}
      </div>
    );
  },
);
