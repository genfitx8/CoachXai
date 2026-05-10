import React from 'react';
import { ChevronRight, Play, Sparkles, User } from 'lucide-react';

interface CoachHomeViewProps {
  coachName: string;
  /** Localised label for the "코치" suffix. */
  coachLabel: string;
  onStartLesson: () => void;
  onOpenStudents: () => void;
  onOpenLessonUpload: () => void;
  onOpenCoachX: () => void;
}

interface SecondaryAction {
  testId: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  onClick: () => void;
}

/**
 * Coach home (the "LIST" view inside App.tsx). Presents the four primary
 * entry points — start lesson, students, upload swing video, coachx ai —
 * with a quiet welcome strip above and the brand emerald hero CTA.
 *
 * The data-testid / aria-label / `rounded-2xl` + `border` class hooks
 * matter: CoachDashboardLessonRecord.test.tsx asserts on them.
 */
export const CoachHomeView: React.FC<CoachHomeViewProps> = ({
  coachName,
  coachLabel,
  onStartLesson,
  onOpenStudents,
  onOpenLessonUpload,
  onOpenCoachX,
}) => {
  const secondary: SecondaryAction[] = [
    {
      testId: 'students-entry-btn',
      label: 'Student',
      desc: '학생 명단·기록 관리',
      icon: <User className="h-5 w-5" />,
      onClick: onOpenStudents,
    },
    {
      testId: 'lesson-upload-entry-btn',
      label: 'Upload Swing Video',
      desc: '스윙 영상을 업로드해 분석',
      icon: <Play className="h-5 w-5" />,
      onClick: onOpenLessonUpload,
    },
    {
      testId: 'coachx-entry-btn',
      label: 'coachx ai',
      desc: 'AI 코칭 인사이트',
      icon: <Sparkles className="h-5 w-5" />,
      onClick: onOpenCoachX,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome strip */}
      <div className="px-1">
        <p className="text-2xs uppercase tracking-[0.2em] text-primary-300/80 font-semibold">
          Coach workspace
        </p>
        <h1 className="mt-1 text-display-sm font-semibold text-ink-high">
          {coachName ? `${coachName} ${coachLabel}님, 환영합니다` : '환영합니다'}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          오늘의 레슨을 시작하거나, 학생을 관리하고, AI 코치와 인사이트를 나눠보세요.
        </p>
      </div>

      {/* Hero CTA */}
      <button
        type="button"
        onClick={onStartLesson}
        data-testid="start-lesson-btn"
        aria-label="Lesson start"
        className="group relative w-full overflow-hidden rounded-2xl border border-primary-400/30 bg-gradient-to-br from-primary-500 to-primary-700 p-6 text-left shadow-elev-3 transition-all hover:shadow-elev-4 hover:-translate-y-0.5 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
      >
        <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
        <div className="relative flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm shadow-glow">
            <Play className="h-7 w-7 fill-white text-white" />
          </span>
          <div className="flex-1">
            <p className="text-2xs uppercase tracking-[0.18em] text-primary-100/90 font-semibold">
              Quick start
            </p>
            <p className="mt-0.5 text-xl font-semibold text-white">Lesson start</p>
            <p className="mt-1 text-sm text-primary-50/85">
              학생을 선택하고 즉시 레슨 기록을 시작합니다.
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-white/80 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </div>
      </button>

      {/* Secondary actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {secondary.map((action) => (
          <button
            key={action.testId}
            type="button"
            onClick={action.onClick}
            data-testid={action.testId}
            aria-label={action.label}
            className="group flex h-full flex-col rounded-2xl border border-line-default bg-bg-raised p-5 text-left shadow-elev-1 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-elev-3 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/10 text-primary-300 transition-colors group-hover:bg-primary-500/15">
              {action.icon}
            </span>
            <p className="mt-4 text-base font-semibold text-ink-high">
              {action.label}
            </p>
            <p className="mt-1 text-xs text-ink-muted">{action.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
};
