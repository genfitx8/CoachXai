import React from 'react';
import { CheckCircle2, Circle, Play, Sparkles, Upload } from 'lucide-react';
import type { Homework, Lesson } from '../types';

/**
 * 3d · Student 대화 홈 · 카드 배너
 *
 * The redesign wants the student's chat home to open with two cards
 * that surface what the coach most recently pushed and how the student
 * is doing on this week's drills — the chat stream is still below,
 * but the first thing on screen should be actionable.
 *
 * Data policy:
 * - "오늘의 한 가지" pulls from the newest approved lesson with a
 *   `reviewSections.nextActions[]` list. We show the first action as
 *   the headline drill and let the student tap through to the lesson
 *   detail. When the coach attached a video clip we surface a small
 *   thumbnail so the student can play it inline.
 * - "이번 주 드릴" aggregates unfinished homework due within the next
 *   seven days: a progress ring, a checklist truncated to five items,
 *   and an "Upload" CTA the student uses to attach a practice clip.
 *
 * Both cards render nothing when the underlying data is empty, so a
 * fresh student sees a clean chat instead of empty containers.
 */

export interface StudentHomeCardsProps {
  /** Full lesson history for this student, freshest-first order preferred. */
  lessons: Lesson[];
  /** Homework rows scoped to this student. */
  homework: Homework[];
  /** Tap the "오늘의 한 가지" card → open the source lesson. */
  onOpenLesson?: (lessonId: string) => void;
  /** Tap the drill upload button → open the practice clip flow. */
  onUploadPractice?: (homeworkId: string) => void;
  /** Tap a checklist item → toggle its completion. */
  onToggleHomework?: (homeworkId: string, next: boolean) => void;
}

const TODAY = () => new Date();
const daysAhead = (date: string, ref: Date = TODAY()) => {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return Infinity;
  const ms = parsed.getTime() - ref.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
};

const findFocusLesson = (lessons: Lesson[]): Lesson | null => {
  const approved = lessons.filter(
    (l) =>
      l.approvalStatus === 'approved' &&
      l.reviewSections?.nextActions &&
      l.reviewSections.nextActions.length > 0
  );
  approved.sort((a, b) => (b.approvedAt ?? b.createdAt) - (a.approvedAt ?? a.createdAt));
  return approved[0] ?? null;
};

const selectThisWeekHomework = (homework: Homework[]): Homework[] => {
  // "This week" = today + next 7 days. Past-due items still show so the
  // student sees the streak they need to close.
  return homework
    .filter((h) => !h.isCompleted && daysAhead(h.date) <= 7)
    .sort((a, b) => daysAhead(a.date) - daysAhead(b.date));
};

export const StudentHomeCards: React.FC<StudentHomeCardsProps> = ({
  lessons,
  homework,
  onOpenLesson,
  onUploadPractice,
  onToggleHomework,
}) => {
  const focusLesson = findFocusLesson(lessons);
  const weekHomework = selectThisWeekHomework(homework);
  const weekAssigned = homework.filter((h) => daysAhead(h.date) <= 7);
  const weekCompleted = weekAssigned.filter((h) => h.isCompleted).length;
  const weekTotal = weekAssigned.length;
  const progress = weekTotal === 0 ? 0 : Math.round((weekCompleted / weekTotal) * 100);

  if (!focusLesson && weekTotal === 0) return null;

  return (
    <div className="px-4 pt-3 pb-2 space-y-3">
      {focusLesson && (
        <FocusCard
          lesson={focusLesson}
          onOpen={() => onOpenLesson?.(focusLesson.id)}
        />
      )}
      {weekTotal > 0 && (
        <DrillCard
          items={weekHomework}
          completed={weekCompleted}
          total={weekTotal}
          progress={progress}
          onToggle={onToggleHomework}
          onUpload={onUploadPractice}
        />
      )}
    </div>
  );
};

// ─── Subcomponents ─────────────────────────────────────────────────────────

const FocusCard: React.FC<{ lesson: Lesson; onOpen: () => void }> = ({ lesson, onOpen }) => {
  const headline = lesson.reviewSections?.nextActions?.[0] ?? '';
  const feedback = lesson.reviewSections?.feedback ?? '';
  const clip = lesson.additionalMedia?.find((m) => m.type === 'video')
    ?? (lesson.videoUrl ? { url: lesson.videoUrl } : null);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.08] via-emerald-500/[0.04] to-transparent p-4 hover:border-emerald-400/50 transition-colors"
    >
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-emerald-400" />
        <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-300">
          오늘의 한 가지
        </span>
        {lesson.approvedAt && (
          <span className="ml-auto text-[11px] font-mono text-ink-muted">
            {relativeDay(lesson.approvedAt)}
          </span>
        )}
      </div>
      <p className="text-[15px] font-bold leading-[1.5] text-ink-high mb-1.5">
        {headline}
      </p>
      {feedback && (
        <p className="text-[13px] leading-[1.6] text-ink-medium line-clamp-2 mb-3">
          {feedback}
        </p>
      )}
      {clip?.url && (
        <div className="rounded-xl border border-line-subtle bg-white/[0.03] px-3 py-2 flex items-center gap-2 text-[12px] text-ink-medium">
          <Play className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <span className="truncate">{lesson.title || '스윙 영상'} · 재생</span>
        </div>
      )}
    </button>
  );
};

const DrillCard: React.FC<{
  items: Homework[];
  completed: number;
  total: number;
  progress: number;
  onToggle?: (id: string, next: boolean) => void;
  onUpload?: (id: string) => void;
}> = ({ items, completed, total, progress, onToggle, onUpload }) => {
  const visible = items.slice(0, 5);
  const overflow = items.length - visible.length;

  return (
    <section className="rounded-2xl border border-line-subtle bg-white/[0.02] p-4">
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
          이번 주 드릴
        </span>
        <span className="ml-auto text-[11px] font-mono text-ink-medium">
          {completed} / {total}
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden mb-3">
        <div
          className="h-full bg-emerald-400 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ul className="space-y-1.5">
        {visible.map((h) => (
          <li key={h.id} className="flex items-center gap-2 text-[13px] leading-[1.5]">
            <button
              type="button"
              onClick={() => onToggle?.(h.id, !h.isCompleted)}
              aria-label={h.isCompleted ? '미완료로 표시' : '완료로 표시'}
              className="flex-shrink-0 text-emerald-400 hover:text-emerald-300"
            >
              {h.isCompleted ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Circle className="w-4 h-4 text-ink-medium" />
              )}
            </button>
            <span
              className={`flex-1 min-w-0 truncate ${
                h.isCompleted ? 'text-ink-faint line-through' : 'text-ink-high'
              }`}
            >
              {h.title}
            </span>
            {onUpload && !h.isCompleted && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpload(h.id);
                }}
                className="text-[11px] font-bold text-emerald-300 hover:text-emerald-200 flex items-center gap-1 px-1"
              >
                <Upload className="w-3 h-3" /> 업로드
              </button>
            )}
          </li>
        ))}
      </ul>

      {overflow > 0 && (
        <div className="mt-2 text-[11px] font-mono text-ink-muted">
          외 {overflow}건
        </div>
      )}
    </section>
  );
};

// ─── Utilities ─────────────────────────────────────────────────────────────

const relativeDay = (ts: number): string => {
  const now = Date.now();
  const days = Math.round((now - ts) / (24 * 60 * 60 * 1000));
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  return new Date(ts).toLocaleDateString('ko-KR');
};
