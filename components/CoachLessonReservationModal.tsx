import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CoachProfile, ClientProfile, Branch, BayReservation } from '../types';
import { reservationService } from '../services/reservationService';
import { bayReservationService, AvailableBay, TimeSlot } from '../services/bayReservationService';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { CheckCircle, ChevronDown, ChevronUp, Clock, MapPin, Search, User, X } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './ui/Modal';

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

const formInputFieldClass =
  'w-full px-3 py-2.5 border border-line-default rounded-xl text-sm bg-bg-overlay text-ink-high outline-none transition-colors focus:border-primary-500 focus:shadow-ring-primary';
const formSectionTitleClass = 'text-sm font-semibold text-ink-high mb-2';

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
      <Modal
        open
        onClose={handleDone}
        title={
          <span className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-500/15 text-primary-300">
              <CheckCircle className="h-5 w-5" />
            </span>
            예약 등록 완료
          </span>
        }
        size="sm"
        footer={
          <Button onClick={handleDone} fullWidth>
            확인
          </Button>
        }
      >
        <p className="whitespace-pre-line text-sm text-ink-medium">{successMsg}</p>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="회원 레슨 예약 등록" size="lg">
      <div className="space-y-6">
            {/* ── Member search ── */}
            <section>
              <label className="block text-sm font-medium text-ink-high mb-1.5">
                <User size={14} className="inline mr-1 text-ink-muted" />
                회원 검색 <span className="text-red-500">*</span>
              </label>

              {selectedMember ? (
                <div className="flex items-center justify-between bg-primary-500/10 border border-primary-500/30 rounded-xl px-3 py-2">
                  <div>
                    <p className="font-medium text-primary-200">{selectedMember.name}</p>
                    <p className="text-xs text-primary-300">{selectedMember.phone}</p>
                  </div>
                  <button
                    onClick={() => setSelectedMember(null)}
                    className="text-primary-300 hover:text-primary-100 transition-colors ml-2"
                    aria-label="회원 선택 취소"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <Search size={16} className="text-ink-muted" />
                  </div>
                  <input
                    ref={searchRef}
                    type="text"
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                    placeholder="이름 또는 전화번호로 검색"
                    className={`${formInputFieldClass} pl-9`}
                  />
                  {searchLoading && (
                    <div className="absolute inset-y-0 right-3 flex items-center">
                      <div className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {memberResults.length > 0 && (
                    <ul className="absolute z-20 mt-1 w-full bg-bg-overlay border border-line-default rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {memberResults.map((m) => (
                        <li key={`${m.name}_${m.phone}`}>
                          <button
                            className="w-full text-left px-4 py-2.5 hover:bg-bg-overlay transition-colors flex items-center justify-between"
                            onClick={() => handleSelectMember(m)}
                          >
                            <span className="font-medium text-ink-high">{m.name}</span>
                            <span className="text-xs text-ink-muted ml-2">{m.phone}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {memberQuery.trim() && memberResults.length === 0 && !searchLoading && (
                    <p className="mt-1 text-xs text-ink-muted">검색 결과가 없습니다.</p>
                  )}
                </div>
              )}
            </section>

            {/* ── Lesson details ── */}
            <section>
              <p className={formSectionTitleClass}>
                <Clock size={14} className="inline mr-1 text-ink-muted" />
                레슨 일시
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-ink-muted mb-1">날짜</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={formInputFieldClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-ink-muted mb-1">시작 시간 (1시간)</label>
                  <select
                    value={hour}
                    onChange={(e) => setHour(Number(e.target.value))}
                    className={formInputFieldClass}
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
              <label className={formSectionTitleClass}>
                메모 (선택)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="레슨 내용이나 요청사항을 입력하세요"
                rows={2}
                className={`${formInputFieldClass} resize-none`}
              />
            </section>

            {/* ── Optional bay reservation ── */}
            <section className="border border-line-default rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  setIncludeBay((v) => !v);
                  setBayError(null);
                  setSelectedBayEntry(null);
                }}
                className="w-full flex items-center justify-between px-4 py-3 bg-bg-overlay hover:bg-bg-inset transition-colors text-sm font-medium text-ink-high"
              >
                <span className="flex items-center gap-2">
                  <MapPin size={14} className="text-ink-muted" />
                  타석도 함께 예약하기 (선택)
                </span>
                {includeBay ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {includeBay && (
                <div className="px-4 py-4 space-y-4 border-t border-line-default">
                  {/* Branch */}
                  <div>
                    <label className="block text-xs text-ink-muted mb-1">지점 선택</label>
                    <select
                      value={selectedBranch?.id ?? ''}
                      onChange={(e) => {
                        const b = branches.find((br) => br.id === e.target.value) ?? null;
                        setSelectedBranch(b);
                        setTimeSlots([]);
                        setAvailableBays([]);
                        setSelectedBayEntry(null);
                      }}
                      className={formInputFieldClass}
                    >
                      <option value="">-- 지점 선택 --</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Bay date */}
                  <div>
                    <label className="block text-xs text-ink-muted mb-1">날짜</label>
                    <input
                      type="date"
                      value={bayDate}
                      onChange={(e) => {
                        setBayDate(e.target.value);
                        setAvailableBays([]);
                        setSelectedBayEntry(null);
                      }}
                      className={formInputFieldClass}
                    />
                  </div>

                  {/* Time slots */}
                  {selectedBranch && timeSlots.length > 0 && (
                    <div>
                      <label className="block text-xs text-ink-muted mb-1">시간대</label>
                      <div className="grid grid-cols-3 gap-2">
                        {timeSlots.map((slot) => (
                          <button
                            key={slot.startHour}
                            type="button"
                            onClick={() => handleSelectTimeSlot(slot)}
                            disabled={slot.pricePoints === null}
                            className={`px-2 py-1.5 rounded text-xs border transition-colors ${
                              bayHour === slot.startHour && availableBays.length > 0
                                ? 'bg-primary-500 text-white border-primary-500'
                                : slot.pricePoints === null
                                ? 'bg-bg-overlay text-ink-muted border-line-default cursor-not-allowed'
                                : 'bg-bg-overlay text-ink-high border-line-default hover:border-primary-500'
                            }`}
                          >
                            {formatHour(slot.startHour)}
                            {slot.pricePoints !== null && (
                              <span className="block text-ink-muted">{slot.pricePoints}pt</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Available bays */}
                  {availableBays.length > 0 && (
                    <div>
                      <label className="block text-xs text-ink-muted mb-1">타석 선택</label>
                      <div className="grid grid-cols-2 gap-2">
                        {availableBays.map((entry) => (
                          <button
                            key={entry.bay.id}
                            type="button"
                            onClick={() => setSelectedBayEntry(entry)}
                            className={`px-3 py-2 rounded border text-xs text-left transition-colors ${
                              selectedBayEntry?.bay.id === entry.bay.id
                                ? 'bg-primary-500 text-white border-primary-500'
                                : 'bg-bg-overlay text-ink-high border-line-default hover:border-primary-500'
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
                      <div className="w-5 h-5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}

                  {bayError && (
                    <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{bayError}</p>
                  )}

                  {includeBay && selectedBranch && !selectedBayEntry && !bayLoading && (
                    <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                      타석을 선택하지 않으면 레슨 예약만 등록됩니다.
                    </p>
                  )}
                </div>
              )}
            </section>

        {/* ── Error ── */}
        {error && (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        {/* ── Actions ── */}
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            취소
          </Button>
          <Button
            onClick={handleSave}
            isLoading={loading}
            disabled={!selectedMember}
            className="flex-1"
          >
            예약 등록
          </Button>
        </div>
      </div>
    </Modal>
  );
};
