import React, { useState, useEffect, useCallback } from 'react';
import { Bay, BayReservation, BayReservationStatus, LessonReservation } from '../types';
import { bayReservationService } from '../services/bayReservationService';
import { reservationService } from '../services/reservationService';
import {
  Calendar,
  Clock,
  User,
  Phone,
  CheckCircle,
  XCircle,
  Clock3,
  RefreshCw,
  Filter,
  Search,
} from 'lucide-react';
import { Button } from './Button';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateOnly(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

function formatHourRange(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const fmt = (dt: Date) =>
    `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  return `${fmt(s)} ~ ${fmt(e)}`;
}

function bayLabel(bay: Bay): string {
  return `${bay.floor}층 ${bay.roomNumber}번`;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  BayReservationStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  CONFIRMED: {
    label: '예약 확정',
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    icon: <CheckCircle className="w-3.5 h-3.5" />,
  },
  CANCEL_REQUESTED: {
    label: '취소 요청',
    color: 'text-orange-600 bg-orange-50 border-orange-200',
    icon: <Clock3 className="w-3.5 h-3.5" />,
  },
  CANCELLED: {
    label: '취소됨',
    color: 'text-gray-500 bg-gray-50 border-gray-200',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
  REJECTED: {
    label: '거절됨',
    color: 'text-red-500 bg-red-50 border-red-200',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface BranchReservationStatusProps {
  branchId: string;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const BranchReservationStatus: React.FC<BranchReservationStatusProps> = ({
  branchId,
  onSuccess,
  onError,
}) => {
  const today = todayStr();

  const [reservations, setReservations] = useState<BayReservation[]>([]);
  const [bays, setBays] = useState<Bay[]>([]);
  const [loading, setLoading] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [pendingLessons, setPendingLessons] = useState<LessonReservation[]>([]);
  const [pendingLessonBaySelection, setPendingLessonBaySelection] = useState<Record<string, string>>({});

  // Filters
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(addDays(today, 13));
  const [filterBayId, setFilterBayId] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<BayReservationStatus | 'ALL'>('ALL');

  // ── fetch ───────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [reservationList, bayList] = await Promise.all([
        bayReservationService.getBranchReservations(branchId, dateFrom, dateTo),
        bayReservationService.getBranchBays(branchId),
      ]);
      const lessonPending = await reservationService.getAdminPendingReservations(branchId);
      // Sort ascending by startTime so earlier slots appear first
      reservationList.sort((a, b) => a.startTime.localeCompare(b.startTime));
      lessonPending.sort((a, b) => a.startTime.localeCompare(b.startTime));
      setReservations(reservationList);
      setBays(bayList);
      setPendingLessons(lessonPending);
    } catch (e) {
      onError?.('예약 목록을 불러오는 데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [branchId, dateFrom, dateTo, onError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── filtering ───────────────────────────────────────────────────────────────

  const filtered = reservations.filter((r) => {
    if (filterBayId !== 'ALL' && r.bayId !== filterBayId) return false;
    if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
    return true;
  });

  const cancelRequestCount = reservations.filter(
    (r) => r.status === 'CANCEL_REQUESTED'
  ).length;

  // ── actions ─────────────────────────────────────────────────────────────────

  const handleApproveCancellation = async (reservationId: string) => {
    setActioningId(reservationId);
    try {
      await bayReservationService.approveCancellation(reservationId);
      onSuccess?.('취소 요청이 승인되었습니다.');
      await fetchData();
    } catch (e) {
      onError?.('취소 승인 중 오류가 발생했습니다.');
    } finally {
      setActioningId(null);
    }
  };

  const handleRejectCancellation = async (reservationId: string) => {
    setActioningId(reservationId);
    try {
      await bayReservationService.rejectCancellation(reservationId);
      onSuccess?.('취소 요청이 거절되었습니다. 예약이 유지됩니다.');
      await fetchData();
    } catch (e) {
      onError?.('취소 거절 중 오류가 발생했습니다.');
    } finally {
      setActioningId(null);
    }
  };

  // ── bay lookup helper ────────────────────────────────────────────────────────

  const getBayLabel = (bayId: string): string => {
    const bay = bays.find((b) => b.id === bayId);
    return bay ? bayLabel(bay) : bayId;
  };

  const handleFinalizeLessonReservation = async (lesson: LessonReservation) => {
    const selectedBayId = pendingLessonBaySelection[lesson.id];
    if (!selectedBayId) {
      onError?.('확정할 타석을 선택해주세요.');
      return;
    }
    setActioningId(lesson.id);
    try {
      await reservationService.confirmReservationByAdmin({
        reservationId: lesson.id,
        branchId,
        bayId: selectedBayId,
      });
      onSuccess?.('레슨 예약이 확정되고 타석이 배정되었습니다.');
      await fetchData();
    } catch (e: any) {
      onError?.(e?.message || '레슨 예약 확정 중 오류가 발생했습니다.');
    } finally {
      setActioningId(null);
    }
  };

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900">타석 예약 현황</h3>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 disabled:opacity-50 transition-colors"
          aria-label="새로고침"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* Lesson reservations waiting for admin bay assignment */}
      <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-4 space-y-3">
        <h4 className="font-semibold text-gray-900">레슨 예약 관리자 확정 대기</h4>
        {pendingLessons.length === 0 ? (
          <p className="text-sm text-gray-400">확정 대기 중인 레슨 예약이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {pendingLessons.map((lesson) => (
              <li key={lesson.id} className="border border-gray-100 rounded-xl p-3 space-y-2">
                <div className="text-sm font-medium text-gray-800">
                  {lesson.clientName || '회원'} · {lesson.coachName}
                </div>
                <div className="text-xs text-gray-500">
                  {formatDateOnly(lesson.startTime)} · {formatHourRange(lesson.startTime, lesson.endTime)}
                </div>
                <div className="flex gap-2 items-center">
                  <select
                    value={pendingLessonBaySelection[lesson.id] ?? ''}
                    onChange={(e) =>
                      setPendingLessonBaySelection((prev) => ({ ...prev, [lesson.id]: e.target.value }))
                    }
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    <option value="">타석 선택</option>
                    {bays
                      .filter((b) => b.isActive)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {bayLabel(b)}
                        </option>
                      ))}
                  </select>
                  <Button
                    onClick={() => handleFinalizeLessonReservation(lesson)}
                    disabled={actioningId === lesson.id}
                    className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5"
                  >
                    확정 + 타석 블럭
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Cancel request alert */}
      {cancelRequestCount > 0 && (
        <div
          data-testid="cancel-request-alert"
          className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 rounded-xl px-4 py-3 text-sm"
        >          <Clock3 className="w-4 h-4 flex-shrink-0" />
          취소 요청 <strong>{cancelRequestCount}건</strong>이 처리를 기다리고 있습니다.
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
          <Filter className="w-4 h-4" />
          필터
        </div>

        {/* Date range */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500 flex-shrink-0">시작일</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
          </div>
          <span className="text-gray-400 text-sm">~</span>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500 flex-shrink-0">종료일</label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
          </div>
        </div>

        {/* Bay + status filter row */}
        <div className="flex flex-wrap gap-3">
          {/* Bay filter */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">타석</label>
            <select
              value={filterBayId}
              onChange={(e) => setFilterBayId(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            >
              <option value="ALL">전체 타석</option>
              {bays
                .filter((b) => b.isActive)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {bayLabel(b)}
                  </option>
                ))}
            </select>
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">상태</label>
            <select
              value={filterStatus}
              onChange={(e) =>
                setFilterStatus(e.target.value as BayReservationStatus | 'ALL')
              }
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            >
              <option value="ALL">전체 상태</option>
              <option value="CONFIRMED">예약 확정</option>
              <option value="CANCEL_REQUESTED">취소 요청</option>
              <option value="CANCELLED">취소됨</option>
              <option value="REJECTED">거절됨</option>
            </select>
          </div>

          <Button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm py-1.5 px-4"
          >
            <Search className="w-3.5 h-3.5" />
            조회
          </Button>
        </div>
      </div>

      {/* Results summary */}
      <p data-testid="reservation-summary" className="text-xs text-gray-500 px-1">
        총 <strong>{filtered.length}</strong>건의 예약이 있습니다.
      </p>

      {/* Reservation list */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          불러오는 중...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm gap-2">
          <Calendar className="w-10 h-10 text-gray-200" />
          해당 기간에 예약이 없습니다.
        </div>
      ) : (
        <ul className="space-y-3" role="list" aria-label="예약 목록">
          {filtered.map((res) => {
            const cfg = STATUS_CONFIG[res.status];
            const isActioning = actioningId === res.id;
            return (
              <li
                key={res.id}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden"
              >
                <div className="px-4 py-3 space-y-2">
                  {/* Status + Bay */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full border ${cfg.color}`}
                    >
                      {cfg.icon}
                      {cfg.label}
                    </span>
                    <span className="text-sm font-semibold text-gray-800">
                      {getBayLabel(res.bayId)}
                    </span>
                  </div>

                  {/* Date / time */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-sm text-gray-700">
                      <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span>{formatDateOnly(res.startTime)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-700">
                      <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span>{formatHourRange(res.startTime, res.endTime)}</span>
                    </div>
                  </div>

                  {/* Reserver info */}
                  <div className="space-y-0.5 pt-1 border-t border-gray-50">
                    <div className="flex items-center gap-1.5 text-sm text-gray-700">
                      <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span>{res.clientName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <Phone className="w-4 h-4 text-gray-300 flex-shrink-0" />
                      <span>{res.clientPhone}</span>
                    </div>
                    <div className="text-xs text-gray-400">
                      결제 포인트: {res.paidPoints}pt
                    </div>
                  </div>

                  {/* Cancel request actions */}
                  {res.status === 'CANCEL_REQUESTED' && (
                    <div className="flex gap-2 pt-2 border-t border-orange-100">
                      <button
                        onClick={() => handleApproveCancellation(res.id)}
                        disabled={isActioning}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 transition text-xs font-medium disabled:opacity-50"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        {isActioning ? '처리 중...' : '취소 승인'}
                      </button>
                      <button
                        onClick={() => handleRejectCancellation(res.id)}
                        disabled={isActioning}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-xs font-medium disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        {isActioning ? '처리 중...' : '취소 거절'}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
