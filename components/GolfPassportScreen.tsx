import React, { useMemo } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Download,
  ShieldCheck,
  Sparkles,
  UserCircle2,
  Video,
} from 'lucide-react';
import type { ClientProfile, Lesson } from '../types';

/**
 * 6f · 골프 여권
 *
 * The redesign asks for a screen that shows the student what "their
 * data" actually is — the point being that everything here travels
 * with them if they change coaches. Not a fresh export dialog and not
 * a settings page: a portable profile the student can browse, review,
 * and (later) hand off.
 *
 * This first cut leans entirely on data the app already has:
 *  - Overview stats (레슨 · 영상 · 활동 기간 · 함께한 코치 수) come
 *    from the student's lesson list.
 *  - 이력 lists the coaches this student has worked with, current +
 *    previous, using the previous_coach_ids array we landed in #309.
 *  - 최근 하이라이트 aggregates the reviewSections coaches have
 *    approved — nothing here surfaces coach-private freeMemo.
 *  - 데이터 관리 block explains ownership at a plain-language level
 *    (학생 소유 / 공동 / 코치 소유) and CTA-links out to the future
 *    export + handover flows (marked as coming soon).
 */

export interface GolfPassportScreenProps {
  clientProfile: ClientProfile;
  lessons: Lesson[];
  onBack: () => void;
  /** Later: kicks off the coach-handover flow (7a). */
  onStartHandover?: () => void;
  /** Later: kicks off a data-export flow. */
  onExportData?: () => void;
}

interface CoachTimelineEntry {
  coachId: string;
  coachName?: string;
  lessonCount: number;
  firstLesson: number;
  lastLesson: number;
  isCurrent: boolean;
}

export const GolfPassportScreen: React.FC<GolfPassportScreenProps> = ({
  clientProfile,
  lessons,
  onBack,
  onStartHandover,
  onExportData,
}) => {
  const approvedLessons = useMemo(
    () => lessons.filter((l) => l.approvalStatus === 'approved' || !l.approvalStatus),
    [lessons]
  );

  const totalVideos = useMemo(
    () =>
      approvedLessons.filter(
        (l) => l.videoUrl || l.videoKey || (l.additionalMedia?.some((m) => m.type === 'video'))
      ).length,
    [approvedLessons]
  );

  const activityRange = useMemo(() => {
    if (approvedLessons.length === 0) return null;
    const times = approvedLessons.map((l) => l.createdAt ?? 0).filter((t) => t > 0);
    if (times.length === 0) return null;
    const first = Math.min(...times);
    const last = Math.max(...times);
    return { first, last, days: Math.max(1, Math.round((last - first) / (24 * 60 * 60 * 1000))) };
  }, [approvedLessons]);

  const coachHistory = useMemo<CoachTimelineEntry[]>(() => {
    const byCoach = new Map<string, CoachTimelineEntry>();
    for (const l of approvedLessons) {
      const cid = l.originalCoachId ?? l.coachId;
      if (!cid) continue;
      const existing = byCoach.get(cid);
      const t = l.createdAt ?? 0;
      if (existing) {
        existing.lessonCount += 1;
        existing.firstLesson = Math.min(existing.firstLesson, t);
        existing.lastLesson = Math.max(existing.lastLesson, t);
      } else {
        byCoach.set(cid, {
          coachId: cid,
          lessonCount: 1,
          firstLesson: t,
          lastLesson: t,
          isCurrent: cid === clientProfile.coachId,
        });
      }
    }
    // Newest activity first, current coach pinned on top.
    return [...byCoach.values()].sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      return b.lastLesson - a.lastLesson;
    });
  }, [approvedLessons, clientProfile.coachId]);

  const highlights = useMemo(() => {
    // Cross-lesson aggregation of coach-authored nextActions — a
    // "what has your coach been asking you to work on" digest. Cap
    // at six unique lines so the block stays scannable.
    const seen = new Set<string>();
    const lines: { text: string; when: number }[] = [];
    for (const l of [...approvedLessons].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))) {
      const actions = l.reviewSections?.nextActions ?? [];
      for (const a of actions) {
        const trimmed = a.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        lines.push({ text: trimmed, when: l.createdAt ?? 0 });
        if (lines.length >= 6) break;
      }
      if (lines.length >= 6) break;
    }
    return lines;
  }, [approvedLessons]);

  return (
    // Rendered straight into ClientApp with no wrapper, so this screen owns
    // its own device insets. The trailing `pb-12` moved onto <main> below:
    // `pb-safe` here would have replaced it outright rather than adding to it.
    <div className="min-h-screen bg-base text-ink-high pb-safe">
      <header className="sticky top-0 z-10 bg-base/95 backdrop-blur border-b border-line-subtle pt-safe">
        <div className="max-w-md mx-auto px-5 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="뒤로"
            className="p-2 -ml-2 rounded-lg text-ink-medium hover:text-ink-high hover:bg-white/5"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold truncate">골프 여권</div>
            <div className="text-[11px] font-mono text-ink-muted truncate">
              {clientProfile.name}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 pt-5 pb-12 space-y-5">
        {/* Overview stats */}
        <section className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.08] via-emerald-500/[0.04] to-transparent p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4 text-emerald-300" />
            <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-200">
              이 데이터는 나의 것
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <OverviewTile label="레슨 기록" value={String(approvedLessons.length)} icon={BookOpen} />
            <OverviewTile label="스윙 영상" value={String(totalVideos)} icon={Video} />
            <OverviewTile
              label="활동 기간"
              value={activityRange ? `${activityRange.days}일` : '—'}
              icon={Sparkles}
            />
            <OverviewTile
              label="함께한 코치"
              value={String(coachHistory.length)}
              icon={UserCircle2}
            />
          </div>
        </section>

        {/* 코치 이력 */}
        <section className="rounded-2xl border border-line-subtle bg-white/[0.02] p-4">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
              코치 이력
            </span>
            <span className="ml-auto text-[11px] font-mono text-ink-muted">
              현재 코치가 위
            </span>
          </div>
          {coachHistory.length === 0 ? (
            <div className="text-[12px] text-ink-muted">
              아직 코치와의 기록이 없습니다.
            </div>
          ) : (
            <ul className="space-y-2">
              {coachHistory.map((c) => (
                <li
                  key={c.coachId}
                  className="flex items-center gap-3 rounded-xl border border-line-subtle bg-white/[0.02] px-3 py-2.5"
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      c.isCurrent
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/40'
                        : 'bg-white/5 text-ink-medium'
                    }`}
                  >
                    <UserCircle2 className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-ink-high truncate">
                      {c.coachName ?? shortCoachId(c.coachId)}
                      {c.isCurrent && (
                        <span className="ml-2 text-[10px] font-mono text-emerald-300">
                          현재
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-ink-muted mt-0.5">
                      {formatRange(c.firstLesson, c.lastLesson)} · {c.lessonCount}회 레슨
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 최근 하이라이트 */}
        {highlights.length > 0 && (
          <section className="rounded-2xl border border-line-subtle bg-white/[0.02] p-4">
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
                최근 코치의 지시
              </span>
              <span className="ml-auto text-[11px] font-mono text-ink-muted">
                {highlights.length}건
              </span>
            </div>
            <ul className="space-y-1.5">
              {highlights.map((h, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[13px] text-ink-high leading-relaxed"
                >
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span>{h.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 데이터 관리 · 소유권 안내 */}
        <section className="rounded-2xl border border-line-subtle bg-white/[0.02] p-4 space-y-3">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
              데이터 소유권
            </span>
          </div>
          <p className="text-[12.5px] text-ink-medium leading-relaxed">
            영상 · 진단 · 스코어는 <b className="text-ink-high">나</b>의 것이고, 코치를 바꿔도 그대로 남습니다.
            레슨 기록은 <b className="text-ink-high">코치와 함께</b> 만들었기 때문에 관계가 끝나도 읽기는 계속 유지됩니다.
            코치의 사적 메모는 코치에게만 남고 여기 나타나지 않습니다.
          </p>

          <div className="grid grid-cols-1 gap-2">
            <ActionRow
              icon={ArrowUpRight}
              label="코치 변경 · 인수인계"
              hint={
                onStartHandover
                  ? '이전 코치의 이력 요약을 새 코치에게 전달합니다'
                  : '곧 제공 · 현재는 준비 중'
              }
              onClick={onStartHandover}
            />
            <ActionRow
              icon={Download}
              label="데이터 내보내기"
              hint={
                onExportData
                  ? '모든 기록 · 영상 링크를 다운로드'
                  : '곧 제공 · 현재는 준비 중'
              }
              onClick={onExportData}
            />
          </div>
        </section>
      </main>
    </div>
  );
};

// ─── Subcomponents ─────────────────────────────────────────────────────────

const OverviewTile: React.FC<{ label: string; value: string; icon: React.ElementType }> = ({
  label,
  value,
  icon: Icon,
}) => (
  <div className="rounded-xl border border-line-subtle bg-white/[0.03] px-3 py-3">
    <div className="flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5 text-ink-muted" />
      <span className="text-[10px] font-mono uppercase tracking-wider text-ink-muted">
        {label}
      </span>
    </div>
    <div className="mt-1 text-[22px] font-bold font-mono text-ink-high tabular-nums">
      {value}
    </div>
  </div>
);

const ActionRow: React.FC<{
  icon: React.ElementType;
  label: string;
  hint: string;
  onClick?: () => void;
}> = ({ icon: Icon, label, hint, onClick }) => {
  const disabled = !onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left rounded-xl border px-3 py-3 flex items-center gap-3 transition-colors ${
        disabled
          ? 'border-line-subtle bg-white/[0.01] cursor-not-allowed opacity-60'
          : 'border-line-default bg-white/[0.03] hover:bg-white/[0.05]'
      }`}
    >
      <Icon
        className={`w-4 h-4 flex-shrink-0 ${
          disabled ? 'text-ink-muted' : 'text-emerald-300'
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-bold text-ink-high leading-tight">
          {label}
        </div>
        <div className="text-[11.5px] text-ink-muted mt-0.5 leading-relaxed">
          {hint}
        </div>
      </div>
    </button>
  );
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function shortCoachId(coachId: string): string {
  // Coach ids are UUIDs — showing the last 4 characters is enough to
  // disambiguate in the list without leaking the whole identifier.
  const last = coachId.slice(-4);
  return `코치 · ${last}`;
}

function formatRange(from: number, to: number): string {
  const f = new Date(from);
  const t = new Date(to);
  const fs = `${f.getFullYear().toString().slice(2)}.${String(f.getMonth() + 1).padStart(2, '0')}`;
  const ts = `${t.getFullYear().toString().slice(2)}.${String(t.getMonth() + 1).padStart(2, '0')}`;
  if (fs === ts) return fs;
  return `${fs} ~ ${ts}`;
}
