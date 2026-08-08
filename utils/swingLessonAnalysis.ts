import type {
  SwingLessonAnalysis,
  SwingLessonCameraView,
  SwingLessonEvent,
  SwingLessonHandedness,
  SwingLessonKineticPeak,
  SwingLessonSummary,
} from '../types';
import type { SwingAnalysis, SwingEvent, SwingEventName } from '../types/swingAnalysis';

const EVENT_ORDER: SwingEventName[] = [
  'address',
  'takeaway',
  'half_backswing',
  'top',
  'mid_downswing',
  'impact',
  'follow_through',
  'finish',
];

const finiteOrUndef = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

const compactMetrics = (metrics: Record<string, number> | undefined) => {
  const out: Record<string, number> = {};
  if (!metrics) return out;
  for (const [k, v] of Object.entries(metrics)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
};

/**
 * Compress a full in-memory {@link SwingAnalysis} down to the persistable
 * subset stored on a Lesson. Drops per-frame keypoints and any trajectories
 * that would blow the Firestore document budget.
 */
export function toSwingLessonAnalysis(
  full: SwingAnalysis,
  cameraViewChoice?: SwingLessonCameraView,
): SwingLessonAnalysis {
  const s = full.summary;
  const summary: SwingLessonSummary = {
    cameraView: (cameraViewChoice ?? s.cameraView ?? 'unknown') as SwingLessonCameraView,
    cameraViewDetected: s.cameraViewDetected as SwingLessonCameraView | undefined,
    handedness: s.handedness as SwingLessonHandedness | undefined,
    attackAngle: finiteOrUndef(s.attackAngle),
    backswingMs: finiteOrUndef(s.backswingMs),
    downswingMs: finiteOrUndef(s.downswingMs),
    tempoRatio: finiteOrUndef(s.tempoRatio),
    swingPlaneAngle: finiteOrUndef(s.swingPlaneAngle),
    swingPlaneAngleCorrected: finiteOrUndef(s.swingPlaneAngleCorrected),
    gravityAligned: typeof s.gravityAligned === 'boolean' ? s.gravityAligned : undefined,
    clubHeadSpeedKmh: finiteOrUndef(s.clubHeadSpeedKmh),
    maxClubHeadSpeedKmh: finiteOrUndef(s.maxClubHeadSpeedKmh),
    clubPathAtImpactDeg: finiteOrUndef(s.clubPathAtImpactDeg),
    bodyCenterlineX: finiteOrUndef(s.bodyCenterlineX),
  };

  const ks = s.kineticSequence;
  if (ks) {
    summary.kineticOrder = ks.order;
    summary.kineticPeakSpanMs = finiteOrUndef(ks.peakSpanMs);
    const peaks: SwingLessonKineticPeak[] = [];
    (['pelvis', 'torso', 'leadArm', 'hands'] as const).forEach((key) => {
      const p = ks[key];
      if (!p) return;
      peaks.push({
        segment: p.segment,
        peakValue: p.peakValue,
        peakT: p.peakT,
        msFromTop: p.msFromTop,
      });
    });
    if (peaks.length > 0) summary.kineticPeaks = peaks;
  }

  const events: SwingLessonEvent[] = [];
  for (const name of EVENT_ORDER) {
    const ev: SwingEvent | undefined = full.events[name];
    if (!ev) continue;
    events.push({
      name,
      t: ev.t,
      metrics: compactMetrics(ev.metrics),
    });
  }

  return {
    cameraView: summary.cameraView,
    summary,
    events,
    warnings: [...(full.warnings || [])],
    sampledFps: finiteOrUndef(full.sampledFps),
    nativeFps: finiteOrUndef(full.nativeFps),
    analyzedAt: Date.now(),
  };
}

export const SWING_EVENT_LABEL_KO: Record<string, string> = {
  address: '어드레스',
  takeaway: '테이크어웨이',
  half_backswing: '하프 백스윙',
  top: '백스윙 톱',
  mid_downswing: '다운스윙',
  impact: '임팩트',
  follow_through: '팔로우 스루',
  finish: '피니시',
};

export const KINETIC_ORDER_LABEL_KO: Record<string, string> = {
  correct: '정상 (골반→상체→팔→손)',
  partial: '부분 정렬',
  simultaneous: '동시 발화',
  inverted: '역순 (팔·손 선행)',
  unknown: '분석 부족',
};

export const CAMERA_VIEW_LABEL_KO: Record<string, string> = {
  face_on: '정면 (Face-On)',
  down_the_line: '측면 (Down-the-Line)',
  unknown: '뷰 미상',
};
