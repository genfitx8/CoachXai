/**
 * coachStyleService — Phase C
 *
 * Captures explicit and implicit signals about which AI outputs are good,
 * so future generations can mirror the coach's style (via few-shot injection
 * in a later phase — this service just persists exemplars for now).
 *
 * Resolution rules mirror promptService:
 * - Coach-scoped exemplars (coachId=<id>) apply only to that coach.
 * - Global exemplars (coachId=undefined) apply system-wide as a fallback.
 * - When both exist for a (target, coachId) pair, coach-scoped wins in
 *   retrieval; both may be surfaced together depending on the caller.
 */

import { CoachStyleExemplar, CoachStyleExemplarSource, PromptTarget } from '../types';
import { storageService } from './storage';
import { firebaseService } from './firebase';
import { apiService } from './apiService';
import { createLogger } from '../utils/logger';

const log = createLogger('coachStyle');

/** Server-backed mode (docs/DATA_ARCHITECTURE.md §6.1): exemplars are
 * fine-tuning gold data, so the server pool takes priority over the
 * caller-provided legacy backend flag. */
const isApiMode = (): boolean => apiService.isAvailable() && !!apiService.getToken();

/**
 * Compute the quality tier for an exemplar based on where the signal came from.
 * Callers can override, but this keeps the mapping consistent by default.
 * - tier 1: coach explicitly starred, coach explicitly dissented, or student
 *           rated the output highly — all three are the strongest signals of
 *           coach intent (positive or negative)
 * - tier 2: coach edited an AI draft (implicit acceptance of the shape)
 * - tier 3: auto-selected by heuristics (recency, depth, etc.)
 */
export const tierForSource = (source: CoachStyleExemplarSource): 1 | 2 | 3 => {
  switch (source) {
    case 'starred':
    case 'feedback':
    case 'dissent':
      return 1;
    case 'edited':
      return 2;
    case 'auto':
    default:
      return 3;
  }
};

export interface GetExemplarsOptions {
  /** Maximum number of exemplars to return. Defaults to 5. */
  limit?: number;
  /**
   * When true, coach-scoped exemplars are preferred but global ones fill
   * remaining slots. When false, only exact-scope matches are returned.
   * Defaults to true so few-shot injection stays useful even before a
   * coach has starred anything of their own.
   */
  includeGlobalFallback?: boolean;
}

/**
 * Sort exemplars for few-shot injection: higher tier first, more recent first.
 */
const rankExemplars = (exemplars: CoachStyleExemplar[]): CoachStyleExemplar[] =>
  [...exemplars].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return b.createdAt - a.createdAt;
  });

export const coachStyleService = {
  /**
   * Persist a new exemplar (or overwrite one with the same id).
   */
  save: async (
    exemplar: CoachStyleExemplar,
    isFirebaseMode: boolean
  ): Promise<void> => {
    if (isApiMode()) {
      await apiService.saveCoachStyleExemplar(exemplar);
      return;
    }
    if (isFirebaseMode) {
      await firebaseService.saveCoachStyleExemplar(exemplar);
    } else {
      storageService.saveCoachStyleExemplar(exemplar);
    }
  },

  /**
   * Remove an exemplar the coach no longer endorses.
   */
  delete: async (
    exemplarId: string,
    isFirebaseMode: boolean
  ): Promise<void> => {
    if (isApiMode()) {
      await apiService.deleteCoachStyleExemplar(exemplarId);
      return;
    }
    if (isFirebaseMode) {
      await firebaseService.deleteCoachStyleExemplar(exemplarId);
    } else {
      storageService.deleteCoachStyleExemplar(exemplarId);
    }
  },

  /**
   * Retrieve exemplars for a target, ranked for few-shot injection.
   *
   * Includes global exemplars as fallback by default so early-stage coaches
   * still benefit from the shared pool while they accumulate their own.
   */
  getForTarget: async (
    target: PromptTarget,
    coachId: string | undefined,
    isFirebaseMode: boolean,
    options: GetExemplarsOptions = {}
  ): Promise<CoachStyleExemplar[]> => {
    const { limit = 5, includeGlobalFallback = true } = options;
    try {
      const all = isApiMode()
        ? await apiService.getCoachStyleExemplars()
        : isFirebaseMode
          ? await firebaseService.getCoachStyleExemplars()
          : storageService.getCoachStyleExemplars();

      const targetMatches = all.filter((x) => x.target === target);

      // Coach-scoped first.
      const coachScoped = coachId
        ? targetMatches.filter((x) => x.coachId === coachId)
        : [];

      let picks = rankExemplars(coachScoped).slice(0, limit);

      if (picks.length < limit && includeGlobalFallback) {
        const remainingSlots = limit - picks.length;
        // Global rows either have no coachId or match undefined.
        const global = targetMatches.filter((x) => !x.coachId);
        const globalPicks = rankExemplars(global).slice(0, remainingSlots);
        picks = picks.concat(globalPicks);
      }

      return picks;
    } catch (e) {
      log.warn('Failed to load coach style exemplars', e);
      return [];
    }
  },

  /**
   * List all exemplars — used by admin UIs to inspect the pool.
   */
  getAll: async (isFirebaseMode: boolean): Promise<CoachStyleExemplar[]> => {
    if (isApiMode()) {
      return apiService.getCoachStyleExemplars();
    }
    if (isFirebaseMode) {
      return firebaseService.getCoachStyleExemplars();
    }
    return storageService.getCoachStyleExemplars();
  },
};

/**
 * Format a set of ranked exemplars as a "참고 예시" block that can be
 * prepended to the model prompt. The tag "참고 예시" is also what the
 * observability logger looks for to set `hasExemplars=true` on the log
 * entry — keeping the marker consistent avoids silent telemetry drift.
 *
 * Returns an empty string when `exemplars` is empty so callers can safely
 * template the result unconditionally.
 *
 * Each exemplar is rendered as:
 *
 *   ### 예시 N (tier T)
 *   **입력 상황:** <input>
 *   **코치가 선호하는 답변 스타일:**
 *   <output>
 */
export const buildFewShotBlock = (exemplars: CoachStyleExemplar[]): string => {
  if (!exemplars.length) return '';
  const rows = exemplars.map((ex, i) => {
    const header = `### 예시 ${i + 1} (tier ${ex.tier})`;
    return `${header}\n**입력 상황:**\n${ex.input}\n\n**코치가 선호하는 답변 스타일:**\n${ex.output}`;
  });
  return [
    '=== 참고 예시 (코치의 이전 답변 스타일) ===',
    '아래 예시는 이 코치가 실제로 선호하는 답변 톤·구조입니다.',
    '**단, 다음 회원에 대한 답변은 반드시 아래 실제 데이터를 근거로 새로 작성하세요.**',
    '예시의 문체·섹션 구조·용어 사용을 참고하되, 예시의 수치나 회원 이름은 절대 옮기지 마세요.',
    '',
    rows.join('\n\n---\n\n'),
    '',
    '=== 참고 예시 끝 ===',
  ].join('\n');
};
