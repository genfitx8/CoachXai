import React from 'react';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
export type BadgeSize = 'sm' | 'md';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: BadgeSize;
  /** Show a small leading dot indicator. */
  dot?: boolean;
}

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-bg-overlay text-ink-medium border border-line-default',
  primary: 'bg-primary-500/15 text-primary-300 border border-primary-500/30',
  success: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  danger:  'bg-red-500/15 text-red-300 border border-red-500/30',
  info:    'bg-interactive-500/15 text-interactive-300 border border-interactive-500/30',
};

const DOT_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-ink-muted',
  primary: 'bg-primary-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  danger:  'bg-red-400',
  info:    'bg-interactive-400',
};

const SIZES: Record<BadgeSize, string> = {
  sm: 'h-5 px-2 text-2xs gap-1',
  md: 'h-6 px-2.5 text-xs gap-1.5',
};

export const Badge: React.FC<BadgeProps> = ({
  tone = 'neutral',
  size = 'md',
  dot = false,
  className = '',
  children,
  ...rest
}) => (
  <span
    className={`inline-flex items-center rounded-full font-medium ${SIZES[size]} ${TONES[tone]} ${className}`}
    {...rest}
  >
    {dot && (
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${DOT_TONES[tone]}`}
        aria-hidden="true"
      />
    )}
    {children}
  </span>
);
