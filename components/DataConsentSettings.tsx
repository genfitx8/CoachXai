import React, { useEffect, useState } from 'react';
import { ConsentPurpose, ConsentRecord } from '../types';
import { consentService } from '../services/consentService';

/**
 * 데이터 활용 동의 (docs/DATA_ARCHITECTURE.md §8.2).
 *
 * 여기서 켜고 끄는 스위치가 CoachX 학습 데이터의 실질적 게이트다:
 * `ai_training` 동의가 있는 사용자의 호출만 프롬프트·응답 원문이 저장되고,
 * 그 원문만 데이터셋 추출에 포함된다. 동의는 기기 설정이 아니라 서버에
 * 기록되는 사실이므로, 서버 모드가 아니면 화면 자체를 띄우지 않는다.
 *
 * 철회는 즉시 반영된다 — 이후 호출의 원문은 저장되지 않고, 다음 추출부터
 * 제외된다. 이미 만들어진 데이터셋에서 빼는 것은 별도 절차(§8.3)다.
 */

const PURPOSE_COPY: Array<{
  purpose: ConsentPurpose;
  label: string;
  hint: string;
}> = [
  {
    purpose: 'ai_training',
    label: 'AI 품질 개선에 내 데이터 활용',
    hint:
      '가명 처리된 레슨 기록과 AI 대화가 CoachX AI를 코치의 방식에 맞게 학습시키는 데 쓰여요. 이름·연락처는 저장 전에 지워집니다.',
  },
  {
    purpose: 'marketing',
    label: '마케팅 정보 수신',
    hint: '새 기능·이벤트 안내를 받아요.',
  },
];

export const DataConsentSettings: React.FC = () => {
  const [consents, setConsents] = useState<ConsentRecord[] | null>(null);
  const [saving, setSaving] = useState<ConsentPurpose | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!consentService.isSupported()) {
      setConsents([]);
      return;
    }
    void consentService.list().then(setConsents);
  }, []);

  if (!consentService.isSupported()) return null;
  if (!consents) {
    return <div className="p-4 text-sm text-ink-medium">동의 설정 불러오는 중…</div>;
  }

  const isGranted = (purpose: ConsentPurpose): boolean =>
    consents.some((c) => c.purpose === purpose && c.granted);

  const toggle = async (purpose: ConsentPurpose) => {
    setSaving(purpose);
    setError(null);
    try {
      setConsents(await consentService.set(purpose, !isGranted(purpose)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-3 p-4">
      <section>
        <h3 className="text-base font-semibold text-ink-high mb-2">데이터 활용 동의</h3>
        <p className="text-xs text-ink-medium mb-3">
          선택 항목이에요. 동의하지 않아도 모든 기능을 그대로 쓸 수 있고, 언제든 여기서 철회할 수 있어요.
        </p>
        <ul className="space-y-2">
          {PURPOSE_COPY.map(({ purpose, label, hint }) => {
            const granted = isGranted(purpose);
            return (
              <li
                key={purpose}
                className="flex items-start justify-between gap-3 rounded-lg bg-bg-overlay border border-line-default p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink-high">{label}</div>
                  <div className="text-xs text-ink-medium mt-0.5 leading-relaxed">{hint}</div>
                </div>
                <button
                  type="button"
                  disabled={saving !== null}
                  onClick={() => void toggle(purpose)}
                  role="switch"
                  aria-checked={granted}
                  aria-label={label}
                  className={
                    'relative shrink-0 w-11 h-6 rounded-full transition disabled:opacity-50 ' +
                    (granted ? 'bg-primary-500' : 'bg-surface-700')
                  }
                >
                  <span
                    className={
                      'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ' +
                      (granted ? 'left-5' : 'left-0.5')
                    }
                  />
                </button>
              </li>
            );
          })}
        </ul>
        {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
      </section>
    </div>
  );
};
