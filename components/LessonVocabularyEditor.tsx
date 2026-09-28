import React, { useState } from 'react';
import { BookOpen, Plus, X } from 'lucide-react';
import {
  MAX_VOCAB_CORRECTIONS,
  MAX_VOCAB_TERMS,
  normalizeLessonVocabulary,
  parseTermsInput,
  type LessonVocabulary,
  type LessonVocabularyCorrection,
} from '../services/lessonVocabulary';

/**
 * 코치별 레슨 용어 사전 편집기.
 *
 * 두 칸이다:
 *  - 전용 용어: 코치가 쓰는 드릴 이름·스윙 이론 용어 등. 필기가 이 표기로 적힌다.
 *  - 고친 기록: "잘못 들린 말 → 바른 말". 검토 화면에서 필기를 고치면 자동으로
 *    쌓이고, 여기서 잘못 배운 짝을 지우거나 직접 더할 수 있다.
 */
export interface LessonVocabularyEditorProps {
  vocabulary: LessonVocabulary;
  onSave: (next: LessonVocabulary) => Promise<void>;
  onClose: () => void;
}

export const LessonVocabularyEditor: React.FC<LessonVocabularyEditorProps> = ({
  vocabulary,
  onSave,
  onClose,
}) => {
  const [termsText, setTermsText] = useState(vocabulary.terms.join(', '));
  const [corrections, setCorrections] = useState<LessonVocabularyCorrection[]>(
    vocabulary.corrections
  );
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addCorrection = () => {
    const f = from.trim();
    const t = to.trim();
    if (!f || !t || f === t) return;
    setCorrections((list) => [...list.filter((c) => c.from !== f), { from: f, to: t }]);
    setFrom('');
    setTo('');
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(
        normalizeLessonVocabulary({ terms: parseTermsInput(termsText), corrections })
      );
      onClose();
    } catch {
      setError('저장하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.');
      setSaving(false);
    }
  };

  const termCount = parseTermsInput(termsText).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="레슨 용어 사전"
      className="absolute inset-0 z-40 bg-base flex flex-col pt-safe pb-safe"
    >
      <header className="px-5 py-4 border-b border-line-subtle flex items-center gap-3 flex-shrink-0">
        <BookOpen className="w-5 h-5 text-emerald-300 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-ink-high">내 레슨 용어 사전</div>
          <div className="text-[12px] text-ink-muted">
            여기 적은 말은 레슨 필기에서 이 표기 그대로 적혀요
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="w-11 h-11 -mr-2 flex items-center justify-center text-ink-muted hover:text-ink-high"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-6">
        <section className="flex flex-col gap-1.5">
          <label htmlFor="vocab-terms" className="text-[12px] font-bold text-ink-high">
            전용 용어{' '}
            <span className="text-ink-muted font-normal">
              · 쉼표나 줄바꿈으로 구분 ({termCount}/{MAX_VOCAB_TERMS})
            </span>
          </label>
          <textarea
            id="vocab-terms"
            value={termsText}
            onChange={(e) => setTermsText(e.target.value)}
            placeholder="예: 원 플레인, 스택 앤 틸트, 수건 드릴, 왼손 리드 드릴"
            className="min-h-[8rem] w-full rounded-xl border border-line-subtle bg-white/[0.04] p-3 text-[13.5px] leading-relaxed text-ink-high placeholder:text-ink-muted focus:ring-2 focus:ring-emerald-500 outline-none resize-y"
          />
          <p className="text-[11.5px] text-ink-muted">
            공용 골프 용어는 이미 들어 있어요. 코치님만 쓰는 드릴 이름·이론 용어·자주 쓰는
            영어 표현을 적어 주세요.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <div className="text-[12px] font-bold text-ink-high">
            고친 기록{' '}
            <span className="text-ink-muted font-normal">
              · 잘못 들린 말 → 바른 말 ({corrections.length}/{MAX_VOCAB_CORRECTIONS})
            </span>
          </div>
          <p className="text-[11.5px] text-ink-muted">
            레슨 기록 확인 화면에서 필기를 고치면 여기 자동으로 쌓여, 다음 레슨부터는 처음부터
            바르게 적혀요. 잘못 배운 짝은 지워 주세요.
          </p>

          <div className="flex items-center gap-2">
            <input
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="잘못 들린 말"
              aria-label="잘못 들린 말"
              className="min-w-0 flex-1 rounded-lg border border-line-subtle bg-white/[0.04] px-3 py-2 text-[13px] text-ink-high placeholder:text-ink-muted focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <span className="text-ink-muted">→</span>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addCorrection();
              }}
              placeholder="바른 말"
              aria-label="바른 말"
              className="min-w-0 flex-1 rounded-lg border border-line-subtle bg-white/[0.04] px-3 py-2 text-[13px] text-ink-high placeholder:text-ink-muted focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <button
              type="button"
              onClick={addCorrection}
              aria-label="고친 기록 추가"
              className="w-10 h-10 flex-shrink-0 rounded-lg bg-emerald-500/15 text-emerald-300 flex items-center justify-center"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {corrections.length === 0 ? (
            <p className="text-[12.5px] text-ink-muted py-2">아직 고친 기록이 없어요.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line-subtle rounded-xl border border-line-subtle">
              {[...corrections].reverse().map((c) => (
                <li key={c.from} className="flex items-center gap-2 pl-3 text-[13px]">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-ink-muted line-through">{c.from}</span>
                    <span className="text-ink-muted"> → </span>
                    <span className="text-ink-high font-medium">{c.to}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCorrections((list) => list.filter((x) => x.from !== c.from))
                    }
                    aria-label={`${c.from} 기록 삭제`}
                    className="w-10 h-10 flex-shrink-0 flex items-center justify-center text-ink-muted hover:text-red-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="px-5 py-3 border-t border-line-subtle flex flex-col gap-2 flex-shrink-0">
        {error && <p className="text-[12px] text-red-300">{error}</p>}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full h-12 rounded-xl bg-emerald-500 text-black font-bold text-[14px] disabled:opacity-50"
        >
          {saving ? '저장 중…' : '사전 저장하기'}
        </button>
      </footer>
    </div>
  );
};
