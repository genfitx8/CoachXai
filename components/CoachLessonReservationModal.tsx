import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CoachProfile, ClientProfile, Branch, BayReservation } from '../types';
import { reservationService } from '../services/reservationService';
import { bayReservationService, AvailableBay, TimeSlot } from '../services/bayReservationService';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { X, Search, User, Clock, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from './Button';

interface CoachLessonReservationModalProps {
  coachProfile: CoachProfile;
  initialDate: string;   // "YYYY-MM-DD"
  initialHour: number;   // 0-23
  onClose: () => void;
  onSaved: () => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

function formatHour(h: number) {
  return `${pad(h)}:00`;
}

export const CoachLessonReservationModal: React.FC<CoachLessonReservationModalProps> = ({
  coachProfile,
  initialDate,
  initialHour,
  onClose,
  onSaved,
}) => {
  // ── Member search ──────────────────────────────────────────────────────────
  const [memberQuery, setMemberQuery] = useState('');
  const [memberResults, setMemberResults] = useState<ClientProfile[]>([]);
  const [allClients, setAllClients] = useState<ClientProfile[]>([]);
  const [selectedMember, setSelectedMember] = useState<ClientProfile | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Lesson details ─────────────────────────────────────────────────────────
  const [date, setDate] = useState(initialDate);
  const [hour, setHour] = useState(initialHour);
  const [notes, setNotes] = useState('');

  // ── Bay reservation (optional) ────────────────────────────────────────────
  const [includeBay, setIncludeBay] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [bayDate, setBayDate] = useState(initialDate);
  const [bayHour, setBayHour] = useState(initialHour);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [availableBays, setAvailableBays] = useState<AvailableBay[]>([]);
  const [selectedBayEntry, setSelectedBayEntry] = useState<AvailableBay | null>(null);
  const [bayLoading, setBayLoading] = useState(false);
  const [bayError, setBayError] = useState<string | null>(null);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── Load clients on mount ──────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setSearchLoading(true);
      try {
        let clients: ClientProfile[];
        if (firebaseService.isInitialized()) {
          clients = await firebaseService.getClients();
        } else {
          clients = storageService.getClients();
        }
        // Filter to clients of this coach only (if coachId is set on client)
        const filtered = clients.filter(
          (c) => !c.coachId || c.coachId === coachProfile.id
        );
        setAllClients(filtered);
      } catch {
        // silently fall back to empty list
      } finally {
        setSearchLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachProfile.id]);

  // ── Load branches when bay section is opened ───────────────────────────────
  useEffect(() => {
    if (!includeBay) return;
    bayReservationService.getActiveBranches().then(setBranches).catch(() => {
      setBayError('지점 정보를 불러오는 데 실패했습니다.');
    });
  }, [includeBay]);

  // ── Load time slots when branch + bayDate change ───────────────────────────
  const loadTimeSlots = useCallback(async (branch: Branch, d: string) => {
    setBayLoading(true);
    setBayError(null);
    setTimeSlots([]);
    setAvailableBays([]);
    setSelectedBayEntry(null);
    try {
      const slots = await bayReservationService.getAvailableTimeSlots(branch.id, d);
      setTimeSlots(slots);
      if (slots.length === 0) {
        setBayError('해당 날짜에 이용 가능한 시간대가 없습니다.');
      }
    } catch {
      setBayError('시간대 정보를 불러오는 데 실패했습니다.');
    } finally {
      setBayLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBranch && includeBay) {
      loadTimeSlots(selectedBranch, bayDate);
    }
  }, [selectedBranch, bayDate, includeBay, loadTimeSlots]);

  // ── Load available bays when a time slot is chosen ─────────────────────────
  const handleSelectTimeSlot = async (slot: TimeSlot) => {
    if (!selectedBranch) return;
    if (slot.pricePoints === null) {
      setBayError('해당 시간대의 가격이 설정되지 않아 예약할 수 없습니다.');
      return;
    }
    setBayHour(slot.startHour);
    setSelectedBayEntry(null);
    setBayLoading(true);
    setBayError(null);
    try {
      const bays = await bayReservationService.getAvailableBays(
        selectedBranch.id,
        bayDate,
        slot.startHour
      );
      setAvailableBays(bays);
      if (bays.length === 0) {
        setBayError('선택한 시간대에 예약 가능한 타석이 없습니다.');
      }
    } catch {
      setBayError('타석 정보를 불러오는 데 실패했습니다.');
    } finally {
      setBayLoading(false);
    }
  };

  // ── Member search filter ───────────────────────────────────────────────────
  useEffect(() => {
    const q = memberQuery.trim();
    if (!q) {
      setMemberResults([]);
      return;
    }
    const lower = q.toLowerCase();
    setMemberResults(
      allClients.filter(
        (c) =>
          c.name.toLowerCase().includes(lower) ||
          c.phone.replace(/-/g, '').includes(q.replace(/-/g, ''))
      ).slice(0, 10)
    );
  }, [memberQuery, allClients]);

  const handleSelectMember = (member: ClientProfile) => {
    setSelectedMember(member);
    setMemberQuery('');
    setMemberResults([]);
    setSelectedBayEntry(null);
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedMember) {
      setError('회원을 선택해주세요.');
      return;
    }

    setLoading(true);
    setError(null);

    const startTime = `${date}T${pad(hour)}:00:00`;
    const endTime = `${date}T${pad(hour + 1)}:00:00`;
    const clientId = `${selectedMember.name}_${selectedMember.phone}`;

    try {
      await reservationService.createCoachMadeLessonReservation(
        coachProfile.id,
        coachProfile.name,
        clientId,
        selectedMember.name,
        selectedMember.phone,
        startTime,
        endTime,
        notes || undefined
      );

      let bayResult: { reservation: BayReservation; updatedClient: ClientProfile } | null = null;
      if (includeBay && selectedBranch && selectedBayEntry) {
        try {
          bayResult = await bayReservationService.createReservation({
            branch: selectedBranch,
            bay: selectedBayEntry.bay,
            date: bayDate,
            startHour: bayHour,
            client: selectedMember,
          });
        } catch (bayErr: any) {
          // Bay reservation failed — lesson reservation already succeeded.
          setSuccessMsg(
            `레슨 예약이 완료되었습니다.\n타석 예약 실패: ${bayErr.message || '알 수 없는 오류'}`
          );
          setLoading(false);
          return;
        }
      }

      const parts = ['레슨 예약이 완료되었습니다.'];
      if (bayResult) {
        parts.push('타석 예약도 함께 완료되었습니다.');
      }
      setSuccessMsg(parts.join(' '));
      setLoading(false);
    } catch (err: any) {
      setError(err.message || '예약 생성에 실패했습니다.');
      setLoading(false);
    }
  };

  // ── After success: close and refresh ──────────────────────────────────────
  const handleDone = () => {
    onSaved();
    onClose();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (successMsg) {
    return (
      <>
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={handleDone}
        />
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center">
            <div className="mb-4 text-green-600">
              <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-gray-800 whitespace-pre-line mb-6">{successMsg}</p>
            <Button onClick={handleDone} className="w-full">확인</Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
            <h2 className="text-lg font-semibold text-gray-900">회원 레슨 예약 등록</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="닫기"
            >
              <X size={22} />
            </button>
          </div>

          <div className="px-6 py-5 space-y-6">
            {/* ── Member search ── */}
            <section>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <User size={14} className="inline mr-1 text-gray-500" />
                회원 검색 <span className="text-red-500">*</span>
              </label>

              {selectedMember ? (
                <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  <div>
                    <p className="font-medium text-blue-900">{selectedMember.name}</p>
                    <p className="text-xs text-blue-600">{selectedMember.phone}</p>
                  </div>
                  <button
                    onClick={() => setSelectedMember(null)}
                    className="text-blue-400 hover:text-blue-700 transition-colors ml-2"
                    aria-label="회원 선택 취소"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <Search size={16} className="text-gray-400" />
                  </div>
                  <input
                    ref={searchRef}
                    type="text"
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                    placeholder="이름 또는 전화번호로 검색"
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {searchLoading && (
                    <div className="absolute inset-y-0 right-3 flex items-center">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {memberResults.length > 0 && (
                    <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {memberResults.map((m) => (
                        <li key={`${m.name}_${m.phone}`}>
                          <button
                            className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors flex items-center justify-between"
                            onClick={() => handleSelectMember(m)}
                          >
                            <span className="font-medium text-gray-900">{m.name}</span>
                            <span className="text-xs text-gray-500 ml-2">{m.phone}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {memberQuery.trim() && memberResults.length === 0 && !searchLoading && (
                    <p className="mt-1 text-xs text-gray-500">검색 결과가 없습니다.</p>
                  )}
                </div>
              )}
            </section>

            {/* ── Lesson details ── */}
            <section>
              <p className="text-sm font-medium text-gray-700 mb-2">
                <Clock size={14} className="inline mr-1 text-gray-500" />
                레슨 일시
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">날짜</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">시작 시간 (1시간)</label>
                  <select
                    value={hour}
                    onChange={(e) => setHour(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {formatHour(i)} ~ {formatHour((i + 1) % 24)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* ── Notes ── */}
            <section>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                메모 (선택)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="레슨 내용이나 요청사항을 입력하세요"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </section>

            {/* ── Optional bay reservation ── */}
            <section className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  setIncludeBay((v) => !v);
                  setBayError(null);
                  setSelectedBayEntry(null);
                }}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
              >
                <span className="flex items-center gap-2">
                  <MapPin size={14} className="text-gray-500" />
                  타석도 함께 예약하기 (선택)
                </span>
                {includeBay ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {includeBay && (
                <div className="px-4 py-4 space-y-4 border-t border-gray-200">
                  {/* Branch */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">지점 선택</label>
                    <select
                      value={selectedBranch?.id ?? ''}
                      onChange={(e) => {
                        const b = branches.find((br) => br.id === e.target.value) ?? null;
                        setSelectedBranch(b);
                        setTimeSlots([]);
                        setAvailableBays([]);
                        setSelectedBayEntry(null);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">-- 지점 선택 --</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Bay date */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">날짜</label>
                    <input
                      type="date"
                      value={bayDate}
                      onChange={(e) => {
                        setBayDate(e.target.value);
                        setAvailableBays([]);
                        setSelectedBayEntry(null);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* Time slots */}
                  {selectedBranch && timeSlots.length > 0 && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">시간대</label>
                      <div className="grid grid-cols-3 gap-2">
                        {timeSlots.map((slot) => (
                          <button
                            key={slot.startHour}
                            type="button"
                            onClick={() => handleSelectTimeSlot(slot)}
                            disabled={slot.pricePoints === null}
                            className={`px-2 py-1.5 rounded text-xs border transition-colors ${
                              bayHour === slot.startHour && availableBays.length > 0
                                ? 'bg-blue-600 text-white border-blue-600'
                                : slot.pricePoints === null
                                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                            }`}
                          >
                            {formatHour(slot.startHour)}
                            {slot.pricePoints !== null && (
                              <span className="block text-gray-400">{slot.pricePoints}pt</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Available bays */}
                  {availableBays.length > 0 && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">타석 선택</label>
                      <div className="grid grid-cols-2 gap-2">
                        {availableBays.map((entry) => (
                          <button
                            key={entry.bay.id}
                            type="button"
                            onClick={() => setSelectedBayEntry(entry)}
                            className={`px-3 py-2 rounded border text-xs text-left transition-colors ${
                              selectedBayEntry?.bay.id === entry.bay.id
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                            }`}
                          >
                            <span className="font-medium">{entry.bay.floor}층 {entry.bay.roomNumber}번</span>
                            <span className="block text-opacity-80">{entry.pricePoints}pt</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {bayLoading && (
                    <div className="flex justify-center py-2">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}

                  {bayError && (
                    <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{bayError}</p>
                  )}

                  {includeBay && selectedBranch && !selectedBayEntry && !bayLoading && (
                    <p className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-2">
                      타석을 선택하지 않으면 레슨 예약만 등록됩니다.
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* ── Error ── */}
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</p>
            )}

            {/* ── Actions ── */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={loading || !selectedMember}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : null}
                예약 등록
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
