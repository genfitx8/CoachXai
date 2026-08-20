/**
 * 그날의 필기 원문 — 접힌 채로 놓이는 블록.
 * 기획: docs/LESSON_STORY_UI_PLAN.md §5.3, §6
 *
 * 스토리는 정리된 글이고 필기는 그 근거다 — 근거는 요구할 때만 나온다.
 * 접힌 동안 전사를 **DOM 에 넣지 않는 것**이 핵심이다. 한 레슨의 필기가
 * 수십~수백 줄이고 목록에서 여러 기록이 함께 그려지므로, 숨기기만 하면
 * 스크롤이 눈에 띄게 무거워진다.
 *
 * 시각 언어는 LessonNotebook(레슨 동반 화면의 필기 노트)과 같다 —
 * 같은 괘선·마진선·손글씨. 다만 저기는 실시간 필기용(자동 스크롤, 타이핑
 * 애니메이션, 요약 푸터)이라 읽기 전용으로 재사용하려면 프롭을 여럿
 * 늘리고 동작을 바꿔야 한다. 그래서 컴포넌트를 재사용하는 대신 문단
 * 조립 규칙(groupTranscriptParagraphs)과 종이 토큰을 공유한다.
 */
import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LiveLessonTranscriptEntry } from '../../types';
import { groupTranscriptParagraphs } from '../../services/lessonAudioPipeline';

/** 괘선 간격(px) — 배경 그라디언트와 글줄 높이가 함께 쓰는 단일 진실. */
const LINE_HEIGHT = 26;
/** 본문 시작 위치 — 마진 빨간 선 바로 오른쪽. */
const MARGIN_X = '2.6rem';
const HAND = "'Gaegu', 'Nanum Pen Script', cursive";

/** id 시드 기반 유사난수 — 렌더마다 흔들리지 않는 손맛용. */
const seeded = (seed: number, salt: number): number => {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const StoryNoteFold: React.FC<{
  transcript: LiveLessonTranscriptEntry[];
  durationSec: number;
}> = ({ transcript, durationSec }) => {
  const [open, setOpen] = useState(false);
  const reduced = useMemo(prefersReducedMotion, []);

  // 접혀 있는 동안에는 문단 조립조차 하지 않는다.
  const paragraphs = useMemo(
    () =>
      open
        ? groupTranscriptParagraphs(
            transcript.map((entry, i) => ({
              index: i,
              startSec: entry.startSec,
              transcript: entry.text,
            }))
          )
        : [],
    [open, transcript]
  );

  const minutes = Math.max(1, Math.round(durationSec / 60));
  const summary = `그날의 필기 · ${minutes}분 · ${transcript.length}줄`;

  return (
    <section
      className="rounded-md overflow-hidden"
      style={{ border: '1px solid var(--paper-rule)', background: 'rgba(0,0,0,0.02)' }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center justify-between gap-2 w-full px-3 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      >
        <span className="text-[12px]" style={{ color: '#5a6274' }}>
          {summary}
        </span>
        <span
          className="flex items-center gap-1 text-[11px]"
          style={{ color: 'var(--paper-pencil)' }}
        >
          {open ? '접기' : '펼쳐보기'}
          <ChevronDown
            className="w-3 h-3"
            style={{
              transform: open ? 'rotate(180deg)' : 'none',
              transition: reduced ? 'none' : 'transform 160ms cubic-bezier(0.16,1,0.3,1)',
            }}
            aria-hidden="true"
          />
        </span>
      </button>

      {open && (
        <div
          className="px-3 pt-1 pb-3"
          style={{
            backgroundImage: `
              linear-gradient(to right, transparent ${MARGIN_X}, var(--paper-margin) ${MARGIN_X}, var(--paper-margin) calc(${MARGIN_X} + 1.5px), transparent calc(${MARGIN_X} + 1.5px)),
              repeating-linear-gradient(to bottom, transparent 0, transparent ${LINE_HEIGHT - 1}px, var(--paper-rule) ${LINE_HEIGHT - 1}px, var(--paper-rule) ${LINE_HEIGHT}px)
            `,
            backgroundOrigin: 'content-box',
            backgroundClip: 'content-box',
          }}
        >
          {paragraphs.map((paragraph) => (
            <p
              key={paragraph.id}
              style={{
                fontFamily: HAND,
                fontSize: '16px',
                lineHeight: `${LINE_HEIGHT}px`,
                color: 'var(--paper-ink)',
                paddingLeft: `calc(${MARGIN_X} + 0.35rem)`,
                transform: reduced
                  ? 'none'
                  : `rotate(${(seeded(paragraph.id, 1) - 0.5) * 0.5}deg)`,
                transformOrigin: 'left center',
                wordBreak: 'keep-all',
                overflowWrap: 'anywhere',
              }}
            >
              {paragraph.segments.map((seg, i) => (
                <span key={seg.id} style={{ opacity: 0.86 + seeded(seg.id, 2) * 0.14 }}>
                  {i > 0 ? ' ' : ''}
                  {seg.text}
                </span>
              ))}
            </p>
          ))}
        </div>
      )}
    </section>
  );
};
