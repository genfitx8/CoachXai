import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

const BASE =
  'group relative inline-flex items-center justify-center font-medium ' +
  'transition-[transform,background-color,box-shadow,border-color] duration-200 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ' +
  'active:scale-[0.98] hover:scale-[1.01] select-none';

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9  px-3.5 text-sm  rounded-md gap-1.5',
  md: 'h-11 px-5   text-sm  rounded-lg gap-2',   // ≥44px touch target
  lg: 'h-13 px-6   text-base rounded-xl gap-2 [&]:h-13',
};

const VARIANTS: Record<ButtonVariant, string> = {
  // Premium emerald — matches the brand `primary` tokens.
  primary:
    'bg-gradient-to-b from-primary-500 to-primary-600 text-white ' +
    'shadow-elev-2 hover:shadow-elev-3 hover:from-primary-400 hover:to-primary-500 ' +
    'focus-visible:ring-primary-400/70',
  // Neutral surface that lifts off the page.
  secondary:
    'bg-bg-overlay text-ink-high border border-line-default ' +
    'hover:bg-surface-700 hover:border-line-strong shadow-elev-1 ' +
    'focus-visible:ring-line-strong',
  // Destructive — uses Tailwind red, no custom token to keep markup readable.
  danger:
    'bg-gradient-to-b from-red-500 to-red-600 text-white ' +
    'shadow-elev-2 hover:from-red-400 hover:to-red-500 ' +
    'focus-visible:ring-red-400/70',
  // Quiet — text-only, becomes a subtle pill on hover.
  ghost:
    'bg-transparent text-ink-medium hover:text-ink-high hover:bg-line-subtle ' +
    'focus-visible:ring-line-strong',
};

const SPINNER_SIZE: Record<ButtonSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  fullWidth = false,
  className = '',
  disabled,
  ...props
}) => {
  const widthCls = fullWidth ? 'w-full' : '';
  return (
    <button
      className={`${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${widthCls} ${className}`}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? (
        <svg
          className={`animate-spin ${SPINNER_SIZE[size]} text-current`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : icon ? (
        <span className="inline-flex shrink-0 transition-transform duration-200 group-hover:scale-110" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
};
