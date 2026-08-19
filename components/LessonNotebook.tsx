import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PenLine, Sparkles } from 'lucide-react';
import { formatClock } from '../services/lessonAudioPipeline';

/**
 * LessonNotebook — 레슨 동반 화면의 "종이 노트" 필기 뷰.
 *
 * 다크 테마 화면 위에 밝은 줄노트 종이 카드를 한 장 올려, 10초 단위로
 * 도착하는 전사 텍스트가 코치가 옆에서 받아 적는 것처럼 한 글자씩
 * 적히게 한다. 시각 요소는 전부 CSS 로 그린다(이미지 없음):
 *
 *  - 괘선: repeating-linear-gradient. 글줄이 괘선 위에 정확히 앉도록
 *    LINE_HEIGHT 상수 하나가 배경과 타이포를 동시에 지배한다.
 *  - 왼쪽 마진: 세로 빨간 선 + 그 영역에 연필 톤의 타임스탬프.
 *  - 손글씨: Gaegu(구글 폰트, index.html 에서 로드). 오프라인이면
 *    cursive 폴백으로 떨어진다 — 기능에는 영향 없음.
 *  - 아날로그 디테일: 줄마다 미세하게 다른 기울기·잉크 농도를 라인 id
 *    시드로 결정해(렌더마다 흔들리지 않게) 손맛을 낸다.
 *
 * 애니메이션은 마운트 이후에 "새로 도착한" 줄에만 건다 — 복구/재진입으로
 * 한꺼번에 실린 기존 필기가 우르르 다시 타이핑되면 오히려 가짜같다.
 * prefers-reduced-motion 이면 애니메이션을 생략한다.
 */

export interface NotebookLine {
  id: number;
  /** 레슨 시작 기준 오프셋(초) — 마진의 연필 타임스탬프로 표시. */
  atSec: number;
  text: string;
}

interface LessonNotebookProps {
  lines: NotebookLine[];
  /** 전사가 진행 중인가 — 마지막 줄 밑에 펜 대기 표시. */
  writing: boolean;
  /** 하단 요약 노트(불릿 텍스트). 빈 문자열이면 안내 문구. */
  summary: string;
  summaryUpdating: boolean;
}

/** 괘선 간격(px) — 배경 그라디언트와 글줄 높이가 함께 쓰는 단일 진실. */
const LINE_HEIGHT = 28;
/** 한 글자 적히는 간격(ms). 한글 음절 기준 ~이 속도가 "받아 적기" 체감. */
const TYPE_INTERVAL_MS = 45;

const INK = '#2b3547';
const PENCIL = '#8a8272';
const PAPER = '#fbf6e9';
const RULE = '#dfd4b8';
const MARGIN_LINE = '#e8a9a0';

/** 라인 id 시드 기반 유사난수(0~1) — 렌더마다 흔들리지 않는 손맛용. */
const seeded = (seed: number, salt: number): number => {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 한 줄 — animate 면 글자 단위로 드러나고 쓰는 자리에 펜이 붙는다. */
const HandwrittenLine: React.FC<{
  line: NotebookLine;
  animate: boolean;
  onGrow: () => void;
}> = ({ line, animate, onGrow }) => {
  const [shown, setShown] = useState(animate ? 0 : line.text.length);
  const done = shown >= line.text.length;

  useEffect(() => {
    if (!animate || done) return;
    const timer = window.setInterval(() => {
      setShown((prev) => {
        const next = Math.min(line.text.length, prev + 1);
        return next;
      });
      onGrow();
    }, TYPE_INTERVAL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, done, line.text.length]);

  const tilt = (seeded(line.id, 1) - 0.5) * 0.8; // ±0.4deg
  const inkOpacity = 0.86 + seeded(line.id, 2) * 0.14;

  return (
    <div className="relative" style={{ paddingLeft: '3.25rem' }}>
      <span
        className="absolute left-0 top-0 text-[10px] tabular-nums select-none"
        style={{
          width: '2.75rem',
          textAlign: 'right',
          paddingRight: '0.4rem',
          lineHeight: `${LINE_HEIGHT}px`,
          color: PENCIL,
          fontFamily: "'Space Grotesk', monospace",
        }}
      >
        {formatClock(line.atSec)}
      </span>
      <p
        style={{
          fontFamily: "'Gaegu', 'Nanum Pen Script', cursive",
          fontSize: '17px',
          lineHeight: `${LINE_HEIGHT}px`,
          color: INK,
          opacity: inkOpacity,
          transform: `rotate(${tilt}deg)`,
          transformOrigin: 'left center',
          wordBreak: 'keep-all',
          overflowWrap: 'anywhere',
        }}
      >
        {line.text.slice(0, shown)}
        {!done && (
          <PenLine
            className="inline-block w-3.5 h-3.5 ml-0.5 align-baseline animate-pulse"
            style={{ color: INK }}
          />
        )}
      </p>
    </div>
  );
};

export const LessonNotebook: React.FC<LessonNotebookProps> = ({
  lines,
  writing,
  summary,
  summaryUpdating,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = useMemo(prefersReducedMotion, []);

  // 마운트 시점에 이미 있던 줄(복구·재진입)은 애니메이션 없이 그린다.
  const preexistingRef = useRef<Set<number> | null>(null);
  if (preexistingRef.current === null) {
    preexistingRef.current = new Set(lines.map((l) => l.id));
  }

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  useEffect(scrollToBottom, [lines.length]);

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
        {lines.length === 0 ? (
          <p
            style={{
              fontFamily: "'Gaegu', 'Nanum Pen Script', cursive",
              fontSize: '16px',
              lineHeight: `${LINE_HEIGHT}px`,
              color: PENCIL,
              paddingLeft: '3.25rem',
            }}
          >
            {writing
              ? '듣고 있어요… 곧 여기에 받아 적을게요'
              : '코칭 멘트가 들리면 여기에 받아 적혀요'}
          </p>
        ) : (
          lines.map((line) => (
            <HandwrittenLine
              key={line.id}
              line={line}
              animate={!reducedMotion && !preexistingRef.current!.has(line.id)}
              onGrow={scrollToBottom}
            />
          ))
        )}
        {writing && lines.length > 0 && (
          <p
            className="animate-pulse select-none"
            style={{
              fontFamily: "'Gaegu', cursive",
              fontSize: '15px',
              lineHeight: `${LINE_HEIGHT}px`,
              color: PENCIL,
              paddingLeft: '3.25rem',
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
                  fontFamily: "'Gaegu', 'Nanum Pen Script', cursive",
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
