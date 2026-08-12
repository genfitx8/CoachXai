import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronRight, Clock, MapPin, Sparkles, Target } from 'lucide-react';
import type { ClientProfile, Lesson, LessonPackage, LessonReservation } from '../types';
import { reservationService } from '../services/reservationService';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { apiService } from '../services/apiService';
import { useLanguage } from './LanguageContext';

/**
 * 5c · Student reservation overview.
 *
 * The redesign folds "다음 레슨", 타석 예약 진입, 레슨권 잔여 into one
 * screen so a student asking themselves "언제 갈지" answers it without
 * hopping between sub-views. This is the overview surface — the deep
 * booking flows (ClientReservation / ClientBayReservation) still exist
 * and are launched via the CTAs below.
 *
 * Data is fetched here rather than threaded through ClientApp so the
 * component drops into any tab position without a props overhaul. Every
 * fetch is offline-tolerant: if Firebase is down the storage fallback
 * still surfaces whatever the student saw last.
 */

export interface StudentReservationSummaryProps {
  clientProfile: ClientProfile;
  /** Full lesson history — used to count package usage per lessonPackageId. */
  myLessons: Lesson[];
  /** Open the lesson booking form. */
  onOpenLessonBooking: () => void;
  /** Open the bay booking flow. */
  onOpenBayBooking: () => void;
  /** Open the "my bay reservations" list. */
  onOpenMyBayReservations?: () => void;
  /** Open a specific lesson detail — CTA in the "다음 레슨" card. */
  onOpenLesson?: (lessonId: string) => void;
}

const KOR = { book: '레슨 예약', bay: '타석 예약', myBay: '내 타석 예약', nextLesson: '다음 레슨', package: '레슨권 잔여', empty: '예정된 레슨이 없습니다', bookCta: '레슨 예약하기', bayCta: '타석 예약하기' };
const ENG = { book: 'Book lesson', bay: 'Book bay', myBay: 'My bay bookings', nextLesson: 'Next lesson', package: 'Lesson package', empty: 'No upcoming lesson', bookCta: 'Book a lesson', bayCta: 'Book a bay' };
const JAP = { book: 'レッスン予約', bay: '打席予約', myBay: '打席予約一覧', nextLesson: '次のレッスン', package: 'レッスン残数', empty: '予定されたレッスンがありません', bookCta: 'レッスンを予約', bayCta: '打席を予約' };

export const StudentReservationSummary: React.FC<StudentReservationSummaryProps> = ({
  clientProfile,
  myLessons,
  onOpenLessonBooking,
  onOpenBayBooking,
  onOpenMyBayReservations,
  onOpenLesson,
}) => {
  const { language } = useLanguage();
  const L = language === 'en' ? ENG : language === 'ja' ? JAP : KOR;

  const clientId = useMemo(
    () => `${clientProfile.name}_${clientProfile.phone}`,
    [clientProfile.name, clientProfile.phone]
  );

  const [reservations, setReservations] = useState<LessonReservation[]>([]);
  const [packages, setPackages] = useState<LessonPackage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      reservationService.getClientReservations(clientId).catch(() => [] as LessonReservation[]),
      loadPackagesForClient(clientId, clientProfile).catch(() => [] as LessonPackage[]),
    ]).then(([r, p]) => {
      if (cancelled) return;
      setReservations(r);
      setPackages(p);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [clientId, clientProfile]);

  const nextLesson = useMemo(() => {
    const now = Date.now();
    const upcoming = reservations.filter(
      (r) =>
        new Date(r.startTime).getTime() > now &&
        (r.status === 'CONFIRMED' || r.status === 'COACH_APPROVED')
    );
    upcoming.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    return upcoming[0] ?? null;
  }, [reservations]);

  const packageStats = useMemo(() => {
    // "used" = count of this student's lessons that reference the package.
    // We only surface packages with at least one session left.
    return packages
      .map((p) => {
        const used = myLessons.filter((l) => l.lessonPackageId === p.id).length;
        const remaining = Math.max(0, p.totalSessions - used);
        return { pkg: p, used, remaining };
      })
      .filter((row) => row.pkg.totalSessions > 0)
      .sort((a, b) => b.remaining - a.remaining);
  }, [packages, myLessons]);

  const totalRemaining = packageStats.reduce((sum, r) => sum + r.remaining, 0);

  return (
    <div className="max-w-md mx-auto px-4 pt-4 pb-6 space-y-4">
      {/* 다음 레슨 */}
      <section
        className={`rounded-2xl p-4 border ${
          nextLesson
            ? 'border-emerald-500/40 bg-gradient-to-br from-emerald-500/[0.08] via-emerald-500/[0.04] to-transparent'
            : 'border-line-subtle bg-white/[0.02]'
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          <Sparkles
            className={`w-4 h-4 ${nextLesson ? 'text-emerald-400' : 'text-ink-muted'}`}
          />
          <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
            {L.nextLesson}
          </span>
        </div>

        {loading ? (
          <div className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />
        ) : nextLesson ? (
          <button
            type="button"
            onClick={() => onOpenLesson?.(nextLesson.id)}
            className="w-full text-left flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-bold text-ink-high leading-tight">
                {formatReservationDate(nextLesson.startTime, language)}
              </div>
              <div className="mt-1 text-[12px] text-ink-medium flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTime(nextLesson.startTime)}–{formatTime(nextLesson.endTime)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {nextLesson.coachName}
                </span>
                {nextLesson.bayLabel && (
                  <span className="inline-flex items-center gap-1">
                    <Target className="w-3 h-3" />
                    {nextLesson.bayLabel}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-ink-muted flex-shrink-0" />
          </button>
        ) : (
          <div className="text-[13px] text-ink-medium leading-relaxed">{L.empty}</div>
        )}
      </section>

      {/* 레슨권 잔여 */}
      {(loading || packageStats.length > 0) && (
        <section className="rounded-2xl border border-line-subtle bg-white/[0.02] p-4">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
              {L.package}
            </span>
            {!loading && (
              <span className="ml-auto text-[13px] font-bold text-emerald-300">
                {totalRemaining}회
              </span>
            )}
          </div>
          {loading ? (
            <div className="h-10 rounded-xl bg-white/[0.03] animate-pulse" />
          ) : (
            <ul className="space-y-2">
              {packageStats.slice(0, 3).map(({ pkg, used, remaining }) => (
                <li key={pkg.id} className="flex items-center gap-3 text-[12.5px]">
                  <div className="flex-1 min-w-0 text-ink-high truncate">
                    {pkg.clientName || pkg.clientId}
                  </div>
                  <div className="flex items-center gap-1 text-ink-medium">
                    <span className="font-mono">{remaining}</span>
                    <span className="text-ink-muted">/</span>
                    <span className="font-mono text-ink-muted">{pkg.totalSessions}</span>
                    <span className="ml-1 text-[11px] text-ink-muted">
                      ({used}회 사용)
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 액션 CTA */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onOpenLessonBooking}
          className="h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-[#04150e] text-[14px] font-bold flex items-center justify-center gap-1.5 transition-colors"
        >
          <Calendar className="w-4 h-4" />
          {L.bookCta}
        </button>
        <button
          type="button"
          onClick={onOpenBayBooking}
          className="h-12 rounded-xl border border-line-default text-ink-high hover:bg-white/5 text-[14px] font-bold flex items-center justify-center gap-1.5 transition-colors"
        >
          <Target className="w-4 h-4" />
          {L.bayCta}
        </button>
      </div>

      {onOpenMyBayReservations && (
        <button
          type="button"
          onClick={onOpenMyBayReservations}
          className="w-full text-[12px] text-ink-medium hover:text-ink-high py-2 rounded-lg hover:bg-white/[0.03] flex items-center justify-center gap-1"
        >
          {L.myBay} <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

// ─── Data loaders ─────────────────────────────────────────────────────────

async function loadPackagesForClient(
  clientId: string,
  clientProfile: ClientProfile
): Promise<LessonPackage[]> {
  // A student's packages are keyed by (coachId, clientId composite). We
  // don't know every coach the student has worked with, so pull all
  // packages the storage layer knows about and filter — cheap because
  // this list is per-user, not per-app.
  const usingFirebase = apiService.isAvailable() && firebaseService.isInitialized();
  const coachId = clientProfile.coachId;

  let all: LessonPackage[] = [];
  if (usingFirebase && coachId) {
    try {
      all = await firebaseService.getLessonPackages(coachId);
    } catch {
      all = storageService.getLessonPackages();
    }
  } else {
    all = storageService.getLessonPackages();
  }
  return all.filter(
    (p) =>
      p.clientId === clientId ||
      (p.clientName === clientProfile.name && p.clientPhone === clientProfile.phone)
  );
}

// ─── Formatting ───────────────────────────────────────────────────────────

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

function formatReservationDate(iso: string, lang: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const weekdays = lang === 'en' ? WEEKDAYS_EN : lang === 'ja' ? WEEKDAYS_JA : WEEKDAYS_KO;
  const w = weekdays[d.getDay()];
  if (isToday) return lang === 'en' ? 'Today' : lang === 'ja' ? '今日' : '오늘';
  if (isTomorrow) return lang === 'en' ? 'Tomorrow' : lang === 'ja' ? '明日' : '내일';
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (lang === 'en') return `${weekdays[d.getDay()]} ${m}/${day}`;
  if (lang === 'ja') return `${m}月${day}日 (${w})`;
  return `${m}월 ${day}일 (${w})`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
