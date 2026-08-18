import React, { useEffect, useMemo, useState } from 'react';
import { Activity, LayoutGrid, TrendingUp, Users } from 'lucide-react';
import type { Bay, BayReservation, CoachProfile } from '../types';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { branchService } from '../services/branchService';

/**
 * 7c · Branch admin — mobile-first read-only overview.
 *
 * The redesign scopes the mobile branch surface to three panels:
 *  1. 타석 가동률 그리드 — bays × today's operating hours, colour
 *     coded by reservation status.
 *  2. 오늘 레슨 · 지점 유지율 2분할 — quick summary tiles the branch
 *     manager can eyeball without opening the desktop editor.
 *  3. 코치별 현황 리스트 — coaches at this branch with today's
 *     activity, sorted by lesson volume.
 *
 * Every edit affordance (opening hours, price rules, staff) stays on
 * desktop per spec. This component never mutates; the sibling
 * BranchAdminDashboard renders the full editor when the viewport is
 * wide enough.
 */

export interface BranchOverviewMobileProps {
  branchId: string;
  branchName: string;
  /** Called when the user taps "관리 화면 열기" to fall through to the
   *  desktop editor even on a mobile viewport. */
  onOpenDesktopEditor?: () => void;
}

interface DayCellState {
  bayId: string;
  hour: number; // 0..23
  reservation: BayReservation | null;
}

const HOUR_RANGE = { start: 9, end: 23 }; // 9AM ~ 11PM inclusive-exclusive display

const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const BranchOverviewMobile: React.FC<BranchOverviewMobileProps> = ({
  branchId,
  branchName,
  onOpenDesktopEditor,
}) => {
  const [bays, setBays] = useState<Bay[]>([]);
  const [reservations, setReservations] = useState<BayReservation[]>([]);
  const [coaches, setCoaches] = useState<CoachProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const today = todayISO();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const usingFb = firebaseService.isInitialized();
    Promise.all([
      branchService.getBays(branchId),
      branchService.getBayReservationsByBranch(branchId, today, today),
      usingFb ? firebaseService.getCoaches() : Promise.resolve(storageService.getCoaches()),
    ])
      .then(([b, r, c]) => {
        if (cancelled) return;
        setBays(b.filter((row) => row.isActive));
        setReservations(r);
        setCoaches(c);
      })
      .catch((e) => {
        console.warn('[BranchOverviewMobile] load failed', e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [branchId, today]);

  // Occupancy stats
  const { occupiedCount, capacityCount } = useMemo(() => {
    const activeHours = HOUR_RANGE.end - HOUR_RANGE.start;
    return {
      occupiedCount: reservations.filter(
        (r) => r.status === 'CONFIRMED' || r.status === 'CANCEL_REQUESTED'
      ).length,
      capacityCount: bays.length * activeHours,
    };
  }, [reservations, bays.length]);

  const occupancyPct =
    capacityCount === 0 ? 0 : Math.round((occupiedCount / capacityCount) * 100);

  // Reservations by bay/hour lookup for the grid.
  const cellMap = useMemo(() => {
    const map = new Map<string, BayReservation>();
    for (const r of reservations) {
      const hour = new Date(r.startTime).getHours();
      map.set(`${r.bayId}_${hour}`, r);
    }
    return map;
  }, [reservations]);

  // Coach activity — approximated from today's bay reservations that
  // reference a lesson_reservation_id. This is a directional indicator
  // until per-branch lesson counts land server-side.
  const coachActivity = useMemo(() => {
    const byCoach = new Map<string, number>();
    for (const r of reservations) {
      if (!r.lessonReservationId) continue;
      // TODO: replace with actual lesson.coach_id lookup once the
      // branch-scoped lesson endpoint ships (P3 retention pipeline).
      byCoach.set(r.clientId, (byCoach.get(r.clientId) ?? 0) + 1);
    }
    // Fall back to coach list without activity numbers so the panel
    // still renders when reservations don't link back to lessons.
    return coaches.map((c) => ({
      coach: c,
      todayLessons: byCoach.get(c.id) ?? 0,
    }));
  }, [reservations, coaches]);

  return (
    <div className="min-h-screen bg-base text-ink-high pb-8">
      <header className="sticky top-0 z-10 bg-base/95 backdrop-blur border-b border-line-subtle">
        <div className="max-w-md mx-auto px-5 h-14 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold truncate">{branchName}</div>
            <div className="text-[11px] font-mono text-ink-muted truncate">
              지점 관리자 · 조회 전용
            </div>
          </div>
          {onOpenDesktopEditor && (
            <button
              type="button"
              onClick={onOpenDesktopEditor}
              className="text-[11px] font-bold text-ink-medium hover:text-ink-high px-2 py-1 rounded-lg hover:bg-white/5"
            >
              관리 화면
            </button>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 py-4 space-y-4">
        {/* Two-tile split */}
        <div className="grid grid-cols-2 gap-2">
          <SplitTile
            icon={LayoutGrid}
            label="타석 가동률"
            value={`${occupancyPct}%`}
            hint={`${occupiedCount} / ${capacityCount}칸`}
            loading={loading}
          />
          <SplitTile
            icon={TrendingUp}
            label="지점 유지율"
            value="—"
            hint="집계 파이프라인 준비 중"
            loading={false}
            muted
          />
        </div>

        {/* Bay grid */}
        <section className="rounded-2xl border border-line-subtle bg-white/[0.02] p-4">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
              오늘 타석 그리드
            </span>
            <span className="ml-auto text-[10px] font-mono text-ink-muted">
              {HOUR_RANGE.start}시 ~ {HOUR_RANGE.end}시
            </span>
          </div>
          {loading ? (
            <div className="h-40 rounded-xl bg-white/[0.03] animate-pulse" />
          ) : bays.length === 0 ? (
            <EmptyState label="등록된 타석이 없습니다." />
          ) : (
            <BayGrid bays={bays} cellMap={cellMap} />
          )}
        </section>

        {/* Coach roster */}
        <section className="rounded-2xl border border-line-subtle bg-white/[0.02] p-4">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
              코치 현황
            </span>
            <span className="ml-auto text-[11px] font-mono text-ink-muted">
              총 {coaches.length}명
            </span>
          </div>
          {loading ? (
            <div className="h-24 rounded-xl bg-white/[0.03] animate-pulse" />
          ) : coaches.length === 0 ? (
            <EmptyState label="등록된 코치가 없습니다." />
          ) : (
            <ul className="space-y-2">
              {[...coachActivity]
                .sort((a, b) => b.todayLessons - a.todayLessons)
                .slice(0, 8)
                .map(({ coach, todayLessons }) => (
                  <li
                    key={coach.id}
                    className="flex items-center gap-3 rounded-xl border border-line-subtle bg-white/[0.02] px-3 py-2.5"
                  >
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-200 text-sm font-bold flex-shrink-0">
                      {coach.name.slice(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-bold text-ink-high truncate">
                        {coach.name}
                      </div>
                      <div className="text-[11px] text-ink-muted truncate">
                        {coach.email || coach.phone || '연락처 미공개'}
                      </div>
                    </div>
                    <div className="text-[11px] font-mono text-ink-medium">
                      {todayLessons > 0 ? `오늘 ${todayLessons}건` : '오늘 없음'}
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <p className="text-[11px] text-ink-muted text-center leading-relaxed pt-2">
          <Activity className="w-3 h-3 inline mr-1" />
          영업시간 · 휴일 · 요금 · 스태프 편집은 데스크톱 관리 화면에서 이용해 주세요.
        </p>
      </main>
    </div>
  );
};

// ─── Subcomponents ────────────────────────────────────────────────────────

const SplitTile: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string;
  hint: string;
  loading: boolean;
  muted?: boolean;
}> = ({ icon: Icon, label, value, hint, loading, muted }) => (
  <div
    className={`rounded-2xl border p-3 ${
      muted
        ? 'border-line-subtle bg-white/[0.01]'
        : 'border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.06] to-transparent'
    }`}
  >
    <div className="flex items-center gap-1.5 mb-2">
      <Icon className={`w-3.5 h-3.5 ${muted ? 'text-ink-muted' : 'text-emerald-300'}`} />
      <span className="text-[10px] font-mono uppercase tracking-wider text-ink-muted">
        {label}
      </span>
    </div>
    {loading ? (
      <div className="h-7 rounded bg-white/[0.03] animate-pulse" />
    ) : (
      <div
        className={`text-[22px] font-bold font-mono tabular-nums leading-tight ${
          muted ? 'text-ink-medium' : 'text-ink-high'
        }`}
      >
        {value}
      </div>
    )}
    <div className="text-[10.5px] text-ink-muted mt-0.5">{hint}</div>
  </div>
);

const BayGrid: React.FC<{
  bays: Bay[];
  cellMap: Map<string, BayReservation>;
}> = ({ bays, cellMap }) => {
  const hours = Array.from(
    { length: HOUR_RANGE.end - HOUR_RANGE.start },
    (_, i) => HOUR_RANGE.start + i
  );
  const sorted = [...bays].sort((a, b) => {
    if (a.floor !== b.floor) return a.floor.localeCompare(b.floor);
    return a.roomNumber.localeCompare(b.roomNumber);
  });
  return (
    <div className="overflow-x-auto">
      <div className="min-w-max">
        {/* Hour row */}
        <div className="flex items-center gap-1 pl-16 mb-1">
          {hours.map((h) => (
            <div
              key={h}
              className="w-6 text-center text-[9px] font-mono text-ink-muted"
            >
              {h}
            </div>
          ))}
        </div>
        {sorted.map((bay) => (
          <div key={bay.id} className="flex items-center gap-1 mb-1">
            <div className="w-16 text-[11px] font-mono text-ink-medium truncate">
              {bay.floor} · {bay.roomNumber}
            </div>
            {hours.map((h) => {
              const r = cellMap.get(`${bay.id}_${h}`);
              const state: DayCellState = {
                bayId: bay.id,
                hour: h,
                reservation: r ?? null,
              };
              return <BayCell key={h} cell={state} />;
            })}
          </div>
        ))}
        {/* Legend */}
        <div className="flex items-center gap-3 pl-16 mt-2 text-[10px] text-ink-muted">
          <LegendChip color="bg-emerald-500" label="예약" />
          <LegendChip color="bg-amber-500/60" label="취소 요청" />
          <LegendChip color="bg-white/[0.06] border border-line-default" label="빈 슬롯" />
        </div>
      </div>
    </div>
  );
};

const BayCell: React.FC<{ cell: DayCellState }> = ({ cell }) => {
  if (!cell.reservation) {
    return (
      <div
        className="w-6 h-6 rounded bg-white/[0.05] border border-line-subtle"
        aria-label={`${cell.hour}시 빈 슬롯`}
      />
    );
  }
  const status = cell.reservation.status;
  if (status === 'CANCELLED' || status === 'REJECTED') {
    return (
      <div
        className="w-6 h-6 rounded bg-white/[0.05] border border-line-subtle opacity-40"
        aria-label={`${cell.hour}시 취소된 슬롯`}
      />
    );
  }
  const bg = status === 'CANCEL_REQUESTED' ? 'bg-amber-500/60' : 'bg-emerald-500';
  return (
    <div
      className={`w-6 h-6 rounded ${bg} border border-emerald-500/30`}
      title={cell.reservation.clientName}
      aria-label={`${cell.hour}시 · ${cell.reservation.clientName}`}
    />
  );
};

const LegendChip: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span className="inline-flex items-center gap-1">
    <span className={`inline-block w-2.5 h-2.5 rounded ${color}`} aria-hidden />
    {label}
  </span>
);

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <div className="rounded-xl border border-dashed border-line-default px-4 py-6 text-center text-[12px] text-ink-muted">
    {label}
  </div>
);
