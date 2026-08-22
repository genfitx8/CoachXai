/**
 * 레슨 스토리 조판기 — 기록 하나를 블록의 순열로 바꾼다.
 * 기획: docs/LESSON_STORY_UI_PLAN.md
 *
 * 이 파일이 이 기능의 전부다. `LessonStoryView` 는 여기서 나온 배열만
 * 보고 그리므로, "카드 나열을 글로 바꾼다"는 판단은 전부 여기 모여 있고
 * 브라우저 없이 테스트할 수 있다.
 *
 * 두 가지 규칙이 화면의 성격을 결정한다.
 *
 *  1. **문단과 미디어의 교차**(§5.2) — 사진을 한곳에 모으면 갤러리가 되고,
 *     문단 사이에 흩으면 글이 된다. 그리고 어느 문단 옆에 놓을지는
 *     **찍힌 시각**이 정한다: 레슨 20분쯤에 찍은 사진은 글의 20% 지점으로
 *     간다. 코치는 그 순간의 이야기를 하면서 그 사진을 찍었기 때문에,
 *     시각이 "이 사진이 무슨 이야기에 속하는가"의 가장 정확한 근거다.
 *     `placeMedia()` 하나가 그 배치를 맡는다.
 *  2. **폴백 사슬**(§5.1) — `reviewSections`(코치 최종본)를 항상 우선하되
 *     비어 있으면 `liveLessonDetail` → `aiAnalysis` → `coachNotes` 로 떨어진다.
 *     그래서 `Lesson.story` 가 통째로 없는 과거 기록도 스토리로 보이고,
 *     M1 을 데이터 마이그레이션 없이 배포할 수 있다.
 */
import type {
  GolfData,
  Lesson,
  LessonStory,
  MediaItem,
  StoryBlock,
} from '../types';

/**
 * `lesson.videoUrl` / `lesson.thumbnailUrl` 이 차지하는 미디어 슬롯의 id.
 * additionalMedia 와 달리 MediaItem 레코드가 없으므로 예약어를 쓴다.
 * 뷰는 이 id 를 받으면 메인 슬롯을 그린다.
 */
export const MAIN_MEDIA_ID = 'main';

/**
 * 교차 삽입을 포기하고 짧은 레이아웃으로 떨어지는 문단 수 하한.
 * feedback 이 한두 문장뿐인 기록이 실제로 많은데, 그런 글에 사진을
 * 끼워 넣으면 리듬이 사는 게 아니라 문단이 토막 난다.
 */
export const SHORT_LAYOUT_MIN_PARAGRAPHS = 2;

export interface ComposeStoryOptions {
  /** 이 화면을 보는 쪽. 학생 뷰만 체크리스트를 체크할 수 있다. */
  viewer: 'COACH' | 'CLIENT';
  /** 서명에 쓸 코치 이름. 없으면 서명 블록의 이름을 생략한다. */
  coachName?: string;
}

/** 미디어 슬롯 하나 — additionalMedia 항목이거나 메인 슬롯. */
interface MediaSlot {
  id: string;
  type: MediaItem['type'];
  role?: MediaItem['role'];
  /** 찍힌 시각(wall-clock ms). 모르면 undefined — 균등 배치로 떨어진다. */
  capturedAt?: number;
}

/** 자료를 레슨 시간축 위에 놓기 위한 기준. 없으면 균등 배치로 떨어진다. */
interface LessonWindow {
  startedAt?: number;
  durationSec?: number;
}

// ─────────────────────────────────────────────────────────────────────
// 텍스트
// ─────────────────────────────────────────────────────────────────────

/**
 * 마크다운 장식을 걷어내고 문단 배열로 만든다.
 *
 * `feedback` 은 코치가 직접 쓴 산문이지만 `aiAnalysis` 는 헤딩과 불릿이
 * 섞인 마크다운이다. 종이 위에 `##` 나 `- ` 가 그대로 찍히면 일기가
 * 아니라 로그로 보이므로 여기서 정리한다. 한 줄 = 한 문단으로 다루는
 * 것은 의도다 — 빈 줄 기준으로만 끊으면 불릿 목록 전체가 한 덩어리가 된다.
 */
export const toPlainParagraphs = (text?: string | null): string[] => {
  if (!text) return [];
  return text
    .split('\n')
    .map((line) =>
      line
        .trim()
        // 헤딩(`## `), 불릿(`- `, `* `, `+ `), 번호(`1. `), 인용(`> `)
        .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)/, '')
        // 강조 마커는 종이 위에서 의미가 없다
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        // 구분선만 있는 줄
        .replace(/^\s*[-*_]{3,}\s*$/, '')
        .trim()
    )
    .filter(Boolean);
};

/** 리드로 쓸 첫 문단과 본문으로 쓸 나머지를 나눈다. */
const splitLeadAndBody = (
  leadSource: string | undefined,
  bodySource: string | undefined
): { lead?: string; body: string[] } => {
  const leadParas = toPlainParagraphs(leadSource);
  const bodyParas = toPlainParagraphs(bodySource);

  if (leadParas.length > 0) {
    // 리드 소스가 여러 문단이면 첫 문단만 리드로 쓰고 나머지는 본문 앞에 붙인다.
    return { lead: leadParas[0], body: [...leadParas.slice(1), ...bodyParas] };
  }
  // 리드 소스가 없으면 본문 첫 문단이 리드 역할을 한다.
  if (bodyParas.length > 0) {
    return { lead: bodyParas[0], body: bodyParas.slice(1) };
  }
  return { body: [] };
};

// ─────────────────────────────────────────────────────────────────────
// 미디어
// ─────────────────────────────────────────────────────────────────────

/**
 * 이 기록이 가진 모든 미디어 슬롯 — 메인 슬롯이 있으면 맨 앞에 온다.
 *
 * 레슨 동반 기록에서 메인 슬롯은 **가장 먼저 찍힌 클립**이다(폼이 클립을
 * 촬영 순서대로 받아 첫 장을 메인으로 올린다). 메인 슬롯에는 시각을 담을
 * 자리가 따로 없으므로 레슨 시작 시각으로 본다 — 실제로 그때 찍혔다.
 */
const collectSlots = (lesson: Lesson): MediaSlot[] => {
  const slots: MediaSlot[] = [];
  if (lesson.videoUrl || lesson.videoKey || lesson.thumbnailUrl) {
    slots.push({
      id: MAIN_MEDIA_ID,
      type: lesson.mediaType,
      capturedAt: lesson.liveLessonDetail?.startedAt,
    });
  }
  for (const m of lesson.additionalMedia ?? []) {
    // 음성은 글 사이에 놓을 것이 아니다 — 스토리에서는 다루지 않는다.
    if (m.type === 'audio') continue;
    slots.push({ id: m.id, type: m.type, role: m.role, capturedAt: m.createdAt });
  }
  return slots;
};

/** 레슨 전/후 비교로 뺄 영상 쌍. 둘 다 있을 때만 성립한다. */
const pickComparePair = (
  lesson: Lesson
): { beforeId: string; afterId: string } | undefined => {
  const media = lesson.additionalMedia ?? [];
  const before = media.find((m) => m.type === 'video' && m.role === 'BEFORE');
  const after = media.find((m) => m.type === 'video' && m.role === 'AFTER');
  if (!before || !after) return undefined;
  return { beforeId: before.id, afterId: after.id };
};

/**
 * 본문에 흩을 미디어 풀.
 *
 * 후보는 `reviewSections.attachmentIds` — 검토 화면에서 코치가 이미
 * "이건 붙일 것"이라 골라둔 목록이다. 새 UI 를 만들지 않고 그 의도를
 * 그대로 재사용한다. 목록이 없으면(구 기록) 가진 미디어 전부를 쓴다.
 * 전/후 비교 쌍만 제외한다 — 그쪽에서 이미 제 자리를 얻었다.
 *
 * 표지는 자료를 가져가지 않는다. 사진과 영상은 전부 본문으로 내려가
 * 자기가 속한 이야기 옆에 놓인다.
 */
const pickBodyPool = (
  lesson: Lesson,
  slots: MediaSlot[],
  pair: { beforeId: string; afterId: string } | undefined
): MediaSlot[] => {
  const attachmentIds = lesson.reviewSections?.attachmentIds;
  const allowed =
    attachmentIds && attachmentIds.length > 0 ? new Set(attachmentIds) : null;

  return slots.filter((s) => {
    if (pair && (s.id === pair.beforeId || s.id === pair.afterId)) return false;
    // 메인 슬롯은 attachmentIds 에 실릴 수 없으므로 허용 목록의 예외로 둔다.
    if (allowed && s.id !== MAIN_MEDIA_ID && !allowed.has(s.id)) return false;
    return true;
  });
};

/** 미디어 슬롯 하나를 photo/video 블록으로. 크기는 호출자가 번갈아 준다. */
const mediaBlock = (
  slot: MediaSlot,
  size: 'inset' | 'full',
  captions?: Record<string, string>
): StoryBlock => ({
  kind: slot.type === 'video' ? 'video' : 'photo',
  mediaId: slot.id,
  caption: captions?.[slot.id],
  size,
});

/**
 * 자료 하나가 레슨의 어느 지점에서 나왔는지 0~1 로 환산한다.
 *
 * 레슨 시작 시각과 길이를 알면 진짜 시간축 위의 위치가 나온다. 모르면
 * (구 기록, 직접 올린 사진) 순번대로 균등하게 편다 — 이 경우 예전과
 * 똑같이 동작한다.
 */
const ratioFor = (
  slot: MediaSlot,
  index: number,
  total: number,
  window: LessonWindow
): number => {
  const { startedAt, durationSec } = window;
  if (
    slot.capturedAt != null &&
    startedAt != null &&
    durationSec != null &&
    durationSec > 0
  ) {
    const offsetSec = (slot.capturedAt - startedAt) / 1000;
    return Math.min(1, Math.max(0, offsetSec / durationSec));
  }
  // 균등 배치 — 예전 gap = ceil(N/(M+1)) 와 같은 자리에 떨어진다.
  return (index + 1) / (total + 1);
};

/**
 * 문단 사이에 자료를 꽂는다 — 이 기획의 심장(§5.2).
 *
 * 코치는 레슨하면서 그 순간의 이야기를 하며 사진을 찍는다. 그래서 **찍힌
 * 시각이 "이 사진이 어느 이야기에 속하는가"의 가장 정확한 근거**다. 레슨
 * 20분쯤(전체의 1/3 지점)에 찍은 사진은 글의 1/3 지점으로 간다.
 *
 * 시간만 따르면 무너지는 경우가 하나 있다. 코치가 마지막 5분에 몰아서
 * 세 장을 찍으면 셋이 글 끝에 붙어 다시 갤러리처럼 보인다. 그래서 순서는
 * 시각이 정하되, **자료 사이에는 문단이 최소 하나** 들어가도록 뒤로 민다.
 * 마지막 문단 뒤에는 놓지 않는다 — 글의 끝은 문단이어야 다음 블록(할 일,
 * 서명)으로 자연스럽게 넘어간다. 밀려서 자리를 못 얻은 자료는 조용히
 * 버리지 않고 하단 갤러리로 모은다.
 */
export const placeMedia = (
  paragraphs: string[],
  pool: MediaSlot[],
  options: { window?: LessonWindow; captions?: Record<string, string> } = {}
): StoryBlock[] => {
  const { window = {}, captions } = options;
  if (pool.length === 0) {
    return paragraphs.map((text) => ({ kind: 'paragraph', text }));
  }

  // 찍힌 순서대로 — 글이 시간을 거스르지 않게. 시각을 모르는 자료는
  // 원래 순서를 유지한다(sort 가 안정적이므로 동률이면 그대로).
  const ordered = pool
    .map((slot, index) => ({ slot, ratio: ratioFor(slot, index, pool.length, window) }))
    .sort((a, b) => a.ratio - b.ratio);

  // 놓을 수 있는 자리는 "문단 1개 뒤" ~ "마지막 문단 앞", 즉 1..lastSlot.
  const lastSlot = paragraphs.length - 1;
  const capacity = Math.max(0, lastSlot);
  const take = Math.min(ordered.length, capacity);
  const leftovers = ordered.slice(take).map((o) => o.slot);

  // 원하는 자리 = 시간 비율을 문단 수에 그대로 대응시킨 지점.
  const at = ordered.slice(0, take).map((o) => Math.round(o.ratio * paragraphs.length));

  /*
   * 두 번 다듬는다. 뒤에서부터 한 번(자기 뒤에 남은 자료가 들어갈 자리를
   * 비워 둔다), 앞에서부터 한 번(간격 1을 보장한다). 뒤쪽 다듬기가 없으면
   * 코치가 마지막 5분에 몰아 찍은 자료들이 글 끝을 넘겨 전부 갤러리로
   * 떨어진다 — 시각은 지켰지만 배치는 포기한 셈이 된다. 앞으로 당겨서
   * 나란히 흩어 놓는 편이 맞다.
   */
  for (let i = take - 1; i >= 0; i--) {
    at[i] = Math.min(at[i], lastSlot - (take - 1 - i));
  }
  for (let i = 0; i < take; i++) {
    at[i] = Math.max(at[i], i === 0 ? 1 : at[i - 1] + 1);
  }

  const placements = new Map<number, StoryBlock>();
  ordered.slice(0, take).forEach(({ slot }, i) => {
    // full / inset 을 번갈아 쓴다 — 같은 크기가 반복되면 리듬이 죽는다.
    placements.set(at[i], mediaBlock(slot, i % 2 === 0 ? 'full' : 'inset', captions));
  });

  const blocks: StoryBlock[] = [];
  paragraphs.forEach((text, i) => {
    blocks.push({ kind: 'paragraph', text });
    const media = placements.get(i + 1);
    if (media) blocks.push(media);
  });

  if (leftovers.length > 0) {
    blocks.push({ kind: 'gallery', mediaIds: leftovers.map((sl) => sl.id) });
  }
  return blocks;
};

// ─────────────────────────────────────────────────────────────────────
// 조판
// ─────────────────────────────────────────────────────────────────────

const hasAnyGolfData = (golf?: GolfData): golf is GolfData =>
  !!golf && Object.values(golf).some((v) => typeof v === 'number' && !Number.isNaN(v));

const dedupe = (items: (string | undefined)[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const v = raw?.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
};

/**
 * 기록 하나를 스토리 블록 배열로 조판한다.
 *
 * `lesson.story.blocks` 가 있고 코치가 손댔다면(M3) 그 배열을 그대로
 * 돌려준다 — 코치가 짠 순서를 자동 조판이 덮는 일은 없어야 한다.
 */
export const composeStory = (
  lesson: Lesson,
  opts: ComposeStoryOptions
): StoryBlock[] => {
  const story: LessonStory = lesson.story ?? {};
  if (story.editedByCoach && story.blocks && story.blocks.length > 0) {
    return story.blocks;
  }

  const isStudent = opts.viewer === 'CLIENT';
  /**
   * 학생에게 MEDIA_ONLY 로 공유된 기록은 글이 내려가지 않는다.
   * 그래도 빈 화면이 되면 안 되므로 사진첩 형태의 스토리로 조판한다.
   */
  const mediaOnly = isStudent && lesson.shareOption === 'MEDIA_ONLY';

  const slots = collectSlots(lesson);
  const pair = pickComparePair(lesson);
  const pool = pickBodyPool(lesson, slots, pair);
  const captions = story.captions;
  /**
   * 자료를 놓을 시간축. 레슨 동반 기록에만 있고, 없으면 배치가 균등
   * 방식으로 떨어진다.
   */
  const window: LessonWindow = {
    startedAt: lesson.liveLessonDetail?.startedAt,
    durationSec: lesson.liveLessonDetail?.recordedDurationSec,
  };

  const blocks: StoryBlock[] = [];

  // 표지는 글자만이다 — 사진과 영상은 전부 본문으로 내려가 자기가 속한
  // 이야기 옆에 놓인다. 맨 위에 사진 한 장을 크게 거는 것은 "그날의
  // 얼굴"을 만들지만, 그 사진이 어느 이야기의 것인지는 지워 버린다.
  blocks.push({
    kind: 'cover',
    headline: (story.headline?.trim() || lesson.title || '레슨 기록').trim(),
    dek: story.dek?.trim() || undefined,
    date: lesson.date,
    sessionNumber: lesson.sessionNumber,
    coachName: opts.coachName,
  });

  if (mediaOnly) {
    if (pair) blocks.push({ kind: 'compare', ...pair });
    if (pool.length > 0) {
      blocks.push({ kind: 'gallery', mediaIds: pool.map((s) => s.id) });
    }
    if (lesson.swingSequence && lesson.swingSequence.length > 0) {
      blocks.push({ kind: 'filmstrip', items: lesson.swingSequence });
    }
    blocks.push({
      kind: 'signature',
      coachName: opts.coachName,
      signedAt: lesson.approvedAt,
    });
    return blocks;
  }

  // ── 글 ────────────────────────────────────────────────────────────
  const live = lesson.liveLessonDetail;
  const { lead, body } = splitLeadAndBody(
    lesson.reviewSections?.todayCovered || live?.summary,
    lesson.reviewSections?.feedback || lesson.aiAnalysis || lesson.coachNotes
  );

  if (lead) blocks.push({ kind: 'lead', text: lead });

  const keyPoints = dedupe(live?.keyPoints ?? []);
  if (keyPoints.length > 0) {
    blocks.push({ kind: 'chips', items: keyPoints, tone: 'key' });
  }

  if (body.length >= SHORT_LAYOUT_MIN_PARAGRAPHS) {
    blocks.push(...placeMedia(body, pool, { window, captions }));
  } else {
    // 짧은 레이아웃 — 교차 삽입을 포기하고 문단 뒤에 갤러리를 붙인다.
    body.forEach((text) => blocks.push({ kind: 'paragraph', text }));
    if (pool.length === 1) {
      blocks.push(mediaBlock(pool[0], 'full', captions));
    } else if (pool.length > 1) {
      blocks.push({ kind: 'gallery', mediaIds: pool.map((s) => s.id) });
    }
  }

  // ── 꼬리 — 순서 고정(§5.3) ────────────────────────────────────────
  if (pair) blocks.push({ kind: 'compare', ...pair });

  if (lesson.swingSequence && lesson.swingSequence.length > 0) {
    blocks.push({ kind: 'filmstrip', items: lesson.swingSequence });
  }

  if (hasAnyGolfData(lesson.golfData)) {
    blocks.push({ kind: 'data', golf: lesson.golfData });
  }

  const actions = dedupe([
    ...(lesson.reviewSections?.nextActions ?? []),
    ...(lesson.reviewSections?.nextActions?.length ? [] : lesson.assignedHomework ?? []),
    ...(lesson.reviewSections?.nextActions?.length || lesson.assignedHomework?.length
      ? []
      : live?.drills ?? []),
  ]);
  if (actions.length > 0) {
    blocks.push({ kind: 'checklist', items: actions, checkable: isStudent });
  }

  const memo = lesson.reviewSections?.freeMemo?.trim();
  if (memo) blocks.push({ kind: 'memo', text: memo });

  if (live?.transcript && live.transcript.length > 0) {
    // 필기 원문은 정리된 글의 근거다 — 학생에게는 전체 공유일 때만 내려간다.
    const maySeeTranscript = !isStudent || lesson.shareOption !== 'MEDIA_ONLY';
    if (maySeeTranscript) {
      blocks.push({
        kind: 'notefold',
        transcript: live.transcript,
        durationSec: live.recordedDurationSec,
      });
    }
  }

  blocks.push({
    kind: 'signature',
    coachName: opts.coachName,
    signedAt: lesson.approvedAt,
  });

  const feedback = lesson.clientFeedback;
  const hasReply = !!(feedback?.text?.trim() || feedback?.voiceUrl);
  if (hasReply) {
    blocks.push({ kind: 'reply', feedback, invite: false });
  } else if (isStudent) {
    blocks.push({ kind: 'reply', invite: true });
  }

  return blocks;
};
