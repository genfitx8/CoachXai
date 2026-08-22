import React, { useEffect, useMemo, useState } from 'react';
import { Mic, Search, User, CalendarClock, X, Loader2, ChevronLeft } from 'lucide-react';
import { ClientProfile, LessonReservation } from '../types';
import { clientIdentityKey, dedupeClients } from '../utils/clientRoster';
import {
  findNearbyLessons,
  NearbyLesson,
  NearbyLessonPhase,
} from '../services/lessonStartSuggestionService';

/**
 * 레슨 중 동반 · 학생 선택
 *
 * The companion moved out of the lesson list and onto its own bottom tab,
 * which means the coach now lands here with no student in hand. Two ways
 * out, in the order a coach on the mat actually wants them:
 *
 *  1. "지금 레슨" — students pulled off the reservation calendar, ranked by
 *     how close their lesson is to right now. One tap, no typing.
 *  2. A name/phone search over the coach's roster, for walk-ins and anyone
 *     the calendar doesn't know about.
 *
 * The relative labels ("15분 후 시작") are recomputed on a ticking clock so a
 * picker left open on the phone stand doesn't go stale.
 */

export interface LiveLessonStudentPickerProps {
  /**
   * The signed-in coach's students, already scoped and name-sorted.
   *
   * Deduped again here: a roster that arrives with the same 이름·번호 repeated
   * (server rows a removed sync minted, a device cache stacked on the server
   * list) turns this screen into hundreds of identical buttons, which is the
   * one thing a coach standing on the mat cannot use.
   */
  clients: ClientProfile[];
  /** Coach's reservations, used to suggest who's on the mat right now. */
  reservations: LessonReservation[];
  /** True while `reservations` is still being fetched. */
  reservationsLoading?: boolean;
  /** Called with the chosen student's name. */
  onSelect: (studentName: string) => void;
  /**
   * Returns to the agent home. With the tab bar gone this screen has no
   * other way out, so the header carries its own back affordance.
   */
  onBack?: () => void;
}

/** How often the relative time labels refresh (ms). */
const TICK_MS = 30_000;

const phaseAccent: Record<NearbyLessonPhase, string> = {
  IN_PROGRESS: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50',
  UPCOMING: 'bg-sky-500/15 text-sky-200 border-sky-400/40',
  JUST_ENDED: 'bg-white/[0.06] text-ink-medium border-line-subtle',
};

/** Case-insensitive name/phone match; an empty query matches everything. */
const matchesQuery = (query: string, name: string, phone?: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    name.toLowerCase().includes(q) || (phone ?? '').replace(/-/g, '').includes(q.replace(/-/g, ''))
  );
};

export const LiveLessonStudentPicker: React.FC<LiveLessonStudentPickerProps> = ({
  clients,
  reservations,
  reservationsLoading = false,
  onSelect,
  onBack,
}) => {
  const [query, setQuery] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Keep "15분 후 시작" honest while the picker sits open.
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const nearby: NearbyLesson[] = useMemo(
    () => findNearbyLessons(reservations, nowMs),
    [reservations, nowMs],
  );

  const visibleNearby = useMemo(
    () =>
      nearby.filter((n) =>
        matchesQuery(query, n.reservation.clientName ?? '', n.reservation.clientPhone),
      ),
    [nearby, query],
  );

  /** One row per person, whatever the caller handed us. */
  const roster = useMemo(() => dedupeClients(clients), [clients]);

  const visibleClients = useMemo(
    () => roster.filter((c) => matchesQuery(query, c.name, c.phone)),
    [roster, query],
  );

  const isSearching = query.trim().length > 0;

  return (
    <div className="space-y-6 animate-fade-in" data-testid="live-lesson-picker">
      <div className="flex items-center gap-2 min-w-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="뒤로"
            className="-ml-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-ink-medium transition-colors hover:bg-white/8 hover:text-ink-high"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <h2 className="text-lg sm:text-xl font-bold text-ink-high flex items-center gap-2 tracking-tight min-w-0">
          <Mic className="w-5 h-5 text-emerald-300 flex-shrink-0" />
          <span className="truncate">레슨 중 동반</span>
        </h2>
      </div>
      <p className="text-sm text-ink-medium">
        동반을 시작할 학생을 선택하세요. 레슨 전체 녹음과 스윙 사진·영상을 모아
        두었다가, 종료하면 레슨 기록 작성으로 이어집니다.
      </p>

      {/* Search — name or phone */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-muted pointer-events-none" />
        <input
          type="text"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="학생 이름 또는 연락처 검색"
          aria-label="학생 검색"
          data-testid="live-lesson-student-search"
          className="w-full pl-10 pr-10 py-3 bg-base border border-line-subtle rounded-xl text-ink-high placeholder:text-ink-muted focus:ring-2 focus:ring-emerald-500 outline-none"
        />
        {isSearching && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="검색어 지우기"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-ink-muted hover:text-ink-high hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Calendar-derived suggestions */}
      <section className="space-y-3" data-testid="live-lesson-nearby-section">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-emerald-300 flex-shrink-0" />
          <h3 className="text-sm font-bold text-ink-high">지금 레슨</h3>
          {reservationsLoading && (
            <Loader2 className="w-3.5 h-3.5 text-ink-muted animate-spin" aria-label="예약 불러오는 중" />
          )}
        </div>

        {visibleNearby.length === 0 ? (
          <p className="text-sm text-ink-muted bg-white/[0.03] border border-dashed border-line-subtle rounded-2xl px-4 py-4">
            {reservationsLoading
              ? '예약 일정을 확인하는 중입니다…'
              : isSearching
                ? '검색어와 일치하는 예정 레슨이 없습니다.'
                : '가까운 시간에 예약된 레슨이 없습니다. 아래에서 학생을 직접 선택하세요.'}
          </p>
        ) : (
          <div className="space-y-2">
            {visibleNearby.map((n) => (
              <button
                key={n.reservation.id}
                type="button"
                onClick={() => onSelect(n.reservation.clientName as string)}
                data-testid="live-lesson-nearby-item"
                className="w-full flex items-center gap-3 p-4 bg-white/[0.03] border border-line-subtle rounded-2xl hover:bg-emerald-500/10 hover:border-emerald-400/40 transition-colors text-left"
              >
                <div className="bg-emerald-500/20 p-2 rounded-full text-emerald-300 flex-shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-ink-high truncate">
                    {n.reservation.clientName}
                  </div>
                  <div className="text-xs text-ink-muted truncate">
                    {n.timeRangeLabel}
                    {n.reservation.lessonType ? ` · ${n.reservation.lessonType}` : ''}
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap flex-shrink-0 ${phaseAccent[n.phase]}`}
                >
                  {n.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Full roster */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-emerald-300 flex-shrink-0" />
          <h3 className="text-sm font-bold text-ink-high">전체 학생</h3>
          <span className="text-xs text-ink-muted">{visibleClients.length}명</span>
        </div>

        {roster.length === 0 ? (
          <div className="text-center py-16 bg-white/[0.03] rounded-2xl border border-dashed border-line-subtle">
            <div className="w-16 h-16 bg-white/[0.05] rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-ink-muted" />
            </div>
            <h3 className="text-lg font-bold text-ink-high">등록된 학생이 없습니다</h3>
            <p className="text-sm text-ink-medium mt-1">학생 탭에서 회원을 먼저 등록해 주세요.</p>
          </div>
        ) : visibleClients.length === 0 ? (
          <p
            className="text-sm text-ink-muted bg-white/[0.03] border border-dashed border-line-subtle rounded-2xl px-4 py-4"
            data-testid="live-lesson-no-search-result"
          >
            &lsquo;{query.trim()}&rsquo; 와(과) 일치하는 학생이 없습니다.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visibleClients.map((client) => (
              <button
                key={clientIdentityKey(client)}
                type="button"
                onClick={() => onSelect(client.name)}
                data-testid="live-lesson-client-item"
                className="flex items-center gap-3 p-4 bg-white/[0.03] border border-line-subtle rounded-2xl hover:bg-emerald-500/10 hover:border-emerald-400/40 transition-colors text-left"
              >
                <div className="bg-emerald-500/20 p-2 rounded-full text-emerald-300 flex-shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-ink-high truncate">{client.name}</div>
                  {client.phone && (
                    <div className="text-xs text-ink-muted truncate">{client.phone}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
