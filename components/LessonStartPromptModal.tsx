import React from 'react';
import { PlayCircle, Clock, X, BellOff } from 'lucide-react';
import { useLanguage } from './LanguageContext';
import { LessonSuggestion } from '../services/lessonStartSuggestionService';

interface LessonStartPromptModalProps {
  suggestion: LessonSuggestion;
  /** "바로 시작" – navigate to NEW lesson form with the member pre-filled. */
  onStart: (suggestion: LessonSuggestion) => void;
  /** "나중에" – dismiss modal; re-check on next focus / interval. */
  onRemindLater: (suggestion: LessonSuggestion) => void;
  /** "오늘 제외" – do not show again for this reservation today. */
  onSkipToday: (suggestion: LessonSuggestion) => void;
}

/**
 * Modal that appears when the coach has a CONFIRMED lesson reservation
 * starting soon (within the configured time window).
 *
 * Displayed on top of the coach dashboard.  Closing via the ✕ button
 * is equivalent to "나중에".
 */
export const LessonStartPromptModal: React.FC<LessonStartPromptModalProps> = ({
  suggestion,
  onStart,
  onRemindLater,
  onSkipToday,
}) => {
  const { t } = useLanguage();
  const { reservation, minutesUntilStart } = suggestion;

  const startDate = new Date(reservation.startTime);
  const timeLabel = startDate.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const endDate = new Date(reservation.endTime);
  const endTimeLabel = endDate.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const timingLabel =
    minutesUntilStart > 0
      ? t('lesson_start_prompt_minutes_before').replace(
          '{n}',
          String(minutesUntilStart),
        )
      : minutesUntilStart === 0
      ? t('lesson_start_prompt_now')
      : t('lesson_start_prompt_minutes_after').replace(
          '{n}',
          String(Math.abs(minutesUntilStart)),
        );

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('lesson_start_prompt_title')}
    >
      {/* Card */}
      <div className="relative w-full sm:max-w-md mx-4 mb-4 sm:mb-0 bg-bg-raised rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
        {/* Close / remind-later button */}
        <button
          onClick={() => onRemindLater(suggestion)}
          className="absolute top-3 right-3 text-ink-muted hover:text-ink-medium transition-colors"
          aria-label={t('lesson_start_prompt_later_btn')}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Top accent bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 to-blue-400" />

        <div className="px-6 pt-5 pb-6 space-y-4">
          {/* Icon + heading */}
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-11 h-11 rounded-full bg-primary-500/15 flex items-center justify-center">
              <PlayCircle className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide">
                {t('lesson_start_prompt_title')}
              </p>
              <h2 className="text-base font-bold text-ink-high leading-snug">
                {t('lesson_start_prompt_body').replace(
                  '{clientName}',
                  reservation.clientName ?? '',
                )}
              </h2>
            </div>
          </div>

          {/* Lesson info card */}
          <div className="bg-primary-500/10 rounded-xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary-300 font-medium text-sm">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span>
                {timeLabel} – {endTimeLabel}
              </span>
            </div>
            <span className="text-xs font-semibold text-indigo-500 bg-primary-500/15 px-2 py-0.5 rounded-full">
              {timingLabel}
            </span>
          </div>

          {/* Action buttons */}
          <div className="space-y-2 pt-1">
            {/* Primary: Start */}
            <button
              onClick={() => onStart(suggestion)}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <PlayCircle className="w-4 h-4" />
              {t('lesson_start_prompt_start_btn')}
            </button>

            {/* Secondary row */}
            <div className="flex gap-2">
              <button
                onClick={() => onRemindLater(suggestion)}
                className="flex-1 py-2.5 rounded-xl border border-line-default text-ink-medium hover:bg-bg-base font-medium text-sm transition-colors"
              >
                {t('lesson_start_prompt_later_btn')}
              </button>
              <button
                onClick={() => onSkipToday(suggestion)}
                className="flex-1 py-2.5 rounded-xl border border-line-default text-ink-medium hover:bg-bg-base font-medium text-sm transition-colors flex items-center justify-center gap-1.5"
              >
                <BellOff className="w-3.5 h-3.5" />
                {t('lesson_start_prompt_skip_today_btn')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
