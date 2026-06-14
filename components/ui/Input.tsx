import React, { forwardRef, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface BaseFieldProps {
  label?: React.ReactNode;
  helper?: React.ReactNode;
  error?: React.ReactNode;
  /** Visually hide the label but keep it for assistive tech. */
  srOnlyLabel?: boolean;
  /** Element rendered inside the field at the leading edge (e.g. an icon). */
  leading?: React.ReactNode;
  /** Element rendered inside the field at the trailing edge. */
  trailing?: React.ReactNode;
  containerClassName?: string;
}

type InputProps = BaseFieldProps &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>;

const FIELD_BASE =
  'flex items-center gap-2 rounded-lg bg-bg-overlay border transition-colors ' +
  'focus-within:border-primary-500 focus-within:shadow-ring-primary';

const INPUT_BASE =
  'w-full bg-transparent outline-none text-ink-high placeholder:text-ink-faint ' +
  'text-sm h-11 px-3.5 disabled:cursor-not-allowed disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    helper,
    error,
    srOnlyLabel = false,
    leading,
    trailing,
    id: providedId,
    className = '',
    containerClassName = '',
    disabled,
    'aria-describedby': ariaDescribedBy,
    ...props
  },
  ref,
) {
  const reactId = useId();
  const id = providedId ?? `input-${reactId}`;
  const helperId = helper ? `${id}-helper` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [ariaDescribedBy, helperId, errorId].filter(Boolean).join(' ') || undefined;

  const borderCls = error
    ? 'border-red-500/70'
    : 'border-line-default hover:border-line-strong';

  return (
    <div className={`flex flex-col gap-1.5 ${containerClassName}`}>
      {label && (
        <label
          htmlFor={id}
          className={
            srOnlyLabel
              ? 'sr-only'
              : 'text-sm font-medium text-ink-medium'
          }
        >
          {label}
        </label>
      )}
      <div className={`${FIELD_BASE} ${borderCls}`}>
        {leading && <span className="pl-3 text-ink-muted shrink-0">{leading}</span>}
        <input
          ref={ref}
          id={id}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${INPUT_BASE} ${leading ? 'pl-1' : ''} ${trailing ? 'pr-1' : ''} ${className}`}
          {...props}
        />
        {trailing && <span className="pr-3 text-ink-muted shrink-0">{trailing}</span>}
      </div>
      {error ? (
        <p id={errorId} className="text-xs text-red-400">{error}</p>
      ) : helper ? (
        <p id={helperId} className="text-xs text-ink-muted">{helper}</p>
      ) : null}
    </div>
  );
});

type PasswordInputProps = Omit<InputProps, 'type' | 'trailing'>;

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(props, ref) {
    const [visible, setVisible] = useState(false);

    return (
      <Input
        {...props}
        ref={ref}
        type={visible ? 'text' : 'password'}
        trailing={
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
            className="text-ink-muted hover:text-ink-high transition-colors focus:outline-none"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        }
      />
    );
  },
);

type TextareaProps = BaseFieldProps &
  React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    label,
    helper,
    error,
    srOnlyLabel = false,
    id: providedId,
    className = '',
    containerClassName = '',
    rows = 4,
    'aria-describedby': ariaDescribedBy,
    ...props
  },
  ref,
) {
  const reactId = useId();
  const id = providedId ?? `textarea-${reactId}`;
  const helperId = helper ? `${id}-helper` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [ariaDescribedBy, helperId, errorId].filter(Boolean).join(' ') || undefined;

  const borderCls = error
    ? 'border-red-500/70'
    : 'border-line-default hover:border-line-strong';

  return (
    <div className={`flex flex-col gap-1.5 ${containerClassName}`}>
      {label && (
        <label
          htmlFor={id}
          className={srOnlyLabel ? 'sr-only' : 'text-sm font-medium text-ink-medium'}
        >
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={
          `rounded-lg bg-bg-overlay border ${borderCls} px-3.5 py-2.5 text-sm text-ink-high ` +
          `placeholder:text-ink-faint outline-none focus:border-primary-500 focus:shadow-ring-primary ` +
          `transition-colors resize-y ${className}`
        }
        {...props}
      />
      {error ? (
        <p id={errorId} className="text-xs text-red-400">{error}</p>
      ) : helper ? (
        <p id={helperId} className="text-xs text-ink-muted">{helper}</p>
      ) : null}
    </div>
  );
});
