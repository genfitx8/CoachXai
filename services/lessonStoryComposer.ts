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
 *     문단 사이에 흩으면 글이 된다. `interleave()` 하나가 그 차이를 만든다.
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

/** 이 기록이 가진 모든 미디어 슬롯 — 메인 슬롯이 있으면 맨 앞에 온다. */
const collectSlots = (lesson: Lesson): MediaSlot[] => {
  const slots: MediaSlot[] = [];
  if (lesson.videoUrl || lesson.videoKey || lesson.thumbnailUrl) {
    slots.push({ id: MAIN_MEDIA_ID, type: lesson.mediaType });
  }
  for (const m of lesson.additionalMedia ?? []) {
    // 음성은 글 사이에 놓을 것이 아니다 — 스토리에서는 다루지 않는다.
    if (m.type === 'audio') continue;
    slots.push({ id: m.id, type: m.type, role: m.role });
  }
  return slots;
};

/**
 * 대표컷 — 목록에서 이 기록을 되돌아보게 만드는 한 장(§5.2).
 * 코치 지정 → 레슨 후 영상 → 메인 슬롯 → 레슨 중 캡처 → 아무 사진 → 아무 영상.
 */
const pickCover = (lesson: Lesson, slots: MediaSlot[]): string | undefined => {
  const has = (id?: string) => !!id && slots.some((s) => s.id === id);

  if (has(lesson.story?.coverMediaId)) return lesson.story!.coverMediaId;

  const after = (lesson.additionalMedia ?? []).find(
    (m) => m.type === 'video' && m.role === 'AFTER'
  );
  if (after && has(after.id)) return after.id;

  if (has(MAIN_MEDIA_ID)) return MAIN_MEDIA_ID;

  const liveShot = (lesson.additionalMedia ?? []).find(
    (m) => m.type === 'image' && m.source === 'live_lesson'
  );
  if (liveShot) return liveShot.id;

  return slots.find((s) => s.type === 'image')?.id ?? slots.find((s) => s.type === 'video')?.id;
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
 * 대표컷과 비교 쌍은 이미 제 자리를 얻었으므로 제외한다.
 */
const pickBodyPool = (
  lesson: Lesson,
  slots: MediaSlot[],
  coverId: string | undefined,
  pair: { beforeId: string; afterId: string } | undefined
): MediaSlot[] => {
  const attachmentIds = lesson.reviewSections?.attachmentIds;
  const allowed =
    attachmentIds && attachmentIds.length > 0 ? new Set(attachmentIds) : null;

  return slots.filter((s) => {
    if (s.id === coverId) return false;
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
 * 문단 사이에 미디어를 꽂는다 — 이 기획의 심장(§5.2).
 *
 *   gap = max(1, ceil(N문단 / (M미디어 + 1)))
 *
 * `gap >= 1` 이므로 연속 두 미디어 사이에는 문단이 최소 하나 보장된다.
 * 사진이 붙어 나오면 그 순간 다시 갤러리처럼 보이기 때문이다. 마지막
 * 문단 뒤에는 넣지 않는다 — 글의 끝은 문단이어야 다음 블록(할 일,
 * 서명)으로 자연스럽게 넘어간다. 자리를 못 얻은 미디어는 하단 갤러리로
 * 몰아주되, 조용히 버리지는 않는다.
 */
export const interleave = (
  paragraphs: string[],
  pool: MediaSlot[],
  captions?: Record<string, string>
): StoryBlock[] => {
  const blocks: StoryBlock[] = [];
  if (pool.length === 0) {
    return paragraphs.map((text) => ({ kind: 'paragraph', text }));
  }

  const gap = Math.max(1, Math.ceil(paragraphs.length / (pool.length + 1)));
  let next = 0;
  let sinceMedia = 0;

  paragraphs.forEach((text, i) => {
    blocks.push({ kind: 'paragraph', text });
    sinceMedia += 1;
    const isLast = i === paragraphs.length - 1;
    if (!isLast && next < pool.length && sinceMedia >= gap) {
      // full / inset 을 번갈아 쓴다 — 같은 크기가 반복되면 리듬이 죽는다.
      blocks.push(mediaBlock(pool[next], next % 2 === 0 ? 'full' : 'inset', captions));
      next += 1;
      sinceMedia = 0;
    }
  });

  if (next < pool.length) {
    blocks.push({ kind: 'gallery', mediaIds: pool.slice(next).map((s) => s.id) });
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
  const coverId = pickCover(lesson, slots);
  const pair = pickComparePair(lesson);
  const pool = pickBodyPool(lesson, slots, coverId, pair);
  const captions = story.captions;

  const blocks: StoryBlock[] = [];

  blocks.push({
    kind: 'cover',
    headline: (story.headline?.trim() || lesson.title || '레슨 기록').trim(),
    dek: story.dek?.trim() || undefined,
    mediaId: coverId,
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
    blocks.push(...interleave(body, pool, captions));
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
