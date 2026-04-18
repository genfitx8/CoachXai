import React, { useState, useEffect, useCallback } from 'react';
import { Branch, Bay, CoachProfile } from '../types';
import {
  bayReservationService,
  TimeSlot,
  AvailableBay,
} from '../services/bayReservationService';
import { ArrowLeft, MapPin, Calendar, Clock, Target, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { Button } from './Button';

interface CoachBayReservationProps {
  coachProfile: CoachProfile;
  onBack: () => void;
  onCoachUpdated: (updatedCoach: CoachProfile) => void;
}

type Step = 'SELECT_BRANCH' | 'SELECT_DATE' | 'SELECT_SLOT' | 'SELECT_BAY' | 'CONFIRM' | 'SUCCESS';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00 ~ ${String(hour + 1).padStart(2, '0')}:00`;
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const CoachBayReservation: React.FC<CoachBayReservationProps> = ({
  coachProfile,
  onBack,
  onCoachUpdated,
}) => {
  const [step, setStep] = useState<Step>('SELECT_BRANCH');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(todayString());
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [availableBays, setAvailableBays] = useState<AvailableBay[]>([]);
  const [selectedBayEntry, setSelectedBayEntry] = useState<AvailableBay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedReservation, setConfirmedReservation] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const list = await bayReservationService.getActiveBranches();
        setBranches(list);
      } catch (e) {
        setError('지점 정보를 불러오는 데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const loadTimeSlots = useCallback(async (branch: Branch, date: string) => {
    setLoading(true);
    setError(null);
    setTimeSlots([]);
    try {
      const slots = await bayReservationService.getAvailableTimeSlots(branch.id, date);
      setTimeSlots(slots);
      if (slots.length === 0) {
        setError('해당 날짜에 이용 가능한 시간대가 없습니다. (휴무일이거나 운영 시간이 없습니다)');
      }
    } catch (e) {
      setError('시간대 정보를 불러오는 데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAvailableBays = useCallback(async (branch: Branch, date: string, startHour: number) => {
    setLoading(true);
    setError(null);
    setAvailableBays([]);
    try {
      const bays = await bayReservationService.getAvailableBays(branch.id, date, startHour);
      setAvailableBays(bays);
      if (bays.length === 0) {
        setError('선택한 시간대에 예약 가능한 타석이 없습니다.');
      }
    } catch (e) {
      setError('타석 정보를 불러오는 데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelectBranch = (branch: Branch) => {
    setSelectedBranch(branch);
    setSelectedDate(todayString());
    setSelectedSlot(null);
    setSelectedBayEntry(null);
    setError(null);
    setStep('SELECT_DATE');
  };

  const handleSelectDate = async () => {
    if (!selectedBranch || !selectedDate) return;
    await loadTimeSlots(selectedBranch, selectedDate);
    setSelectedSlot(null);
    setSelectedBayEntry(null);
    setStep('SELECT_SLOT');
  };

  const handleSelectSlot = async (slot: TimeSlot) => {
    if (!selectedBranch) return;
    if (slot.pricePoints === null) {
      setError('해당 시간대의 가격이 설정되지 않아 예약할 수 없습니다.');
      return;
    }
    setSelectedSlot(slot);
    setSelectedBayEntry(null);
    setError(null);
    await loadAvailableBays(selectedBranch, selectedDate, slot.startHour);
    setStep('SELECT_BAY');
  };

  const handleSelectBay = (entry: AvailableBay) => {
    setSelectedBayEntry(entry);
    setError(null);
    setStep('CONFIRM');
  };

  const handleConfirm = async () => {
    if (!selectedBranch || !selectedSlot || !selectedBayEntry) return;
    setLoading(true);
    setError(null);
    try {
      const { reservation, updatedCoach } = await bayReservationService.createCoachBayReservation({
        branch: selectedBranch,
        bay: selectedBayEntry.bay,
        date: selectedDate,
        startHour: selectedSlot.startHour,
        coach: coachProfile,
      });
      setConfirmedReservation(reservation);
      onCoachUpdated(updatedCoach);
      setStep('SUCCESS');
    } catch (e: any) {
      setError(e?.message ?? '예약에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep('SELECT_BRANCH');
    setSelectedBranch(null);
    setSelectedDate(todayString());
    setSelectedSlot(null);
    setSelectedBayEntry(null);
    setConfirmedReservation(null);
    setError(null);
  };

  const stepLabels: { key: Step; label: string }[] = [
    { key: 'SELECT_BRANCH', label: '지점' },
    { key: 'SELECT_DATE', label: '날짜' },
    { key: 'SELECT_SLOT', label: '시간' },
    { key: 'SELECT_BAY', label: '타석' },
    { key: 'CONFIRM', label: '확인' },
  ];

  const currentStepIdx = stepLabels.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="font-bold text-lg text-gray-900">타석 예약</h1>
          <div className="ml-auto text-sm text-gray-500">
            보유 포인트: <span className="font-bold text-emerald-600">{(coachProfile.currentPoints ?? 0).toLocaleString()}pt</span>
          </div>
        </div>

        {/* Step indicator */}
        {step !== 'SUCCESS' && (
          <div className="max-w-lg mx-auto px-4 pb-3 flex items-center gap-1">
            {stepLabels.map((s, idx) => (
              <React.Fragment key={s.key}>
                <div
                  className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-colors ${
                    idx < currentStepIdx
                      ? 'bg-emerald-500 text-white'
                      : idx === currentStepIdx
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {idx < currentStepIdx ? '✓' : idx + 1}
                </div>
                <span
                  className={`text-[11px] font-medium ${
                    idx === currentStepIdx ? 'text-emerald-700' : 'text-gray-400'
                  }`}
                >
                  {s.label}
                </span>
                {idx < stepLabels.length - 1 && (
                  <div className={`flex-1 h-px ${idx < currentStepIdx ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Error message */}
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader className="w-8 h-8 text-emerald-500 animate-spin" />
          </div>
        )}

        {/* SELECT_BRANCH */}
        {!loading && step === 'SELECT_BRANCH' && (
          <div className="space-y-3">
            <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-600" />
              지점을 선택하세요
            </h2>
            {branches.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">이용 가능한 지점이 없습니다.</p>
            ) : (
              branches.map((branch) => (
                <button
                  key={branch.id}
                  onClick={() => handleSelectBranch(branch)}
                  className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-3.5 hover:border-emerald-400 hover:bg-emerald-50 transition-all group"
                >
                  <div className="font-semibold text-gray-900 group-hover:text-emerald-700">{branch.name}</div>
                  {branch.timeZone && (
                    <div className="text-xs text-gray-400 mt-0.5">{branch.timeZone}</div>
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {/* SELECT_DATE */}
        {!loading && step === 'SELECT_DATE' && selectedBranch && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              날짜를 선택하세요
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">선택된 지점</div>
              <div className="font-semibold text-gray-800">{selectedBranch.name}</div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">예약 날짜</label>
              <input
                type="date"
                value={selectedDate}
                min={todayString()}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              {selectedDate && (
                <div className="text-xs text-gray-500 mt-1">{formatDate(selectedDate)}</div>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setStep('SELECT_BRANCH')} className="flex-1 bg-gray-100 text-gray-700 hover:bg-gray-200">
                이전
              </Button>
              <Button
                onClick={handleSelectDate}
                disabled={!selectedDate}
                className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                다음
              </Button>
            </div>
          </div>
        )}

        {/* SELECT_SLOT */}
        {!loading && step === 'SELECT_SLOT' && (
          <div className="space-y-3">
            <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600" />
              시간을 선택하세요
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl p-3 text-sm">
              <span className="text-gray-500">{selectedBranch?.name}</span>
              <span className="mx-2 text-gray-300">|</span>
              <span className="font-medium text-gray-700">{selectedDate && formatDate(selectedDate)}</span>
            </div>
            {timeSlots.length === 0 && !error && (
              <p className="text-sm text-gray-500 text-center py-8">이용 가능한 시간대가 없습니다.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {timeSlots.map((slot) => {
                const hasPrice = slot.pricePoints !== null;
                return (
                  <button
                    key={slot.startHour}
                    onClick={() => handleSelectSlot(slot)}
                    disabled={!hasPrice}
                    className={`rounded-xl px-3 py-3 text-left transition-all border ${
                      hasPrice
                        ? 'bg-white border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 cursor-pointer'
                        : 'bg-gray-50 border-gray-100 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <div className="font-semibold text-sm text-gray-800">{formatHour(slot.startHour)}</div>
                    <div className={`text-xs mt-0.5 font-medium ${hasPrice ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {hasPrice ? `${slot.pricePoints?.toLocaleString()}pt` : '가격 미설정'}
                    </div>
                  </button>
                );
              })}
            </div>
            <Button onClick={() => setStep('SELECT_DATE')} className="w-full bg-gray-100 text-gray-700 hover:bg-gray-200">
              이전
            </Button>
          </div>
        )}

        {/* SELECT_BAY */}
        {!loading && step === 'SELECT_BAY' && selectedSlot && (
          <div className="space-y-3">
            <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-600" />
              타석을 선택하세요
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl p-3 text-sm space-y-1">
              <div>
                <span className="text-gray-500">지점: </span>
                <span className="font-medium">{selectedBranch?.name}</span>
              </div>
              <div>
                <span className="text-gray-500">일시: </span>
                <span className="font-medium">{formatDate(selectedDate)} {formatHour(selectedSlot.startHour)}</span>
              </div>
              <div>
                <span className="text-gray-500">요금: </span>
                <span className="font-bold text-emerald-600">{selectedSlot.pricePoints?.toLocaleString()}pt</span>
              </div>
            </div>
            {availableBays.length === 0 && !error && (
              <p className="text-sm text-gray-500 text-center py-8">예약 가능한 타석이 없습니다.</p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {availableBays.map(({ bay }) => (
                <button
                  key={bay.id}
                  onClick={() => handleSelectBay({ bay, pricePoints: selectedSlot.pricePoints! })}
                  className="bg-white border border-gray-200 rounded-xl p-3 text-center hover:border-emerald-400 hover:bg-emerald-50 transition-all"
                >
                  <div className="font-bold text-gray-800">{bay.floor}F</div>
                  <div className="text-sm text-gray-600">{bay.roomNumber}번</div>
                </button>
              ))}
            </div>
            <Button onClick={() => setStep('SELECT_SLOT')} className="w-full bg-gray-100 text-gray-700 hover:bg-gray-200">
              이전
            </Button>
          </div>
        )}

        {/* CONFIRM */}
        {!loading && step === 'CONFIRM' && selectedBranch && selectedSlot && selectedBayEntry && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-gray-800">예약을 확인해주세요</h2>
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              <div className="px-4 py-3 flex justify-between">
                <span className="text-sm text-gray-500">지점</span>
                <span className="text-sm font-medium text-gray-800">{selectedBranch.name}</span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-sm text-gray-500">날짜</span>
                <span className="text-sm font-medium text-gray-800">{formatDate(selectedDate)}</span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-sm text-gray-500">시간</span>
                <span className="text-sm font-medium text-gray-800">{formatHour(selectedSlot.startHour)}</span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-sm text-gray-500">타석</span>
                <span className="text-sm font-medium text-gray-800">
                  {selectedBayEntry.bay.floor}층 {selectedBayEntry.bay.roomNumber}번
                </span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-sm text-gray-500">차감 포인트</span>
                <span className="text-sm font-bold text-red-500">-{selectedBayEntry.pricePoints.toLocaleString()}pt</span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-sm text-gray-500">예약 후 잔여</span>
                <span className="text-sm font-bold text-emerald-600">
                  {((coachProfile.currentPoints ?? 0) - selectedBayEntry.pricePoints).toLocaleString()}pt
                </span>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={() => setStep('SELECT_BAY')} className="flex-1 bg-gray-100 text-gray-700 hover:bg-gray-200">
                이전
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                예약 확정
              </Button>
            </div>
          </div>
        )}

        {/* SUCCESS */}
        {step === 'SUCCESS' && confirmedReservation && selectedBranch && selectedSlot && selectedBayEntry && (
          <div className="space-y-6 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-9 h-9 text-emerald-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">예약 완료!</h2>
              <p className="text-sm text-gray-500">타석 예약이 성공적으로 완료되었습니다.</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 text-left">
              <div className="px-4 py-3 flex justify-between">
                <span className="text-sm text-gray-500">예약번호</span>
                <span className="text-xs font-mono text-gray-600 truncate max-w-[60%]">{confirmedReservation.id}</span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-sm text-gray-500">지점</span>
                <span className="text-sm font-medium text-gray-800">{selectedBranch.name}</span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-sm text-gray-500">날짜</span>
                <span className="text-sm font-medium text-gray-800">{formatDate(selectedDate)}</span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-sm text-gray-500">시간</span>
                <span className="text-sm font-medium text-gray-800">{formatHour(selectedSlot.startHour)}</span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-sm text-gray-500">타석</span>
                <span className="text-sm font-medium text-gray-800">
                  {selectedBayEntry.bay.floor}층 {selectedBayEntry.bay.roomNumber}번
                </span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-sm text-gray-500">차감 포인트</span>
                <span className="text-sm font-bold text-red-500">-{selectedBayEntry.pricePoints.toLocaleString()}pt</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleReset} className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700">
                추가 예약하기
              </Button>
              <Button onClick={onBack} className="flex-1 bg-gray-100 text-gray-700 hover:bg-gray-200">
                닫기
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
