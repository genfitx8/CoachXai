import React from 'react';
import { BellOff, Clock, PlayCircle } from 'lucide-react';
import { useLanguage } from './LanguageContext';
import { LessonSuggestion } from '../services/lessonStartSuggestionService';
import { Button } from './Button';
import { Modal } from './ui/Modal';

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
 * starting soon (within the configured time window). Built on the shared
 * Modal primitive (focus trap, ESC = remind-later, mobile bottom-sheet).
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

  const title = (
    <span className="flex items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-500/15 text-primary-300">
        <PlayCircle className="h-6 w-6" />
      </span>
      <span className="flex flex-col">
        <span className="text-2xs font-semibold uppercase tracking-[0.16em] text-primary-300">
          {t('lesson_start_prompt_title')}
        </span>
        <span className="text-base font-semibold leading-snug text-ink-high">
          {t('lesson_start_prompt_body').replace(
            '{clientName}',
            reservation.clientName ?? '',
          )}
        </span>
      </span>
    </span>
  );

  return (
    <Modal
      open
      onClose={() => onRemindLater(suggestion)}
      title={title}
      size="sm"
    >
      <div className="space-y-4">
        {/* Lesson info card */}
        <div className="flex items-center justify-between rounded-xl border border-primary-500/20 bg-primary-500/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-primary-300">
            <Clock className="h-4 w-4 shrink-0" />
            <span>
              {timeLabel} – {endTimeLabel}
            </span>
          </div>
          <span className="rounded-full bg-primary-500/15 px-2 py-0.5 text-xs font-semibold text-primary-200">
            {timingLabel}
          </span>
        </div>

        {/* Primary: Start */}
        <Button
          onClick={() => onStart(suggestion)}
          fullWidth
          size="lg"
          icon={<PlayCircle className="h-4 w-4" />}
        >
          {t('lesson_start_prompt_start_btn')}
        </Button>

        {/* Secondary row */}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => onRemindLater(suggestion)}
            className="flex-1"
          >
            {t('lesson_start_prompt_later_btn')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => onSkipToday(suggestion)}
            icon={<BellOff className="h-3.5 w-3.5" />}
            className="flex-1"
          >
            {t('lesson_start_prompt_skip_today_btn')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
