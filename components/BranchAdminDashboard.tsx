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
  ClipboardList,
  Gift,
} from 'lucide-react';
import { Branch, DayOfWeek, OpeningHours, OpeningHourEntry } from '../types';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { useLanguage } from './LanguageContext';
import { BayManager } from './BayManager';
import { BayPriceRuleManager } from './BayPriceRuleManager';
import { BranchReservationStatus } from './BranchReservationStatus';
import { BranchMemberPointGrant } from './BranchMemberPointGrant';
import { createLogger } from '../utils/logger';

const log = createLogger('branchAdminDashboard');

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

type Tab = 'hours' | 'holidays' | 'bays' | 'prices' | 'reservations' | 'points';

// ─── component ────────────────────────────────────────────────────────────────

export const BranchAdminDashboard: React.FC<BranchAdminDashboardProps> = ({
  branchId,
  branchName,
  username,
  onLogout,
}) => {
  const { t } = useLanguage();
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
        setFetchError(t('branch_fetch_error'));
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
      log.error('Failed to fetch branch data:', e);
      setFetchError(t('branch_fetch_error2'));
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
          showError(t('branch_hours_time_error').replace('{day}', DAY_LABELS[d]));
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
      showSuccess(t('branch_hours_save_success'));
    } catch (e) {
      log.error('Failed to save opening hours:', e);
      showError(t('branch_hours_save_error'));
    } finally {
      setHoursSaving(false);
    }
  };

  // ── save holidays ────────────────────────────────────────────────────────────

  const handleAddHoliday = () => {
    if (!newHoliday) return;
    if (holidays.includes(newHoliday)) {
      showError(t('branch_holiday_duplicate'));
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
      showSuccess(t('branch_holiday_save_success'));
    } catch (e) {
      log.error('Failed to save holidays:', e);
      showError(t('branch_holiday_save_error'));
    } finally {
      setHolidaysSaving(false);
    }
  };

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-bg-base flex flex-col">
      {/* Header */}
      <header className="bg-bg-raised border-b border-line-default sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary-500/15 rounded-full flex items-center justify-center">
              <Building2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="font-bold text-ink-high text-lg leading-tight">{branchName}</h1>
              <p className="text-xs text-ink-medium">{username} · {t('branch_manager_label')}</p>
            </div>
          </div>
          <Button
            onClick={onLogout}
            className="bg-bg-overlay text-ink-high hover:bg-bg-inset text-sm py-2 px-4 flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            {t('branch_logout_btn')}
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 space-y-4">
        {/* Welcome */}
        <div className="bg-gradient-to-r from-emerald-800 to-emerald-700 rounded-2xl p-5 text-white shadow-md">
          <p className="text-emerald-100 text-sm mb-1">{t('branch_greeting').replace('{name}', username)}</p>
          <h2 className="text-xl font-bold">{t('branch_dashboard_subtitle').replace('{name}', branchName)}</h2>
        </div>

        {/* Feedback banners */}
        {successMsg && (
          <div className="flex items-center gap-2 bg-primary-500/10 border border-emerald-200 text-primary-300 rounded-xl px-4 py-3 text-sm">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-200 text-red-300 rounded-xl px-4 py-3 text-sm">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Loading / Error */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-ink-medium text-sm">
            {t('branch_loading')}
          </div>
        ) : fetchError ? (
          <div className="flex items-center justify-center py-20 text-red-500 text-sm">
            {fetchError}
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-2 border-b border-line-default">
              <button
                onClick={() => setActiveTab('hours')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'hours'
                    ? 'border-emerald-700 text-emerald-600'
                    : 'border-transparent text-ink-medium hover:text-ink-high'
                }`}
              >
                <Clock className="w-4 h-4" />
                {t('branch_hours_management')}
              </button>
              <button
                onClick={() => setActiveTab('holidays')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'holidays'
                    ? 'border-emerald-700 text-emerald-600'
                    : 'border-transparent text-ink-medium hover:text-ink-high'
                }`}
              >
                <CalendarOff className="w-4 h-4" />
                {t('branch_holidays_management')}
              </button>
              <button
                onClick={() => setActiveTab('bays')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'bays'
                    ? 'border-emerald-700 text-emerald-600'
                    : 'border-transparent text-ink-medium hover:text-ink-high'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                {t('branch_bay_management')}
              </button>
              <button
                onClick={() => setActiveTab('prices')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'prices'
                    ? 'border-emerald-700 text-emerald-600'
                    : 'border-transparent text-ink-medium hover:text-ink-high'
                }`}
              >
                <CircleDollarSign className="w-4 h-4" />
                {t('branch_price_management')}
              </button>
              <button
                onClick={() => setActiveTab('reservations')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'reservations'
                    ? 'border-emerald-700 text-emerald-600'
                    : 'border-transparent text-ink-medium hover:text-ink-high'
                }`}
              >
                <ClipboardList className="w-4 h-4" />
                {t('branch_reservation_status')}
              </button>
              <button
                onClick={() => setActiveTab('points')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'points'
                    ? 'border-emerald-700 text-emerald-600'
                    : 'border-transparent text-ink-medium hover:text-ink-high'
                }`}
              >
                <Gift className="w-4 h-4" />
                {t('branch_point_give')}
              </button>
            </div>

            {/* Tab: Opening Hours */}
            {activeTab === 'hours' && (
              <div className="bg-bg-raised rounded-2xl border border-line-subtle shadow-sm p-5 space-y-4">
                <h3 className="font-bold text-ink-high">{t('branch_hours_settings')}</h3>
                <div className="space-y-3">
                  {DAYS.map((day) => {
                    const entry = hoursState[day];
                    return (
                      <div
                        key={day}
                        className="flex flex-wrap items-center gap-3 py-3 border-b border-gray-50 last:border-0"
                      >
                        <span className="w-16 text-sm font-medium text-ink-high flex-shrink-0">
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
                            className="w-4 h-4 accent-emerald-700"
                          />
                          <span className="text-sm text-ink-medium">{t('branch_day_off')}</span>
                        </label>

                        {/* Time inputs */}
                        {!entry.isClosed && (
                          <>
                            <div className="flex items-center gap-1.5">
                              <label className="text-xs text-ink-medium">{t('branch_open_time')}</label>
                              <input
                                type="time"
                                value={entry.open}
                                onChange={(e) =>
                                  setHoursState((prev) => ({
                                    ...prev,
                                    [day]: { ...prev[day], open: e.target.value },
                                  }))
                                }
                                className="border border-line-default rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                              />
                            </div>
                            <span className="text-ink-muted text-sm">~</span>
                            <div className="flex items-center gap-1.5">
                              <label className="text-xs text-ink-medium">{t('branch_close_time')}</label>
                              <input
                                type="time"
                                value={entry.close}
                                onChange={(e) =>
                                  setHoursState((prev) => ({
                                    ...prev,
                                    [day]: { ...prev[day], close: e.target.value },
                                  }))
                                }
                                className="border border-line-default rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                              />
                            </div>
                          </>
                        )}

                        {entry.isClosed && (
                          <span className="text-sm text-ink-muted italic">{t('branch_day_off')}</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <Button
                  onClick={handleSaveHours}
                  disabled={hoursSaving}
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm py-2.5 px-5 w-full justify-center"
                >
                  <Save className="w-4 h-4" />
                  {hoursSaving ? t('branch_save_hours_saving') : t('branch_save_hours')}
                </Button>
              </div>
            )}

            {/* Tab: Holidays */}
            {activeTab === 'holidays' && (
              <div className="bg-bg-raised rounded-2xl border border-line-subtle shadow-sm p-5 space-y-4">
                <h3 className="font-bold text-ink-high">{t('branch_holidays_settings')}</h3>

                {/* Add holiday */}
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={newHoliday}
                    onChange={(e) => setNewHoliday(e.target.value)}
                    className="flex-1 border border-line-default rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                  <Button
                    onClick={handleAddHoliday}
                    disabled={!newHoliday}
                    className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm py-2 px-4"
                  >
                    <Plus className="w-4 h-4" />
                    {t('branch_add_holiday')}
                  </Button>
                </div>

                {/* Holiday list */}
                {holidays.length === 0 ? (
                  <p className="text-sm text-ink-muted text-center py-6">
                    {t('branch_no_holidays')}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {holidays.map((date) => (
                      <li
                        key={date}
                        className="flex items-center justify-between bg-bg-base rounded-xl px-4 py-2.5"
                      >
                        <span className="text-sm font-medium text-ink-high">{date}</span>
                        <button
                          onClick={() => handleRemoveHoliday(date)}
                          className="text-red-400 hover:text-red-400 transition-colors"
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
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm py-2.5 px-5 w-full justify-center"
                >
                  <Save className="w-4 h-4" />
                  {holidaysSaving ? t('branch_save_holidays_saving') : t('branch_save_holidays')}
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

            {/* Tab: Reservations */}
            {activeTab === 'reservations' && (
              <BranchReservationStatus
                branchId={branchId}
                onSuccess={showSuccess}
                onError={showError}
              />
            )}

            {/* Tab: Points Grant */}
            {activeTab === 'points' && (
              <BranchMemberPointGrant
                branchAdminUsername={username}
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
