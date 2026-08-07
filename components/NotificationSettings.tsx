import React, { useEffect, useState } from 'react';
import { Button } from './Button';
import {
  NotificationPreferences,
  REMINDER_MINUTE_OPTIONS,
  getPreferences,
  updatePreferences,
} from '../services/notificationPreferenceService';
import { APP_VARIANT } from '../utils/appVariant';

// Channels exposed depend on which app is running — a coach never receives
// broadcasts, a student never receives practice-log or reservation-request
// alerts (they cause them).
const COACH_CHANNELS: Array<{ key: keyof NotificationPreferences['channels']; label: string; hint?: string }> = [
  { key: 'practiceLogged', label: '학생 연습 기록', hint: '학생이 연습 기록을 남길 때' },
  { key: 'reservationRequested', label: '레슨 예약 요청', hint: '학생이 새 예약을 신청할 때' },
  { key: 'lessonStartingSoon', label: '레슨 시작 알림' },
];
const STUDENT_CHANNELS: Array<{ key: keyof NotificationPreferences['channels']; label: string; hint?: string }> = [
  { key: 'lessonVideoUploaded', label: '새 레슨 영상', hint: '코치가 레슨 영상을 올렸을 때' },
  { key: 'reservationConfirmed', label: '예약 확정 알림' },
  { key: 'coachBroadcast', label: '코치 공지사항' },
  { key: 'lessonStartingSoon', label: '레슨 시작 알림' },
];

export const NotificationSettings: React.FC = () => {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setPrefs(await getPreferences());
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const channelList = APP_VARIANT === 'coach' ? COACH_CHANNELS : STUDENT_CHANNELS;

  const save = async (patch: Partial<NotificationPreferences>) => {
    if (!prefs) return;
    setSaving(true);
    setError(null);
    try {
      const next = await updatePreferences(patch);
      setPrefs(next);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-4 text-sm text-ink-medium">알림 설정 불러오는 중…</div>;
  }
  if (!prefs) {
    return (
      <div className="p-4 text-sm text-red-500">
        알림 설정을 불러오지 못했습니다. {error}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <section>
        <h3 className="text-base font-semibold text-ink-high mb-2">
          레슨 시작 리마인더
        </h3>
        <p className="text-xs text-ink-medium mb-3">
          예약된 레슨 시작 시각을 기준으로 언제 알림을 받을지 선택하세요.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {REMINDER_MINUTE_OPTIONS.map((opt) => {
            const active = prefs.lessonReminderMinutes === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={saving}
                onClick={() => save({ lessonReminderMinutes: opt.value })}
                className={
                  'px-3 py-2 rounded-lg border text-sm transition ' +
                  (active
                    ? 'bg-primary-500/20 border-primary-500 text-primary-300'
                    : 'bg-bg-overlay border-line-default text-ink-high hover:border-line-strong')
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="text-base font-semibold text-ink-high mb-2">알림 종류</h3>
        <ul className="space-y-2">
          {channelList.map(({ key, label, hint }) => {
            const enabled = prefs.channels[key];
            return (
              <li
                key={key}
                className="flex items-center justify-between rounded-lg bg-bg-overlay border border-line-default p-3"
              >
                <div>
                  <div className="text-sm font-medium text-ink-high">{label}</div>
                  {hint && (
                    <div className="text-xs text-ink-medium mt-0.5">{hint}</div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    save({ channels: { ...prefs.channels, [key]: !enabled } })
                  }
                  className={
                    'relative w-11 h-6 rounded-full transition ' +
                    (enabled ? 'bg-primary-500' : 'bg-surface-700')
                  }
                  aria-label={label}
                >
                  <span
                    className={
                      'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ' +
                      (enabled ? 'left-5' : 'left-0.5')
                    }
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3 className="text-base font-semibold text-ink-high mb-2">
          방해금지 시간
        </h3>
        <p className="text-xs text-ink-medium mb-3">
          이 시간대에는 일반 알림이 억제됩니다. 레슨 시작 리마인더는 예외로 항상 발송돼요.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={prefs.quietHoursStart ?? ''}
            onChange={(e) => save({ quietHoursStart: e.target.value || null })}
            className="rounded-lg bg-bg-overlay border border-line-default px-3 py-2 text-sm text-ink-high"
          />
          <span className="text-ink-medium text-sm">부터</span>
          <input
            type="time"
            value={prefs.quietHoursEnd ?? ''}
            onChange={(e) => save({ quietHoursEnd: e.target.value || null })}
            className="rounded-lg bg-bg-overlay border border-line-default px-3 py-2 text-sm text-ink-high"
          />
          <span className="text-ink-medium text-sm">까지</span>
          {(prefs.quietHoursStart || prefs.quietHoursEnd) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => save({ quietHoursStart: null, quietHoursEnd: null })}
            >
              해제
            </Button>
          )}
        </div>
      </section>

      {error && (
        <div className="text-xs text-red-400" role="alert">
          저장 실패: {error}
        </div>
      )}
      {savedAt && !error && (
        <div className="text-xs text-ink-medium">저장됨</div>
      )}
    </div>
  );
};
