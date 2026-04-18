import React, { useState, useEffect, useCallback } from 'react';
import { CoachProfile, LessonReservation, ReservationStatus, DayOfWeek, OpeningHours } from '../types';
import { reservationService } from '../services/reservationService';
import { firebaseService } from '../services/firebase';
import { Calendar, Clock, User, Phone, CheckCircle, XCircle, ArrowLeft, Filter, Settings, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

interface ReservationManagerProps {
  coachProfile: CoachProfile;
  onBack: () => void;
  initialDate?: string;          // pre-fill from calendar click
  onCoachUpdated?: (updated: CoachProfile) => void;
}

type TabType = 'SLOTS' | 'SETTINGS';

const DAY_LABELS: { key: DayOfWeek; label: string }[] = [
  { key: 'mon', label: '월' },
  { key: 'tue', label: '화' },
  { key: 'wed', label: '수' },
  { key: 'thu', label: '목' },
  { key: 'fri', label: '금' },
  { key: 'sat', label: '토' },
  { key: 'sun', label: '일' },
];

// Returns the DayOfWeek key for a given Date
const getDayKey = (date: Date): DayOfWeek => {
  const keys: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return keys[date.getDay()];
};

// Adds days to a date string (YYYY-MM-DD) and returns a new YYYY-MM-DD
const addDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

// Today as YYYY-MM-DD (local time)
const todayStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const ReservationManager: React.FC<ReservationManagerProps> = ({
  coachProfile,
  onBack,
  initialDate,
  onCoachUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('SLOTS');
  const [reservations, setReservations] = useState<LessonReservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<ReservationStatus | 'ALL'>('ALL');

  // ── Slot toggling ──────────────────────────────────────────────
  const [slotDate, setSlotDate] = useState<string>(initialDate || todayStr());
  const [togglingHours, setTogglingHours] = useState<Set<number>>(new Set());

  // ── Working schedule settings ──────────────────────────────────
  const [workingSchedule, setWorkingSchedule] = useState<OpeningHours>(
    coachProfile.workingSchedule ?? {}
  );
  const [savingSettings, setSavingSettings] = useState(false);

  const loadReservations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await reservationService.getCoachReservations(coachProfile.id);
      setReservations(data);
    } catch (error) {
      console.error('Failed to load reservations:', error);
    } finally {
      setLoading(false);
    }
  }, [coachProfile.id]);

  useEffect(() => {
    loadReservations();
  }, [loadReservations]);

  // Sync initialDate whenever it changes from outside
  useEffect(() => {
    if (initialDate) {
      setSlotDate(initialDate);
      setActiveTab('SLOTS');
    }
  }, [initialDate]);

  // ── Slot helpers ───────────────────────────────────────────────

  // Returns existing reservations for the current slotDate
  const reservationsForDate = reservations.filter((r) => {
    const rDate = r.startTime.slice(0, 10);
    return rDate === slotDate && r.status !== 'CANCELLED';
  });

  // Returns the set of occupied hours for slotDate
  const occupiedHours = new Set(
    reservationsForDate.map((r) => new Date(r.startTime).getHours())
  );

  // Working-hours range for slotDate
  const dayKey = getDayKey(new Date(slotDate + 'T00:00:00'));
  const daySchedule = workingSchedule[dayKey];

  const getWorkBoundaryHour = (
    entry: typeof daySchedule,
    field: 'open' | 'close',
    defaultHour: number
  ): number | null => {
    if (entry?.isClosed) return null;
    const raw = entry?.[field];
    return raw ? parseInt(raw.split(':')[0], 10) : defaultHour;
  };

  const workStart = getWorkBoundaryHour(daySchedule, 'open', 6);
  const workEnd   = getWorkBoundaryHour(daySchedule, 'close', 22);

  const handleToggleHourSlot = async (hour: number) => {
    if (togglingHours.has(hour)) return;
    setTogglingHours((prev) => new Set(prev).add(hour));
    try {
      await reservationService.toggleHourSlot(
        coachProfile.id,
        coachProfile.name,
        slotDate,
        hour
      );
      await loadReservations();
    } catch (err: any) {
      alert(err.message || '슬롯 변경에 실패했습니다.');
    } finally {
      setTogglingHours((prev) => {
        const next = new Set(prev);
        next.delete(hour);
        return next;
      });
    }
  };


  const handleApprove = async (reservationId: string) => {
    if (!confirm('이 예약을 승인하시겠습니까?')) return;
    try {
      await reservationService.approveReservation(reservationId);
      alert('예약이 승인되었습니다.');
      loadReservations();
    } catch (error: any) {
      alert(error.message || '승인에 실패했습니다.');
    }
  };

  const handleReject = async (reservationId: string) => {
    const reason = prompt('거부 사유를 입력해주세요 (선택사항):');
    if (reason === null) return;
    try {
      await reservationService.rejectReservation(reservationId, reason || undefined);
      alert('예약이 거부되었습니다.');
      loadReservations();
    } catch (error: any) {
      alert(error.message || '거부에 실패했습니다.');
    }
  };

  const handleCancel = async (reservationId: string) => {
    if (!confirm('이 예약을 취소하시겠습니까?')) return;
    try {
      await reservationService.cancelReservation(reservationId);
      alert('예약이 취소되었습니다.');
      loadReservations();
    } catch (error: any) {
      alert(error.message || '취소에 실패했습니다.');
    }
  };

  // ── Working-schedule settings ──────────────────────────────────

  const toggleDay = (day: DayOfWeek) => {
    setWorkingSchedule((prev) => {
      const entry = prev[day];
      if (!entry || entry.isClosed) {
        // Enable with default hours
        return { ...prev, [day]: { open: '09:00', close: '18:00', isClosed: false } };
      }
      return { ...prev, [day]: { ...entry, isClosed: true } };
    });
  };

  const setDayHours = (day: DayOfWeek, field: 'open' | 'close', value: string) => {
    setWorkingSchedule((prev) => ({
      ...prev,
      [day]: { ...(prev[day] ?? { open: '09:00', close: '18:00', isClosed: false }), [field]: value },
    }));
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const updated: CoachProfile = { ...coachProfile, workingSchedule };
      if (firebaseService.isInitialized()) {
        await firebaseService.saveCoach(updated);
      } else {
        localStorage.setItem('swingnote_coach_profile', JSON.stringify(updated));
      }
      if (onCoachUpdated) onCoachUpdated(updated);
      alert('근무 시간이 저장되었습니다.');
    } catch (err: any) {
      alert(err.message || '저장에 실패했습니다.');
    } finally {
      setSavingSettings(false);
    }
  };

  // ── Status helpers ─────────────────────────────────────────────

  const getStatusColor = (status: ReservationStatus) => {
    switch (status) {
      case 'AVAILABLE':  return 'bg-gray-100 text-gray-700 border-gray-300';
      case 'BLOCKED':    return 'bg-red-100 text-red-700 border-red-300';
      case 'PENDING':    return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'CONFIRMED':  return 'bg-green-100 text-green-700 border-green-300';
      case 'CANCELLED':  return 'bg-red-100 text-red-700 border-red-300';
      case 'COMPLETED':  return 'bg-blue-100 text-blue-700 border-blue-300';
      default:           return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getBorderColor = (status: ReservationStatus) => {
    switch (status) {
      case 'AVAILABLE':  return 'border-l-gray-300';
      case 'BLOCKED':    return 'border-l-red-400';
      case 'PENDING':    return 'border-l-yellow-400';
      case 'CONFIRMED':  return 'border-l-green-400';
      case 'CANCELLED':  return 'border-l-red-300';
      case 'COMPLETED':  return 'border-l-blue-400';
      default:           return 'border-l-gray-300';
    }
  };

  const getStatusText = (status: ReservationStatus) => {
    switch (status) {
      case 'AVAILABLE':  return '예약 가능';
      case 'BLOCKED':    return '블럭됨';
      case 'PENDING':    return '대기중';
      case 'CONFIRMED':  return '승인됨';
      case 'CANCELLED':  return '취소됨';
      case 'COMPLETED':  return '완료됨';
      default:           return status;
    }
  };

  const formatDateTime = (isoString: string) =>
    new Date(isoString).toLocaleString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const filteredReservations = filterStatus === 'ALL'
    ? reservations
    : reservations.filter((r) => r.status === filterStatus);

  const pendingCount   = reservations.filter((r) => r.status === 'PENDING').length;
  const confirmedCount = reservations.filter((r) => r.status === 'CONFIRMED').length;
  const blockedCount   = reservations.filter((r) => r.status === 'BLOCKED').length;

  // Hour grid range (06:00-22:00 by default, clamped to working hours)
  const DISPLAY_START = workStart ?? 6;
  const DISPLAY_END   = workEnd ?? 22;
  const hourRange = Array.from({ length: DISPLAY_END - DISPLAY_START }, (_, i) => DISPLAY_START + i);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
              aria-label="뒤로"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">예약 관리</h1>
              <p className="text-sm text-gray-500">{coachProfile.name} 코치</p>
            </div>
          </div>
          {/* Tab switcher */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setActiveTab('SLOTS')}
              className={`px-4 py-2 text-sm font-medium transition ${
                activeTab === 'SLOTS'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Calendar className="w-4 h-4 inline mr-1" />
              슬롯 관리
            </button>
            <button
              onClick={() => setActiveTab('SETTINGS')}
              className={`px-4 py-2 text-sm font-medium transition ${
                activeTab === 'SETTINGS'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Settings className="w-4 h-4 inline mr-1" />
              근무 시간 설정
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* ── SLOTS TAB ─────────────────────────────────────── */}
        {activeTab === 'SLOTS' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-xs text-gray-500 mb-1">전체</p>
                <p className="text-2xl font-bold text-gray-900">{reservations.length}</p>
              </div>
              <div className="bg-yellow-50 rounded-xl p-4 shadow-sm border border-yellow-100">
                <p className="text-xs text-yellow-600 mb-1">대기중</p>
                <p className="text-2xl font-bold text-yellow-800">{pendingCount}</p>
              </div>
              <div className="bg-green-50 rounded-xl p-4 shadow-sm border border-green-100">
                <p className="text-xs text-green-600 mb-1">승인됨</p>
                <p className="text-2xl font-bold text-green-800">{confirmedCount}</p>
              </div>
              <div className="bg-red-50 rounded-xl p-4 shadow-sm border border-red-100">
                <p className="text-xs text-red-500 mb-1">블럭됨</p>
                <p className="text-2xl font-bold text-red-800">{blockedCount}</p>
              </div>
            </div>

            {/* 1-hour slot manager */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                시간 슬롯 관리
              </h2>

              {/* Date navigator */}
              <div className="flex items-center gap-3 mb-5">
                <button
                  onClick={() => setSlotDate(addDays(slotDate, -1))}
                  className="p-2 rounded-lg hover:bg-gray-100 transition"
                  aria-label="이전 날"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                <input
                  type="date"
                  value={slotDate}
                  onChange={(e) => setSlotDate(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-center font-medium"
                  aria-label="날짜 선택"
                />
                <button
                  onClick={() => setSlotDate(addDays(slotDate, 1))}
                  className="p-2 rounded-lg hover:bg-gray-100 transition"
                  aria-label="다음 날"
                >
                  <ChevronRight className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              {daySchedule?.isClosed ? (
                <div className="text-center py-6 bg-red-50 rounded-lg text-red-600 text-sm font-medium">
                  휴무일로 설정된 날입니다. 근무 시간 설정에서 변경할 수 있습니다.
                </div>
              ) : (
                <>
                  {workStart !== null && workEnd !== null && (
                    <p className="text-xs text-gray-500 mb-3">
                      근무 시간: {String(workStart).padStart(2, '0')}:00 – {String(workEnd).padStart(2, '0')}:00
                      {' '}· 근무 시간은 기본으로 예약 가능합니다. 슬롯을 클릭하면 상태를 변경할 수 있습니다.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5 items-center mb-3 text-[11px] text-gray-500">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-300 text-emerald-700">예약 가능</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 border border-red-300 text-red-700">예약 불가</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-100 border border-yellow-300 text-yellow-700">대기중</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-100 border border-green-300 text-green-700">승인됨</span>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                    {hourRange.map((hour) => {
                      const isOccupied = occupiedHours.has(hour);
                      const isToggling = togglingHours.has(hour);
                      const reservation = reservationsForDate.find(
                        (r) => new Date(r.startTime).getHours() === hour
                      );
                      const isBooked =
                        reservation?.status === 'PENDING' ||
                        reservation?.status === 'CONFIRMED';
                      const isBlocked = reservation?.status === 'BLOCKED';

                      const statusBg = isBlocked
                        ? 'bg-red-100 border-red-300 text-red-700 hover:bg-red-200 cursor-pointer'
                        : reservation?.status === 'PENDING'
                        ? 'bg-yellow-100 border-yellow-300 text-yellow-700 cursor-default'
                        : reservation?.status === 'CONFIRMED'
                        ? 'bg-green-100 border-green-300 text-green-700 cursor-default'
                        : 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100 cursor-pointer';

                      return (
                        <button
                          key={hour}
                          data-testid={`slot-${hour}`}
                          disabled={isBooked || isToggling}
                          onClick={() => !isBooked && handleToggleHourSlot(hour)}
                          title={
                            isBooked
                              ? `${getStatusText(reservation?.status as ReservationStatus)} – ${reservation?.clientName || ''}`
                              : isBlocked
                              ? `${String(hour).padStart(2, '0')}:00 클릭 → 예약 가능으로 변경`
                              : `${String(hour).padStart(2, '0')}:00 클릭 → 예약 불가로 변경`
                          }
                          className={`relative rounded-lg border text-xs font-semibold py-3 transition ${statusBg} ${
                            isToggling ? 'opacity-60 cursor-wait' : ''
                          }`}
                          aria-label={`${String(hour).padStart(2, '0')}:00 슬롯`}
                        >
                          <span className="block">{String(hour).padStart(2, '0')}:00</span>
                          {isOccupied ? (
                            <span className="block text-[10px] leading-tight mt-0.5 truncate px-1">
                              {getStatusText(reservation?.status as ReservationStatus)}
                              {reservation?.clientName ? ` · ${reservation.clientName}` : ''}
                            </span>
                          ) : (
                            <span className="block text-[10px] leading-tight mt-0.5 opacity-70">예약 가능</span>
                          )}
                          {isToggling && (
                            <span className="absolute inset-0 flex items-center justify-center">
                              <span className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Reservation list */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
              {/* Filter bar */}
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 overflow-x-auto">
                <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
                {(['ALL', 'PENDING', 'CONFIRMED', 'AVAILABLE', 'BLOCKED'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition whitespace-nowrap ${
                      filterStatus === s
                        ? s === 'ALL'       ? 'bg-blue-600 text-white'
                        : s === 'PENDING'   ? 'bg-yellow-500 text-white'
                        : s === 'CONFIRMED' ? 'bg-green-600 text-white'
                        : s === 'BLOCKED'   ? 'bg-red-500 text-white'
                        :                     'bg-gray-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {s === 'ALL'       ? `전체 (${reservations.length})`
                    : s === 'PENDING'   ? `대기중 (${pendingCount})`
                    : s === 'CONFIRMED' ? `승인됨 (${confirmedCount})`
                    : s === 'AVAILABLE' ? '예약 가능'
                    :                     `블럭됨 (${blockedCount})`}
                  </button>
                ))}
              </div>

              <div className="divide-y divide-gray-100">
                {loading ? (
                  <div className="py-12 text-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto" />
                    <p className="text-gray-500 mt-3 text-sm">로딩 중...</p>
                  </div>
                ) : filteredReservations.length === 0 ? (
                  <div className="py-12 text-center">
                    <Calendar className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">
                      {filterStatus === 'ALL' ? '예약이 없습니다.' : `${getStatusText(filterStatus as ReservationStatus)} 예약이 없습니다.`}
                    </p>
                  </div>
                ) : (
                  filteredReservations.map((reservation) => (
                    <div
                      key={reservation.id}
                      className={`px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-l-4 ${getBorderColor(reservation.status)}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${getStatusColor(reservation.status)}`}>
                            {getStatusText(reservation.status)}
                          </span>
                          {reservation.lessonType && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                              {reservation.lessonType}
                            </span>
                          )}
                          {reservation.blockReason && (
                            <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                              {reservation.blockReason}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-gray-700 text-sm">
                          <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span>
                            {formatDateTime(reservation.startTime)}
                            {' – '}
                            {new Date(reservation.endTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {reservation.clientName && (
                          <div className="flex flex-wrap items-center gap-3 mt-1">
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <User className="w-3 h-3" />{reservation.clientName}
                            </span>
                            {reservation.clientPhone && (
                              <span className="flex items-center gap-1 text-xs text-gray-500">
                                <Phone className="w-3 h-3" />{reservation.clientPhone}
                              </span>
                            )}
                          </div>
                        )}
                        {reservation.notes && (
                          <p className="text-xs text-gray-500 mt-1 italic">{reservation.notes}</p>
                        )}
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        {reservation.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => handleApprove(reservation.id)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-xs font-medium"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />승인
                            </button>
                            <button
                              onClick={() => handleReject(reservation.id)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-xs font-medium"
                            >
                              <XCircle className="w-3.5 h-3.5" />거부
                            </button>
                          </>
                        )}
                        {(reservation.status === 'AVAILABLE' || reservation.status === 'CONFIRMED' || reservation.status === 'BLOCKED') && (
                          <button
                            onClick={() => handleCancel(reservation.id)}
                            className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg transition text-xs font-medium"
                          >
                            {reservation.status === 'BLOCKED' ? '해제' : '취소'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {/* ── SETTINGS TAB ──────────────────────────────────── */}
        {activeTab === 'SETTINGS' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-1">근무 요일 및 시간 설정</h2>
            <p className="text-xs text-gray-500 mb-6">
              설정된 근무 시간 외의 슬롯은 회원에게 노출되지 않습니다.
            </p>

            <div className="space-y-4">
              {DAY_LABELS.map(({ key, label }) => {
                const entry = workingSchedule[key];
                const isActive = !!(entry && !entry.isClosed);
                return (
                  <div
                    key={key}
                    className={`flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border transition ${
                      isActive ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    {/* Day toggle */}
                    <div className="flex items-center gap-3 sm:w-24 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleDay(key)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                          isActive ? 'bg-blue-600' : 'bg-gray-300'
                        }`}
                        role="switch"
                        aria-checked={isActive}
                        aria-label={`${label}요일 활성화`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                            isActive ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                      <span className={`text-sm font-semibold ${isActive ? 'text-blue-700' : 'text-gray-400'}`}>
                        {label}요일
                      </span>
                    </div>

                    {/* Hours */}
                    {isActive ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="time"
                          value={entry?.open ?? '09:00'}
                          onChange={(e) => setDayHours(key, 'open', e.target.value)}
                          className="flex-1 px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                          aria-label={`${label}요일 시작 시간`}
                        />
                        <span className="text-gray-400 text-sm">~</span>
                        <input
                          type="time"
                          value={entry?.close ?? '18:00'}
                          onChange={(e) => setDayHours(key, 'close', e.target.value)}
                          className="flex-1 px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                          aria-label={`${label}요일 종료 시간`}
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">휴무</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-6">
              <Button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="w-full sm:w-auto flex items-center gap-2 justify-center"
              >
                <Save className="w-4 h-4" />
                {savingSettings ? '저장 중...' : '근무 시간 저장'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

