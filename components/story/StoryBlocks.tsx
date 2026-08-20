/**
 * 레슨 스토리의 텍스트/데이터 블록 — 표지, 리드, 문단, 키워드, 샷 데이터,
 * 할 일, 포스트잇, 서명, 학생의 한마디.
 * 기획: docs/LESSON_STORY_UI_PLAN.md §6
 *
 * 타이포 원칙(§11 접근성): 손글씨(Gaegu)는 캡션·메모·서명·한마디 같은
 * **부가 텍스트에만** 쓴다. 제목·리드·본문·할 일은 Noto Sans KR 이다.
 * 손글씨 본문은 저시력 사용자에게 읽기 불가에 가깝다.
 */
import React, { useState } from 'react';
import { Check } from 'lucide-react';
import type { ClientFeedback, GolfData } from '../../types';
import { StoryPolaroid, StoryVideo, type StoryMediaMap } from './StoryMedia';

const HAND = "'Gaegu', 'Nanum Pen Script', cursive";

// ─────────────────────────────────────────────────────────────────────

/**
 * 표지 — 대표컷 위에 한 줄 제목과 날짜·회차·코치명이 얹힌다.
 * 대표컷이 없어도(사진 한 장 없는 기록) 종이 위 큰 날짜로 성립한다.
 */
export const StoryCover: React.FC<{
  headline: string;
  dek?: string;
  mediaId?: string;
  media: StoryMediaMap;
  date: string;
  sessionNumber?: number;
  coachName?: string;
}> = ({ headline, dek, mediaId, media, date, sessionNumber, coachName }) => {
  const src = mediaId ? media[mediaId] : undefined;
  const meta = [
    date.replace(/-/g, '.'),
    sessionNumber ? `${sessionNumber}회차` : null,
    coachName ? `${coachName} 코치` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // 대표컷 없음 — 종이만으로 표지를 만든다.
  if (!src) {
    return (
      <header className="px-4 pt-5 pb-1">
        <p
          className="text-[11px] tracking-[0.1em] tabular-nums"
          style={{ color: 'var(--paper-pencil)' }}
        >
          {meta}
        </p>
        <h1
          className="font-bold tracking-tight mt-1"
          style={{ fontSize: '1.35rem', lineHeight: 1.3, color: 'var(--paper-ink)', wordBreak: 'keep-all' }}
        >
          {headline}
        </h1>
        {dek && (
          <p className="text-[13px] mt-1.5" style={{ color: '#4b5568', wordBreak: 'keep-all' }}>
            {dek}
          </p>
        )}
      </header>
    );
  }

  // 그라디언트 + 제목 — 사진 위에도, 영상의 정지 화면 위에도 같은 것이 얹힌다.
  const titling = (
    <>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(to top, rgba(12,26,21,0.92) 0%, rgba(12,26,21,0.42) 42%, transparent 72%)',
        }}
      />
      <div className="absolute left-4 right-4 bottom-3 text-left pointer-events-none">
        <p className="text-[10px] tracking-[0.1em] tabular-nums" style={{ color: '#cfe4da' }}>
          {meta}
        </p>
        <h1
          className="font-bold tracking-tight text-white mt-0.5"
          style={{ fontSize: '1.3rem', lineHeight: 1.3, wordBreak: 'keep-all' }}
        >
          {headline}
        </h1>
      </div>
    </>
  );

  return (
    <header className="relative">
      {src.type === 'video' ? (
        /*
         * 표지 영상은 탭하면 재생된다. 조판기가 대표컷을 본문 미디어
         * 풀에서 빼기 때문에, 여기서 재생할 수 없으면 그 영상은 스토리
         * 어디에서도 볼 수 없게 된다 — 기록의 본체가 영상 하나뿐인
         * 경우가 흔하므로 이 경로가 막히면 안 된다.
         */
        <StoryVideo src={src} label={headline} overlay={titling} aspectRatio="16 / 9" />
      ) : (
        <>
          <img
            src={src.url}
            alt=""
            decoding="async"
            className="block w-full h-auto"
            style={{ aspectRatio: '16 / 9', objectFit: 'cover' }}
          />
          {titling}
        </>
      )}
      {dek && (
        <p
          className="text-[13px] px-4 pt-3"
          style={{ color: '#4b5568', wordBreak: 'keep-all' }}
        >
          {dek}
        </p>
      )}
    </header>
  );
};

// ─────────────────────────────────────────────────────────────────────

/** 리드 — 본문보다 한 단계 크고 행간이 넓다. */
export const StoryLead: React.FC<{ text: string }> = ({ text }) => (
  <p
    style={{
      fontSize: '15px',
      lineHeight: 1.9,
      color: 'var(--paper-ink)',
      wordBreak: 'keep-all',
      overflowWrap: 'anywhere',
    }}
  >
    {text}
  </p>
);

/** 본문 문단. 여백이 일기의 8할이라 행간을 넉넉히 준다. */
export const StoryParagraph: React.FC<{ text: string }> = ({ text }) => (
  <p
    style={{
      fontSize: '14px',
      lineHeight: 1.95,
      color: 'var(--paper-ink)',
      wordBreak: 'keep-all',
      overflowWrap: 'anywhere',
    }}
  >
    {text}
  </p>
);

/** 오늘의 키워드 — 손글씨 태그. */
export const StoryChips: React.FC<{ items: string[]; tone: 'key' | 'drill' }> = ({
  items,
  tone,
}) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map((item) => (
      <span
        key={item}
        className="rounded-full px-2 py-[1px]"
        style={{
          fontFamily: HAND,
          fontWeight: 700,
          fontSize: '14px',
          color: tone === 'drill' ? '#0b7355' : '#46506a',
          background: tone === 'drill' ? 'rgba(16,185,129,0.10)' : 'rgba(43,53,71,0.06)',
          border: `1px solid ${tone === 'drill' ? 'rgba(16,185,129,0.28)' : 'rgba(43,53,71,0.15)'}`,
        }}
      >
        {tone === 'drill' ? `드릴 · ${item}` : item}
      </span>
    ))}
  </div>
);

// ─────────────────────────────────────────────────────────────────────

/** 표시할 샷 데이터 — 라벨·단위·소수 자릿수를 한곳에서 정한다. */
const DATA_FIELDS: Array<{
  key: keyof GolfData;
  label: string;
  unit?: string;
  digits?: number;
}> = [
  { key: 'carryDistance', label: 'Carry', unit: 'm' },
  { key: 'totalDistance', label: 'Total', unit: 'm' },
  { key: 'ballSpeed', label: 'Ball', unit: 'm/s', digits: 1 },
  { key: 'clubHeadSpeed', label: 'Head', unit: 'm/s', digits: 1 },
  { key: 'smashFactor', label: 'Smash', digits: 2 },
  { key: 'launchAngle', label: 'Launch', unit: '°', digits: 1 },
  { key: 'clubPath', label: 'Path', unit: '°', digits: 1 },
  { key: 'faceAngle', label: 'Face', unit: '°', digits: 1 },
  { key: 'attackAngle', label: 'Attack', unit: '°', digits: 1 },
  { key: 'spinRate', label: 'Spin', unit: 'rpm' },
  { key: 'backSpin', label: 'Back', unit: 'rpm' },
  { key: 'sideTotal', label: 'Side', unit: 'm', digits: 1 },
];

/**
 * 샷 데이터 — 가로 스크롤 숫자 스트립.
 * 차트는 일기 톤을 깨므로 자료 탭(GolfDataVisualizer)이 맡는다.
 */
export const StoryDataStrip: React.FC<{ golf: GolfData }> = ({ golf }) => {
  const shown = DATA_FIELDS.filter(
    (f) => typeof golf[f.key] === 'number' && !Number.isNaN(golf[f.key] as number)
  );
  if (shown.length === 0) return null;

  return (
    <div className="-mx-1 px-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      <div className="flex gap-2 w-max">
        {shown.map((f) => {
          const raw = golf[f.key] as number;
          const value = f.digits ? raw.toFixed(f.digits) : Math.round(raw).toString();
          return (
            <div
              key={f.key}
              className="flex-none rounded-md px-2 py-1"
              style={{ minWidth: '4.1rem', border: '1px solid rgba(43,53,71,0.13)' }}
            >
              <p
                className="text-[9px] tracking-[0.08em] uppercase"
                style={{ color: 'var(--paper-pencil)' }}
              >
                {f.label}
              </p>
              <p
                className="font-bold tabular-nums leading-tight"
                style={{ fontSize: '15px', color: 'var(--paper-ink)' }}
              >
                {value}
                {f.unit && (
                  <span
                    className="font-normal ml-0.5"
                    style={{ fontSize: '10px', color: 'var(--paper-pencil)' }}
                  >
                    {f.unit}
                  </span>
                )}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────

/**
 * 다음 레슨까지 할 일 — 종이 위에서 브랜드 민트를 쓰는 **유일한** 블록.
 * 이 글에서 학생이 실제로 행동해야 하는 곳이 여기뿐이므로 시각적
 * 독점권을 준다.
 *
 * 체크는 학생 뷰에서만 가능하고, 이 화면 안에서만 유지된다 —
 * 서버 왕복은 M2 이후의 일이다.
 */
export const StoryChecklist: React.FC<{ items: string[]; checkable: boolean }> = ({
  items,
  checkable,
}) => {
  const [done, setDone] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <section
      className="rounded-lg px-3 py-2.5"
      style={{
        background: 'rgba(16,185,129,0.10)',
        border: '1px solid rgba(16,185,129,0.28)',
      }}
    >
      <h2
        className="text-[10px] tracking-[0.12em] uppercase mb-1.5"
        style={{ color: '#0b7355' }}
      >
        다음 레슨까지
      </h2>
      <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
        {items.map((item, i) => {
          const isDone = done.has(i);
          const box = (
            <>
              <span
                className="flex-none grid place-items-center rounded-[3px]"
                style={{
                  width: '0.95rem',
                  height: '0.95rem',
                  marginTop: '0.28rem',
                  border: `1.5px solid ${isDone ? '#10b981' : 'rgba(11,115,85,0.55)'}`,
                  background: isDone ? '#10b981' : 'transparent',
                }}
                aria-hidden="true"
              >
                {isDone && <Check className="w-2.5 h-2.5" style={{ color: '#04150e' }} />}
              </span>
              <span
                style={{
                  fontSize: '13px',
                  lineHeight: 1.6,
                  color: isDone ? '#5d6678' : 'var(--paper-ink)',
                  textDecoration: isDone ? 'line-through' : 'none',
                  wordBreak: 'keep-all',
                }}
              >
                {item}
              </span>
            </>
          );

          return (
            <li key={`${i}-${item}`}>
              {checkable ? (
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-pressed={isDone}
                  className="flex gap-2 items-start text-left w-full rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                >
                  {box}
                </button>
              ) : (
                <div className="flex gap-2 items-start">{box}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/** 자유 메모 — 포스트잇. */
export const StoryMemo: React.FC<{ text: string }> = ({ text }) => (
  <aside
    className="rounded-[2px] px-3 py-2.5 self-start"
    style={{
      background: 'var(--paper-postit)',
      transform: 'rotate(-1.2deg)',
      boxShadow: '0 4px 12px -5px rgba(0,0,0,0.35)',
      fontFamily: HAND,
      fontSize: '15px',
      lineHeight: 1.6,
      color: '#4a4326',
      whiteSpace: 'pre-wrap',
      wordBreak: 'keep-all',
    }}
  >
    {text}
  </aside>
);

/**
 * 코치 서명 — "누가 나한테 써줬다"를 만드는 한 줄. 생략하지 않는다.
 * 승인 시각이 있으면 그 날짜를, 없으면 이름만 남긴다.
 */
export const StorySignature: React.FC<{ coachName?: string; signedAt?: number }> = ({
  coachName,
  signedAt,
}) => {
  const when = signedAt ? new Date(signedAt) : null;
  const label = [
    coachName ? `${coachName} 코치` : null,
    when && !Number.isNaN(when.getTime())
      ? `${when.getMonth() + 1}월 ${when.getDate()}일`
      : null,
  ]
    .filter(Boolean)
    .join(', ');

  if (!label) return null;

  return (
    <p
      className="self-end text-right"
      style={{
        fontFamily: HAND,
        fontWeight: 700,
        fontSize: '17px',
        color: '#46506a',
        borderBottom: '1.5px solid rgba(43,53,71,0.2)',
        padding: '0 0.4rem 0.15rem',
      }}
    >
      — {label}
    </p>
  );
};

/**
 * 학생의 한마디 — 종이 아래 붙은 다른 색 쪽지.
 * 아직 없으면 학생 뷰에서만 입력 유도가 뜬다. 실제 입력은 기존
 * 자료 탭의 회원 노트 UI 가 맡으므로 여기서는 그쪽으로 안내만 한다.
 */
export const StoryReply: React.FC<{
  feedback?: ClientFeedback;
  invite: boolean;
  onInvite?: () => void;
}> = ({ feedback, invite, onInvite }) => {
  const text = feedback?.text?.trim();

  if (invite) {
    return (
      <button
        type="button"
        onClick={onInvite}
        className="rounded-md px-3 py-2.5 text-left w-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        style={{ background: '#eef1f7', border: '1px dashed rgba(43,53,71,0.22)' }}
      >
        <span
          style={{ fontFamily: HAND, fontSize: '15px', color: '#7a8296' }}
        >
          ✎ 오늘 레슨, 한마디 남기기
        </span>
      </button>
    );
  }

  if (!text && !feedback?.voiceUrl) return null;

  return (
    <aside className="rounded-md px-3 py-2.5" style={{ background: '#eef1f7' }}>
      <p
        className="text-[9px] tracking-[0.1em] uppercase"
        style={{ color: '#7a8296' }}
      >
        학생의 한마디
      </p>
      {text && (
        <p
          style={{
            fontFamily: HAND,
            fontSize: '15px',
            lineHeight: 1.55,
            color: '#3d465c',
            whiteSpace: 'pre-wrap',
            wordBreak: 'keep-all',
          }}
        >
          {text}
        </p>
      )}
      {feedback?.voiceUrl && (
        <audio src={feedback.voiceUrl} controls preload="none" className="w-full mt-1.5 h-8" />
      )}
    </aside>
  );
};

/** 대표컷/문단 사이 사진을 스토리 뷰에서 그릴 때 쓰는 재수출. */
export { StoryPolaroid };
