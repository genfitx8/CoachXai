import React, { useContext } from 'react';
import { ChevronLeft } from 'lucide-react';
import { LanguageContext } from '../LanguageContext';

export type BackButtonTone = 'dark' | 'light';

interface BackButtonProps {
  onClick: () => void;
  /** Optional visible label next to the icon. */
  label?: string;
  /** Match to the surrounding surface. `dark` for dark backgrounds, `light` for light. Defaults to `dark`. */
  tone?: BackButtonTone;
  /** Extra classes appended to the root button. */
  className?: string;
  /** Accessible label. Falls back to the visible label, then the translated "뒤로가기". */
  ariaLabel?: string;
  /** Optional test id, forwarded as data-testid. */
  testId?: string;
}

const TONE_CLASSES: Record<BackButtonTone, string> = {
  dark:
    'bg-slate-900/70 border border-slate-700/70 text-slate-200 hover:bg-slate-800 hover:text-white',
  light:
    'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 hover:text-gray-900 shadow-sm',
};

/**
 * Shared back button used across all student-app screens so the affordance
 * looks and behaves the same everywhere. Always meets the 44x44 tap target.
 */
export const BackButton: React.FC<BackButtonProps> = ({
  onClick,
  label,
  tone = 'dark',
  className = '',
  ariaLabel,
  testId,
}) => {
  const langCtx = useContext(LanguageContext);
  const fallbackBack = langCtx?.t('back') ?? '뒤로';
  const accessibleLabel = ariaLabel ?? label ?? fallbackBack;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={accessibleLabel}
      data-testid={testId}
      className={
        'inline-flex items-center gap-1.5 rounded-xl px-3 min-h-[44px] min-w-[44px] justify-center ' +
        'text-sm font-semibold transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 ' +
        `${TONE_CLASSES[tone]} ${className}`
      }
    >
      <ChevronLeft className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
      {label && <span className="whitespace-nowrap">{label}</span>}
    </button>
  );
};

export default BackButton;
