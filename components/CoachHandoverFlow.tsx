import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  MessageSquare,
  Search,
  ShieldCheck,
  Sparkles,
  UserCircle2,
  X,
} from 'lucide-react';
import type { ClientProfile, CoachProfile, Lesson, HandoverSummary } from '../types';
import { apiService } from '../services/apiService';
import { generateHandoverSummary } from '../services/geminiService';
import { storageService } from '../services/storage';
import { insightService } from '../services/insightService';

/**
 * 7a · 코치 변경 · 인수인계
 *
 * The redesign's promise "학생 계정은 코치에 종속되지 않는다" reads as
 * a claim until the student actually feels the freedom of picking a new
 * coach. This flow gives them that:
 *
 *   1. `search` — type in a coach name, hit the /coaches/search endpoint,
 *      pick a match. The student can also cancel out.
 *   2. `items` — pick which slices of their history to include in the
 *      handover summary the new coach will receive. Coach-private
 *      material (사적 메모) never appears here per §309 / §8b.
 *   3. `review` — one-screen recap with the outgoing + incoming coach and
 *      the chosen share items, gated on a final confirm.
 *   4. `submitting` / `done` — writes the coach_id change; server side
 *      auto-pushes the previous coach id onto previous_coach_ids so the
 *      passport (6f) shows the trail immediately.
 *
 * The AI-summary generation itself is a follow-up — this flow queues the
 * intent (via the share flags in the PATCH body) so a scheduled worker
 * can compose and deliver the summary to the incoming coach's briefing.
 */

export interface CoachHandoverFlowProps {
  clientProfile: ClientProfile;
  /**
   * All approved lessons for this student, filtered to whatever the
   * outgoing coach can legally see. When provided the handover writes
   * an AI-composed briefing for the incoming coach; when absent the
   * flow still completes but the briefing is a bare fallback.
   */
  pastLessons?: Lesson[];
  onCoachChanged: (updatedProfile: ClientProfile) => void;
  onClose: () => void;
}

type Stage = 'search' | 'items' | 'review' | 'submitting' | 'done' | 'error';

interface ShareItems {
  recentLessons: boolean;
  swingHistory: boolean;
  diagnosisScores: boolean;
  currentCurriculum: boolean;
  privateMemoExcluded: true; // Locked — never shared. Rendered for transparency.
}

const DEFAULT_SHARE: ShareItems = {
  recentLessons: true,
  swingHistory: true,
  diagnosisScores: true,
  currentCurriculum: true,
  privateMemoExcluded: true,
};

export const CoachHandoverFlow: React.FC<CoachHandoverFlowProps> = ({
  clientProfile,
  pastLessons,
  onCoachChanged,
  onClose,
}) => {
  const [stage, setStage] = useState<Stage>('search');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<CoachProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<CoachProfile | null>(null);
  const [share, setShare] = useState<ShareItems>(DEFAULT_SHARE);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (stage !== 'search' || debouncedQuery.length === 0) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    apiService.searchCoachesByName(debouncedQuery).then((rows) => {
      if (cancelled) return;
      // Filter out the current coach — switching to your own coach is a no-op.
      setResults(rows.filter((c) => c.id !== clientProfile.coachId));
      setSearching(false);
    });
    return () => { cancelled = true; };
  }, [debouncedQuery, stage, clientProfile.coachId]);

  const submit = async () => {
    if (!selectedCoach) return;
    setStage('submitting');
    setError(null);
    try {
      // Compose the handover briefing BEFORE the coach_id flip. The
      // outgoing coach is still authoritative here — the AI call uses
      // their lessons + share preferences, and the resulting summary
      // is stored keyed to the incoming coach so their first visit to
      // the student surfaces it.
      const fromCoachId = clientProfile.coachId ?? '';
      const shareItems = {
        recentLessons: share.recentLessons,
        swingHistory: share.swingHistory,
        diagnosisScores: share.diagnosisScores,
        currentCurriculum: share.currentCurriculum,
      };
      try {
        const draft = await generateHandoverSummary(
          clientProfile,
          pastLessons ?? [],
          shareItems,
          fromCoachId || undefined
        );
        const clientId = `${clientProfile.name}_${clientProfile.phone ?? ''}`;
        const summary: HandoverSummary = {
          id: `handover_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          clientId,
          fromCoachId,
          toCoachId: selectedCoach.id,
          headline: draft.headline,
          keyPoints: draft.keyPoints,
          recentFocus: draft.recentFocus,
          watchOuts: draft.watchOuts,
          sharedItems: shareItems,
          swingEvidence: draft.swingEvidence,
          historyEvidence: draft.historyEvidence,
          confidence: draft.confidence,
          caveats: draft.caveats,
          generatedAt: Date.now(),
        };
        await insightService.saveHandoverSummary(summary);
      } catch (e) {
        // Summary is best-effort — never block the coach reassignment
        // itself. The student's move to the new coach is the primary
        // action; the briefing can be regenerated later.
        console.warn('[CoachHandoverFlow] summary generation failed', e);
      }

      const updated = await apiService.updateMyClientProfile({
        coachId: selectedCoach.id,
        designatedCoach: selectedCoach.name,
      });
      onCoachChanged(updated);
      setStage('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : '코치 변경 실패');
      setStage('error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="코치 변경 · 인수인계"
      onClick={stage === 'done' ? onClose : undefined}
    >
      <div
        // Bottom sheet — the panel's last row lands on the home indicator /
        // gesture bar without the inset. Safe to put on the scroller: the
        // panel carries no bottom padding of its own.
        className="w-full sm:max-w-md bg-base border-t sm:border border-line-subtle sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] overflow-y-auto pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 bg-base/95 backdrop-blur border-b border-line-subtle px-5 py-3 flex items-center gap-2">
          {stage === 'items' || stage === 'review' ? (
            <button
              type="button"
              onClick={() => setStage(stage === 'review' ? 'items' : 'search')}
              aria-label="뒤로"
              className="p-1.5 -ml-1.5 rounded-lg text-ink-medium hover:text-ink-high hover:bg-white/5"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : null}
          <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
            코치 변경 · 인수인계
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="ml-auto p-1.5 rounded-lg text-ink-medium hover:text-ink-high hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="px-5 py-5">
          {stage === 'search' && (
            <SearchStage
              query={query}
              onQueryChange={setQuery}
              results={results}
              searching={searching}
              onPick={(c) => {
                setSelectedCoach(c);
                setStage('items');
              }}
              currentCoachName={clientProfile.designatedCoach}
            />
          )}

          {stage === 'items' && selectedCoach && (
            <ItemsStage
              selectedCoach={selectedCoach}
              share={share}
              onChange={setShare}
              onNext={() => setStage('review')}
            />
          )}

          {stage === 'review' && selectedCoach && (
            <ReviewStage
              clientProfile={clientProfile}
              selectedCoach={selectedCoach}
              share={share}
              onConfirm={submit}
            />
          )}

          {stage === 'submitting' && <SubmittingStage />}
          {stage === 'done' && selectedCoach && (
            <DoneStage newCoachName={selectedCoach.name} onClose={onClose} />
          )}
          {stage === 'error' && (
            <ErrorStage
              message={error ?? '알 수 없는 오류'}
              onRetry={() => setStage('review')}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Stage bodies ─────────────────────────────────────────────────────────

const SearchStage: React.FC<{
  query: string;
  onQueryChange: (q: string) => void;
  results: CoachProfile[];
  searching: boolean;
  onPick: (c: CoachProfile) => void;
  currentCoachName?: string;
}> = ({ query, onQueryChange, results, searching, onPick, currentCoachName }) => (
  <>
    <p className="text-[13px] leading-relaxed text-ink-medium mb-4">
      새 코치를 이름으로 찾아보세요. 이전 코치와 함께 만든 레슨 기록·영상은
      그대로 남고, 코치의 사적 메모만 이전 코치에게 남습니다.
    </p>

    {currentCoachName && (
      <div className="text-[11px] font-mono text-ink-muted mb-3">
        현재 코치 · {currentCoachName}
      </div>
    )}

    <div className="relative">
      <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        autoFocus
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="코치 이름 입력"
        className="w-full pl-9 pr-3 h-11 rounded-xl bg-white/[0.04] border border-line-default text-[14px] text-ink-high placeholder:text-ink-faint focus:outline-none focus:border-emerald-500/60"
      />
    </div>

    <div className="mt-3 min-h-[80px]">
      {searching ? (
        <div className="py-6 flex items-center justify-center gap-2 text-[12px] text-ink-muted">
          <Loader2 className="w-3 h-3 animate-spin" /> 검색 중
        </div>
      ) : query.trim() && results.length === 0 ? (
        <div className="py-6 text-center text-[12px] text-ink-muted">
          검색 결과가 없습니다.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c)}
                className="w-full text-left rounded-xl border border-line-subtle bg-white/[0.03] hover:bg-white/[0.06] px-3 py-2.5 flex items-center gap-3 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
                  <UserCircle2 className="w-4 h-4 text-ink-medium" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-bold text-ink-high truncate">
                    {c.name}
                  </div>
                  <div className="text-[11px] text-ink-muted truncate">
                    {c.email || c.phone || '연락처 미공개'}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-ink-muted flex-shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  </>
);

const ItemsStage: React.FC<{
  selectedCoach: CoachProfile;
  share: ShareItems;
  onChange: (s: ShareItems) => void;
  onNext: () => void;
}> = ({ selectedCoach, share, onChange, onNext }) => {
  const items: Array<{
    key: keyof ShareItems;
    label: string;
    hint: string;
    locked?: 'on' | 'off';
  }> = [
    {
      key: 'recentLessons',
      label: '최근 3개월 레슨 요약',
      hint: '다뤘던 주제 · 피드백 · 다음 액션 (승인된 것만)',
    },
    {
      key: 'swingHistory',
      label: '스윙 영상 이력',
      hint: '앞·옆 스윙 · 자세 분석 (내가 원하면 언제든 삭제)',
    },
    {
      key: 'diagnosisScores',
      label: '진단 점수 3종',
      hint: '몸 · 장비 · 기술 최근 세션',
    },
    {
      key: 'currentCurriculum',
      label: '진행 중인 커리큘럼 · 숙제',
      hint: '새 코치가 이어서 잡을 수 있도록',
    },
    {
      key: 'privateMemoExcluded',
      label: '이전 코치의 사적 메모',
      hint: '전달되지 않습니다 · 코치 개인 노트는 코치에게만',
      locked: 'off',
    },
  ];

  return (
    <>
      <p className="text-[13px] leading-relaxed text-ink-medium mb-4">
        <b className="text-ink-high">{selectedCoach.name}</b> 코치에게 어떤 이력을
        전달할지 선택하세요. 항목마다 언제든 다시 바꿀 수 있어요.
      </p>

      <ul className="space-y-2">
        {items.map((it) => {
          const isLocked = !!it.locked;
          const isOn = isLocked ? it.locked === 'on' : (share[it.key] as boolean);
          return (
            <li key={String(it.key)}>
              <button
                type="button"
                disabled={isLocked}
                onClick={() =>
                  !isLocked &&
                  onChange({ ...share, [it.key]: !isOn })
                }
                className={`w-full text-left rounded-xl border px-3 py-3 flex items-start gap-3 transition-colors ${
                  isLocked
                    ? 'border-line-subtle bg-white/[0.01] cursor-not-allowed'
                    : isOn
                      ? 'border-emerald-500/40 bg-emerald-500/[0.06]'
                      : 'border-line-default bg-white/[0.02] hover:bg-white/[0.04]'
                }`}
              >
                <div
                  className={`mt-0.5 w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 ${
                    isLocked
                      ? 'bg-white/5 text-ink-faint border border-line-default'
                      : isOn
                        ? 'bg-emerald-500 text-[#04150e]'
                        : 'border border-line-default'
                  }`}
                >
                  {isOn && <Check className="w-3 h-3" strokeWidth={3} />}
                  {isLocked && it.locked === 'off' && (
                    <X className="w-3 h-3" strokeWidth={3} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-[13.5px] font-bold leading-tight ${
                      isLocked ? 'text-ink-medium' : 'text-ink-high'
                    }`}
                  >
                    {it.label}
                    {isLocked && (
                      <span className="ml-1.5 text-[10px] font-mono uppercase tracking-wider text-ink-muted">
                        정책상 제외
                      </span>
                    )}
                  </div>
                  <div className="text-[11.5px] text-ink-muted mt-0.5 leading-relaxed">
                    {it.hint}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={onNext}
        className="mt-5 w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-[#04150e] text-[14px] font-bold flex items-center justify-center gap-2 transition-colors"
      >
        다음 <ArrowRight className="w-4 h-4" />
      </button>
    </>
  );
};

const ReviewStage: React.FC<{
  clientProfile: ClientProfile;
  selectedCoach: CoachProfile;
  share: ShareItems;
  onConfirm: () => void;
}> = ({ clientProfile, selectedCoach, share, onConfirm }) => {
  const shared: string[] = [];
  if (share.recentLessons) shared.push('최근 3개월 레슨 요약');
  if (share.swingHistory) shared.push('스윙 영상 이력');
  if (share.diagnosisScores) shared.push('진단 점수 3종');
  if (share.currentCurriculum) shared.push('진행 중인 커리큘럼 · 숙제');

  return (
    <>
      <div className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.08] to-transparent p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-emerald-300" />
          <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-200">
            인수인계 미리보기
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] font-mono text-ink-muted mb-1">이전</div>
            <div className="text-[14px] font-bold text-ink-high truncate">
              {clientProfile.designatedCoach ?? '미지정'}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-mono text-ink-muted mb-1">새 코치</div>
            <div className="text-[14px] font-bold text-emerald-300 truncate">
              {selectedCoach.name}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="text-[11px] font-mono uppercase tracking-wider text-ink-muted mb-2">
          전달되는 항목
        </div>
        {shared.length === 0 ? (
          <div className="text-[12.5px] text-ink-muted">
            아무 항목도 선택되지 않았어요. 최소한 하나는 선택해 주세요.
          </div>
        ) : (
          <ul className="space-y-1">
            {shared.map((s) => (
              <li
                key={s}
                className="flex items-center gap-2 text-[13px] text-ink-high"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-300 flex-shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="text-[11.5px] text-ink-muted leading-relaxed mb-4">
        승인 후에도 언제든 여권 화면에서 항목별 공유 범위를 다시 조정할 수 있고,
        원하면 데이터를 통째로 내보낼 수도 있어요.
      </div>

      <button
        type="button"
        onClick={onConfirm}
        disabled={shared.length === 0}
        className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-[#04150e] text-[14px] font-bold flex items-center justify-center gap-2 transition-colors"
      >
        <MessageSquare className="w-4 h-4" />
        코치 변경 확정
      </button>
    </>
  );
};

const SubmittingStage: React.FC = () => (
  <div className="py-6 text-center">
    <Loader2 className="w-8 h-8 text-emerald-400 mx-auto mb-3 animate-spin" />
    <div className="text-[13px] text-ink-high font-bold">코치 변경 처리 중</div>
    <div className="text-[11px] text-ink-muted mt-1">잠시만 기다려주세요</div>
  </div>
);

const DoneStage: React.FC<{ newCoachName: string; onClose: () => void }> = ({
  newCoachName,
  onClose,
}) => (
  <div className="py-4 text-center">
    <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-400/50 mx-auto flex items-center justify-center mb-3">
      <Check className="w-6 h-6 text-emerald-300" />
    </div>
    <div className="text-[15px] font-bold text-ink-high mb-1">
      코치 변경 완료
    </div>
    <div className="text-[12.5px] text-ink-medium leading-relaxed mb-4">
      {newCoachName} 코치에게 이력이 전달되었어요. 다음 대화부터 새 코치의
      브리핑이 시작됩니다.
    </div>
    <button
      type="button"
      onClick={onClose}
      className="w-full h-11 rounded-xl border border-line-default text-ink-high hover:bg-white/5 text-[14px] font-bold"
    >
      확인
    </button>
  </div>
);

const ErrorStage: React.FC<{
  message: string;
  onRetry: () => void;
  onClose: () => void;
}> = ({ message, onRetry, onClose }) => (
  <div className="py-4 text-center">
    <div className="text-[13px] font-bold text-amber-300 mb-2">
      코치 변경 실패
    </div>
    <div className="text-[12px] text-ink-medium mb-4">{message}</div>
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClose}
        className="flex-1 h-10 rounded-lg border border-line-default text-ink-medium hover:text-ink-high text-[13px] font-bold"
      >
        닫기
      </button>
      <button
        type="button"
        onClick={onRetry}
        className="flex-1 h-10 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-[#04150e] text-[13px] font-bold"
      >
        다시 시도
      </button>
    </div>
  </div>
);
