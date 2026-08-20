/**
 * lessonStoryComposer 조판 규칙 테스트.
 *
 * 이 조판기가 화면의 성격을 결정하므로(카드 나열이냐 글이냐), 규칙을
 * 여기서 고정한다. 브라우저 없이 도는 순수 함수라 렌더링 없이 검증한다.
 *
 *  - 문단/미디어 교차 삽입과 그 경계 조건
 *  - 짧은 글 분기 (교차 삽입을 포기해야 하는 경우)
 *  - 폴백 사슬 — story 필드가 통째로 없는 과거 기록
 *  - MEDIA_ONLY 학생 뷰
 *  - 코치가 짠 순서의 보존
 */
import { describe, it, expect } from 'vitest';
import {
  composeStory,
  interleave,
  toPlainParagraphs,
  MAIN_MEDIA_ID,
} from '../services/lessonStoryComposer';
import type { Lesson, MediaItem, StoryBlock } from '../types';

const baseLesson = (over: Partial<Lesson> = {}): Lesson => ({
  id: 'l1',
  clientName: '이수진',
  clientPhone: '01000000000',
  createdBy: 'COACH',
  date: '2026-08-19',
  title: '드라이버 교정',
  videoUrl: '',
  mediaType: 'video',
  coachNotes: '',
  tags: [],
  createdAt: 1_700_000_000_000,
  ...over,
});

const img = (id: string, over: Partial<MediaItem> = {}): MediaItem => ({
  id,
  url: `https://cdn.test/${id}.jpg`,
  type: 'image',
  createdAt: 1,
  ...over,
});

const vid = (id: string, over: Partial<MediaItem> = {}): MediaItem => ({
  id,
  url: `https://cdn.test/${id}.mp4`,
  type: 'video',
  createdAt: 1,
  ...over,
});

const kinds = (blocks: StoryBlock[]) => blocks.map((b) => b.kind);
const only = <K extends StoryBlock['kind']>(blocks: StoryBlock[], kind: K) =>
  blocks.filter((b): b is Extract<StoryBlock, { kind: K }> => b.kind === kind);

const COACH = { viewer: 'COACH' as const, coachName: '김도현' };
const STUDENT = { viewer: 'CLIENT' as const, coachName: '김도현' };

// ─────────────────────────────────────────────────────────────────────
describe('toPlainParagraphs — 마크다운 장식 제거', () => {
  it('헤딩·불릿·번호·인용 마커를 걷어낸다', () => {
    expect(
      toPlainParagraphs('## 오늘 다룬 것\n- 오른팔 붙이기\n1. 하프스윙\n> 메모')
    ).toEqual(['오늘 다룬 것', '오른팔 붙이기', '하프스윙', '메모']);
  });

  it('강조 마커와 구분선을 제거하고 빈 줄을 버린다', () => {
    expect(toPlainParagraphs('**중요**\n\n---\n\n__굵게__')).toEqual([
      '중요',
      '굵게',
    ]);
  });

  it('빈 입력은 빈 배열', () => {
    expect(toPlainParagraphs(undefined)).toEqual([]);
    expect(toPlainParagraphs('   \n  ')).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('interleave — 문단과 미디어의 교차', () => {
  const slots = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `m${i}`, type: 'image' as const }));

  it('미디어가 없으면 문단만 남는다', () => {
    expect(kinds(interleave(['a', 'b'], []))).toEqual(['paragraph', 'paragraph']);
  });

  it('연속 두 미디어 사이에 문단이 최소 하나 들어간다', () => {
    // 문단 6 · 미디어 5 → gap=1 로 가장 촘촘한 배치가 나오는 조건
    const blocks = kinds(interleave(['a', 'b', 'c', 'd', 'e', 'f'], slots(5)));
    const isInline = (k?: string) => k === 'photo' || k === 'video';
    for (let i = 1; i < blocks.length; i++) {
      expect(isInline(blocks[i]) && isInline(blocks[i - 1])).toBe(false);
    }
  });

  it('마지막 문단 뒤에는 인라인 미디어를 놓지 않는다', () => {
    // 글의 끝은 문단이어야 다음 블록(할 일·서명)으로 자연스럽게 넘어간다.
    // 자리를 못 얻은 미디어의 갤러리는 인라인 삽입이 아니라 꼬리 블록이다.
    const blocks = kinds(interleave(['a', 'b', 'c', 'd'], slots(2)));
    const lastInline = blocks.lastIndexOf('photo');
    const lastParagraph = blocks.lastIndexOf('paragraph');
    expect(lastInline).toBeGreaterThanOrEqual(0);
    expect(lastParagraph).toBeGreaterThan(lastInline);
  });

  it('자리를 못 얻은 미디어는 버리지 않고 갤러리로 몰아준다', () => {
    // 문단 2 · 미디어 4 → 본문에는 한 장만 들어가고 나머지 3장은 갤러리
    const blocks = interleave(['a', 'b'], slots(4));
    const gallery = only(blocks, 'gallery');
    expect(gallery).toHaveLength(1);
    const placed = only(blocks, 'photo').map((b) => b.mediaId);
    expect([...placed, ...gallery[0].mediaIds].sort()).toEqual([
      'm0',
      'm1',
      'm2',
      'm3',
    ]);
  });

  it('삽입되는 미디어는 full / inset 을 번갈아 쓴다', () => {
    const blocks = interleave(['a', 'b', 'c', 'd', 'e', 'f'], slots(2));
    expect(only(blocks, 'photo').map((b) => b.size)).toEqual(['full', 'inset']);
  });

  it('영상 슬롯은 video 블록으로 나온다', () => {
    const blocks = interleave(
      ['a', 'b', 'c', 'd'],
      [{ id: 'v1', type: 'video' }]
    );
    expect(only(blocks, 'video').map((b) => b.mediaId)).toEqual(['v1']);
  });

  it('캡션을 mediaId 로 찾아 붙인다', () => {
    const blocks = interleave(['a', 'b', 'c', 'd'], slots(1), {
      m0: '탑에서 팔꿈치 붙은 순간',
    });
    expect(only(blocks, 'photo')[0].caption).toBe('탑에서 팔꿈치 붙은 순간');
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('composeStory — 표지', () => {
  it('story.headline 이 없으면 lesson.title 로 폴백한다', () => {
    const blocks = composeStory(baseLesson(), COACH);
    expect(only(blocks, 'cover')[0].headline).toBe('드라이버 교정');
  });

  it('story.headline 이 있으면 그것을 쓴다', () => {
    const blocks = composeStory(
      baseLesson({ story: { headline: '오른팔이 붙기 시작한 날' } }),
      COACH
    );
    expect(only(blocks, 'cover')[0].headline).toBe('오른팔이 붙기 시작한 날');
  });

  it('제목이 전부 비어도 표지는 나온다', () => {
    const blocks = composeStory(baseLesson({ title: '' }), COACH);
    expect(only(blocks, 'cover')[0].headline).toBe('레슨 기록');
  });

  it('대표컷은 코치 지정 → 레슨 후 영상 → 메인 슬롯 순으로 고른다', () => {
    const media = [vid('before', { role: 'BEFORE' }), vid('after', { role: 'AFTER' })];

    // 메인 슬롯이 있어도 레슨 후 영상이 우선
    const withAfter = composeStory(
      baseLesson({ videoUrl: 'https://cdn.test/main.mp4', additionalMedia: media }),
      COACH
    );
    expect(only(withAfter, 'cover')[0].mediaId).toBe('after');

    // 코치 지정이 그 위
    const pinned = composeStory(
      baseLesson({
        videoUrl: 'https://cdn.test/main.mp4',
        additionalMedia: media,
        story: { coverMediaId: 'before' },
      }),
      COACH
    );
    expect(only(pinned, 'cover')[0].mediaId).toBe('before');

    // 존재하지 않는 id 를 가리키면 무시하고 규칙대로
    const stale = composeStory(
      baseLesson({ additionalMedia: media, story: { coverMediaId: 'gone' } }),
      COACH
    );
    expect(only(stale, 'cover')[0].mediaId).toBe('after');
  });

  it('미디어가 하나도 없으면 대표컷 없이 표지만 나온다', () => {
    const blocks = composeStory(baseLesson(), COACH);
    expect(only(blocks, 'cover')[0].mediaId).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('composeStory — 폴백 사슬', () => {
  it('reviewSections 가 liveLessonDetail 보다 우선한다', () => {
    const blocks = composeStory(
      baseLesson({
        reviewSections: { todayCovered: '코치 최종본', feedback: '코치 피드백' },
        liveLessonDetail: {
          recordedDurationSec: 60,
          transcript: [],
          summary: 'AI 요약',
        },
      }),
      COACH
    );
    expect(only(blocks, 'lead')[0].text).toBe('코치 최종본');
  });

  it('reviewSections 가 없는 구 기록은 liveLessonDetail 로 떨어진다', () => {
    const blocks = composeStory(
      baseLesson({
        liveLessonDetail: {
          recordedDurationSec: 60,
          transcript: [],
          summary: '오늘은 슬라이스를 잡았습니다',
          keyPoints: ['오른팔 붙이기'],
          drills: ['타월 드릴'],
        },
      }),
      STUDENT
    );
    expect(only(blocks, 'lead')[0].text).toBe('오늘은 슬라이스를 잡았습니다');
    expect(only(blocks, 'chips')[0].items).toEqual(['오른팔 붙이기']);
    expect(only(blocks, 'checklist')[0].items).toEqual(['타월 드릴']);
  });

  it('aiAnalysis 밖에 없는 아주 오래된 기록도 글이 나온다', () => {
    const blocks = composeStory(
      baseLesson({ aiAnalysis: '## 요약\n- 첫째 줄\n- 둘째 줄' }),
      COACH
    );
    expect(only(blocks, 'lead')[0].text).toBe('요약');
    expect(only(blocks, 'paragraph').map((b) => b.text)).toEqual([
      '첫째 줄',
      '둘째 줄',
    ]);
  });

  it('coachNotes 만 있어도 조판된다', () => {
    const blocks = composeStory(baseLesson({ coachNotes: '메모만 있음' }), COACH);
    expect(only(blocks, 'lead')[0].text).toBe('메모만 있음');
  });

  it('할 일은 nextActions → assignedHomework → drills 순으로 하나만 쓴다', () => {
    const blocks = composeStory(
      baseLesson({
        reviewSections: { nextActions: ['A'] },
        assignedHomework: ['B'],
        liveLessonDetail: { recordedDurationSec: 1, transcript: [], drills: ['C'] },
      }),
      STUDENT
    );
    expect(only(blocks, 'checklist')[0].items).toEqual(['A']);
  });

  it('내용이 전혀 없어도 표지와 서명은 남는다', () => {
    expect(kinds(composeStory(baseLesson(), COACH))).toEqual(['cover', 'signature']);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('composeStory — 짧은 글 분기', () => {
  it('본문이 2문단 미만이면 교차 삽입 대신 갤러리를 붙인다', () => {
    const blocks = composeStory(
      baseLesson({
        videoUrl: 'https://cdn.test/main.mp4',
        reviewSections: { todayCovered: '리드', feedback: '한 문장뿐' },
        additionalMedia: [img('a'), img('b'), img('c')],
      }),
      COACH
    );
    expect(only(blocks, 'photo')).toHaveLength(0);
    expect(only(blocks, 'gallery')[0].mediaIds).toEqual(['a', 'b', 'c']);
  });

  it('짧은 글에 사진이 딱 한 장이면 갤러리 대신 그대로 놓는다', () => {
    const blocks = composeStory(
      baseLesson({
        videoUrl: 'https://cdn.test/main.mp4',
        reviewSections: { todayCovered: '리드', feedback: '한 문장뿐' },
        additionalMedia: [img('a')],
      }),
      COACH
    );
    expect(only(blocks, 'gallery')).toHaveLength(0);
    expect(only(blocks, 'photo')[0]).toMatchObject({ mediaId: 'a', size: 'full' });
  });

  it('본문이 2문단 이상이면 교차 삽입으로 간다', () => {
    const blocks = composeStory(
      baseLesson({
        videoUrl: 'https://cdn.test/main.mp4',
        reviewSections: {
          todayCovered: '리드',
          feedback: '첫째 문단\n둘째 문단\n셋째 문단\n넷째 문단',
        },
        additionalMedia: [img('a')],
      }),
      COACH
    );
    expect(only(blocks, 'photo')).toHaveLength(1);
    // 사진이 문단 사이에 들어갔는지 — 앞뒤가 모두 문단이어야 한다
    const at = blocks.findIndex((b) => b.kind === 'photo');
    expect(blocks[at - 1].kind).toBe('paragraph');
    expect(blocks[at + 1].kind).toBe('paragraph');
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('composeStory — 미디어 풀 구성', () => {
  const wordy = {
    todayCovered: '리드',
    feedback: '하나\n둘\n셋\n넷\n다섯\n여섯',
  };

  it('attachmentIds 가 있으면 그 안의 미디어만 본문에 쓴다', () => {
    const blocks = composeStory(
      baseLesson({
        videoUrl: 'https://cdn.test/main.mp4',
        reviewSections: { ...wordy, attachmentIds: ['a'] },
        additionalMedia: [img('a'), img('b'), img('c')],
      }),
      COACH
    );
    const used = [
      ...only(blocks, 'photo').map((b) => b.mediaId),
      ...only(blocks, 'gallery').flatMap((b) => b.mediaIds),
    ];
    expect(used).toEqual(['a']);
  });

  it('attachmentIds 가 없는 구 기록은 가진 미디어를 전부 쓴다', () => {
    const blocks = composeStory(
      baseLesson({
        videoUrl: 'https://cdn.test/main.mp4',
        reviewSections: wordy,
        additionalMedia: [img('a'), img('b')],
      }),
      COACH
    );
    const used = [
      ...only(blocks, 'photo').map((b) => b.mediaId),
      ...only(blocks, 'gallery').flatMap((b) => b.mediaIds),
    ];
    expect(used.sort()).toEqual(['a', 'b']);
  });

  it('대표컷과 비교 쌍은 본문 풀에서 빠진다 — 같은 사진이 두 번 나오지 않게', () => {
    const blocks = composeStory(
      baseLesson({
        reviewSections: wordy,
        additionalMedia: [
          vid('before', { role: 'BEFORE' }),
          vid('after', { role: 'AFTER' }),
          img('shot'),
        ],
      }),
      COACH
    );
    expect(only(blocks, 'cover')[0].mediaId).toBe('after');
    expect(only(blocks, 'compare')[0]).toMatchObject({
      beforeId: 'before',
      afterId: 'after',
    });
    const bodyMedia = [
      ...only(blocks, 'photo').map((b) => b.mediaId),
      ...only(blocks, 'video').map((b) => b.mediaId),
      ...only(blocks, 'gallery').flatMap((b) => b.mediaIds),
    ];
    expect(bodyMedia).toEqual(['shot']);
  });

  it('비교 쌍은 한쪽만 있으면 만들지 않는다', () => {
    const blocks = composeStory(
      baseLesson({
        reviewSections: wordy,
        additionalMedia: [vid('before', { role: 'BEFORE' })],
      }),
      COACH
    );
    expect(only(blocks, 'compare')).toHaveLength(0);
  });

  it('음성 첨부는 스토리에 등장하지 않는다', () => {
    const blocks = composeStory(
      baseLesson({
        videoUrl: 'https://cdn.test/main.mp4',
        reviewSections: wordy,
        additionalMedia: [
          { id: 'voice', url: 'https://cdn.test/v.webm', type: 'audio', createdAt: 1 },
          img('shot'),
        ],
      }),
      COACH
    );
    const used = [
      ...only(blocks, 'photo').map((b) => b.mediaId),
      ...only(blocks, 'gallery').flatMap((b) => b.mediaIds),
    ];
    expect(used).toEqual(['shot']);
  });

  it('메인 슬롯은 attachmentIds 허용 목록의 예외로 남는다', () => {
    // videoUrl 은 MediaItem 레코드가 없어 attachmentIds 에 실릴 수 없다.
    const blocks = composeStory(
      baseLesson({
        videoUrl: 'https://cdn.test/main.mp4',
        reviewSections: { ...wordy, attachmentIds: ['a'] },
        additionalMedia: [img('a'), img('b')],
        story: { coverMediaId: 'a' },
      }),
      COACH
    );
    const used = [
      ...only(blocks, 'video').map((b) => b.mediaId),
      ...only(blocks, 'gallery').flatMap((b) => b.mediaIds),
    ];
    expect(used).toContain(MAIN_MEDIA_ID);
    expect(used).not.toContain('b');
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('composeStory — 뷰어별 분기', () => {
  const full = baseLesson({
    videoUrl: 'https://cdn.test/main.mp4',
    reviewSections: {
      todayCovered: '리드',
      feedback: '하나\n둘\n셋',
      nextActions: ['타월 드릴'],
    },
    additionalMedia: [img('a')],
    liveLessonDetail: {
      recordedDurationSec: 2520,
      transcript: [{ startSec: 0, text: '오늘은' }],
    },
  });

  it('체크리스트는 학생 뷰에서만 체크 가능하다', () => {
    expect(only(composeStory(full, STUDENT), 'checklist')[0].checkable).toBe(true);
    expect(only(composeStory(full, COACH), 'checklist')[0].checkable).toBe(false);
  });

  it('학생의 한마디가 없으면 학생 뷰에서만 입력 유도가 뜬다', () => {
    expect(only(composeStory(full, STUDENT), 'reply')[0].invite).toBe(true);
    expect(only(composeStory(full, COACH), 'reply')).toHaveLength(0);
  });

  it('한마디가 있으면 양쪽 모두에 보인다', () => {
    const replied = { ...full, clientFeedback: { text: '해볼게요', updatedAt: 1 } };
    expect(only(composeStory(replied, COACH), 'reply')[0].invite).toBe(false);
    expect(only(composeStory(replied, STUDENT), 'reply')[0].invite).toBe(false);
  });

  it('MEDIA_ONLY 학생 뷰는 글 없이 사진첩으로 조판된다', () => {
    const shared = { ...full, shareOption: 'MEDIA_ONLY' as const };
    const blocks = composeStory(shared, STUDENT);
    expect(kinds(blocks)).not.toContain('paragraph');
    expect(kinds(blocks)).not.toContain('lead');
    expect(kinds(blocks)).not.toContain('notefold');
    // 그래도 빈 화면이 되지는 않는다
    expect(kinds(blocks)).toContain('cover');
    expect(only(blocks, 'gallery')[0].mediaIds).toEqual(['a']);
  });

  it('MEDIA_ONLY 라도 코치 본인에게는 전체가 보인다', () => {
    const shared = { ...full, shareOption: 'MEDIA_ONLY' as const };
    expect(kinds(composeStory(shared, COACH))).toContain('notefold');
  });

  it('필기 원문은 접힌 채로 블록에 실린다', () => {
    const fold = only(composeStory(full, COACH), 'notefold')[0];
    expect(fold.durationSec).toBe(2520);
    expect(fold.transcript).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('composeStory — 코치가 짠 순서', () => {
  it('editedByCoach 면 저장된 blocks 를 그대로 돌려준다', () => {
    const pinned: StoryBlock[] = [
      { kind: 'lead', text: '코치가 직접 짠 순서' },
      { kind: 'cover', headline: '표지가 뒤에', date: '2026-08-19' },
    ];
    const blocks = composeStory(
      baseLesson({
        reviewSections: { todayCovered: '자동 조판이 쓸 리드' },
        story: { editedByCoach: true, blocks: pinned },
      }),
      COACH
    );
    expect(blocks).toEqual(pinned);
  });

  it('editedByCoach 가 아니면 저장된 blocks 를 무시하고 다시 조판한다', () => {
    const blocks = composeStory(
      baseLesson({
        reviewSections: { todayCovered: '자동 조판이 쓸 리드' },
        story: {
          blocks: [{ kind: 'lead', text: '낡은 배열' }],
        },
      }),
      COACH
    );
    expect(only(blocks, 'lead')[0].text).toBe('자동 조판이 쓸 리드');
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('composeStory — 꼬리 블록 순서', () => {
  it('compare → filmstrip → data → checklist → memo → notefold → signature', () => {
    const blocks = composeStory(
      baseLesson({
        reviewSections: {
          todayCovered: '리드',
          feedback: '하나\n둘\n셋',
          nextActions: ['드릴'],
          freeMemo: '힘 빼세요',
        },
        additionalMedia: [vid('b', { role: 'BEFORE' }), vid('a', { role: 'AFTER' })],
        swingSequence: [
          { id: 's1', label: 'Top', imageUrl: 'https://cdn.test/s1.jpg', timestamp: 0 },
        ],
        golfData: { carryDistance: 218 },
        liveLessonDetail: {
          recordedDurationSec: 60,
          transcript: [{ startSec: 0, text: '오늘은' }],
        },
      }),
      COACH
    );
    const tail = kinds(blocks).filter((k) =>
      ['compare', 'filmstrip', 'data', 'checklist', 'memo', 'notefold', 'signature'].includes(k)
    );
    expect(tail).toEqual([
      'compare',
      'filmstrip',
      'data',
      'checklist',
      'memo',
      'notefold',
      'signature',
    ]);
  });

  it('값이 모두 undefined 인 golfData 는 데이터 블록을 만들지 않는다', () => {
    const blocks = composeStory(
      baseLesson({ golfData: { carryDistance: undefined } }),
      COACH
    );
    expect(only(blocks, 'data')).toHaveLength(0);
  });

  it('중복된 키포인트와 할 일은 한 번만 나온다', () => {
    const blocks = composeStory(
      baseLesson({
        reviewSections: { nextActions: ['드릴', '드릴', ' 드릴 ', '스윙'] },
        liveLessonDetail: {
          recordedDurationSec: 1,
          transcript: [],
          keyPoints: ['탑', '탑'],
        },
      }),
      COACH
    );
    expect(only(blocks, 'checklist')[0].items).toEqual(['드릴', '스윙']);
    expect(only(blocks, 'chips')[0].items).toEqual(['탑']);
  });
});
