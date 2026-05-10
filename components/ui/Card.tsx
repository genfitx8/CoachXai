import React from 'react';

export type CardVariant = 'base' | 'elevated' | 'glass' | 'outline';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  /** Render with a subtle interactive hover lift (for clickable cards). */
  interactive?: boolean;
}

const VARIANTS: Record<CardVariant, string> = {
  base:     'bg-bg-raised border border-line-subtle shadow-elev-1',
  elevated: 'bg-bg-raised border border-line-default shadow-elev-3',
  glass:    'bg-white/5 backdrop-blur-md border border-white/10 shadow-elev-2',
  outline:  'bg-transparent border border-line-default',
};

const PADDING: Record<CardPadding, string> = {
  none: 'p-0',
  sm:   'p-3',
  md:   'p-5',
  lg:   'p-7',
};

export const Card: React.FC<CardProps> = ({
  variant = 'base',
  padding = 'md',
  interactive = false,
  className = '',
  children,
  ...rest
}) => {
  const interactiveCls = interactive
    ? 'transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-elev-3 hover:border-line-strong cursor-pointer'
    : '';
  return (
    <div
      className={`rounded-2xl ${VARIANTS[variant]} ${PADDING[padding]} ${interactiveCls} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  ...rest
}) => <div className={`mb-4 ${className}`} {...rest} />;

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className = '',
  ...rest
}) => (
  <h3
    className={`text-lg font-semibold text-ink-high tracking-tight ${className}`}
    {...rest}
  />
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className = '',
  ...rest
}) => <p className={`mt-1 text-sm text-ink-muted ${className}`} {...rest} />;

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  ...rest
}) => (
  <div
    className={`mt-5 pt-4 border-t border-line-subtle flex items-center gap-3 ${className}`}
    {...rest}
  />
);
