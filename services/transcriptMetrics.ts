/**
 * transcriptMetrics — 레슨 필기 정확도 채점.
 *
 * 사람이 손으로 받아 적은 정답 필기(reference)와 파이프라인이 만든 필기
 * (hypothesis)를 비교해 두 숫자를 낸다:
 *
 *  - CER(문자 오류율): 공백·문장부호·화자 표기를 뺀 문자열의 편집 거리 ÷
 *    정답 길이. 한국어는 띄어쓰기가 흔들려도 뜻이 같으므로 단어가 아니라
 *    문자 단위로 잰다. 낮을수록 좋다.
 *  - 골프 용어 재현율: 정답 필기에 나온 골프 용어가 필기에도 **바른 표기로**
 *    몇 번 적혔는가. 이 서비스의 핵심 지표다 — 전체 문장이 조금 흔들리는
 *    것보다 "섕크"가 "생크"로 적히는 것이 코치에게 훨씬 큰 오류다.
 *
 * 순수 함수만 둔다 — 평가 스크립트(evals/transcription)와 단위 테스트가 함께 쓴다.
 */

/** "코치:", "학생:", "주변:", "[0:10]" 같은 표기를 지운다 — 채점 대상은 말 자체다. */
const stripAnnotations = (text: string): string =>
  text
    .replace(/\[\d{1,2}:\d{2}(?::\d{2})?(?:[–-]\d{1,2}:\d{2}(?::\d{2})?)?\]/g, ' ')
    .replace(/(^|\n)\s*(코치|학생|주변|미상|coach|student|other|unknown)\s*[:：]/gi, '$1');

/** 채점용 정규화 — 공백·문장부호를 없애고 영문은 소문자로. */
export const normalizeForScoring = (text: string): string =>
  stripAnnotations(text)
    .toLowerCase()
    .replace(/[\s.,!?…~·"'“”‘’()[\]{}:;\-–—/]+/g, '');

/** 두 문자열의 편집 거리(Levenshtein). 메모리는 짧은 쪽 길이만큼만 쓴다. */
export const editDistance = (a: string, b: string): number => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const [long, short] = a.length >= b.length ? [a, b] : [b, a];
  let prev = new Uint32Array(short.length + 1);
  let cur = new Uint32Array(short.length + 1);
  for (let j = 0; j <= short.length; j++) prev[j] = j;
  for (let i = 1; i <= long.length; i++) {
    cur[0] = i;
    const ch = long.charCodeAt(i - 1);
    for (let j = 1; j <= short.length; j++) {
      const sub = prev[j - 1] + (ch === short.charCodeAt(j - 1) ? 0 : 1);
      const del = prev[j] + 1;
      const ins = cur[j - 1] + 1;
      cur[j] = sub < del ? (sub < ins ? sub : ins) : del < ins ? del : ins;
    }
    [prev, cur] = [cur, prev];
  }
  return prev[short.length];
};

/** 문자 오류율(0 이상, 1 을 넘을 수도 있다 — 필기가 정답보다 훨씬 길 때). */
export const characterErrorRate = (reference: string, hypothesis: string): number => {
  const ref = normalizeForScoring(reference);
  const hyp = normalizeForScoring(hypothesis);
  if (!ref.length) return hyp.length ? 1 : 0;
  return editDistance(ref, hyp) / ref.length;
};

/**
 * 용어 힌트 문자열(GOLF_TERM_HINTS 모양)에서 채점할 용어 목록을 뽑는다.
 * "[셋업]" 같은 머리말은 버리고, "그립(스트롱/위크)" 은 "그립", "스트롱",
 * "위크" 로 편다. 두 글자 미만은 우연히 겹치기 쉬워 뺀다.
 */
export const extractTermList = (hints: string): string[] => {
  const out = new Set<string>();
  const body = hints.replace(/\[[^\]]*\]/g, ',');
  // 괄호 안의 쉼표에서는 자르지 않는다.
  let depth = 0;
  let current = '';
  const items: string[] = [];
  for (const ch of body) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === '\n') && depth === 0) {
      items.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  items.push(current);
  const add = (t: string) => {
    const term = t.trim();
    if (term.replace(/\s+/g, '').length >= 2) out.add(term);
  };
  for (const item of items) {
    const m = item.match(/^([^(]*)\(([^)]*)\)\s*$/);
    if (m) {
      add(m[1]);
      for (const alt of m[2].split(/[/,]/)) add(alt);
    } else {
      add(item);
    }
  }
  return [...out];
};

const countOccurrences = (haystack: string, needle: string): number => {
  if (!needle) return 0;
  let n = 0;
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + needle.length)) {
    n += 1;
  }
  return n;
};

export interface TermRecall {
  /** 정답 필기에 나온 용어 등장 횟수 합. */
  expected: number;
  /** 그중 필기에도 바른 표기로 적힌 횟수. */
  found: number;
  /** found / expected (정답에 용어가 없으면 1). */
  recall: number;
  /** 필기에서 빠졌거나 틀리게 적힌 용어와 모자란 횟수. */
  missed: Array<{ term: string; expected: number; found: number }>;
}

/**
 * 골프 용어 재현율. 비교는 공백을 뺀 문자열에서 한다("테이크 어웨이"와
 * "테이크어웨이"는 같은 용어다). 긴 용어부터 세어, "얼리 익스텐션" 안의
 * "익스텐션"처럼 겹치는 짧은 용어를 두 번 세지 않는다.
 */
export const termRecall = (
  reference: string,
  hypothesis: string,
  terms: string[]
): TermRecall => {
  let ref = normalizeForScoring(reference);
  let hyp = normalizeForScoring(hypothesis);
  const unique = [...new Set(terms.map((t) => normalizeForScoring(t)).filter(Boolean))].sort(
    (a, b) => b.length - a.length
  );
  const display = new Map(terms.map((t) => [normalizeForScoring(t), t.trim()]));
  let expected = 0;
  let found = 0;
  const missed: TermRecall['missed'] = [];
  for (const term of unique) {
    const inRef = countOccurrences(ref, term);
    if (!inRef) continue;
    const inHyp = countOccurrences(hyp, term);
    const hit = Math.min(inRef, inHyp);
    expected += inRef;
    found += hit;
    if (hit < inRef) missed.push({ term: display.get(term) ?? term, expected: inRef, found: hit });
    // 센 자리는 지워 짧은 용어가 다시 세지 않게 한다.
    ref = ref.split(term).join('\u0000');
    hyp = hyp.split(term).join('\u0000');
  }
  return { expected, found, recall: expected ? found / expected : 1, missed };
};
