import React from 'react';

/**
 * CoachX 로고 — 교차 마크 + 워드마크
 *
 * 작도 규칙 (변경 금지)
 *   40×40 격자 · 두 획의 끝점 8 / 32 · stroke-width 3.4 (= 격자의 8.5%)
 *   linecap round · 정확히 45°
 *   왼쪽위→오른쪽아래 획이 잉크색(뒤), 오른쪽위→왼쪽아래 획이 에메랄드(앞)
 *
 * 최소 크기: 마크 단독 24px, 가로형 20px, 16px 이하는 마크만
 * 여백: 사방으로 마크 높이의 100%
 */

export type LogoTone = 'light' | 'dark' | 'mono';

const INK: Record<LogoTone, string> = {
  light: '#14171A',
  dark: '#F3F5F4',
  mono: 'currentColor',
};

interface MarkProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  tone?: LogoTone;
  monochrome?: boolean;
}

export const CoachXMark: React.FC<MarkProps> = ({
  size = 40,
  tone = 'dark',
  monochrome = false,
  ...rest
}) => {
  const stroke = size >= 40 ? 3.4 : size >= 24 ? 3.8 : size >= 20 ? 4.2 : 4.6;
  const ink = INK[tone];
  const accent = monochrome ? ink : '#10B981';

  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      role="img"
      aria-label="CoachX"
      {...rest}
    >
      <line
        x1="8" y1="8" x2="32" y2="32"
        stroke={ink} strokeWidth={stroke} strokeLinecap="round"
      />
      <line
        x1="32" y1="8" x2="8" y2="32"
        stroke={accent} strokeWidth={stroke} strokeLinecap="round"
        opacity={monochrome ? 0.45 : 1}
      />
    </svg>
  );
};

interface LogoProps {
  size?: number;
  tone?: Exclude<LogoTone, 'mono'>;
  orientation?: 'horizontal' | 'vertical';
  korean?: boolean;
  className?: string;
}

export const CoachXLogo: React.FC<LogoProps> = ({
  size = 38,
  tone = 'dark',
  orientation = 'horizontal',
  korean = false,
  className,
}) => {
  const ink = INK[tone];
  const wordSize = orientation === 'horizontal' ? size * 0.82 : size * 0.57;
  const horizontal = orientation === 'horizontal';

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: horizontal ? 'row' : 'column',
        alignItems: 'center',
        gap: horizontal ? size * 0.34 : size * 0.25,
      }}
    >
      <CoachXMark size={size} tone={tone} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: horizontal ? 'flex-start' : 'center' }}>
        <span
          style={{
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
            fontWeight: 500,
            fontSize: wordSize,
            letterSpacing: '-0.025em',
            lineHeight: 1,
            color: ink,
          }}
        >
          Coach<span style={{ fontWeight: 700 }}>X</span>
        </span>
        {korean && (
          <span
            style={{
              fontFamily: "'Noto Sans KR', sans-serif",
              fontWeight: 500,
              fontSize: wordSize * 0.5,
              letterSpacing: '0.02em',
              marginTop: wordSize * 0.17,
              color: tone === 'dark' ? '#8A918E' : '#7A7F7C',
            }}
          >
            코치엑스
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * 에이전트 활동 표시. 작업 중일 때 에메랄드 획이 은은하게 밝아집니다 — 허용되는 유일한 애니메이션.
 */
export const CoachXMarkLive: React.FC<MarkProps & { active?: boolean }> = ({
  active = false,
  ...rest
}) => (
  <span
    style={{
      display: 'inline-flex',
      filter: active ? 'drop-shadow(0 0 6px rgba(16,185,129,0.65))' : 'none',
      transition: 'filter 600ms cubic-bezier(0.16, 1, 0.3, 1)',
    }}
  >
    <CoachXMark {...rest} />
  </span>
);
