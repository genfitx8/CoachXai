import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  ClipboardList,
  HandHelping,
  MessageSquare,
  Package,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import type {
  ClientProfile,
  HandoverSummary,
  Homework,
  Lesson,
  LessonPackage,
} from '../types';
import type { MemberGrowthReport } from '../services/coachXService';
import { storageService } from '../services/storage';
import { useLanguage } from './LanguageContext';

/**
 * 4c · Coach-facing student detail with the redesign's 4-tab layout.
 *
 * 요약 / 기록 / 계획 / 정산 fold what used to live across the client
 * manager row's action buttons (packages, lessons, program, chat) into
 * one screen. The tabs render existing data — no new backend fetches —
 * so this drops in without a data model change and gives the coach a
 * single place to answer "how is this student doing?" and "what's next?"
 * before pivoting into the deep flow via the tab actions or the bottom
 * "이 학생으로 대화 열기" CTA.
 *
 * The screen is intentionally read-heavy: mutations still live in the
 * deep flows (LessonDetail edit, HomeworkModal, LessonPackageManager,
 * etc.) which are one tap away via each tab's inline "관리" link.
 */

export interface CoachStudentDetailProps {
  student: ClientProfile;
  /** Lessons scoped to this student (caller filters). */
  lessons: Lesson[];
  /** Homework rows scoped to this student. */
  homework: Homework[];
  /** Packages scoped to this student. */
  packages: LessonPackage[];
  /** Optional growth report (if the coach's dashboard already computed one). */
  growthReport?: MemberGrowthReport;
  onBack: () => void;
  /** Open a specific lesson's detail view. */
  onOpenLesson?: (lesson: Lesson) => void;
  /** Open the packages manager scoped to this student. */
  onManagePackages?: () => void;
  /** Open the curriculum planner scoped to this student. */
  onOpenCurriculum?: () => void;
  /** Open the homework composer scoped to this student. */
  onAssignHomework?: () => void;
  /** Open CoachX chat with this student pre-loaded as the subject. */
  onOpenChatForStudent: () => void;
  /**
   * Current coach viewing this screen. When a 7a handover briefing was
   * stored for this coach + student pair, it is shown as a dismissible
   * banner above the tab content on the first visit.
   */
  viewerCoachId?: string;
}

type Tab = 'summary' | 'records' | 'plan' | 'billing';

const TAB_LABELS_KO: Record<Tab, string> = {
  summary: '요약',
  records: '기록',
  plan: '계획',
  billing: '정산',
};
const TAB_LABELS_EN: Record<Tab, string> = {
  summary: 'Overview',
  records: 'Records',
  plan: 'Plan',
  billing: 'Billing',
};
const TAB_LABELS_JA: Record<Tab, string> = {
  summary: '概要',
  records: '記録',
  plan: '計画',
  billing: '会計',
};

const TAB_ICONS: Record<Tab, React.ElementType> = {
  summary: BarChart3,
  records: BookOpen,
  plan: ClipboardList,
  billing: Package,
};

export const CoachStudentDetail: React.FC<CoachStudentDetailProps> = ({
  student,
  lessons,
  homework,
  packages,
  growthReport,
  onBack,
  onOpenLesson,
  onManagePackages,
  onOpenCurriculum,
  onAssignHomework,
  onOpenChatForStudent,
  viewerCoachId,
}) => {
  const { language } = useLanguage();
  const labels =
    language === 'en' ? TAB_LABELS_EN : language === 'ja' ? TAB_LABELS_JA : TAB_LABELS_KO;
  const [tab, setTab] = useState<Tab>('summary');

  // 7a · Load handover briefing when the current coach was the recipient
  // of a recent handover for this student. A summary that already carries
  // `readAt` was dismissed in an earlier session and is no longer surfaced;
  // dismissing here stamps `readAt` so it stays dismissed across reloads.
  const [handover, setHandover] = useState<HandoverSummary | null>(null);
  const [handoverDismissed, setHandoverDismissed] = useState(false);
  useEffect(() => {
    if (!viewerCoachId) {
      setHandover(null);
      return;
    }
    const compositeId = `${student.name}_${student.phone ?? ''}`;
    const match = storageService
      .getHandoverSummariesForCoach(viewerCoachId)
      .find((s) => s.clientId === compositeId && !s.readAt);
    setHandover(match ?? null);
    setHandoverDismissed(false);
  }, [viewerCoachId, student.name, student.phone]);

  const dismissHandover = () => {
    if (handover) storageService.markHandoverSummaryRead(handover.id);
    setHandoverDismissed(true);
  };

  const sortedLessons = useMemo(
    () => [...lessons].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    [lessons]
  );
  const latestLesson = sortedLessons[0] ?? null;
  const openHomework = useMemo(() => homework.filter((h) => !h.isCompleted), [homework]);

  return (
    <div className="min-h-screen bg-base text-ink-high pb-24">
      {/* Header — profile band */}
      <header className="sticky top-0 z-10 bg-base/95 backdrop-blur border-b border-line-subtle">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="뒤로"
            className="p-2 -ml-2 rounded-lg text-ink-medium hover:text-ink-high hover:bg-white/5 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold truncate">{student.name}</div>
            <div className="text-[11px] font-mono text-ink-muted truncate">
              {student.phone}
              {student.handicap != null && ` · 핸디 ${student.handicap}`}
            </div>
          </div>
          {growthReport && <TrendBadge trend={growthReport.trendIndicator} />}
        </div>

        {/* Tab bar */}
        <div className="max-w-2xl mx-auto px-2 flex items-stretch">
          {(Object.keys(labels) as Tab[]).map((key) => {
            const Icon = TAB_ICONS[key];
            const active = key === tab;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex-1 flex items-center justify-center gap-1.5 py-3 text-[13px] font-bold transition-colors ${
                  active ? 'text-ink-high' : 'text-ink-muted hover:text-ink-medium'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {labels[key]}
                {active && (
                  <span
                    className="absolute bottom-0 left-4 right-4 h-0.5 bg-emerald-400 rounded-full"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-5 space-y-4">
        {handover && !handoverDismissed && (
          <HandoverBanner summary={handover} onDismiss={dismissHandover} />
        )}
        {tab === 'summary' && (
          <SummaryTab
            latestLesson={latestLesson}
            lessonCount={lessons.length}
            openHomeworkCount={openHomework.length}
            growthReport={growthReport}
            onOpenLatest={
              latestLesson && onOpenLesson ? () => onOpenLesson(latestLesson) : undefined
            }
          />
        )}
        {tab === 'records' && (
          <RecordsTab
            lessons={sortedLessons}
            onOpenLesson={onOpenLesson}
          />
        )}
        {tab === 'plan' && (
          <PlanTab
            homework={homework}
            onAssignHomework={onAssignHomework}
            onOpenCurriculum={onOpenCurriculum}
          />
        )}
        {tab === 'billing' && (
          <BillingTab
            student={student}
            packages={packages}
            usedByPackage={countUsageByPackage(lessons)}
            onManagePackages={onManagePackages}
          />
        )}
      </main>

      {/* Bottom fixed CTA — the redesign's "이 학생으로 대화 열기" */}
      <div className="fixed bottom-0 inset-x-0 z-20 border-t border-line-subtle bg-base/95 backdrop-blur pb-safe">
        <div className="max-w-2xl mx-auto px-5 py-3">
          <button
            type="button"
            onClick={onOpenChatForStudent}
            className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-[#04150e] text-[15px] font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            이 학생으로 대화 열기
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Tab bodies ────────────────────────────────────────────────────────────

const SummaryTab: React.FC<{
  latestLesson: Lesson | null;
  lessonCount: number;
  openHomeworkCount: number;
  growthReport?: MemberGrowthReport;
  onOpenLatest?: () => void;
}> = ({ latestLesson, lessonCount, openHomeworkCount, growthReport, onOpenLatest }) => (
  <>
    <div className="grid grid-cols-3 gap-2">
      <StatTile label="누적 레슨" value={String(lessonCount)} />
      <StatTile label="미완료 숙제" value={String(openHomeworkCount)} tone={openHomeworkCount > 0 ? 'warn' : 'default'} />
      <StatTile
        label="성장 점수"
        value={growthReport ? String(growthReport.growthScore) : '—'}
      />
    </div>

    {latestLesson ? (
      <section className="rounded-2xl border border-line-subtle bg-white/[0.02] p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
            최근 레슨
          </span>
          <span className="ml-auto text-[11px] font-mono text-ink-muted">
            {latestLesson.date}
          </span>
        </div>
        <div className="text-[14px] font-bold text-ink-high">{latestLesson.title}</div>
        {latestLesson.coachNotes && (
          <p className="text-[13px] leading-relaxed text-ink-medium line-clamp-3 whitespace-pre-line">
            {latestLesson.coachNotes}
          </p>
        )}
        {latestLesson.reviewSections?.nextActions?.length ? (
          <div className="text-[12px] text-emerald-200/90 space-y-1 pt-1">
            {latestLesson.reviewSections.nextActions.slice(0, 3).map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-1.5 w-1 h-1 rounded-full bg-emerald-400 flex-shrink-0" />
                <span>{a}</span>
              </div>
            ))}
          </div>
        ) : null}
        {onOpenLatest && (
          <button
            type="button"
            onClick={onOpenLatest}
            className="text-[12px] font-bold text-emerald-300 hover:text-emerald-200 pt-1"
          >
            레슨 상세 열기 →
          </button>
        )}
      </section>
    ) : (
      <EmptyState label="아직 기록된 레슨이 없습니다." />
    )}

    {growthReport && (growthReport.repeatedIssues.length > 0 || growthReport.strengths.length > 0) && (
      <section className="rounded-2xl border border-line-subtle bg-white/[0.02] p-4 space-y-3">
        <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
          코치X 요약
        </span>
        {growthReport.strengths.length > 0 && (
          <div>
            <div className="text-[11px] text-emerald-300 mb-1">강점</div>
            <ul className="space-y-1 text-[12.5px] text-ink-medium">
              {growthReport.strengths.slice(0, 3).map((s, i) => (
                <li key={i}>· {s}</li>
              ))}
            </ul>
          </div>
        )}
        {growthReport.repeatedIssues.length > 0 && (
          <div>
            <div className="text-[11px] text-amber-300 mb-1">반복 이슈</div>
            <ul className="space-y-1 text-[12.5px] text-ink-medium">
              {growthReport.repeatedIssues.slice(0, 3).map((s, i) => (
                <li key={i}>· {s}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    )}
  </>
);

const RecordsTab: React.FC<{
  lessons: Lesson[];
  onOpenLesson?: (l: Lesson) => void;
}> = ({ lessons, onOpenLesson }) => {
  if (lessons.length === 0) {
    return <EmptyState label="기록된 레슨이 없습니다." />;
  }
  return (
    <div className="space-y-2">
      {lessons.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => onOpenLesson?.(l)}
          className="w-full text-left rounded-xl border border-line-subtle bg-white/[0.02] hover:bg-white/[0.04] p-3 transition-colors"
        >
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-mono text-ink-muted">{l.date}</span>
            {l.approvalStatus === 'approved' && (
              <span className="text-[10px] font-mono text-emerald-300">전달됨</span>
            )}
            {l.approvalStatus === 'draft' && (
              <span className="text-[10px] font-mono text-amber-300">초안</span>
            )}
            <span className="ml-auto text-[11px] text-ink-muted">
              {l.recordType ?? 'LESSON'}
            </span>
          </div>
          <div className="text-[14px] font-bold text-ink-high mt-1">{l.title}</div>
          {l.coachNotes && (
            <div className="text-[12px] text-ink-medium mt-1 line-clamp-2">
              {l.coachNotes}
            </div>
          )}
        </button>
      ))}
    </div>
  );
};

const PlanTab: React.FC<{
  homework: Homework[];
  onAssignHomework?: () => void;
  onOpenCurriculum?: () => void;
}> = ({ homework, onAssignHomework, onOpenCurriculum }) => {
  const active = homework.filter((h) => !h.isCompleted);
  const done = homework.filter((h) => h.isCompleted);

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {onOpenCurriculum && (
          <ActionTile
            label="커리큘럼 관리"
            hint="배정된 파트 · 진행률"
            onClick={onOpenCurriculum}
          />
        )}
        {onAssignHomework && (
          <ActionTile
            label="숙제 배정"
            hint="드릴 · 마감 지정"
            onClick={onAssignHomework}
          />
        )}
      </div>

      <section className="rounded-2xl border border-line-subtle bg-white/[0.02] p-4">
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
            진행 중인 숙제
          </span>
          <span className="ml-auto text-[11px] font-mono text-ink-medium">
            {active.length} / {homework.length}
          </span>
        </div>
        {active.length === 0 ? (
          <div className="text-[12px] text-ink-muted">배정된 숙제가 없습니다.</div>
        ) : (
          <ul className="space-y-1.5">
            {active.slice(0, 6).map((h) => (
              <li key={h.id} className="flex items-center gap-2 text-[13px] text-ink-high">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <span className="flex-1 truncate">{h.title}</span>
                <span className="text-[11px] font-mono text-ink-muted">{h.date}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <section className="rounded-2xl border border-line-subtle bg-white/[0.02] p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-ink-muted mb-3">
            완료 {done.length}건
          </div>
          <ul className="space-y-1 text-[12.5px] text-ink-muted">
            {done.slice(0, 4).map((h) => (
              <li key={h.id} className="truncate">· {h.title}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
};

const BillingTab: React.FC<{
  student: ClientProfile;
  packages: LessonPackage[];
  usedByPackage: Record<string, number>;
  onManagePackages?: () => void;
}> = ({ student, packages, usedByPackage, onManagePackages }) => {
  const totalRemaining = packages.reduce(
    (sum, p) => sum + Math.max(0, p.totalSessions - (usedByPackage[p.id] ?? 0)),
    0
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="레슨권 잔여" value={`${totalRemaining}회`} />
        <StatTile
          label="보유 포인트"
          value={
            student.currentPoints != null
              ? `${student.currentPoints.toLocaleString()}P`
              : '—'
          }
        />
      </div>

      <section className="rounded-2xl border border-line-subtle bg-white/[0.02] p-4">
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
            레슨 패키지
          </span>
          {onManagePackages && (
            <button
              type="button"
              onClick={onManagePackages}
              className="ml-auto text-[11px] font-bold text-emerald-300 hover:text-emerald-200"
            >
              관리 →
            </button>
          )}
        </div>
        {packages.length === 0 ? (
          <div className="text-[12px] text-ink-muted">
            아직 배정된 레슨 패키지가 없습니다.
          </div>
        ) : (
          <ul className="space-y-2">
            {packages.map((p) => {
              const used = usedByPackage[p.id] ?? 0;
              const remaining = Math.max(0, p.totalSessions - used);
              return (
                <li key={p.id} className="flex items-center gap-2 text-[13px]">
                  <div className="flex-1 min-w-0 text-ink-high truncate">
                    {p.totalSessions}회권
                  </div>
                  <div className="flex items-center gap-1 text-ink-medium font-mono">
                    <span>{remaining}</span>
                    <span className="text-ink-muted">/</span>
                    <span className="text-ink-muted">{p.totalSessions}</span>
                    <span className="ml-1 text-[11px] text-ink-muted">
                      ({used}회 사용)
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
};

// ─── Subcomponents ─────────────────────────────────────────────────────────

const StatTile: React.FC<{
  label: string;
  value: string;
  tone?: 'default' | 'warn';
}> = ({ label, value, tone = 'default' }) => (
  <div className="rounded-2xl border border-line-subtle bg-white/[0.02] px-3 py-3">
    <div className="text-[10px] font-mono uppercase tracking-wider text-ink-muted">
      {label}
    </div>
    <div
      className={`mt-1 text-[20px] font-bold font-mono ${
        tone === 'warn' ? 'text-amber-300' : 'text-ink-high'
      }`}
    >
      {value}
    </div>
  </div>
);

const ActionTile: React.FC<{ label: string; hint: string; onClick: () => void }> = ({
  label,
  hint,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="rounded-2xl border border-line-subtle bg-white/[0.02] hover:bg-white/[0.04] px-3 py-3 text-left transition-colors"
  >
    <div className="text-[13px] font-bold text-ink-high">{label}</div>
    <div className="text-[11px] text-ink-muted mt-0.5">{hint}</div>
  </button>
);

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <div className="rounded-2xl border border-line-subtle bg-white/[0.02] px-4 py-8 text-center text-[13px] text-ink-muted">
    {label}
  </div>
);

const TrendBadge: React.FC<{ trend: MemberGrowthReport['trendIndicator'] }> = ({ trend }) => {
  if (trend === 'improving') {
    return (
      <span className="text-[10px] font-bold text-emerald-300 flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30">
        <TrendingUp className="w-3 h-3" /> 상승
      </span>
    );
  }
  if (trend === 'plateau') {
    return (
      <span className="text-[10px] font-bold text-amber-300 flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/30">
        정체
      </span>
    );
  }
  if (trend === 'inactive') {
    return (
      <span className="text-[10px] font-bold text-red-300 flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/10 border border-red-500/30">
        <TrendingDown className="w-3 h-3" /> 이탈 위험
      </span>
    );
  }
  return null;
};

// ─── 7a · Handover briefing banner ────────────────────────────────────────

const CONFIDENCE_LABEL: Record<
  NonNullable<HandoverSummary['confidence']>,
  string
> = {
  strong: '확신',
  plausible: '추정',
  speculative: '가설',
};

const HandoverBanner: React.FC<{
  summary: HandoverSummary;
  onDismiss: () => void;
}> = ({ summary, onDismiss }) => (
  <section
    aria-label="이전 코치의 인수인계 요약"
    className="relative rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.10] via-emerald-500/[0.05] to-transparent p-4"
  >
    <button
      type="button"
      onClick={onDismiss}
      aria-label="배너 닫기"
      className="absolute top-3 right-3 p-1 rounded-md text-ink-muted hover:text-ink-high hover:bg-white/5"
    >
      <X className="w-3.5 h-3.5" />
    </button>

    <div className="flex items-center gap-2 mb-2">
      <HandHelping className="w-4 h-4 text-emerald-300" />
      <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-200">
        인수인계 요약
      </div>
      {summary.confidence && (
        <span className="text-[10px] font-bold text-emerald-200 px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30">
          {CONFIDENCE_LABEL[summary.confidence]}
        </span>
      )}
    </div>

    <div className="text-[14px] font-bold text-ink-high mb-2">
      {summary.headline}
    </div>

    <p className="text-[12px] leading-relaxed text-ink-medium mb-3">
      {summary.recentFocus}
    </p>

    {summary.keyPoints.length > 0 && (
      <ul className="space-y-1 mb-2">
        {summary.keyPoints.map((point, i) => (
          <li
            key={i}
            className="text-[12px] leading-relaxed text-ink-medium flex items-start gap-1.5"
          >
            <span className="text-emerald-400 mt-0.5">·</span>
            <span>{point}</span>
          </li>
        ))}
      </ul>
    )}

    {summary.watchOuts && summary.watchOuts.length > 0 && (
      <div className="mt-3 pt-3 border-t border-emerald-500/20">
        <div className="text-[10px] font-mono uppercase tracking-wider text-amber-200/80 mb-1">
          유의
        </div>
        <ul className="space-y-0.5">
          {summary.watchOuts.map((w, i) => (
            <li key={i} className="text-[11.5px] text-ink-medium">
              · {w}
            </li>
          ))}
        </ul>
      </div>
    )}
  </section>
);

// ─── Helpers ───────────────────────────────────────────────────────────────

function countUsageByPackage(lessons: Lesson[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const l of lessons) {
    if (l.lessonPackageId) {
      map[l.lessonPackageId] = (map[l.lessonPackageId] ?? 0) + 1;
    }
  }
  return map;
}
