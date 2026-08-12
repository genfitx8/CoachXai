import React, { useState } from 'react';
import { X, Check, MessageSquareWarning, Loader2 } from 'lucide-react';
import type { AIEvidenceEnvelope } from '../types/aiEvidence';
import type { PromptTarget } from '../types';

/**
 * 6a · AI 판단 근거 — the redesign's transparency screen.
 *
 * When the coach taps "왜 이 제안?" on any AI-authored card (weekly
 * insight, coaching summary, shot fault…), this modal opens with the
 * exact envelope the model returned: what it looked at (swingEvidence),
 * what history it referenced (historyEvidence), how confident it is
 * (confidence bar), and any caveats it wanted the coach to know.
 *
 * The coach then acknowledges (맞아요) or dissents (다르게 봐요) — the
 * dissent path opens a compact correction textarea and calls
 * `onDissent(correction)` so the caller can persist a CoachStyleExemplar
 * with source='dissent' (see PR #315 · services/coachStyleService.ts).
 * That negative example flows into the few-shot pool for future AI calls
 * on the same target.
 */
export interface EvidenceDetailModalProps {
  /** The claim in coach-facing language, e.g. summary sentence. */
  claim: string;
  /** Envelope emitted alongside the claim. Any field may be missing. */
  envelope: AIEvidenceEnvelope;
  /** Which AI feature this judgement came from — routes the exemplar. */
  target: PromptTarget;
  /**
   * Short label naming the concrete subject (student name + session
   * number, week range, etc.). Rendered under the claim so the coach
   * knows what they're endorsing before pressing 맞아요.
   */
  subjectLabel?: string;
  /**
   * Fires when the coach accepts. The caller typically stores a
   * 'starred'-source exemplar or simply dismisses the sheet.
   */
  onAccept?: () => void;
  /**
   * Fires when the coach dissents with a written correction. The
   * caller stores a 'dissent'-source CoachStyleExemplar keyed on
   * (target, coach). Return a promise to keep the modal in a saving
   * state until the write lands.
   */
  onDissent?: (correction: string) => Promise<void>;
  onClose: () => void;
}

const CONFIDENCE_META: Record<
  'strong' | 'plausible' | 'speculative',
  { pct: number; label: string; tone: string; bar: string }
> = {
  strong: { pct: 88, label: '확신도 높음', tone: 'text-emerald-300', bar: 'bg-emerald-400' },
  plausible: { pct: 60, label: '확신도 보통', tone: 'text-ink-medium', bar: 'bg-ink-medium' },
  speculative: { pct: 30, label: '추정', tone: 'text-amber-300', bar: 'bg-amber-400' },
};

export const EvidenceDetailModal: React.FC<EvidenceDetailModalProps> = ({
  claim,
  envelope,
  subjectLabel,
  onAccept,
  onDissent,
  onClose,
}) => {
  const [dissentOpen, setDissentOpen] = useState(false);
  const [correction, setCorrection] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confidenceMeta = envelope.confidence
    ? CONFIDENCE_META[envelope.confidence]
    : null;

  const submitDissent = async () => {
    if (!onDissent) return;
    const text = correction.trim();
    if (!text) {
      setError('교정 내용을 짧게라도 입력해 주세요.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onDissent(text);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="AI 판단 근거"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-base border-t sm:border border-line-subtle sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-base/95 backdrop-blur border-b border-line-subtle px-5 py-3 flex items-center gap-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
            판단 근거
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="ml-auto p-1.5 rounded-lg text-ink-medium hover:text-ink-high hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Claim card */}
          <section className="rounded-2xl border border-line-subtle bg-white/[0.03] px-4 py-4">
            {subjectLabel && (
              <div className="text-[11px] font-mono text-ink-muted mb-1.5">
                {subjectLabel}
              </div>
            )}
            <p className="text-[15px] leading-[1.65] text-ink-high whitespace-pre-line">
              {claim}
            </p>
            {confidenceMeta && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-mono ${confidenceMeta.tone}`}>
                    {confidenceMeta.label}
                  </span>
                  <span className="text-[11px] font-mono text-ink-muted">
                    {confidenceMeta.pct}%
                  </span>
                </div>
                <div className="h-[3px] rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full ${confidenceMeta.bar}`}
                    style={{ width: `${confidenceMeta.pct}%` }}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Evidence card */}
          {(envelope.swingEvidence?.length || envelope.historyEvidence?.length) ? (
            <section className="rounded-2xl border border-line-subtle bg-white/[0.02] px-4 py-4">
              <div className="text-[11px] font-mono uppercase tracking-wider text-ink-muted mb-3">
                본 것
              </div>
              {envelope.swingEvidence?.length ? (
                <ul className="space-y-1.5 text-sm text-ink-high leading-relaxed">
                  {envelope.swingEvidence.map((e, i) => (
                    <li key={`s-${i}`} className="flex items-start gap-2">
                      <span className="mt-2 w-1 h-1 rounded-full bg-emerald-400 flex-shrink-0" />
                      <span>{e}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {envelope.historyEvidence?.length ? (
                <ul
                  className={`space-y-1.5 text-sm text-ink-medium leading-relaxed ${
                    envelope.swingEvidence?.length ? 'border-t border-line-subtle mt-3 pt-3' : ''
                  }`}
                >
                  {envelope.historyEvidence.map((e, i) => (
                    <li key={`h-${i}`} className="flex items-start gap-2">
                      <span className="mt-2 w-1 h-1 rounded-full bg-ink-muted flex-shrink-0" />
                      <span className="text-ink-medium">이력 · {e}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          {/* Caveats */}
          {envelope.caveats?.length ? (
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-[13px] leading-relaxed text-amber-100">
              {envelope.caveats.map((c, i) => (
                <div key={i}>· {c}</div>
              ))}
            </section>
          ) : null}

          {/* Coach action card */}
          <section className="rounded-2xl border border-line-subtle bg-white/[0.02] px-4 py-4 space-y-3">
            <div className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
              코치 판단
            </div>

            {!dissentOpen ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onAccept?.();
                    onClose();
                  }}
                  className="flex-1 h-10 rounded-lg border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10 text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Check className="w-4 h-4" /> 맞아요
                </button>
                <button
                  type="button"
                  onClick={() => setDissentOpen(true)}
                  className="flex-1 h-10 rounded-lg border border-line-default text-ink-high hover:bg-white/5 text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
                  disabled={!onDissent}
                  title={!onDissent ? '이 화면에서는 교정을 저장할 수 없습니다' : undefined}
                >
                  <MessageSquareWarning className="w-4 h-4" /> 다르게 봐요
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-[11px] font-mono text-ink-muted block">
                  코치의 판단을 짧게 남겨주세요. 이 학생에 대한 판단 기준에 반영되고,
                  반복되면 코치 전체 기준에 반영됩니다.
                </label>
                <textarea
                  autoFocus
                  value={correction}
                  onChange={(e) => setCorrection(e.target.value)}
                  rows={3}
                  placeholder="예: 이 학생은 얼리익스텐션보다 상체 회전 부족이 더 큰 원인."
                  className="w-full resize-none bg-white/[0.04] border border-line-default rounded-lg px-3 py-2 text-[14px] leading-[1.65] text-ink-high placeholder:text-ink-faint focus:outline-none focus:border-emerald-500/60"
                />
                {error && (
                  <div className="text-[12px] text-amber-300">{error}</div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDissentOpen(false);
                      setCorrection('');
                      setError(null);
                    }}
                    disabled={saving}
                    className="text-[13px] text-ink-medium hover:text-ink-high px-3 py-2 rounded-lg hover:bg-white/5 disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={submitDissent}
                    disabled={saving}
                    className="ml-auto h-10 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-[#04150e] text-sm font-bold flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> 저장 중
                      </>
                    ) : (
                      '교정 저장'
                    )}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
