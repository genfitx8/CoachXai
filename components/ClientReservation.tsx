import React, { useState, useEffect } from 'react';
import { ClientProfile, LessonReservation, ReservationStatus } from '../types';
import { reservationService, VIRTUAL_SLOT_ID_PREFIX } from '../services/reservationService';
import { Calendar, Clock, User, ArrowLeft, Filter, XCircle } from 'lucide-react';
import { Button } from './Button';
import { createLogger } from '../utils/logger';

const log = createLogger('clientReservation');

interface ClientReservationProps {
  clientProfile: ClientProfile;
  onBack: () => void;
}

export const ClientReservation: React.FC<ClientReservationProps> = ({ clientProfile, onBack }) => {
  const [availableSlots, setAvailableSlots] = useState<LessonReservation[]>([]);
  const [myReservations, setMyReservations] = useState<LessonReservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'AVAILABLE' | 'MY_RESERVATIONS'>('AVAILABLE');
  const [selectedSlot, setSelectedSlot] = useState<LessonReservation | null>(null);
  const [notes, setNotes] = useState('');
  const [filterStatus, setFilterStatus] = useState<ReservationStatus | 'ALL'>('ALL');
  
  // Form state for direct time input
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestDate, setRequestDate] = useState('');
  const [requestStartTime, setRequestStartTime] = useState('');
  const [requestEndTime, setRequestEndTime] = useState('');
  const [requestNotes, setRequestNotes] = useState('');

  // Date-based available slot state
  const [dateSlotsForDate, setDateSlotsForDate] = useState<LessonReservation[]>([]);
  const [loadingDateSlots, setLoadingDateSlots] = useState(false);
  const [selectedDateSlot, setSelectedDateSlot] = useState<LessonReservation | null>(null);

  const clientId = `${clientProfile.name}_${clientProfile.phone}`;
  const coachId = clientProfile.coachId || '';

  const loadAvailableSlots = async () => {
    if (!coachId) {
      alert('담당 코치가 지정되지 않았습니다.');
      return;
    }

    setLoading(true);
    try {
      const data = await reservationService.getAvailableSlots(coachId);
      setAvailableSlots(data);
    } catch (error) {
      log.error('Failed to load available slots:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMyReservations = async () => {
    setLoading(true);
    try {
      const data = await reservationService.getClientReservations(clientId);
      setMyReservations(data);
    } catch (error) {
      log.error('Failed to load my reservations:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (view === 'AVAILABLE') {
      loadAvailableSlots();
    } else {
      loadMyReservations();
    }
  }, [view, clientProfile, coachId]);

  const handleRequestReservation = async () => {
    if (!selectedSlot) return;

    try {
      await reservationService.requestReservation(
        selectedSlot.id,
        clientId,
        clientProfile.name,
        clientProfile.phone,
        notes || undefined
      );

      alert('예약 요청이 완료되었습니다. 코치의 승인을 기다려주세요.');
      setSelectedSlot(null);
      setNotes('');
      loadAvailableSlots();
    } catch (error: any) {
      alert(error.message || '예약 요청에 실패했습니다.');
    }
  };

  const loadSlotsForDate = async (date: string) => {
    if (!date || !coachId) {
      setDateSlotsForDate([]);
      return;
    }

    setLoadingDateSlots(true);
    try {
      // Use working-hour based availability (includes virtual default-available slots)
      const slots = await reservationService.getAvailableWorkingHourSlots(coachId, date);
      setDateSlotsForDate(slots);
    } catch (error) {
      log.error('Failed to load slots for date:', error);
      // Fallback to explicit available slots only
      try {
        const fallback = await reservationService.getAvailableSlots(
          coachId,
          `${date}T00:00:00`,
          `${date}T23:59:59`
        );
        setDateSlotsForDate(fallback);
      } catch {
        setDateSlotsForDate([]);
      }
    } finally {
      setLoadingDateSlots(false);
    }
  };

  const handleDateChange = (date: string) => {
    setRequestDate(date);
    setSelectedDateSlot(null);
    setRequestStartTime('');
    setRequestEndTime('');
    loadSlotsForDate(date);
  };

  const handleTimeSlotSelect = (slot: LessonReservation) => {
    if (selectedDateSlot?.id === slot.id) {
      // Deselect if clicking the same slot
      setSelectedDateSlot(null);
      setRequestStartTime('');
      setRequestEndTime('');
    } else {
      setSelectedDateSlot(slot);
      const st = new Date(slot.startTime);
      const et = new Date(slot.endTime);
      setRequestStartTime(
        `${String(st.getHours()).padStart(2, '0')}:${String(st.getMinutes()).padStart(2, '0')}`
      );
      setRequestEndTime(
        `${String(et.getHours()).padStart(2, '0')}:${String(et.getMinutes()).padStart(2, '0')}`
      );
    }
  };

  const handleRequestWithTime = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!requestDate || !requestStartTime || !requestEndTime) {
      alert('날짜와 시간을 모두 입력해주세요.');
      return;
    }

    if (!coachId || !clientProfile.designatedCoach) {
      alert('담당 코치가 지정되지 않았습니다.');
      return;
    }

    try {
      if (selectedDateSlot && !selectedDateSlot.id.startsWith(VIRTUAL_SLOT_ID_PREFIX)) {
        // Use the pre-set explicit available slot
        await reservationService.requestReservation(
          selectedDateSlot.id,
          clientId,
          clientProfile.name,
          clientProfile.phone,
          requestNotes || undefined
        );
      } else {
        // Direct time input or virtual working-hour slot
        const startDateTime = `${requestDate}T${requestStartTime}:00`;
        const endDateTime = `${requestDate}T${requestEndTime}:00`;
        await reservationService.requestReservationWithTime(
          coachId,
          clientProfile.designatedCoach,
          clientId,
          clientProfile.name,
          clientProfile.phone,
          startDateTime,
          endDateTime,
          requestNotes || undefined
        );
      }

      alert('예약 요청이 완료되었습니다. 코치의 승인을 기다려주세요.');
      setShowRequestForm(false);
      setRequestDate('');
      setRequestStartTime('');
      setRequestEndTime('');
      setRequestNotes('');
      setSelectedDateSlot(null);
      setDateSlotsForDate([]);
      loadMyReservations();
    } catch (error: any) {
      alert(error.message || '예약 요청에 실패했습니다.');
    }
  };

  const handleCancelReservation = async (reservationId: string) => {
    if (!confirm('이 예약을 취소하시겠습니까?')) return;

    try {
      await reservationService.cancelReservation(reservationId);
      alert('예약이 취소되었습니다.');
      loadMyReservations();
    } catch (error: any) {
      alert(error.message || '취소에 실패했습니다.');
    }
  };

  const getStatusColor = (status: ReservationStatus) => {
    switch (status) {
      case 'AVAILABLE':
        return 'bg-bg-overlay text-ink-high border-line-default';
      case 'BLOCKED':
        return 'bg-red-500/15 text-red-300 border-red-500/30';
      case 'PENDING':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'CONFIRMED':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      case 'CANCELLED':
        return 'bg-red-500/15 text-red-300 border-red-500/30';
      case 'COMPLETED':
        return 'bg-interactive-500/15 text-interactive-300 border-interactive-500/30';
      default:
        return 'bg-bg-overlay text-ink-high border-line-default';
    }
  };

  const getBorderColor = (status: ReservationStatus) => {
    switch (status) {
      case 'AVAILABLE':
        return 'border-line-subtle';
      case 'BLOCKED':
        return 'border-red-200';
      case 'PENDING':
        return 'border-yellow-100';
      case 'CONFIRMED':
        return 'border-green-100';
      case 'CANCELLED':
        return 'border-red-100';
      case 'COMPLETED':
        return 'border-blue-100';
      default:
        return 'border-line-subtle';
    }
  };

  const getStatusText = (status: ReservationStatus) => {
    switch (status) {
      case 'AVAILABLE':
        return '예약 가능';
      case 'BLOCKED':
        return '블럭됨';
      case 'PENDING':
        return '승인 대기중';
      case 'CONFIRMED':
        return '승인됨';
      case 'CANCELLED':
        return '취소됨';
      case 'COMPLETED':
        return '완료됨';
      default:
        return status;
    }
  };

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filteredReservations = filterStatus === 'ALL'
    ? myReservations
    : myReservations.filter(r => r.status === filterStatus);

  return (
    <div className="min-h-screen bg-bg-base safe-top safe-bottom">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label="뒤로 가기"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line-default bg-bg-overlay/60 text-ink-high transition-colors hover:border-line-strong hover:bg-bg-overlay"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-2xs uppercase tracking-[0.18em] text-primary-300/80 font-semibold">
              Reservation
            </p>
            <h1 className="text-display-sm font-semibold text-ink-high tracking-tight">레슨 예약</h1>
            <p className="mt-0.5 text-sm text-ink-muted">
              {clientProfile.designatedCoach ? `${clientProfile.designatedCoach} 코치` : '담당 코치를 지정해주세요'}
            </p>
          </div>
        </div>

        {/* View Toggle — segmented control */}
        <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-bg-inset p-1">
          <button
            onClick={() => setView('AVAILABLE')}
            aria-pressed={view === 'AVAILABLE'}
            className={`h-10 rounded-lg text-sm font-medium transition-all ${
              view === 'AVAILABLE'
                ? 'bg-bg-overlay text-ink-high shadow-elev-1'
                : 'text-ink-muted hover:text-ink-high'
            }`}
          >
            레슨 예약하기
          </button>
          <button
            onClick={() => setView('MY_RESERVATIONS')}
            aria-pressed={view === 'MY_RESERVATIONS'}
            className={`h-10 rounded-lg text-sm font-medium transition-all ${
              view === 'MY_RESERVATIONS'
                ? 'bg-bg-overlay text-ink-high shadow-elev-1'
                : 'text-ink-muted hover:text-ink-high'
            }`}
          >
            내 예약
          </button>
        </div>

        {/* Content */}
        {view === 'AVAILABLE' ? (
          <div className="space-y-4">
            {!coachId ? (
              <div className="bg-bg-raised rounded-lg shadow-sm p-12 text-center">
                <User className="w-16 h-16 text-ink-muted mx-auto mb-4" />
                <p className="text-ink-medium mb-2">담당 코치가 지정되지 않았습니다.</p>
                <p className="text-sm text-ink-muted">프로필에서 담당 코치를 지정해주세요.</p>
              </div>
            ) : (
              <>
                {/* New Request Form */}
                {!showRequestForm ? (
                  <div className="bg-bg-raised rounded-lg shadow-sm p-8 text-center">
                    <Calendar className="w-16 h-16 text-interactive-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-ink-high mb-2">레슨 예약하기</h3>
                    <p className="text-ink-medium mb-6">
                      원하시는 날짜와 시간을 선택해주세요.<br />
                      블럭된 시간을 제외한 모든 시간에 예약을 요청할 수 있습니다.
                    </p>
                    <Button onClick={() => setShowRequestForm(true)} className="mx-auto">
                      예약 신청하기
                    </Button>
                  </div>
                ) : (
                  <div className="bg-bg-raised rounded-lg shadow-md p-6">
                    <h2 className="text-lg font-semibold mb-4">레슨 예약 신청</h2>
                    <form onSubmit={handleRequestWithTime} className="space-y-4">
                      <div>
                        <label htmlFor="request-date" className="block text-sm font-medium text-ink-high mb-1">
                          날짜
                        </label>
                        <input
                          id="request-date"
                          type="date"
                          value={requestDate}
                          onChange={(e) => handleDateChange(e.target.value)}
                          className="w-full px-3 py-2 border border-line-default rounded-lg focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>

                      {/* Time slot boxes shown after date is selected */}
                      {requestDate && (
                        <div>
                          <label className="block text-sm font-medium text-ink-high mb-2">
                            예약 가능한 시간대
                          </label>
                          {loadingDateSlots ? (
                            <div className="text-center py-4">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto" />
                            </div>
                          ) : dateSlotsForDate.length > 0 ? (
                            <div
                              data-testid="time-slot-grid"
                              className="grid grid-cols-2 sm:grid-cols-3 gap-2"
                            >
                              {dateSlotsForDate.map((slot) => {
                                const startLabel = new Date(slot.startTime).toLocaleTimeString(
                                  'ko-KR',
                                  { hour: '2-digit', minute: '2-digit' }
                                );
                                const endLabel = new Date(slot.endTime).toLocaleTimeString(
                                  'ko-KR',
                                  { hour: '2-digit', minute: '2-digit' }
                                );
                                const isSelected = selectedDateSlot?.id === slot.id;
                                return (
                                  <button
                                    key={slot.id}
                                    type="button"
                                    data-testid={`time-slot-${slot.id}`}
                                    aria-pressed={isSelected}
                                    onClick={() => handleTimeSlotSelect(slot)}
                                    className={`rounded-lg border p-3 text-center transition-all ${
                                      isSelected
                                        ? 'border-primary-500/40 bg-primary-500/15 text-primary-200 shadow-elev-1'
                                        : 'border-line-default bg-bg-raised text-ink-high hover:border-line-strong hover:bg-bg-overlay'
                                    }`}
                                  >
                                    <div className="font-medium text-sm">{startLabel}</div>
                                    <div className="text-xs mt-0.5">~ {endLabel}</div>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-sm text-ink-medium bg-bg-base rounded-lg p-3">
                              선택한 날짜에 예약 가능한 시간대가 없습니다.<br />
                              아래에서 원하는 시간을 직접 입력하세요.
                            </p>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="request-start-time" className="block text-sm font-medium text-ink-high mb-1">
                            시작 시간
                          </label>
                          <input
                            id="request-start-time"
                            type="time"
                            value={requestStartTime}
                            onChange={(e) => {
                              setRequestStartTime(e.target.value);
                              setSelectedDateSlot(null);
                            }}
                            className="w-full px-3 py-2 border border-line-default rounded-lg focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>
                        <div>
                          <label htmlFor="request-end-time" className="block text-sm font-medium text-ink-high mb-1">
                            종료 시간
                          </label>
                          <input
                            id="request-end-time"
                            type="time"
                            value={requestEndTime}
                            onChange={(e) => {
                              setRequestEndTime(e.target.value);
                              setSelectedDateSlot(null);
                            }}
                            className="w-full px-3 py-2 border border-line-default rounded-lg focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-ink-high mb-1">
                          요청 메모 (선택사항)
                        </label>
                        <textarea
                          value={requestNotes}
                          onChange={(e) => setRequestNotes(e.target.value)}
                          placeholder="코치에게 전달할 메시지를 입력하세요"
                          className="w-full px-3 py-2 border border-line-default rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                          rows={3}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" className="flex-1">
                          예약 요청
                        </Button>
                        <button
                          type="button"
                          onClick={() => setShowRequestForm(false)}
                          className="px-4 py-2 text-ink-high hover:bg-bg-overlay rounded-lg transition"
                        >
                          취소
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Filter for My Reservations */}
            <div className="bg-bg-raised rounded-lg shadow-sm p-4">
              <div className="flex items-center gap-2 overflow-x-auto">
                <Filter className="w-4 h-4 text-ink-medium flex-shrink-0" />
                <button
                  onClick={() => setFilterStatus('ALL')}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition whitespace-nowrap ${
                    filterStatus === 'ALL' ? 'bg-primary-500 text-white' : 'bg-bg-overlay text-ink-high hover:bg-bg-inset'
                  }`}
                >
                  전체
                </button>
                <button
                  onClick={() => setFilterStatus('PENDING')}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition whitespace-nowrap ${
                    filterStatus === 'PENDING' ? 'bg-yellow-500 text-white' : 'bg-bg-overlay text-ink-high hover:bg-bg-inset'
                  }`}
                >
                  대기중
                </button>
                <button
                  onClick={() => setFilterStatus('CONFIRMED')}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition whitespace-nowrap ${
                    filterStatus === 'CONFIRMED' ? 'bg-green-500 text-white' : 'bg-bg-overlay text-ink-high hover:bg-bg-inset'
                  }`}
                >
                  승인됨
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                <p className="text-ink-medium mt-4">로딩 중...</p>
              </div>
            ) : filteredReservations.length === 0 ? (
              <div className="bg-bg-raised rounded-lg shadow-sm p-12 text-center">
                <Calendar className="w-16 h-16 text-ink-muted mx-auto mb-4" />
                <p className="text-ink-medium">
                  {filterStatus === 'ALL' ? '예약 내역이 없습니다.' : `${getStatusText(filterStatus as ReservationStatus)} 예약이 없습니다.`}
                </p>
              </div>
            ) : (
              filteredReservations.map((reservation) => (
                <div
                  key={reservation.id}
                  className={`bg-bg-raised rounded-lg shadow-sm p-4 border-l-4 ${getBorderColor(reservation.status)}`}
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-1 rounded text-xs font-semibold border ${getStatusColor(reservation.status)}`}>
                          {getStatusText(reservation.status)}
                        </span>
                        {reservation.lessonType && (
                          <span className="px-2 py-1 bg-interactive-500/15 text-interactive-300 rounded text-xs font-semibold">
                            {reservation.lessonType}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-ink-high mb-1">
                        <Clock className="w-4 h-4 text-ink-medium" />
                        <span className="font-medium">
                          {formatDateTime(reservation.startTime)} - {new Date(reservation.endTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-ink-medium text-sm">
                        <User className="w-4 h-4 text-ink-muted" />
                        <span>{reservation.coachName} 코치</span>
                      </div>
                      {reservation.notes && (
                        <p className="text-sm text-ink-medium mt-2 italic">{reservation.notes}</p>
                      )}
                    </div>
                    {(reservation.status === 'PENDING' || reservation.status === 'CONFIRMED') && (
                      <button
                        onClick={() => handleCancelReservation(reservation.id)}
                        className="flex items-center gap-1 px-3 py-2 text-red-400 hover:bg-red-500/10 rounded-lg transition text-sm"
                      >
                        <XCircle className="w-4 h-4" />
                        취소
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Reservation Modal */}
      {selectedSlot && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-bg-raised rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">레슨 예약</h2>
            
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 text-ink-high">
                <Clock className="w-4 h-4 text-ink-medium" />
                <span className="text-sm">
                  {formatDateTime(selectedSlot.startTime)} - {new Date(selectedSlot.endTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="flex items-center gap-2 text-ink-high">
                <User className="w-4 h-4 text-ink-medium" />
                <span className="text-sm">{selectedSlot.coachName} 코치</span>
              </div>
              {selectedSlot.lessonType && (
                <div className="text-sm">
                  <span className="text-ink-medium">레슨 종류:</span>{' '}
                  <span className="font-medium">{selectedSlot.lessonType}</span>
                </div>
              )}
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-ink-high mb-2">
                요청 메모 (선택사항)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="코치에게 전달할 메시지를 입력하세요"
                className="w-full px-3 py-2 border border-line-default rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                rows={3}
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleRequestReservation} className="flex-1">
                예약 요청
              </Button>
              <button
                onClick={() => {
                  setSelectedSlot(null);
                  setNotes('');
                }}
                className="px-4 py-2 text-ink-high hover:bg-bg-overlay rounded-lg transition"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
