/**
 * 레슨 스토리의 미디어 블록 — 폴라로이드 사진/영상, 전후 비교, 갤러리,
 * 스윙 시퀀스 필름스트립. 기획: docs/LESSON_STORY_UI_PLAN.md §6
 *
 * 이 파일에 미디어 블록을 모아 둔 이유는 전부 같은 두 가지 장치를
 * 공유하기 때문이다.
 *
 *  1. **폴라로이드 프레임** — 흰 테두리 + 미세한 회전. 회전각은
 *     mediaId 해시로 고정한다. 리렌더마다 각도가 흔들리면 손맛이
 *     아니라 버그로 보인다.
 *  2. **탭하기 전까지 <video> 를 만들지 않는다** — 스토리는 기존 상세
 *     화면보다 영상이 훨씬 많이 노출되므로, 전부 마운트하면 모바일에서
 *     디코더가 바로 바닥난다. 탭 전에는 포스터 자리만 그린다.
 */
import React, { useMemo, useState } from 'react';
import { Film, ImageOff, Play } from 'lucide-react';
import type { SwingSequenceItem } from '../../types';
import { StoryEditable } from './StoryEditable';

/** 뷰가 mediaId 로 실제 재생 가능한 소스를 찾을 때 쓰는 맵. */
export interface StoryMediaSource {
  url: string;
  type: 'video' | 'image' | 'audio';
  /** 영상의 포스터 이미지(있으면 탭 전 화면에 쓴다). */
  poster?: string;
}
export type StoryMediaMap = Record<string, StoryMediaSource>;

/** 캡션 타이포 — 읽는 자리와 고치는 자리가 같은 값을 써야 글이 안 흔들린다. */
const CAPTION_STYLE: React.CSSProperties = {
  fontFamily: "'Gaegu', 'Nanum Pen Script', cursive",
  fontSize: '15px',
  lineHeight: 1.5,
  color: 'var(--paper-pencil)',
  textAlign: 'center',
  wordBreak: 'keep-all',
  display: 'block',
};

/** id 시드 기반 유사난수(0~1) — 렌더마다 흔들리지 않는 손맛용. */
const seeded = (seed: string): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const x = Math.sin(h) * 43758.5453;
  return x - Math.floor(x);
};

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 폴라로이드 기울기(deg). reduce-motion 이면 0. */
const useTilt = (seed: string, amplitude = 1.3): number => {
  const reduced = useMemo(prefersReducedMotion, []);
  return useMemo(
    () => (reduced ? 0 : (seeded(seed) - 0.5) * 2 * amplitude),
    [seed, amplitude, reduced]
  );
};

/** 자료가 사라진 자리 — 빈칸으로 두면 조판이 무너진 것처럼 보인다. */
const MissingMedia: React.FC<{ label: string }> = ({ label }) => (
  <div
    className="flex flex-col items-center justify-center gap-1 py-8 px-4 rounded-sm text-center"
    style={{ background: '#2b354710', color: 'var(--paper-pencil)' }}
  >
    <ImageOff className="w-5 h-5" aria-hidden="true" />
    <span className="text-xs">{label}</span>
  </div>
);

/**
 * 영상 한 편 — 탭하기 전에는 포스터와 재생 버튼만, 탭한 뒤에 실제
 * <video> 를 마운트한다. 자동재생하지 않는다(일기를 여는 순간 소리가
 * 나면 안 된다).
 *
 * 표지처럼 포스터 위에 글자가 얹히는 자리는 `overlay` 로 넘긴다. 재생이
 * 시작되면 오버레이는 사라진다 — 안 그러면 제목이 컨트롤을 덮는다.
 */
export const StoryVideo: React.FC<{
  src: StoryMediaSource;
  label: string;
  /** 정지 상태의 포스터 위에 얹을 것(표지의 그라디언트 + 제목 등). */
  overlay?: React.ReactNode;
  /** 포스터 자리의 비율 고정 — 표지처럼 높이가 정해진 곳에서 쓴다. */
  aspectRatio?: string;
}> = ({ src, label, overlay, aspectRatio }) => {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <video
        src={src.url}
        poster={src.poster}
        controls
        autoPlay
        playsInline
        className="block w-full h-auto"
        style={{ maxHeight: '70vh', background: '#0d1f1a' }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="relative block w-full group focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      aria-label={`${label} 재생`}
    >
      {src.poster ? (
        <img
          src={src.poster}
          alt=""
          loading="lazy"
          decoding="async"
          className="block w-full h-auto"
          style={aspectRatio ? { aspectRatio, objectFit: 'cover' } : undefined}
        />
      ) : (
        <div
          className="w-full"
          style={{
            aspectRatio: aspectRatio ?? '16 / 9',
            background: 'linear-gradient(135deg,#27564a,#0d1f1a)',
          }}
        />
      )}
      {overlay}
      <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="w-12 h-12 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center transition-transform group-hover:scale-105 group-active:scale-95">
          <Play className="w-5 h-5 text-white translate-x-[1px]" fill="currentColor" />
        </span>
      </span>
    </button>
  );
};

/**
 * 폴라로이드 한 장 — 사진이든 영상이든 같은 프레임에 담는다.
 * 캡션은 아래 흰 여백 위에 손글씨로 앉는다.
 */
export const StoryPolaroid: React.FC<{
  mediaId: string;
  media: StoryMediaMap;
  caption?: string;
  size: 'inset' | 'full';
  /** alt 폴백 — 캡션이 없을 때 "레슨 사진 3/7" 같은 위치 설명. */
  altFallback: string;
  /** 코치 본인이면 캡션을 사진 밑에서 바로 쓴다. */
  editable?: boolean;
  onCaptionChange?: (next: string) => void;
}> = ({
  mediaId,
  media,
  caption,
  size,
  altFallback,
  editable = false,
  onCaptionChange,
}) => {
  const src = media[mediaId];
  const tilt = useTilt(mediaId);

  return (
    <figure
      className="self-center bg-white rounded-[2px] mx-auto"
      style={{
        width: size === 'full' ? '100%' : '76%',
        maxWidth: '100%',
        padding: '7px 7px 0',
        transform: `rotate(${tilt}deg)`,
        boxShadow: '0 6px 18px -6px rgba(0,0,0,0.4), 0 0 0 1px rgba(0,0,0,0.05)',
      }}
    >
      <div className="overflow-hidden rounded-[1px]">
        {!src ? (
          <MissingMedia label="자료를 불러오지 못했어요" />
        ) : src.type === 'video' ? (
          <StoryVideo src={src} label={caption || altFallback} />
        ) : (
          <img
            src={src.url}
            alt={caption || altFallback}
            loading="lazy"
            decoding="async"
            className="block w-full h-auto"
          />
        )}
      </div>
      <figcaption
        className="leading-snug"
        style={{ padding: '0.3rem 0.4rem 0.55rem' }}
      >
        {editable ? (
          <StoryEditable
            value={caption ?? ''}
            onSave={(v) => onCaptionChange?.(v)}
            editable
            placeholder="＋ 캡션 달기"
            maxLength={40}
            ariaLabel={`${altFallback} 캡션 달기`}
            style={CAPTION_STYLE}
          />
        ) : (
          // 캡션이 없어도 폴라로이드 아래 여백은 남는다(빈 흰 테두리).
          <span style={CAPTION_STYLE}>{caption || ' '}</span>
        )}
      </figcaption>
    </figure>
  );
};

/** 레슨 전/후 나란히 — 두 영상을 같은 프레임 안에 붙여 놓는다. */
export const StoryCompare: React.FC<{
  beforeId: string;
  afterId: string;
  media: StoryMediaMap;
}> = ({ beforeId, afterId, media }) => {
  const pane = (id: string, label: string) => {
    const src = media[id];
    return (
      <figure className="relative m-0 min-w-0">
        {src ? (
          <StoryVideo src={src} label={label} />
        ) : (
          <MissingMedia label="영상 없음" />
        )}
        <figcaption
          className="absolute left-1.5 bottom-1 pointer-events-none"
          style={{
            fontFamily: "'Gaegu', 'Nanum Pen Script', cursive",
            fontWeight: 700,
            fontSize: '14px',
            color: '#f0efe6',
            textShadow: '0 1px 3px rgba(0,0,0,0.7)',
          }}
        >
          {label}
        </figcaption>
      </figure>
    );
  };

  return (
    <div
      className="grid grid-cols-2 gap-[2px] rounded-sm overflow-hidden"
      style={{ boxShadow: '0 0 0 1px rgba(43,53,71,0.13)' }}
    >
      {pane(beforeId, '레슨 전')}
      {pane(afterId, '레슨 후')}
    </div>
  );
};

/**
 * 본문에 자리를 못 얻은 미디어 — 하단 그리드. 사진이 많은 기록에서
 * 문단 사이가 사진으로만 채워지는 것을 막는 안전판이다.
 */
export const StoryGallery: React.FC<{
  mediaIds: string[];
  media: StoryMediaMap;
}> = ({ mediaIds, media }) => (
  <div className="grid grid-cols-3 gap-1.5">
    {mediaIds.map((id, i) => {
      const src = media[id];
      return (
        <div
          key={id}
          className="overflow-hidden rounded-sm"
          style={{ aspectRatio: '1 / 1', background: '#2b354712' }}
        >
          {!src ? (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ color: 'var(--paper-pencil)' }}
            >
              <ImageOff className="w-4 h-4" aria-hidden="true" />
            </div>
          ) : src.type === 'video' ? (
            // 갤러리의 영상은 썸네일만 — 여기서 <video> 를 9개 만들면
            // 모바일 디코더가 바로 바닥난다.
            <div className="relative w-full h-full">
              {src.poster ? (
                <img
                  src={src.poster}
                  alt={`레슨 영상 ${i + 1}`}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full"
                  style={{ background: 'linear-gradient(135deg,#27564a,#0d1f1a)' }}
                />
              )}
              <span className="absolute inset-0 flex items-center justify-center">
                <Film className="w-4 h-4 text-white/85" aria-hidden="true" />
              </span>
            </div>
          ) : (
            <img
              src={src.url}
              alt={`레슨 사진 ${i + 1}`}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
          )}
        </div>
      );
    })}
  </div>
);

/** 스윙 시퀀스 — 가로로 흐르는 프레임 띠. */
export const StoryFilmstrip: React.FC<{ items: SwingSequenceItem[] }> = ({ items }) => (
  <div className="-mx-1 px-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
    <div className="flex gap-1.5 w-max">
      {items.map((item) => (
        <figure
          key={item.id}
          className="m-0 flex-none bg-white rounded-[2px] p-[3px]"
          style={{ width: '5.5rem', boxShadow: '0 0 0 1px rgba(43,53,71,0.1)' }}
        >
          <img
            src={item.imageUrl}
            alt={item.label}
            loading="lazy"
            decoding="async"
            className="block w-full rounded-[1px]"
            style={{ aspectRatio: '3 / 4', objectFit: 'cover' }}
          />
          <figcaption
            className="text-center pt-0.5"
            style={{
              fontFamily: "'Gaegu', 'Nanum Pen Script', cursive",
              fontSize: '13px',
              color: 'var(--paper-pencil)',
            }}
          >
            {item.label}
          </figcaption>
        </figure>
      ))}
    </div>
  </div>
);
