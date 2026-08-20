/**
 * LessonStoryView — 레슨 기록의 블로그/일기 뷰.
 * 기획: docs/LESSON_STORY_UI_PLAN.md
 *
 * 이 컴포넌트는 **블록 배열만 보고 그린다.** `composeStory()` 가 어떤
 * 필드에서 무엇을 뽑았는지 전혀 모르며, 알 필요도 없다. 조판 규칙을
 * 바꾸고 싶으면 조판기를 고치고, 생김새를 바꾸고 싶으면 여기를 고친다.
 * 그 분리 덕분에 조판 규칙은 브라우저 없이 테스트할 수 있다.
 *
 * 미디어 해석은 **호출자가 넘긴 맵**을 쓴다. LessonDetail 이 이미
 * idb:// → blob URL 해석을 하고 있으므로, 여기서 다시 해석하면 같은
 * 블롭에 대해 객체 URL 이 두 벌 생긴다. 대신 실제 비용이 큰 쪽(영상
 * 디코더)은 여기서 막는다 — StoryMedia 의 영상은 탭 전까지 마운트되지
 * 않는다.
 */
import React, { useMemo } from 'react';
import type { Lesson, StoryBlock } from '../types';
import { composeStory, type ComposeStoryOptions } from '../services/lessonStoryComposer';
import {
  StoryCompare,
  StoryFilmstrip,
  StoryGallery,
  StoryPolaroid,
  type StoryMediaMap,
} from './story/StoryMedia';
import {
  StoryChecklist,
  StoryChips,
  StoryCover,
  StoryDataStrip,
  StoryLead,
  StoryMemo,
  StoryParagraph,
  StoryReply,
  StorySignature,
} from './story/StoryBlocks';
import { StoryNoteFold } from './story/StoryNoteFold';

export interface LessonStoryViewProps {
  lesson: Lesson;
  /** 이 화면을 보는 쪽. 체크리스트·한마디 입력 유도가 갈린다. */
  viewer: ComposeStoryOptions['viewer'];
  /** 서명에 쓸 코치 이름. */
  coachName?: string;
  /**
   * mediaId → 재생 가능한 소스. `MAIN_MEDIA_ID` 키는 lesson.videoUrl
   * 슬롯을 가리킨다. 호출자가 이미 해석해 둔 URL 을 그대로 넘긴다.
   */
  media: StoryMediaMap;
  /** 학생이 "한마디 남기기"를 눌렀을 때 — 보통 자료 탭으로 보낸다. */
  onWriteReply?: () => void;
}

/** 블록 배열에서 React key 를 만든다 — 같은 종류가 여러 번 나온다. */
const keyFor = (block: StoryBlock, index: number): string => {
  switch (block.kind) {
    case 'photo':
    case 'video':
      return `${block.kind}-${block.mediaId}`;
    case 'compare':
      return `compare-${block.beforeId}-${block.afterId}`;
    case 'gallery':
      return `gallery-${block.mediaIds.join('_')}`;
    default:
      return `${block.kind}-${index}`;
  }
};

export const LessonStoryView: React.FC<LessonStoryViewProps> = ({
  lesson,
  viewer,
  coachName,
  media,
  onWriteReply,
}) => {
  const blocks = useMemo(
    () => composeStory(lesson, { viewer, coachName }),
    [lesson, viewer, coachName]
  );

  // 표지는 전폭 레이아웃이라 본문 여백을 쓰지 않는다 — 따로 뽑아 둔다.
  const cover = blocks.find(
    (b): b is Extract<StoryBlock, { kind: 'cover' }> => b.kind === 'cover'
  );
  const body = blocks.filter((b) => b.kind !== 'cover');

  // alt 폴백용 — 본문에 놓인 자료가 몇 번째인지 세어 "레슨 자료 3/7" 을 만든다.
  const inlineTotal = body.filter((b) => b.kind === 'photo' || b.kind === 'video').length;
  let inlineSeen = 0;

  const isDraft = lesson.approvalStatus === 'draft';

  return (
    <div className="w-full flex justify-center px-3 pb-8 pt-3">
      <article
        className="w-full overflow-hidden"
        style={{
          maxWidth: '46rem',
          background: 'var(--paper)',
          color: 'var(--paper-ink)',
          borderRadius: '0.5rem',
          boxShadow: '0 10px 30px -10px rgba(0,0,0,0.75)',
        }}
      >
        {/* 코치가 승인 전 기록을 열어본 경우 — 학생에게는 아직 안 보인다. */}
        {isDraft && viewer === 'COACH' && (
          <p
            className="text-[11px] text-center py-1.5 px-3"
            style={{
              background: 'rgba(224,170,92,0.18)',
              color: '#7a5410',
              borderBottom: '1px solid rgba(122,84,16,0.18)',
            }}
          >
            초안 · 학생에게 아직 보이지 않아요
          </p>
        )}

        {/* 표지는 전폭이라 본문 여백 밖에 그린다. */}
        {cover && (
          <StoryCover
            headline={cover.headline}
            dek={cover.dek}
            mediaId={cover.mediaId}
            media={media}
            date={cover.date}
            sessionNumber={cover.sessionNumber}
            coachName={cover.coachName}
          />
        )}

        {body.length > 0 && (
          <div className="flex flex-col gap-4 px-4 pt-4 pb-5">
            {body.map((block, i) => (
              <React.Fragment key={keyFor(block, i)}>
                {renderBody(block, {
                  media,
                  onWriteReply,
                  altIndex: () => {
                    inlineSeen += 1;
                    return `레슨 자료 ${inlineSeen}/${inlineTotal}`;
                  },
                })}
              </React.Fragment>
            ))}
          </div>
        )}
      </article>
    </div>
  );
};

interface BodyContext {
  media: StoryMediaMap;
  onWriteReply?: () => void;
  /** 호출할 때마다 다음 순번의 alt 폴백 문구를 만든다. */
  altIndex: () => string;
}

/** 표지를 제외한 블록 하나를 그린다. */
function renderBody(block: StoryBlock, ctx: BodyContext): React.ReactNode {
  switch (block.kind) {
    case 'lead':
      return <StoryLead text={block.text} />;
    case 'paragraph':
      return <StoryParagraph text={block.text} />;
    case 'chips':
      return <StoryChips items={block.items} tone={block.tone} />;
    case 'photo':
    case 'video':
      return (
        <StoryPolaroid
          mediaId={block.mediaId}
          media={ctx.media}
          caption={block.caption}
          size={block.size}
          altFallback={ctx.altIndex()}
        />
      );
    case 'compare':
      return (
        <StoryCompare
          beforeId={block.beforeId}
          afterId={block.afterId}
          media={ctx.media}
        />
      );
    case 'gallery':
      return <StoryGallery mediaIds={block.mediaIds} media={ctx.media} />;
    case 'filmstrip':
      return <StoryFilmstrip items={block.items} />;
    case 'data':
      return <StoryDataStrip golf={block.golf} />;
    case 'checklist':
      return <StoryChecklist items={block.items} checkable={block.checkable} />;
    case 'memo':
      return <StoryMemo text={block.text} />;
    case 'notefold':
      return (
        <StoryNoteFold transcript={block.transcript} durationSec={block.durationSec} />
      );
    case 'signature':
      return <StorySignature coachName={block.coachName} signedAt={block.signedAt} />;
    case 'reply':
      return (
        <StoryReply
          feedback={block.feedback}
          invite={block.invite}
          onInvite={ctx.onWriteReply}
        />
      );
    case 'cover':
      // 표지는 호출부가 본문 여백 밖에서 그린다.
      return null;
  }
}
