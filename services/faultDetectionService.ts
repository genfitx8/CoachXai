import type {
  SwingAnalysis,
  SwingEvent,
  SwingEventName,
  SwingSummary,
} from '../types/swingAnalysis';
import type { FaultId, FaultSeverity, SwingFault } from '../types/swingFault';
import { DRILL_LIBRARY } from './drillLibrary';

/**
 * Deterministic fault detection over `SwingAnalysis`. Every rule is a small
 * pure function that returns `SwingFault | undefined` — no LLM, no
 * probabilistic reasoning, so the same swing always produces the same
 * verdict. The thresholds below are conservative starting points derived from
 * common coaching literature; tune them against real coach-labeled swings.
 *
 * Adding a new fault:
 *   1. Add its id + drill list to `types/swingFault.ts` / `drillLibrary.ts`.
 *   2. Write a `detectXxx(events, summary)` function returning the SwingFault.
 *   3. Register the function in `RULES`.
 */

type DetectionContext = {
  events: Partial<Record<SwingEventName, SwingEvent>>;
  summary: SwingSummary;
};

type Rule = (ctx: DetectionContext) => SwingFault | undefined;

function fault(
  id: FaultId,
  severity: FaultSeverity,
  title: string,
  description: string,
  evidence: string[],
): SwingFault {
  return {
    id,
    severity,
    title,
    description,
    evidence,
    drills: DRILL_LIBRARY[id] ?? [],
  };
}

function detectEarlyExtension(ctx: DetectionContext): SwingFault | undefined {
  const v = ctx.events.impact?.metrics.earlyExtensionMm;
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  if (v < 40) return undefined;
  const severity: FaultSeverity = v >= 80 ? 'major' : 'minor';
  return fault(
    'early_extension',
    severity,
    '얼리 익스텐션',
    `임팩트 시점 골반이 어드레스 대비 ${v.toFixed(0)}mm 카메라 쪽으로 이동. 상체가 세워지며 슬라이스·푸시의 근본 원인이 됩니다.`,
    ['earlyExtensionMm'],
  );
}

function detectHeadSway(ctx: DetectionContext): SwingFault | undefined {
  const v = ctx.events.impact?.metrics.headSwayMm;
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  if (v < 50) return undefined;
  const severity: FaultSeverity = v >= 100 ? 'major' : 'minor';
  return fault(
    'head_sway',
    severity,
    '머리 드리프트',
    `어드레스 대비 머리가 ${v.toFixed(0)}mm 이동. 임팩트 지점을 예측하기 어려워지고 뒤땅·탑볼 확률이 높아집니다.`,
    ['headSwayMm'],
  );
}

function detectSpineLoss(ctx: DetectionContext): SwingFault | undefined {
  const v = ctx.events.impact?.metrics.spineTiltDelta;
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const mag = Math.abs(v);
  if (mag < 8) return undefined;
  const severity: FaultSeverity = mag >= 15 ? 'major' : 'minor';
  const dir = v < 0 ? '세워졌' : '기울었';
  return fault(
    'spine_loss',
    severity,
    '자세 유지 실패',
    `임팩트에서 척추 각이 어드레스 대비 ${mag.toFixed(1)}° ${dir}습니다. 컨택 지점을 정확히 되찾기 어려워집니다.`,
    ['spineTiltDelta'],
  );
}

function detectWeakXFactor(ctx: DetectionContext): SwingFault | undefined {
  const v = ctx.events.top?.metrics.hipShoulderSeparation;
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const mag = Math.abs(v);
  if (mag >= 30) return undefined;
  return fault(
    'weak_x_factor',
    'minor',
    '코일 부족 (약한 X-Factor)',
    `백스윙 톱에서 어깨-골반 분리각이 ${mag.toFixed(1)}°에 그침. 투어 평균은 40°+이며 헤드 스피드 손실로 직결됩니다.`,
    ['hipShoulderSeparation@top'],
  );
}

function detectOverSwing(ctx: DetectionContext): SwingFault | undefined {
  const v = ctx.events.top?.metrics.shoulderRotation;
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const mag = Math.abs(v);
  if (mag < 115) return undefined;
  return fault(
    'over_swing',
    mag >= 130 ? 'major' : 'minor',
    '오버스윙',
    `백스윙 톱 어깨 회전 ${mag.toFixed(0)}°. 110° 이상은 컨트롤 저하·리듬 붕괴로 이어집니다.`,
    ['shoulderRotation@top'],
  );
}

function detectTempoIssue(ctx: DetectionContext): SwingFault | undefined {
  const r = ctx.summary.tempoRatio;
  if (typeof r !== 'number' || !Number.isFinite(r)) return undefined;
  if (r < 2.2) {
    return fault(
      'quick_tempo',
      r < 1.7 ? 'major' : 'minor',
      '급한 템포',
      `백스윙:다운스윙 비율 ${r.toFixed(2)}:1. 투어 평균 3:1 대비 급하게 다운스윙에 진입하며 방향성이 나빠집니다.`,
      ['tempoRatio'],
    );
  }
  if (r > 3.8) {
    return fault(
      'slow_tempo',
      r > 4.5 ? 'major' : 'minor',
      '느린 템포',
      `백스윙:다운스윙 비율 ${r.toFixed(2)}:1. 다운스윙 가속이 부족해 거리 손실이 발생합니다.`,
      ['tempoRatio'],
    );
  }
  return undefined;
}

function detectPlaneIssue(ctx: DetectionContext): SwingFault | undefined {
  const plane = ctx.summary.swingPlaneAngleCorrected ?? ctx.summary.swingPlaneAngle;
  if (typeof plane !== 'number' || !Number.isFinite(plane)) return undefined;
  if (plane < 40) {
    return fault(
      'off_plane_flat',
      plane < 30 ? 'major' : 'minor',
      '납작한 스윙 플레인',
      `스윙 플레인 ${plane.toFixed(1)}°. 정상 드라이버 45–55° 대비 지나치게 눕혀졌으며 훅·풀 성향이 강해집니다.`,
      ['swingPlaneAngle'],
    );
  }
  if (plane > 70) {
    return fault(
      'off_plane_steep',
      plane > 80 ? 'major' : 'minor',
      '가파른 스윙 플레인',
      `스윙 플레인 ${plane.toFixed(1)}°. 정상 45–55° 대비 세워져 있고 슬라이스·페이드 성향과 뒤땅 확률이 상승합니다.`,
      ['swingPlaneAngle'],
    );
  }
  return undefined;
}

function detectKneeFlexIssue(ctx: DetectionContext): SwingFault | undefined {
  const v = ctx.events.address?.metrics.kneeFlex;
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  if (v > 175) {
    return fault(
      'address_over_extension',
      'minor',
      '어드레스 무릎 신전',
      `어드레스 무릎 각도 ${v.toFixed(1)}°. 목표 150–165° 대비 다리가 지나치게 펴져 있어 회전 저항이 줄고 스웨이가 유발됩니다.`,
      ['kneeFlex@address'],
    );
  }
  if (v < 140 && v >= 90) {
    return fault(
      'poor_knee_flex',
      'minor',
      '어드레스 무릎 과굴곡',
      `어드레스 무릎 각도 ${v.toFixed(1)}°. 150° 이하로 지나치게 낮으면 상체 회전이 제한되고 스탠딩 업 결점이 발생합니다.`,
      ['kneeFlex@address'],
    );
  }
  return undefined;
}

function detectClubPathIssue(ctx: DetectionContext): SwingFault | undefined {
  const v = ctx.summary.clubPathAtImpactDeg;
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const mag = Math.abs(v);
  if (mag < 8) return undefined;
  if (v < 0) {
    return fault(
      'excessive_out_to_in',
      mag >= 12 ? 'major' : 'minor',
      '아웃-투-인 궤도',
      `클럽 패스 ${v.toFixed(1)}°. 페이스가 열리면 슬라이스, 닫히면 풀 훅. 대부분 오버-더-톱 이동이 원인입니다.`,
      ['clubPathAtImpactDeg'],
    );
  }
  return fault(
    'excessive_in_to_out',
    mag >= 12 ? 'major' : 'minor',
    '과도한 인-투-아웃',
    `클럽 패스 +${v.toFixed(1)}°. 페이스가 열리면 푸시, 닫히면 스냅 훅으로 이어집니다.`,
    ['clubPathAtImpactDeg'],
  );
}

const RULES: Rule[] = [
  detectEarlyExtension,
  detectHeadSway,
  detectSpineLoss,
  detectWeakXFactor,
  detectOverSwing,
  detectTempoIssue,
  detectPlaneIssue,
  detectKneeFlexIssue,
  detectClubPathIssue,
];

const SEVERITY_ORDER: Record<FaultSeverity, number> = {
  major: 0,
  minor: 1,
  info: 2,
};

/**
 * Run every rule against the analysis and return the surviving faults sorted
 * by severity (major → minor → info). Duplicate ids are impossible because
 * each rule owns a unique FaultId.
 */
export function detectFaults(analysis: SwingAnalysis): SwingFault[] {
  const ctx: DetectionContext = { events: analysis.events, summary: analysis.summary };
  const faults: SwingFault[] = [];
  for (const rule of RULES) {
    const f = rule(ctx);
    if (f) faults.push(f);
  }
  faults.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return faults;
}

/** Internal helpers for unit tests. */
export const __testing__ = {
  detectEarlyExtension,
  detectHeadSway,
  detectSpineLoss,
  detectWeakXFactor,
  detectOverSwing,
  detectTempoIssue,
  detectPlaneIssue,
  detectKneeFlexIssue,
  detectClubPathIssue,
};
