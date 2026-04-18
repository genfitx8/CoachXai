import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './Button';
import {
  LogOut,
  Clock,
  CalendarOff,
  Building2,
  Save,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  LayoutGrid,
  CircleDollarSign,
} from 'lucide-react';
import { Branch, DayOfWeek, OpeningHours, OpeningHourEntry } from '../types';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { BayManager } from './BayManager';
import { BayPriceRuleManager } from './BayPriceRuleManager';

// ─── helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: '월요일',
  tue: '화요일',
  wed: '수요일',
  thu: '목요일',
  fri: '금요일',
  sat: '토요일',
  sun: '일요일',
};
const DAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const DEFAULT_ENTRY: OpeningHourEntry = { open: '09:00', close: '22:00', isClosed: false };

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// ─── types ────────────────────────────────────────────────────────────────────

interface BranchAdminDashboardProps {
  branchId: string;
  branchName: string;
  username: string;
  onLogout: () => void;
}

type Tab = 'hours' | 'holidays' | 'bays' | 'prices';

// ─── component ────────────────────────────────────────────────────────────────

export const BranchAdminDashboard: React.FC<BranchAdminDashboardProps> = ({
  branchId,
  branchName,
  username,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('hours');

  // Branch data
  const [branch, setBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Opening hours state (local edits)
  const [hoursState, setHoursState] = useState<Record<DayOfWeek, OpeningHourEntry>>(
    () =>
      DAYS.reduce(
        (acc, d) => ({ ...acc, [d]: { ...DEFAULT_ENTRY } }),
        {} as Record<DayOfWeek, OpeningHourEntry>
      )
  );
  const [hoursSaving, setHoursSaving] = useState(false);

  // Holidays state (local edits)
  const [holidays, setHolidays] = useState<string[]>([]);
  const [newHoliday, setNewHoliday] = useState('');
  const [holidaysSaving, setHolidaysSaving] = useState(false);

  // Feedback messages
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setErrorMsg(null);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setSuccessMsg(null);
    setTimeout(() => setErrorMsg(null), 5000);
  };

  // ── fetch branch ────────────────────────────────────────────────────────────

  const fetchBranch = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const branches = firebaseService.isInitialized()
        ? await firebaseService.getBranches()
        : storageService.getBranches();

      const found = branches.find((b) => b.id === branchId);
      if (!found) {
        setFetchError('지점 정보를 불러올 수 없습니다.');
        return;
      }
      setBranch(found);

      // Hydrate opening hours editor
      const initialHours: Record<DayOfWeek, OpeningHourEntry> = DAYS.reduce(
        (acc, d) => ({
          ...acc,
          [d]: found.openingHours?.[d] ?? { ...DEFAULT_ENTRY },
        }),
        {} as Record<DayOfWeek, OpeningHourEntry>
      );
      setHoursState(initialHours);
      setHolidays([...(found.holidays ?? [])].sort());
    } catch (e) {
      console.error('Failed to fetch branch data:', e);
      setFetchError('지점 정보를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    fetchBranch();
  }, [fetchBranch]);

  // ── update helpers ───────────────────────────────────────────────────────────

  const persistBranchFields = async (fields: Partial<Omit<Branch, 'id'>>) => {
    if (firebaseService.isInitialized()) {
      await firebaseService.updateBranch(branchId, fields);
    } else {
      storageService.updateBranch(branchId, fields);
    }
    // Reflect locally
    setBranch((prev) => (prev ? { ...prev, ...fields, updatedAt: Date.now() } : prev));
  };

  // ── save opening hours ───────────────────────────────────────────────────────

  const handleSaveHours = async () => {
    // Validate: open < close for all non-closed days
    for (const d of DAYS) {
      const entry = hoursState[d];
      if (!entry.isClosed) {
        if (timeToMinutes(entry.open) >= timeToMinutes(entry.close)) {
          showError(`${DAY_LABELS[d]}: 오픈 시간이 마감 시간보다 빠르거나 같습니다.`);
          return;
        }
      }
    }

    setHoursSaving(true);
    try {
      const openingHours: OpeningHours = {};
      for (const d of DAYS) {
        openingHours[d] = hoursState[d];
      }
      await persistBranchFields({ openingHours });
      showSuccess('운영시간이 저장되었습니다.');
    } catch (e) {
      console.error('Failed to save opening hours:', e);
      showError('운영시간 저장 중 오류가 발생했습니다.');
    } finally {
      setHoursSaving(false);
    }
  };

  // ── save holidays ────────────────────────────────────────────────────────────

  const handleAddHoliday = () => {
    if (!newHoliday) return;
    if (holidays.includes(newHoliday)) {
      showError('이미 등록된 휴무일입니다.');
      return;
    }
    const updated = [...holidays, newHoliday].sort();
    setHolidays(updated);
    setNewHoliday('');
  };

  const handleRemoveHoliday = (date: string) => {
    setHolidays((prev) => prev.filter((d) => d !== date));
  };

  const handleSaveHolidays = async () => {
    setHolidaysSaving(true);
    try {
      await persistBranchFields({ holidays });
      showSuccess('휴무일이 저장되었습니다.');
    } catch (e) {
      console.error('Failed to save holidays:', e);
      showError('휴무일 저장 중 오류가 발생했습니다.');
    } finally {
      setHolidaysSaving(false);
    }
  };

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center">
              <Building2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-lg leading-tight">{branchName}</h1>
              <p className="text-xs text-gray-500">{username} · 지점 관리자</p>
            </div>
          </div>
          <Button
            onClick={onLogout}
            className="bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm py-2 px-4 flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            로그아웃
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 space-y-4">
        {/* Welcome */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-2xl p-5 text-white shadow-md">
          <p className="text-emerald-100 text-sm mb-1">안녕하세요, {username}님</p>
          <h2 className="text-xl font-bold">{branchName} 관리 대시보드</h2>
        </div>

        {/* Feedback banners */}
        {successMsg && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Loading / Error */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
            불러오는 중...
          </div>
        ) : fetchError ? (
          <div className="flex items-center justify-center py-20 text-red-500 text-sm">
            {fetchError}
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-200">
              <button
                onClick={() => setActiveTab('hours')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'hours'
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Clock className="w-4 h-4" />
                운영시간 관리
              </button>
              <button
                onClick={() => setActiveTab('holidays')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'holidays'
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <CalendarOff className="w-4 h-4" />
                휴무일 관리
              </button>
              <button
                onClick={() => setActiveTab('bays')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'bays'
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                타석 관리
              </button>
              <button
                onClick={() => setActiveTab('prices')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'prices'
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <CircleDollarSign className="w-4 h-4" />
                가격 관리
              </button>
            </div>

            {/* Tab: Opening Hours */}
            {activeTab === 'hours' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                <h3 className="font-bold text-gray-900">운영시간 설정</h3>
                <div className="space-y-3">
                  {DAYS.map((day) => {
                    const entry = hoursState[day];
                    return (
                      <div
                        key={day}
                        className="flex flex-wrap items-center gap-3 py-3 border-b border-gray-50 last:border-0"
                      >
                        <span className="w-16 text-sm font-medium text-gray-700 flex-shrink-0">
                          {DAY_LABELS[day]}
                        </span>

                        {/* Closed toggle */}
                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={!!entry.isClosed}
                            onChange={(e) =>
                              setHoursState((prev) => ({
                                ...prev,
                                [day]: { ...prev[day], isClosed: e.target.checked },
                              }))
                            }
                            className="w-4 h-4 accent-emerald-500"
                          />
                          <span className="text-sm text-gray-600">휴무</span>
                        </label>

                        {/* Time inputs */}
                        {!entry.isClosed && (
                          <>
                            <div className="flex items-center gap-1.5">
                              <label className="text-xs text-gray-500">오픈</label>
                              <input
                                type="time"
                                value={entry.open}
                                onChange={(e) =>
                                  setHoursState((prev) => ({
                                    ...prev,
                                    [day]: { ...prev[day], open: e.target.value },
                                  }))
                                }
                                className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                              />
                            </div>
                            <span className="text-gray-400 text-sm">~</span>
                            <div className="flex items-center gap-1.5">
                              <label className="text-xs text-gray-500">마감</label>
                              <input
                                type="time"
                                value={entry.close}
                                onChange={(e) =>
                                  setHoursState((prev) => ({
                                    ...prev,
                                    [day]: { ...prev[day], close: e.target.value },
                                  }))
                                }
                                className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                              />
                            </div>
                          </>
                        )}

                        {entry.isClosed && (
                          <span className="text-sm text-gray-400 italic">휴무일</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <Button
                  onClick={handleSaveHours}
                  disabled={hoursSaving}
                  className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm py-2.5 px-5 w-full justify-center"
                >
                  <Save className="w-4 h-4" />
                  {hoursSaving ? '저장 중...' : '운영시간 저장'}
                </Button>
              </div>
            )}

            {/* Tab: Holidays */}
            {activeTab === 'holidays' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                <h3 className="font-bold text-gray-900">휴무일 설정</h3>

                {/* Add holiday */}
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={newHoliday}
                    onChange={(e) => setNewHoliday(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                  <Button
                    onClick={handleAddHoliday}
                    disabled={!newHoliday}
                    className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm py-2 px-4"
                  >
                    <Plus className="w-4 h-4" />
                    추가
                  </Button>
                </div>

                {/* Holiday list */}
                {holidays.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">
                    등록된 휴무일이 없습니다.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {holidays.map((date) => (
                      <li
                        key={date}
                        className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5"
                      >
                        <span className="text-sm font-medium text-gray-700">{date}</span>
                        <button
                          onClick={() => handleRemoveHoliday(date)}
                          className="text-red-400 hover:text-red-600 transition-colors"
                          aria-label={`${date} 삭제`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <Button
                  onClick={handleSaveHolidays}
                  disabled={holidaysSaving}
                  className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm py-2.5 px-5 w-full justify-center"
                >
                  <Save className="w-4 h-4" />
                  {holidaysSaving ? '저장 중...' : '휴무일 저장'}
                </Button>
              </div>
            )}

            {/* Tab: Bays */}
            {activeTab === 'bays' && (
              <BayManager
                branchId={branchId}
                onSuccess={showSuccess}
                onError={showError}
              />
            )}

            {/* Tab: Prices */}
            {activeTab === 'prices' && (
              <BayPriceRuleManager
                branchId={branchId}
                onSuccess={showSuccess}
                onError={showError}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
};
