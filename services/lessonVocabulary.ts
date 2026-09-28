/**
 * lessonVocabulary — 코치별 레슨 용어 사전.
 *
 * 왜 필요한가
 * -----------
 * 공용 골프 용어 목록(lessonAudioPipeline 의 GOLF_TERM_HINTS)은 교과서 어휘다.
 * 실제 코치는 자기만의 말을 쓴다 — 직접 이름 붙인 드릴, 따르는 스윙 이론의
 * 용어("스택 앤 틸트", "원 플레인"), 입버릇처럼 쓰는 영어 표현. 이런 말은
 * 공용 목록에 없어 음성 인식도 교정 모델도 매번 같은 방식으로 틀린다.
 *
 * 사전은 두 부분이다:
 *  - terms: 코치가 직접 등록한 전용 용어.
 *  - corrections: "이렇게 잘못 들렸다 → 이게 맞다" 짝. 코치가 검토 화면에서
 *    필기를 고치면 그 차이에서 자동으로 배운다(learnCorrectionsFromEdit).
 *    같은 코치의 같은 오인식은 반복되므로, 한 번 고친 말은 다음 레슨부터
 *    처음부터 바르게 적힌다.
 *
 * 저장은 서버(`/api/coaches/me/lesson-vocabulary`)가 원본이고, 오프라인·
 * 서버 실패에 대비해 마지막으로 받은 사전을 localStorage 에 둔다.
 */
import { createLogger } from '../utils/logger';

const log = createLogger('lessonVocabulary');

export interface LessonVocabularyCorrection {
  from: string;
  to: string;
}

export interface LessonVocabulary {
  terms: string[];
  corrections: LessonVocabularyCorrection[];
}

export const EMPTY_LESSON_VOCABULARY: LessonVocabulary = { terms: [], corrections: [] };

// 서버(server/src/services/lessonVocabulary.ts)와 같은 상한이다.
export const MAX_VOCAB_TERMS = 300;
export const MAX_VOCAB_CORRECTIONS = 200;
export const MAX_VOCAB_ITEM_LEN = 40;

const cleanItem = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const text = value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/["`{}[\]<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > MAX_VOCAB_ITEM_LEN ? '' : text;
};

/** 어떤 입력이 와도 저장·프롬프트에 안전한 사전 모양으로 만든다. */
export const normalizeLessonVocabulary = (input: unknown): LessonVocabulary => {
  const raw = (input && typeof input === 'object' ? input : {}) as {
    terms?: unknown;
    corrections?: unknown;
  };
  const terms: string[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw.terms) ? raw.terms : []) {
    const term = cleanItem(item);
    if (!term || seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
    if (terms.length >= MAX_VOCAB_TERMS) break;
  }
  // 같은 from 이 여러 번 오면 뒤의 것(최근 교정)을 남긴다.
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

/** 편집기 입력(쉼표·줄바꿈 구분)을 용어 배열로. */
export const parseTermsInput = (text: string): string[] =>
  text
    .split(/[,\n，、]/)
    .map((t) => t.trim())
    .filter(Boolean);

export const isEmptyVocabulary = (v: LessonVocabulary): boolean =>
  v.terms.length === 0 && v.corrections.length === 0;

// ─── 프롬프트 블록 ──────────────────────────────────────────────────────────

/**
 * 전사·교정 프롬프트에 붙이는 코치 사전 블록. 비어 있으면 빈 문자열.
 *
 * - mode 'audio': 소리를 듣고 적는 프롬프트용 — "이렇게 들리면 이렇게 적으라".
 * - mode 'text': 이미 적힌 글을 고치는 프롬프트용 — "이렇게 적힌 곳은 고치라".
 * - mode 'terms': 짧게 유지해야 하는 실시간 프롬프트용 — 용어만.
 */
export const buildVocabularyPromptBlock = (
  vocab: LessonVocabulary,
  mode: 'audio' | 'text' | 'terms'
): string => {
  const parts: string[] = [];
  if (vocab.terms.length) {
    const terms = mode === 'terms' ? vocab.terms.slice(0, 80) : vocab.terms;
    parts.push(
      `이 코치가 등록한 전용 용어(공용 목록보다 우선합니다. 표기도 이대로 적으세요):\n${terms.join(', ')}`
    );
  }
  if (mode !== 'terms' && vocab.corrections.length) {
    const lead =
      mode === 'audio'
        ? '이 코치의 지난 레슨에서 코치가 직접 고친 오인식입니다. 왼쪽처럼 들리는 자리에서 문맥이 맞으면 오른쪽으로 적으세요:'
        : '이 코치의 지난 레슨에서 코치가 직접 고친 오인식입니다. 왼쪽처럼 적힌 곳은 문맥이 맞으면 오른쪽으로 고치세요:';
    parts.push(
      `${lead}\n${vocab.corrections.map((c) => `- "${c.from}" → "${c.to}"`).join('\n')}`
    );
  }
  return parts.join('\n\n');
};

// ─── 검토 수정에서 배우기 ───────────────────────────────────────────────────

/**
 * 한글 음절을 자모 기호열로 편다. "생크"와 "섕크"처럼 모음 하나만 다른
 * 오인식은 음절 단위로 보면 완전히 다른 글자지만, 자모로 보면 거의 같다.
 */
const toJamo = (text: string): string[] => {
  const out: string[] = [];
  for (const ch of text.replace(/\s+/g, '').toLowerCase()) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const idx = code - 0xac00;
      out.push(`c${Math.floor(idx / 588)}`, `v${Math.floor((idx % 588) / 28)}`);
      const jong = idx % 28;
      if (jong) out.push(`j${jong}`);
    } else {
      out.push(ch);
    }
  }
  return out;
};

/**
 * 두 말의 발음 닮음(0~1) — 자모열의 편집 거리를 긴 쪽 길이로 나눠 뺀 값.
 *
 * 순서를 보는 편집 거리여야 한다. 2-그램 겹침은 "인투아웃"과 "아웃투인"
 * (뜻이 반대인 두 용어)을 거의 같다고 보고, "백스윙→다운스윙" 같은 내용
 * 수정과 "생크→섕크" 같은 오인식을 같은 점수로 매긴다.
 */
export const pronunciationSimilarity = (a: string, b: string): number => {
  const left = toJamo(a);
  const right = toJamo(b);
  if (!left.length || !right.length) return 0;
  let row = Array.from({ length: right.length + 1 }, (_, j) => j);
  for (let i = 1; i <= left.length; i++) {
    const next = [i];
    for (let j = 1; j <= right.length; j++) {
      next[j] = Math.min(
        row[j] + 1,
        next[j - 1] + 1,
        row[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
    }
    row = next;
  }
  return 1 - row[right.length] / Math.max(left.length, right.length);
};

/** 최장 공통 부분열 정렬 — 같은 항목 쌍의 [i, j] 목록(순서대로). */
const lcsPairs = <T>(a: T[], b: T[]): Array<[number, number]> => {
  const n = a.length;
  const m = b.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
};

/** 한 번의 교체로 볼 최대 어절 수 — 이보다 길면 오인식이 아니라 문장 수정이다. */
const MAX_REPLACE_TOKENS = 3;
/** 배울 말의 최대 길이(공백 제외). */
const MAX_LEARN_LEN = 20;
/**
 * 이 이상 발음이 닮아야 "잘못 들린 말"로 본다. 내용 수정과 가르는 선이다.
 * 실측: 오인식(생크→섕크 0.80, 페이서→페이스 0.83, 치킨이→치킨윙 0.75)은
 * 모두 이 위, 내용 수정(왼팔을→오른팔을 0.73, 백스윙→다운스윙 0.50,
 * 인투아웃→아웃투인 0.20)은 모두 아래였다.
 */
const MIN_LEARN_SIMILARITY = 0.75;
/** 어절 끝에서 떼어 낼 수 있는 조사 한 글자. "페이서가→페이스가" 에서 "가"를 뗀다. */
const TRAILING_PARTICLES = new Set([...'은는이가을를에의로도만와과랑']);
/** 한 줄 편집 안에서 비교할 최대 어절 수 — 넘는 줄은 건너뛴다(비용 상한). */
const MAX_LINE_TOKENS = 400;
/** 한 번 저장에서 비교할 최대 줄 수. */
const MAX_LINES = 2_000;

const stripPunct = (t: string) => t.replace(/^[\s"'“”‘’(]+|[\s"'“”‘’).,!?…~·]+$/g, '');

const toCandidate = (del: string[], ins: string[]): LessonVocabularyCorrection | null => {
  if (!del.length || !ins.length) return null;
  if (del.length > MAX_REPLACE_TOKENS || ins.length > MAX_REPLACE_TOKENS) return null;
  // 화자 표기("코치:")를 바꾼 편집은 용어가 아니다.
  if ([...del, ...ins].some((t) => t.endsWith(':'))) return null;
  let from = stripPunct(del.join(' '));
  let to = stripPunct(ins.join(' '));
  const lastFrom = from.slice(-1);
  if (
    lastFrom === to.slice(-1) &&
    TRAILING_PARTICLES.has(lastFrom) &&
    from.length > 2 &&
    to.length > 2
  ) {
    from = from.slice(0, -1).trim();
    to = to.slice(0, -1).trim();
  }
  const sq = (t: string) => t.replace(/\s+/g, '');
  if (!from || !to || sq(from) === sq(to)) return null; // 띄어쓰기만 바꾼 편집
  if (sq(from).length < 2 || sq(to).length < 2) return null; // 한 글자는 근거가 너무 약하다
  if (sq(from).length > MAX_LEARN_LEN || sq(to).length > MAX_LEARN_LEN) return null;
  if (!/[가-힣a-zA-Z]/.test(from) || !/[가-힣a-zA-Z]/.test(to)) return null;
  if (pronunciationSimilarity(from, to) < MIN_LEARN_SIMILARITY) return null;
  // 여러 어절을 같은 수만큼 바꿨다면 어절마다 닮아야 한다 — 한 어절만 크게
  // 바뀐 편집("왼팔을 펴고→오른팔을 접고")이 전체 평균에 묻혀 통과하지 않게.
  if (del.length === ins.length && del.length > 1) {
    const each = del.every(
      (d, k) =>
        stripPunct(d) === stripPunct(ins[k]) ||
        pronunciationSimilarity(stripPunct(d), stripPunct(ins[k])) >= MIN_LEARN_SIMILARITY
    );
    if (!each) return null;
  }
  return { from, to };
};

/** 두 줄의 문자 2-그램 Dice(0~1) — 어느 줄이 어느 줄을 고친 것인지 짝지을 때만 쓴다. */
const lineSimilarity = (a: string, b: string): number => {
  const grams = (t: string) => {
    const x = t.replace(/\s+/g, '');
    const g: string[] = [];
    for (let i = 0; i + 1 < x.length; i++) g.push(x.slice(i, i + 2));
    return g;
  };
  const left = grams(a);
  const right = grams(b);
  if (!left.length || !right.length) return 0;
  const pool = new Map<string, number>();
  for (const g of left) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hits = 0;
  for (const g of right) {
    const n = pool.get(g) ?? 0;
    if (n > 0) {
      hits += 1;
      pool.set(g, n - 1);
    }
  }
  return (2 * hits) / (left.length + right.length);
};

/** 한 줄 쌍에서 어절 교체를 뽑는다. */
const extractFromLinePair = (before: string, after: string): LessonVocabularyCorrection[] => {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);
  if (!a.length || !b.length || a.length > MAX_LINE_TOKENS || b.length > MAX_LINE_TOKENS) {
    return [];
  }
  const out: LessonVocabularyCorrection[] = [];
  let pi = 0;
  let pj = 0;
  for (const [i, j] of [...lcsPairs(a, b), [a.length, b.length] as [number, number]]) {
    const cand = toCandidate(a.slice(pi, i), b.slice(pj, j));
    if (cand) out.push(cand);
    pi = i + 1;
    pj = j + 1;
  }
  return out;
};

/**
 * 검토 화면의 필기 초안(original)과 코치가 고친 필기(edited)를 비교해
 * "잘못 들린 말 → 바른 말" 짝을 뽑는다.
 *
 * 배우는 것은 **발음이 닮은 짧은 교체**뿐이다. 코치가 문장을 지우거나
 * 새로 쓰거나 내용을 바꾼 편집은 오인식이 아니므로 버린다 — 잘못 배운
 * 짝은 다음 레슨의 멀쩡한 말을 틀리게 바꾼다.
 */
export const learnCorrectionsFromEdit = (
  original: string,
  edited: string
): LessonVocabularyCorrection[] => {
  if (!original.trim() || !edited.trim() || original === edited) return [];
  const before = original.split('\n').slice(0, MAX_LINES);
  const after = edited.split('\n').slice(0, MAX_LINES);

  // 줄 단위로 먼저 맞춘 뒤, 두 앵커 사이에서 바뀐 줄끼리 짝지어 비교한다.
  const out: LessonVocabularyCorrection[] = [];
  let pi = 0;
  let pj = 0;
  for (const [i, j] of [...lcsPairs(before, after), [before.length, after.length] as [number, number]]) {
    const removed = before.slice(pi, i);
    const added = after.slice(pj, j);
    // 바뀐 줄마다 가장 닮은 새 줄과 짝짓는다(순서 유지). 코치가 줄을 끼워
    // 넣거나 지우면 위치로 짝지은 줄은 서로 다른 말이 된다.
    let from = 0;
    for (const line of removed) {
      let best = -1;
      let bestScore = 0.3; // 이보다 안 닮았으면 고친 줄이 아니라 다른 줄이다
      for (let k = from; k < added.length; k++) {
        const score = lineSimilarity(line, added[k]);
        if (score > bestScore) {
          best = k;
          bestScore = score;
        }
      }
      if (best < 0) continue;
      out.push(...extractFromLinePair(line, added[best]));
      from = best + 1;
    }
    pi = i + 1;
    pj = j + 1;
  }
  return normalizeLessonVocabulary({ corrections: out }).corrections;
};

/** 배운 짝을 사전에 합친다(같은 from 은 최근 것으로). */
export const mergeCorrections = (
  vocab: LessonVocabulary,
  learned: LessonVocabularyCorrection[]
): LessonVocabulary =>
  normalizeLessonVocabulary({
    terms: vocab.terms,
    corrections: [...vocab.corrections, ...learned],
  });

// ─── 저장소 ─────────────────────────────────────────────────────────────────

const CACHE_KEY = 'coachxai_lesson_vocabulary';

const readCache = (): LessonVocabulary => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? normalizeLessonVocabulary(JSON.parse(raw)) : EMPTY_LESSON_VOCABULARY;
  } catch {
    return EMPTY_LESSON_VOCABULARY;
  }
};

const writeCache = (vocab: LessonVocabulary): void => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(vocab));
  } catch {
    // 저장 공간이 없어도 사전 기능 자체는 서버 값으로 돈다.
  }
};

/** 서버의 사전을 읽는다. 실패하면 마지막으로 받은 사전을 쓴다. */
export const loadLessonVocabulary = async (): Promise<LessonVocabulary> => {
  try {
    // API 계층은 여기서만 필요하다 — 정적 import 하면 필기 파이프라인이 이
    // 모듈의 순수 함수(프롬프트 블록)를 쓰는 것만으로 API 계층까지 끌려온다.
    const { apiService } = await import('./apiService');
    const vocab = normalizeLessonVocabulary(await apiService.getLessonVocabulary());
    writeCache(vocab);
    return vocab;
  } catch (err) {
    log.warn('용어 사전을 불러오지 못해 캐시를 씁니다:', err);
    return readCache();
  }
};

/** 사전을 저장하고, 서버가 정규화한 최종본을 돌려준다. */
export const saveLessonVocabulary = async (
  vocab: LessonVocabulary
): Promise<LessonVocabulary> => {
  const normalized = normalizeLessonVocabulary(vocab);
  const { apiService } = await import('./apiService');
  const saved = normalizeLessonVocabulary(await apiService.saveLessonVocabulary(normalized));
  writeCache(saved);
  return saved;
};

/**
 * 검토 수정에서 배운 짝을 사전에 더해 저장한다. 배운 게 없으면 저장하지
 * 않는다. 몇 개를 새로 배웠는지(이미 같은 짝이 있으면 제외) 돌려준다.
 */
export const learnFromReviewEdit = async (
  original: string,
  edited: string,
  current?: LessonVocabulary
): Promise<{ learned: number; vocabulary: LessonVocabulary }> => {
  const base = current ?? readCache();
  const learned = learnCorrectionsFromEdit(original, edited).filter(
    (c) => !base.corrections.some((e) => e.from === c.from && e.to === c.to)
  );
  if (!learned.length) return { learned: 0, vocabulary: base };
  const vocabulary = await saveLessonVocabulary(mergeCorrections(base, learned));
  return { learned: learned.length, vocabulary };
};
