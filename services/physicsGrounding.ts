/**
 * physicsGrounding — Trackman/PGA reference values for optimal launch and
 * spin, keyed by club + clubhead speed.
 *
 * Why this exists
 * ---------------
 * shot_analysis baseline v2 (evals/BASELINE.md, F2) showed the model was
 * confidently asserting "7번 아이언 최적 런치 18~20°" style numbers — those
 * values weren't in the input and don't match published Trackman data
 * (7I median tour: ~16°). This module gives the AI a grounded reference
 * so it can quote instead of invent.
 *
 * Design
 * ------
 * - Pure lookup + linear interpolation between adjacent clubSpeed bins.
 * - Returns `null` for unknown clubs so callers can gracefully skip.
 * - `buildPhysicsReferenceBlock` formats a markdown table the AI can
 *   quote directly into the report.
 *
 * The system prompt tells the model to prefer this block over any prior
 * knowledge. Assertions in evals/shot_analysis.eval.json check that the
 * exact reference numbers appear in the output.
 */

import raw from '../constants/optimalLaunchSpin.json';

interface Bin {
  clubSpeedMph: number;
  launchDeg: [number, number];
  spinRpm: [number, number];
}

interface ClubTable {
  label: string;
  bins: Bin[];
}

interface Root {
  source: string;
  clubs: Record<string, ClubTable>;
}

const table: Root = raw as unknown as Root;

export interface OptimalRange {
  club: string;
  label: string;
  clubSpeedMph: number;
  /** Closest reference bin used for the lookup (mph). */
  referenceBinMph: number;
  /** True when clubSpeedMph fell outside the covered range and was clamped. */
  extrapolated: boolean;
  launchDeg: [number, number];
  spinRpm: [number, number];
}

/**
 * Normalise a club name to the JSON table's key. Handles the various
 * ways coaches write iron numbers ("7I", "7iron", "7번 아이언", "iron 7", etc.).
 * Returns the key or null when the club isn't in the table.
 */
export const normaliseClubKey = (club: string): string | null => {
  const raw = club.trim().toUpperCase().replace(/\s+/g, '');
  // Direct hit — already in canonical form.
  if (raw in table.clubs) return raw;

  // Common Korean spellings.
  const koToKey: Record<string, string> = {
    드라이버: 'DR',
    DRIVER: 'DR',
    '3번우드': '3W',
    '5번우드': '5W',
  };
  if (koToKey[raw]) return koToKey[raw];

  // Numeric-iron matcher: "7IRON", "IRON7", "7번아이언" → 7I
  const ironMatch = raw.match(/([4-9])\s*(I|IRON|번아이언)/);
  if (ironMatch) return `${ironMatch[1]}I`;

  // Wedge nicknames.
  const wedgeMatch = raw.match(/(P|G|S|L)W/);
  if (wedgeMatch) return `${wedgeMatch[1]}W`;

  return null;
};

/**
 * Linear interpolation between two [min, max] tuples given a t in [0, 1].
 */
const lerpRange = (
  a: [number, number],
  b: [number, number],
  t: number
): [number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

/**
 * Look up the optimal launch/spin range for a given club at a given
 * clubhead speed. Interpolates linearly between adjacent bins; clamps
 * (with `extrapolated: true`) when outside the covered range. Returns
 * null when the club isn't in our reference table.
 */
export const getOptimalLaunchSpin = (
  club: string,
  clubSpeedMph: number
): OptimalRange | null => {
  const key = normaliseClubKey(club);
  if (!key) return null;
  const entry = table.clubs[key];
  if (!entry || entry.bins.length === 0) return null;

  const bins = [...entry.bins].sort((a, b) => a.clubSpeedMph - b.clubSpeedMph);
  const roundR = (r: [number, number]): [number, number] => [
    Math.round(r[0] * 10) / 10,
    Math.round(r[1] * 10) / 10,
  ];
  const roundI = (r: [number, number]): [number, number] => [
    Math.round(r[0] / 50) * 50,
    Math.round(r[1] / 50) * 50,
  ];

  // Below the lowest bin → clamp with extrapolation flag.
  if (clubSpeedMph <= bins[0].clubSpeedMph) {
    return {
      club: key,
      label: entry.label,
      clubSpeedMph,
      referenceBinMph: bins[0].clubSpeedMph,
      extrapolated: clubSpeedMph < bins[0].clubSpeedMph,
      launchDeg: roundR(bins[0].launchDeg),
      spinRpm: roundI(bins[0].spinRpm),
    };
  }
  // Above the highest bin.
  if (clubSpeedMph >= bins[bins.length - 1].clubSpeedMph) {
    const top = bins[bins.length - 1];
    return {
      club: key,
      label: entry.label,
      clubSpeedMph,
      referenceBinMph: top.clubSpeedMph,
      extrapolated: clubSpeedMph > top.clubSpeedMph,
      launchDeg: roundR(top.launchDeg),
      spinRpm: roundI(top.spinRpm),
    };
  }
  // Interpolate between the two bracketing bins.
  for (let i = 0; i < bins.length - 1; i++) {
    const lo = bins[i];
    const hi = bins[i + 1];
    if (clubSpeedMph >= lo.clubSpeedMph && clubSpeedMph <= hi.clubSpeedMph) {
      const t = (clubSpeedMph - lo.clubSpeedMph) / (hi.clubSpeedMph - lo.clubSpeedMph);
      return {
        club: key,
        label: entry.label,
        clubSpeedMph,
        referenceBinMph:
          Math.abs(clubSpeedMph - lo.clubSpeedMph) <=
          Math.abs(hi.clubSpeedMph - clubSpeedMph)
            ? lo.clubSpeedMph
            : hi.clubSpeedMph,
        extrapolated: false,
        launchDeg: roundR(lerpRange(lo.launchDeg, hi.launchDeg, t)),
        spinRpm: roundI(lerpRange(lo.spinRpm, hi.spinRpm, t)),
      };
    }
  }
  return null;
};

export interface ClubSpeedLookup {
  /** Club symbol as it appears in the aggregate (e.g. "7I", "DR"). */
  club: string;
  /** Measured clubhead speed for the golfer, in mph. */
  clubSpeedMph: number;
}

/**
 * Build a markdown reference block for the AI prompt. Includes only clubs
 * that resolved to an OptimalRange — unknown clubs are silently skipped
 * so the AI still handles them (falling back to caveated language).
 */
export const buildPhysicsReferenceBlock = (
  lookups: ClubSpeedLookup[]
): string => {
  const rows: string[] = [];
  for (const l of lookups) {
    const range = getOptimalLaunchSpin(l.club, l.clubSpeedMph);
    if (!range) continue;
    const [launchLo, launchHi] = range.launchDeg;
    const [spinLo, spinHi] = range.spinRpm;
    const note = range.extrapolated
      ? ` (참조 bin ${range.referenceBinMph} mph에서 외삽)`
      : '';
    rows.push(
      `- **${range.label}** (${range.clubSpeedMph.toFixed(0)} mph 기준${note}): 최적 런치 **${launchLo}°–${launchHi}°**, 최적 스핀 **${Math.round(spinLo)}–${Math.round(spinHi)} rpm**`
    );
  }
  if (rows.length === 0) return '';
  return [
    '=== Trackman / PGA 참조 최적 값 (이 골퍼 실측 클럽 스피드 기준) ===',
    '**중요**: 아래 값은 검증된 참조 데이터입니다. 최적 런치·스핀을 언급할 때는',
    '아래 표의 값을 그대로 사용하세요. 추측·일반론으로 값을 지어내지 마세요.',
    '',
    ...rows,
    `\n_출처: ${table.source}_`,
  ].join('\n');
};
