import React from 'react';
import { Globe, LogOut, User } from 'lucide-react';
import { Button } from './Button';
import { CoachProfile } from '../types';

interface CoachHeaderProps {
  coach: CoachProfile;
  /** Localised label for the "코치" suffix. */
  coachLabel: string;
  /** Current language code, displayed in uppercase next to the globe icon. */
  language: string;
  onToggleLanguage: () => void;
  onOpenProfile: () => void;
  onLogout: () => void;
}

/**
 * Sticky top header used across every coach-mode screen. Owns nothing —
 * all state and i18n live in the parent. Kept deliberately small so it
 * stays in lockstep with the design system if a token shifts.
 */
export const CoachHeader: React.FC<CoachHeaderProps> = ({
  coach,
  coachLabel,
  language,
  onToggleLanguage,
  onOpenProfile,
  onLogout,
}) => {
  return (
    <header className="bg-bg-base/80 border-b border-line-subtle sticky top-0 z-40 backdrop-blur-xl top-header-safe">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <button
          type="button"
          onClick={onOpenProfile}
          className="flex items-center gap-2 text-sm text-ink-high hover:bg-line-subtle px-3 py-1.5 rounded-full transition-colors"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-500/15 text-primary-300">
            <User className="h-4 w-4" />
          </span>
          <span className="font-semibold">
            {coach.name} {coachLabel}
          </span>
        </button>

        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={onToggleLanguage}
            className="inline-flex items-center gap-1.5 rounded-full border border-line-default bg-bg-overlay/80 px-3 py-1.5 text-xs font-medium text-ink-medium backdrop-blur-md transition-colors hover:border-line-strong hover:text-ink-high"
          >
            <Globe className="h-3.5 w-3.5" />
            {language.toUpperCase()}
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            aria-label="logout"
            className="text-ink-muted hover:text-red-400"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
};
