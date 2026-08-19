import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PenLine, Sparkles } from 'lucide-react';
import {
  groupTranscriptParagraphs,
  SPEAKER_LABELS,
  type SpeakerRole,
  type TranscriptParagraph,
  type TranscriptTurn,
} from '../services/lessonAudioPipeline';

/**
 * LessonNotebook — 레슨 동반 화면의 "종이 노트" 필기 뷰.
 *
 * 다크 테마 화면 위에 밝은 줄노트 종이 카드를 한 장 올려, 도착하는 전사
 * 텍스트가 코치가 옆에서 받아 적는 것처럼 적히게 한다. 시각 요소는 전부
 * CSS 로 그린다(이미지 없음):
 *
 *  - 괘선: repeating-linear-gradient. 글줄이 괘선 위에 정확히 앉도록
 *    LINE_HEIGHT 상수 하나가 배경과 타이포를 동시에 지배한다.
 *  - 왼쪽 마진: 세로 빨간 선. 본문은 그 오른쪽에서 시작한다.
 *  - 손글씨: Gaegu(구글 폰트, index.html 에서 로드). 오프라인이면
 *    cursive 폴백으로 떨어진다 — 기능에는 영향 없음.
 *  - 아날로그 디테일: 문단마다 미세하게 다른 기울기, 조각마다 다른 잉크
 *    농도를 id 시드로 결정해(렌더마다 흔들리지 않게) 손맛을 낸다.
 *
 * 화자 표기
 * ---------
 * 전사에 화자 역할(코치/학생/주변)이 붙어 있으면 문단을 화자 단위로 끊고
 * 문단 앞에 작은 라벨을 그린다. 라벨이 없는 필기(온디바이스 인식 원문 등)
 * 는 예전 그대로 라벨 없이 흐른다 — 모른다는 사실을 "미상" 이라고 적는
 * 것보다 조용히 두는 편이 노트를 덜 어지럽힌다. 레슨과 무관한 "주변"
 * 발화는 지우지 않고 연한 잉크로 남긴다: 코치가 무엇이 걸러졌는지 볼 수
 * 있어야 요약이 뭘 버렸는지 신뢰할 수 있다.
 *
 * 문단 조립
 * ---------
 * 실시간 인식은 한 문장을 여러 조각으로 끊어 확정한다("드라이버
 * 슬라이스를" / "교정하는 레슨 좀 할 건데요"). 조각 하나를 한 줄로 그리면
 * 필기가 단어 나열처럼 보이므로, 조각들을 인라인으로 이어 붙여 한 문단이
 * 종이 위를 자연스럽게 흐르게 한다. 발화 사이가 크게 벌어졌을 때만
 * (PARAGRAPH_GAP_SEC) 문단을 끊는다. 타임스탬프는 표시하지 않는다 —
 * 코치가 읽는 것은 시각이 아니라 대화 흐름이다.
 *
 * 애니메이션은 마운트 이후에 "새로 도착한" 조각에만 건다 — 복구/재진입으로
 * 한꺼번에 실린 기존 필기가 우르르 다시 타이핑되면 오히려 가짜같다.
 * prefers-reduced-motion 이면 애니메이션을 생략한다.
 */

export interface NotebookLine {
  id: number;
  /** 레슨 시작 기준 오프셋(초) — 문단을 끊는 기준(표시하지는 않는다). */
  atSec: number;
  text: string;
  /** 화자 라벨이 붙은 발화들. 없으면 화자 미상 한 덩어리로 그린다. */
  turns?: TranscriptTurn[];
}

interface LessonNotebookProps {
  lines: NotebookLine[];
  /** 전사가 진행 중인가 — 마지막 줄 밑에 펜 대기 표시. */
  writing: boolean;
  /**
   * 실시간 음성 인식의 잠정 텍스트 — 말하는 도중 그대로 화면에 적힌다.
   * 확정되면 lines 로 넘어오므로 잠정 조각은 연한 잉크로 구분하고,
   * 진행 중인 문단 끝에 이어 붙여 말이 그대로 흐르는 것처럼 보이게 한다.
   */
  interim?: string;
  /**
   * 새로 도착한 확정 조각에 글자 단위 타이핑 애니메이션을 걸지 여부.
   * 실시간 인식 경로에서는 interim 이 이미 "적히는 중" 을 보여줬으므로
   * false 로 꺼서 같은 문장이 두 번 적히는 느낌을 없앤다. AI 전사
   * 폴백(잠정 표시 없음)에서는 true.
   */
  animateNewLines?: boolean;
  /** 하단 요약 노트(불릿 텍스트). 빈 문자열이면 안내 문구. */
  summary: string;
  summaryUpdating: boolean;
}

/** 괘선 간격(px) — 배경 그라디언트와 글줄 높이가 함께 쓰는 단일 진실. */
const LINE_HEIGHT = 28;
/** 한 글자 적히는 간격(ms). 한글 음절 기준 ~이 속도가 "받아 적기" 체감. */
const TYPE_INTERVAL_MS = 45;
/** 본문 시작 위치 — 마진 빨간 선(2.9rem) 바로 오른쪽. */
const BODY_INDENT = '3.25rem';

const INK = '#2b3547';
const PENCIL = '#8a8272';
const PAPER = '#fbf6e9';
const RULE = '#dfd4b8';
const MARGIN_LINE = '#e8a9a0';

const HAND_FONT = "'Gaegu', 'Nanum Pen Script', cursive";

/** 화자별 잉크 — "주변"(레슨 무관)은 연필처럼 흐리게 남긴다. */
const speakerInk = (speaker: SpeakerRole): string =>
  speaker === 'other' ? PENCIL : INK;

/** 라인 id 시드 기반 유사난수(0~1) — 렌더마다 흔들리지 않는 손맛용. */
const seeded = (seed: number, salt: number): number => {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * 문단 안의 조각 하나. animate 면 글자 단위로 드러나고, 쓰는 자리에 펜이
 * 붙는다. 인라인 span 이라 앞 조각에 자연스럽게 이어진다.
 */
const HandwrittenSegment: React.FC<{
  id: number;
  text: string;
  /** 앞 조각과 띄어 쓸지 — 문단의 첫 조각만 false. */
  spaced: boolean;
  animate: boolean;
  onGrow: () => void;
}> = ({ id, text, spaced, animate, onGrow }) => {
  const [shown, setShown] = useState(animate ? 0 : text.length);
  const done = shown >= text.length;

  useEffect(() => {
    if (!animate || done) return;
    const timer = window.setInterval(() => {
      setShown((prev) => Math.min(text.length, prev + 1));
      onGrow();
    }, TYPE_INTERVAL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, done, text.length]);

  return (
    <span style={{ opacity: 0.86 + seeded(id, 2) * 0.14 }}>
      {spaced ? ' ' : ''}
      {text.slice(0, shown)}
      {!done && (
        <PenLine
          className="inline-block w-3.5 h-3.5 ml-0.5 align-baseline animate-pulse"
          style={{ color: INK }}
        />
      )}
    </span>
  );
};

/** 문단 하나 — 조각들이 인라인으로 흐르고, 끝에 잠정 텍스트가 붙는다. */
const HandwrittenParagraph: React.FC<{
  paragraph: TranscriptParagraph;
  /** 이 조각을 타이핑 애니메이션으로 그릴지 판정. */
  shouldAnimate: (segmentId: number) => boolean;
  /** 문단 끝에 이어 붙일 잠정 텍스트(마지막 문단에만). */
  trailingInterim?: string;
  onGrow: () => void;
}> = ({ paragraph, shouldAnimate, trailingInterim, onGrow }) => (
  <p
    style={{
      fontFamily: HAND_FONT,
      fontSize: '17px',
      lineHeight: `${LINE_HEIGHT}px`,
      color: speakerInk(paragraph.speaker),
      paddingLeft: BODY_INDENT,
      transform: `rotate(${(seeded(paragraph.id, 1) - 0.5) * 0.5}deg)`,
      transformOrigin: 'left center',
      wordBreak: 'keep-all',
      overflowWrap: 'anywhere',
    }}
  >
    {SPEAKER_LABELS[paragraph.speaker] && (
      <span
        style={{
          fontWeight: 700,
          opacity: paragraph.speaker === 'other' ? 0.6 : 0.75,
          marginRight: '0.3rem',
        }}
      >
        {SPEAKER_LABELS[paragraph.speaker]}
      </span>
    )}
    {paragraph.segments.map((seg, i) => (
      <HandwrittenSegment
        key={seg.key}
        id={seg.id}
        text={seg.text}
        spaced={i > 0}
        animate={shouldAnimate(seg.id)}
        onGrow={onGrow}
      />
    ))}
    {trailingInterim && (
      <span style={{ opacity: 0.45 }}>
        {paragraph.segments.length > 0 ? ' ' : ''}
        {trailingInterim}
        <PenLine
          className="inline-block w-3.5 h-3.5 ml-0.5 align-baseline animate-pulse"
          style={{ color: INK }}
        />
      </span>
    )}
  </p>
);

export const LessonNotebook: React.FC<LessonNotebookProps> = ({
  lines,
  writing,
  interim,
  animateNewLines = true,
  summary,
  summaryUpdating,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = useMemo(prefersReducedMotion, []);

  // 마운트 시점에 이미 있던 조각(복구·재진입)은 애니메이션 없이 그린다.
  const preexistingRef = useRef<Set<number> | null>(null);
  if (preexistingRef.current === null) {
    preexistingRef.current = new Set(lines.map((l) => l.id));
  }

  // 조각을 문단으로 묶는다 — 검토 화면의 필기 전문과 같은 규칙을 쓴다.
  const paragraphs = useMemo(
    () =>
      groupTranscriptParagraphs(
        lines.map((l) => ({
          index: l.id,
          startSec: l.atSec,
          transcript: l.text,
          turns: l.turns,
        }))
      ),
    [lines]
  );

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  useEffect(scrollToBottom, [lines.length, interim]);

  const shouldAnimate = (segmentId: number) =>
    animateNewLines && !reducedMotion && !preexistingRef.current!.has(segmentId);

  const summaryLines = summary
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div
      className="mt-3 rounded-xl overflow-hidden"
      style={{
        background: PAPER,
        boxShadow:
          '0 10px 24px rgba(0,0,0,0.45), inset 0 0 40px rgba(190,170,120,0.12)',
        transform: 'rotate(-0.3deg)',
      }}
    >
      {/* 필기 영역 — 괘선 + 마진선은 이 스크롤 컨테이너의 배경으로 그린다 */}
      <div
        ref={scrollRef}
        className="overflow-y-auto px-3 pt-2 pb-3"
        style={{
          maxHeight: LINE_HEIGHT * 9,
          minHeight: LINE_HEIGHT * 4,
          backgroundImage: `
            linear-gradient(to right, transparent 2.9rem, ${MARGIN_LINE} 2.9rem, ${MARGIN_LINE} calc(2.9rem + 1.5px), transparent calc(2.9rem + 1.5px)),
            repeating-linear-gradient(to bottom, transparent 0, transparent ${
              LINE_HEIGHT - 1
            }px, ${RULE} ${LINE_HEIGHT - 1}px, ${RULE} ${LINE_HEIGHT}px)
          `,
          backgroundOrigin: 'content-box',
          backgroundClip: 'content-box',
        }}
      >
        {paragraphs.length === 0 && !interim ? (
          <p
            style={{
              fontFamily: HAND_FONT,
              fontSize: '16px',
              lineHeight: `${LINE_HEIGHT}px`,
              color: PENCIL,
              paddingLeft: BODY_INDENT,
            }}
          >
            {writing
              ? '듣고 있어요… 말씀하시면 바로 적을게요'
              : '코칭 멘트가 들리면 여기에 받아 적혀요'}
          </p>
        ) : (
          <div className="space-y-1">
            {paragraphs.map((paragraph, i) => (
              <HandwrittenParagraph
                key={paragraph.key}
                paragraph={paragraph}
                shouldAnimate={shouldAnimate}
                // 잠정 텍스트는 진행 중인(마지막) 문단 끝에 이어 붙인다.
                trailingInterim={
                  i === paragraphs.length - 1 ? interim : undefined
                }
                onGrow={scrollToBottom}
              />
            ))}
            {/* 필기가 아직 없는데 말이 시작된 경우 — 잠정 텍스트만 그린다 */}
            {paragraphs.length === 0 && interim && (
              <HandwrittenParagraph
                paragraph={{ id: -1, key: 'interim', speaker: 'unknown', segments: [] }}
                shouldAnimate={() => false}
                trailingInterim={interim}
                onGrow={scrollToBottom}
              />
            )}
          </div>
        )}
        {writing && !interim && paragraphs.length > 0 && (
          <p
            className="animate-pulse select-none"
            style={{
              fontFamily: "'Gaegu', cursive",
              fontSize: '15px',
              lineHeight: `${LINE_HEIGHT}px`,
              color: PENCIL,
              paddingLeft: BODY_INDENT,
            }}
          >
            ✎ …
          </p>
        )}
      </div>

      {/* 요약 노트 — 종이 하단, 형광펜 헤딩 + 손글씨 불릿 */}
      <div
        className="px-3 pt-2 pb-3"
        style={{ borderTop: `2px dashed ${RULE}`, background: PAPER }}
      >
        <div className="flex items-center gap-1.5 mb-1" style={{ paddingLeft: '0.25rem' }}>
          <span
            style={{
              fontFamily: "'Gaegu', cursive",
              fontWeight: 700,
              fontSize: '15px',
              color: INK,
              background:
                'linear-gradient(104deg, rgba(255,225,90,0) 0.5%, rgba(255,225,90,0.85) 3%, rgba(255,225,90,0.6) 96%, rgba(255,225,90,0) 99%)',
              padding: '0 0.35rem',
              transform: 'rotate(-0.4deg)',
              display: 'inline-block',
            }}
          >
            오늘의 요약
          </span>
          {summaryUpdating ? (
            <span
              className="animate-pulse text-[11px]"
              style={{ color: PENCIL, fontFamily: "'Gaegu', cursive" }}
            >
              정리 중…
            </span>
          ) : (
            <Sparkles className="w-3 h-3" style={{ color: PENCIL }} />
          )}
        </div>
        {summaryLines.length > 0 ? (
          <div className="space-y-0.5">
            {summaryLines.map((l, i) => (
              <p
                key={`${i}-${l.slice(0, 12)}`}
                style={{
                  fontFamily: HAND_FONT,
                  fontSize: '15.5px',
                  lineHeight: '22px',
                  color: INK,
                  transform: `rotate(${(seeded(i + 100, 3) - 0.5) * 0.6}deg)`,
                  transformOrigin: 'left center',
                  wordBreak: 'keep-all',
                }}
              >
                {l}
              </p>
            ))}
          </div>
        ) : (
          <p
            style={{
              fontFamily: "'Gaegu', cursive",
              fontSize: '14px',
              color: PENCIL,
            }}
          >
            필기가 5분쯤 쌓이면 여기에 정리돼요
          </p>
        )}
      </div>
    </div>
  );
};
