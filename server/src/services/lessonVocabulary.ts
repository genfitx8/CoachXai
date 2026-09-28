/**
 * 코치별 레슨 용어 사전 — 서버 쪽 정규화.
 *
 * 이 값은 그대로 전사·교정 프롬프트에 실린다. 그래서 저장 전에 반드시
 * 모양과 크기를 묶는다: 줄바꿈을 없애(프롬프트 구조를 깨는 입력 차단),
 * 항목 길이와 개수에 상한을 두고(프롬프트 폭주 차단), 중복을 합친다.
 */

export interface LessonVocabularyCorrection {
  from: string;
  to: string;
}

export interface LessonVocabulary {
  terms: string[];
  corrections: LessonVocabularyCorrection[];
}

export const MAX_VOCAB_TERMS = 300;
export const MAX_VOCAB_CORRECTIONS = 200;
export const MAX_VOCAB_ITEM_LEN = 40;

const cleanItem = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const text = value
    .replace(/[\r\n\t]+/g, ' ')
    // 프롬프트 안에서 인용·구분 기호로 쓰는 문자는 뺀다.
    .replace(/["`{}\[\]<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > MAX_VOCAB_ITEM_LEN ? '' : text;
};

export const normalizeLessonVocabulary = (input: unknown): LessonVocabulary => {
  const raw = (input && typeof input === 'object' ? input : {}) as {
    terms?: unknown;
    corrections?: unknown;
  };

  const terms: string[] = [];
  const seenTerms = new Set<string>();
  for (const item of Array.isArray(raw.terms) ? raw.terms : []) {
    const term = cleanItem(item);
    if (!term || seenTerms.has(term)) continue;
    seenTerms.add(term);
    terms.push(term);
    if (terms.length >= MAX_VOCAB_TERMS) break;
  }

  // 같은 from 이 여러 번 오면 **뒤의 것**(최근 교정)을 남긴다.
  const byFrom = new Map<string, string>();
  for (const item of Array.isArray(raw.corrections) ? raw.corrections : []) {
    if (!item || typeof item !== 'object') continue;
    const from = cleanItem((item as { from?: unknown }).from);
    const to = cleanItem((item as { to?: unknown }).to);
    if (!from || !to || from === to) continue;
    byFrom.delete(from);
    byFrom.set(from, to);
  }
  const corrections = [...byFrom]
    .map(([from, to]) => ({ from, to }))
    .slice(-MAX_VOCAB_CORRECTIONS);

  return { terms, corrections };
};
