import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  Loader2,
  AlertTriangle,
  Target,
  RefreshCw,
  X,
  Stethoscope,
  Dumbbell,
} from 'lucide-react';
import { swingAnalysisService } from '../../services/swingAnalysisService';
import { detectFaults } from '../../services/faultDetectionService';
import type { SwingFault } from '../../types/swingFault';
import type {
  KineticOrder,
  KineticSegment,
  KineticSegmentPeak,
  KineticSequence,
} from '../../types/swingAnalysis';
import {
  CameraView,
  Handedness,
  SwingAnalysis,
  SwingAnalysisProgress,
  SwingEvent,
  SwingEventName,
  SwingFrame,
  SwingSummary,
} from '../../types/swingAnalysis';
import { SkeletonKeypoint } from '../../types/postureAnalysis';

const EVENT_LABEL: Record<SwingEventName, string> = {
  address: '어드레스',
  takeaway: '백스윙',
  top: '백스윙 톱',
  impact: '임팩트',
  finish: '피니시',
};

const EVENT_ORDER: SwingEventName[] = ['address', 'takeaway', 'top', 'impact', 'finish'];

const POSE_CONNECTIONS: Array<[number, number]> = [
  [11, 12],
  [11, 13], [13, 15],
  [12, 14], [14, 16],
  [11, 23], [12, 24],
  [23, 24],
  [23, 25], [25, 27],
  [24, 26], [26, 28],
];

interface OverlayLine {
  start: { x: number; y: number };
  end: { x: number; y: number };
  color: string;
  label?: string;
}

interface ClubHeadMarker {
  x: number;
  y: number;
  label?: string;
}

interface TrajectoryOverlay {
  points: Array<{ x: number; y: number }>;
  color: string;
}

function drawKeypoints(
  canvas: HTMLCanvasElement,
  bg: HTMLVideoElement | HTMLImageElement | null,
  keypoints: SkeletonKeypoint[],
  overlay?: OverlayLine,
  clubHead?: ClubHeadMarker,
  trajectory?: TrajectoryOverlay,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (bg && 'videoWidth' in bg) {
    canvas.width = bg.videoWidth || canvas.width;
    canvas.height = bg.videoHeight || canvas.height;
    ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
  } else if (bg) {
    canvas.width = (bg as HTMLImageElement).naturalWidth || canvas.width;
    canvas.height = (bg as HTMLImageElement).naturalHeight || canvas.height;
    ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 3;
  ctx.fillStyle = '#f97316';
  POSE_CONNECTIONS.forEach(([a, b]) => {
    const p1 = keypoints[a];
    const p2 = keypoints[b];
    if (!p1 || !p2 || p1.confidence < 0.3 || p2.confidence < 0.3) return;
    ctx.beginPath();
    ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
    ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
    ctx.stroke();
  });
  keypoints.forEach((kp) => {
    if (kp.confidence < 0.3) return;
    ctx.beginPath();
    ctx.arc(kp.x * canvas.width, kp.y * canvas.height, 4, 0, 2 * Math.PI);
    ctx.fill();
  });
  if (overlay) {
    const sx = overlay.start.x * canvas.width;
    const sy = overlay.start.y * canvas.height;
    const ex = overlay.end.x * canvas.width;
    const ey = overlay.end.y * canvas.height;
    ctx.save();
    ctx.strokeStyle = overlay.color;
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 6]);
    // Extend the segment a little beyond both endpoints so the plane reads as
    // a "line" rather than a chord between two dots.
    const dx = ex - sx;
    const dy = ey - sy;
    ctx.beginPath();
    ctx.moveTo(sx - dx * 0.15, sy - dy * 0.15);
    ctx.lineTo(ex + dx * 0.15, ey + dy * 0.15);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = overlay.color;
    [
      { x: sx, y: sy },
      { x: ex, y: ey },
    ].forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, 2 * Math.PI);
      ctx.fill();
    });
    if (overlay.label) {
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = overlay.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      const midX = (sx + ex) / 2;
      const midY = (sy + ey) / 2;
      ctx.strokeText(overlay.label, midX + 8, midY - 8);
      ctx.fillText(overlay.label, midX + 8, midY - 8);
    }
    ctx.restore();
  }
  if (trajectory && trajectory.points.length >= 2) {
    ctx.save();
    ctx.strokeStyle = trajectory.color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    const first = trajectory.points[0];
    ctx.moveTo(first.x * canvas.width, first.y * canvas.height);
    for (let i = 1; i < trajectory.points.length; i++) {
      const p = trajectory.points[i];
      ctx.lineTo(p.x * canvas.width, p.y * canvas.height);
    }
    ctx.stroke();
    // Small tick marks at each sample so users can count frames along the arc.
    ctx.fillStyle = trajectory.color;
    ctx.globalAlpha = 1;
    for (const p of trajectory.points) {
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, 3, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.restore();
  }
  if (clubHead) {
    const cx = clubHead.x * canvas.width;
    const cy = clubHead.y * canvas.height;
    ctx.save();
    // Outer glow ring.
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, 2 * Math.PI);
    ctx.stroke();
    // Solid center.
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
    ctx.fill();
    if (clubHead.label) {
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#fde047';
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = 3;
      ctx.strokeText(clubHead.label, cx + 14, cy + 4);
      ctx.fillText(clubHead.label, cx + 14, cy + 4);
    }
    ctx.restore();
  }
}

interface EventSnapshotProps {
  event: SwingEvent | undefined;
  frame: SwingFrame | undefined;
  videoUrl: string;
  overlay?: OverlayLine;
  clubHead?: ClubHeadMarker;
  trajectory?: TrajectoryOverlay;
}

const EventSnapshot: React.FC<EventSnapshotProps> = ({
  event,
  frame,
  videoUrl,
  overlay,
  clubHead,
  trajectory,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!event || !frame || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = document.createElement('video');
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    const onSeeked = () => {
      drawKeypoints(canvas, video, frame.keypoints, overlay, clubHead, trajectory);
      video.removeEventListener('seeked', onSeeked);
      video.src = '';
    };
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = event.t;
    });
    video.addEventListener('seeked', onSeeked);
    return () => {
      video.removeEventListener('seeked', onSeeked);
      video.src = '';
    };
  }, [event, frame, videoUrl, overlay, clubHead, trajectory]);

  if (!event || !frame) {
    return (
      <div className="rounded-lg bg-slate-900 border border-slate-800 p-4 flex items-center justify-center text-xs text-slate-500 min-h-[180px]">
        감지되지 않음
      </div>
    );
  }

  const metricAngle = (key: string) => {
    const v = event.metrics[key];
    return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1)}°` : '—';
  };
  const metricMm = (key: string) => {
    const v = event.metrics[key];
    return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(0)}mm` : '—';
  };
  const metricSignedDeg = (key: string) => {
    const v = event.metrics[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
    const sign = v > 0 ? '+' : '';
    return `${sign}${v.toFixed(1)}°`;
  };

  const kneeFlex = event.metrics.kneeFlex;
  const kneeTone: MetricTone | undefined =
    typeof kneeFlex !== 'number'
      ? undefined
      : kneeFlex >= 150 && kneeFlex <= 170
      ? 'ok'
      : kneeFlex >= 140 && kneeFlex < 178
      ? 'warn'
      : 'bad';

  return (
    <div className="rounded-lg bg-slate-900 border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/70">
        <span className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-200">{EVENT_LABEL[event.name]}</span>
          {event.subFrameOffset != null && (
            <span
              className="text-[9px] font-semibold px-1 py-0.5 rounded bg-cyan-900/50 text-cyan-300 border border-cyan-800/60"
              title={`서브프레임 보간 ±${(event.subFrameOffset * 33).toFixed(1)}ms`}
            >
              정밀
            </span>
          )}
        </span>
        <span className="text-[10px] text-slate-500">t={event.t.toFixed(3)}s</span>
      </div>
      <div className="bg-black">
        <canvas
          ref={canvasRef}
          className="w-full h-auto block"
          style={{ maxHeight: '220px', objectFit: 'contain' }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 p-3 text-[11px]">
        {event.name === 'impact' ? (
          <>
            <MetricRow
              label="머리 드리프트"
              value={metricMm('headSwayMm')}
              tone={impactTone(event.metrics.headSwayMm, 50, 100)}
              hint="어드레스 대비 X 이동"
            />
            <MetricRow
              label="얼리 익스텐션"
              value={metricMm('earlyExtensionMm')}
              tone={impactTone(event.metrics.earlyExtensionMm, 40, 80)}
              hint="어드레스 대비 골반 Z 이동"
            />
            <MetricRow
              label="자세 유지"
              value={metricSignedDeg('spineTiltDelta')}
              tone={
                event.metrics.spineTiltDelta == null
                  ? undefined
                  : Math.abs(event.metrics.spineTiltDelta) <= 5
                  ? 'ok'
                  : Math.abs(event.metrics.spineTiltDelta) <= 12
                  ? 'warn'
                  : 'bad'
              }
              hint="어드레스 대비 척추 각 변화"
            />
            <MetricRow label="X-Factor" value={metricAngle('hipShoulderSeparation')} />
          </>
        ) : event.name === 'address' ? (
          <>
            <MetricRow
              label="척추 기울기"
              value={metricAngle(
                event.metrics.spineTiltCorrected != null ? 'spineTiltCorrected' : 'spineTilt3D',
              )}
              hint={
                event.metrics.spineTiltCorrected != null
                  ? '목표 30–40° (중력 정렬)'
                  : '목표 30–40°'
              }
            />
            <MetricRow
              label="무릎 굽힘"
              value={metricAngle('kneeFlex')}
              tone={kneeTone}
              hint="목표 150–170°"
            />
            <MetricRow label="어깨 라인" value={metricSignedDeg('shoulderRotation')} />
            <MetricRow label="골반 라인" value={metricSignedDeg('pelvisRotation')} />
          </>
        ) : (
          <>
            <MetricRow label="X-Factor" value={metricAngle('hipShoulderSeparation')} />
            <MetricRow label="척추 기울기" value={metricAngle('spineTilt3D')} />
            <MetricRow label="어깨 회전" value={metricAngle('shoulderRotation')} />
            <MetricRow label="골반 회전" value={metricAngle('pelvisRotation')} />
          </>
        )}
      </div>
    </div>
  );
};

function impactTone(
  value: number | undefined,
  okMax: number,
  warnMax: number,
): 'ok' | 'warn' | 'bad' | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value <= okMax) return 'ok';
  if (value <= warnMax) return 'warn';
  return 'bad';
}

/**
 * Build an overlay line showing the swing plane trace: dashed segment from the
 * top-of-swing lead-wrist position to the impact lead-wrist position, drawn on
 * the impact snapshot. Handedness-aware; returns undefined when either event
 * or the wrist landmarks are missing.
 */
function swingPlaneOverlay(analysis: SwingAnalysis): OverlayLine | undefined {
  const { top, impact } = analysis.events;
  if (!top || !impact) return undefined;
  const leadIdx = analysis.summary.handedness === 'left' ? 16 : 15;
  const topFrame = analysis.frames[top.frameIndex];
  const impactFrame = analysis.frames[impact.frameIndex];
  const start = topFrame?.keypoints[leadIdx];
  const end = impactFrame?.keypoints[leadIdx];
  if (!start || !end || start.confidence < 0.3 || end.confidence < 0.3) return undefined;
  const label =
    analysis.summary.swingPlaneAngle != null
      ? `Plane ${analysis.summary.swingPlaneAngle.toFixed(1)}°`
      : undefined;
  return {
    start: { x: start.x, y: start.y },
    end: { x: end.x, y: end.y },
    color: '#f472b6',
    label,
  };
}

type MetricTone = 'ok' | 'warn' | 'bad';

const TONE_COLOR: Record<MetricTone, string> = {
  ok: 'text-emerald-400',
  warn: 'text-yellow-400',
  bad: 'text-red-400',
};

const MetricRow: React.FC<{
  label: string;
  value: string;
  tone?: MetricTone;
  hint?: string;
}> = ({ label, value, tone, hint }) => (
  <div className="rounded bg-slate-800/50 px-2 py-1.5">
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={`font-semibold ${tone ? TONE_COLOR[tone] : 'text-slate-100'}`}>
        {value}
      </span>
    </div>
    {hint && <div className="mt-0.5 text-[10px] text-slate-500 leading-tight">{hint}</div>}
  </div>
);

const VIEW_LABEL: Record<CameraView, string> = {
  face_on: '정면 (Face-On)',
  down_the_line: '측면 (Down-the-Line)',
  unknown: '뷰 미상',
};

const VIEW_COLOR: Record<CameraView, string> = {
  face_on: 'text-emerald-300 bg-emerald-900/40 border-emerald-800/60',
  down_the_line: 'text-blue-300 bg-blue-900/40 border-blue-800/60',
  unknown: 'text-slate-400 bg-slate-800/60 border-slate-700/60',
};

const HAND_LABEL: Record<Handedness, string> = {
  right: '오른손잡이',
  left: '왼손잡이',
  unknown: '핸드 미상',
};

interface SummaryBarProps {
  summary: SwingSummary;
}

const SummaryBar: React.FC<SummaryBarProps> = ({ summary }) => {
  const tempoTone =
    summary.tempoRatio == null
      ? 'text-slate-400'
      : summary.tempoRatio >= 2.5 && summary.tempoRatio <= 3.5
      ? 'text-emerald-400'
      : 'text-yellow-400';
  const planeTone =
    summary.swingPlaneAngle == null
      ? 'text-slate-400'
      : summary.swingPlaneAngle >= 40 && summary.swingPlaneAngle <= 70
      ? 'text-emerald-400'
      : 'text-yellow-400';
  return (
    <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 flex flex-wrap gap-2 items-center">
      <span
        className={`text-[10px] font-semibold px-2 py-1 rounded border ${VIEW_COLOR[summary.cameraView]}`}
      >
        {VIEW_LABEL[summary.cameraView]}
      </span>
      {summary.handedness && (
        <span className="text-[10px] font-semibold px-2 py-1 rounded border border-slate-700 bg-slate-800/70 text-slate-300">
          {HAND_LABEL[summary.handedness]}
        </span>
      )}
      {(summary.swingPlaneAngleCorrected ?? summary.swingPlaneAngle) != null && (
        <span className="text-[10px] font-semibold px-2 py-1 rounded border border-slate-700 bg-slate-800/70 text-slate-300">
          스윙 플레인{' '}
          <span className={planeTone}>
            {(summary.swingPlaneAngleCorrected ?? summary.swingPlaneAngle)!.toFixed(1)}°
          </span>
          {summary.gravityAligned && summary.swingPlaneAngleCorrected != null && (
            <span className="ml-1 text-[9px] text-emerald-500 font-normal">중력정렬</span>
          )}
        </span>
      )}
      {summary.attackAngle != null && (
        <span className="text-[10px] font-semibold px-2 py-1 rounded border border-slate-700 bg-slate-800/70 text-slate-300">
          어택 앵글{' '}
          <span
            className={
              summary.attackAngle >= -6 && summary.attackAngle <= 6
                ? 'text-emerald-400'
                : 'text-yellow-400'
            }
          >
            {summary.attackAngle > 0 ? '+' : ''}
            {summary.attackAngle.toFixed(1)}°
          </span>
        </span>
      )}
      {summary.clubHeadSpeedKmh != null && (
        <span className="text-[10px] font-semibold px-2 py-1 rounded border border-slate-700 bg-slate-800/70 text-slate-300">
          헤드 스피드{' '}
          <span
            className={
              summary.clubHeadSpeedKmh >= 150
                ? 'text-emerald-400'
                : summary.clubHeadSpeedKmh >= 120
                ? 'text-yellow-400'
                : 'text-slate-400'
            }
          >
            {summary.clubHeadSpeedKmh.toFixed(0)} km/h
          </span>
          {summary.maxClubHeadSpeedKmh != null &&
            summary.maxClubHeadSpeedKmh > summary.clubHeadSpeedKmh + 0.5 && (
              <span className="ml-1 text-[9px] text-cyan-400 font-normal">
                max {summary.maxClubHeadSpeedKmh.toFixed(0)}
              </span>
            )}
          <span className="ml-1 text-[9px] text-slate-500 font-normal">기하 추정</span>
        </span>
      )}
      {summary.clubPathAtImpactDeg != null && (
        <span className="text-[10px] font-semibold px-2 py-1 rounded border border-slate-700 bg-slate-800/70 text-slate-300">
          클럽 패스{' '}
          <span
            className={
              Math.abs(summary.clubPathAtImpactDeg) <= 5
                ? 'text-emerald-400'
                : 'text-yellow-400'
            }
          >
            {summary.clubPathAtImpactDeg > 0 ? '+' : ''}
            {summary.clubPathAtImpactDeg.toFixed(1)}°
          </span>
          <span className="ml-1 text-[9px] text-slate-500 font-normal">
            {summary.clubPathAtImpactDeg > 1
              ? 'in-to-out'
              : summary.clubPathAtImpactDeg < -1
              ? 'out-to-in'
              : ''}
          </span>
        </span>
      )}
      <div className="flex items-center gap-3 text-xs text-slate-300 ml-auto">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">백스윙</span>
          <span className="font-semibold">
            {summary.backswingMs != null ? `${summary.backswingMs}ms` : '—'}
          </span>
        </div>
        <span className="text-slate-700">|</span>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">다운스윙</span>
          <span className="font-semibold">
            {summary.downswingMs != null ? `${summary.downswingMs}ms` : '—'}
          </span>
        </div>
        <span className="text-slate-700">|</span>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">템포</span>
          <span className={`font-semibold ${tempoTone}`}>
            {summary.tempoRatio != null ? `${summary.tempoRatio.toFixed(2)} : 1` : '—'}
          </span>
          <span className="text-slate-600 text-[10px]">(투어 ≈ 3.0)</span>
        </div>
      </div>
    </div>
  );
};

const FAULT_TONE: Record<SwingFault['severity'], { badge: string; ring: string; label: string }> = {
  major: {
    badge: 'bg-red-900/50 text-red-200 border-red-700/60',
    ring: 'border-red-800/60',
    label: '중요',
  },
  minor: {
    badge: 'bg-yellow-900/40 text-yellow-200 border-yellow-700/60',
    ring: 'border-yellow-800/60',
    label: '주의',
  },
  info: {
    badge: 'bg-slate-800/60 text-slate-300 border-slate-700/60',
    ring: 'border-slate-800/60',
    label: '참고',
  },
};

/**
 * Video playback with a skeleton overlay that stays synced to the video's
 * current time. Lets a coach scrub, pause, and slow-mo any part of the swing
 * while still seeing the detected pose — turning the analysis output into a
 * live teaching tool instead of just four static event snapshots.
 *
 * Sync strategy: on every animation frame, find the analyzed frame whose
 * timestamp is closest to `video.currentTime` and redraw its keypoints. The
 * analyzed frames are sampled at ~30fps so nearest-neighbor is visually
 * indistinguishable from interpolation.
 */
const PlaybackSection: React.FC<{ analysis: SwingAnalysis }> = ({ analysis }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentT, setCurrentT] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let raf = 0;
    const render = () => {
      const t = video.currentTime;
      // Nearest analyzed frame by timestamp.
      let nearest = analysis.frames[0];
      let minDiff = Math.abs(t - nearest.t);
      for (let i = 1; i < analysis.frames.length; i++) {
        const f = analysis.frames[i];
        const d = Math.abs(t - f.t);
        if (d < minDiff) {
          minDiff = d;
          nearest = f;
        } else if (f.t > t) {
          break; // frames are ordered → past the closest point
        }
      }
      // Match canvas pixel size to the video's actual displayed size so the
      // skeleton doesn't stretch or offset when the container is responsive.
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
      }
      drawKeypoints(canvas, null, nearest?.keypoints ?? []);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    const onTime = () => setCurrentT(video.currentTime);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('seeked', onTime);
    return () => {
      cancelAnimationFrame(raf);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('seeked', onTime);
    };
  }, [analysis]);

  const seekTo = (t: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = t;
    // Small nudge so the frame actually renders when paused at seek target.
    video.pause();
  };

  const setSpeed = (rate: number) => {
    const video = videoRef.current;
    if (video) video.playbackRate = rate;
  };

  const step = (delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    // ~1 sampled frame at a time — enough resolution for coach walk-throughs.
    const dt = analysis.sampledFps > 0 ? 1 / analysis.sampledFps : 1 / 30;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta * dt));
    video.pause();
  };

  return (
    <section className="rounded-lg bg-slate-900 border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100">스윙 재생 & 프레임 스크러빙</h2>
        </div>
        <span className="text-[11px] text-slate-500">
          코치가 임의 프레임에서 일시정지해 설명 가능
        </span>
      </div>
      <div className="p-4 space-y-3">
        <div className="relative bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            src={analysis.videoUrl}
            controls
            playsInline
            className="w-full h-auto block"
            style={{ maxHeight: '360px' }}
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ maxHeight: '360px', objectFit: 'contain' }}
          />
        </div>

        {/* Playback speed + step controls */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider mr-1">속도</span>
          {[0.25, 0.5, 1].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setSpeed(r)}
              className="text-[11px] px-2 py-1 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              {r}x
            </button>
          ))}
          <span className="text-slate-700 mx-1">|</span>
          <button
            type="button"
            onClick={() => step(-1)}
            className="text-[11px] px-2 py-1 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            ◀ 1프레임
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            className="text-[11px] px-2 py-1 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            1프레임 ▶
          </button>
          <span className="ml-auto text-[11px] text-slate-400 font-mono">
            t = {currentT.toFixed(2)}s
          </span>
        </div>

        {/* Event jump buttons */}
        <div className="flex flex-wrap gap-2">
          {(['address', 'takeaway', 'top', 'impact', 'finish'] as SwingEventName[]).map((name) => {
            const evt = analysis.events[name];
            if (!evt) return null;
            const active = Math.abs(currentT - evt.t) < 0.05;
            return (
              <button
                key={name}
                type="button"
                onClick={() => seekTo(evt.t)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors ${
                  active
                    ? 'border-emerald-400 bg-emerald-900/40 text-emerald-200'
                    : 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {EVENT_LABEL[name]}
                <span className="ml-1.5 text-[10px] text-slate-500 font-normal">
                  {evt.t.toFixed(2)}s
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

/**
 * Kinetic sequence visualization — the TPI-style ordering of pelvis → torso
 * → lead arm → hands angular velocity peaks. Coaches use this to prove
 * "kinematic chain" faults (arms firing before pelvis, everything peaking at
 * once, etc.) that other apps don't surface.
 */
const KINETIC_LABEL: Record<KineticSegment, string> = {
  pelvis: '골반',
  torso: '상체',
  lead_arm: '리드팔',
  hands: '손/클럽',
};

const KINETIC_COLOR: Record<KineticSegment, string> = {
  pelvis: '#f472b6', // pink
  torso: '#facc15', // yellow
  lead_arm: '#22d3ee', // cyan
  hands: '#a78bfa', // violet
};

const KINETIC_ORDER_UI: Record<
  KineticOrder,
  { label: string; badge: string; hint: string }
> = {
  correct: {
    label: '올바른 시퀀스',
    badge: 'bg-emerald-900/50 text-emerald-200 border-emerald-700/60',
    hint: '골반 → 상체 → 리드팔 → 손 순으로 정확히 발화. 프로 수준의 효율적인 스윙입니다.',
  },
  partial: {
    label: '부분 시퀀스',
    badge: 'bg-yellow-900/40 text-yellow-200 border-yellow-700/60',
    hint: '일부 세그먼트만 순서대로. 리듬 개선 여지가 있습니다.',
  },
  simultaneous: {
    label: '동시 발화',
    badge: 'bg-orange-900/50 text-orange-200 border-orange-700/60',
    hint: '모든 세그먼트가 30ms 이내 동시 피크. 스윙 체인이 형성되지 않고 있어 파워 손실이 큽니다.',
  },
  inverted: {
    label: '역시퀀스 (팔 먼저)',
    badge: 'bg-red-900/50 text-red-200 border-red-700/60',
    hint: '팔/손이 골반보다 먼저 피크. 오버-더-톱, 캐스팅, 얼리 익스텐션의 근본 원인입니다.',
  },
  unknown: {
    label: '측정 불가',
    badge: 'bg-slate-800/60 text-slate-400 border-slate-700/60',
    hint: '피크 감지가 안 된 세그먼트가 많습니다. 촬영 각도/조명을 확인해 주세요.',
  },
};

interface KineticTileProps {
  segment: KineticSegment;
  peak: KineticSegmentPeak | undefined;
}

const KineticTile: React.FC<KineticTileProps> = ({ segment, peak }) => {
  const color = KINETIC_COLOR[segment];
  return (
    <div className="rounded-lg bg-slate-800/60 border border-slate-700/70 px-3 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: color }} />
          <span className="text-[11px] text-slate-400 uppercase tracking-wider">
            {KINETIC_LABEL[segment]}
          </span>
        </span>
      </div>
      {peak ? (
        <>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-slate-100">
              {peak.peakValue.toFixed(0)}
            </span>
            <span className="text-[10px] text-slate-500">°/s</span>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            {peak.msFromTop >= 0 ? '톱 이후' : '톱 이전'}{' '}
            <span className="font-semibold text-slate-300">
              {Math.abs(peak.msFromTop)}ms
            </span>
          </p>
        </>
      ) : (
        <>
          <span className="text-xl font-bold text-slate-600">—</span>
          <p className="mt-1 text-[10px] text-slate-600">감지 실패</p>
        </>
      )}
    </div>
  );
};

/** Compact SVG chart showing the four angular-speed curves during downswing. */
const KineticChart: React.FC<{ ks: KineticSequence }> = ({ ks }) => {
  const tl = ks.timeline;
  if (!tl || tl.frameIndices.length < 3) return null;
  const width = 560;
  const height = 160;
  const padL = 8;
  const padR = 8;
  const padT = 8;
  const padB = 20;

  const all = [...tl.pelvis, ...tl.torso, ...tl.leadArm, ...tl.hands];
  const maxVal = Math.max(1, ...all.filter((v) => Number.isFinite(v)));
  const n = tl.frameIndices.length;

  const xAt = (i: number) => padL + (i / Math.max(1, n - 1)) * (width - padL - padR);
  const yAt = (v: number) =>
    padT + (1 - v / maxVal) * (height - padT - padB);

  const path = (values: number[]) =>
    values
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`)
      .join(' ');

  // Peak markers relative to the chart window (frameIndices[0] = 0).
  const peakMarker = (peak: KineticSegmentPeak | undefined, color: string) => {
    if (!peak) return null;
    const idx = tl.frameIndices.findIndex((fi) => {
      // peakT is in seconds; the timeline stores frameIndices. Approximate by
      // matching the closest frame — good enough for a marker.
      return true;
    });
    // Simpler: find slot with the max value in the drawn series matching this segment.
    const series =
      peak.segment === 'pelvis'
        ? tl.pelvis
        : peak.segment === 'torso'
          ? tl.torso
          : peak.segment === 'lead_arm'
            ? tl.leadArm
            : tl.hands;
    let bestI = 0;
    let bestV = -Infinity;
    for (let i = 0; i < series.length; i++) {
      if (series[i] > bestV) {
        bestV = series[i];
        bestI = i;
      }
    }
    return (
      <circle
        key={peak.segment}
        cx={xAt(bestI)}
        cy={yAt(bestV)}
        r={4}
        fill={color}
        stroke="rgba(15, 23, 42, 0.9)"
        strokeWidth={1.5}
      />
    );
  };

  return (
    <div className="mt-3 rounded-lg bg-slate-950 border border-slate-800 p-3 overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        <path
          d={path(tl.pelvis)}
          fill="none"
          stroke={KINETIC_COLOR.pelvis}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={path(tl.torso)}
          fill="none"
          stroke={KINETIC_COLOR.torso}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={path(tl.leadArm)}
          fill="none"
          stroke={KINETIC_COLOR.lead_arm}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={path(tl.hands)}
          fill="none"
          stroke={KINETIC_COLOR.hands}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {peakMarker(ks.pelvis, KINETIC_COLOR.pelvis)}
        {peakMarker(ks.torso, KINETIC_COLOR.torso)}
        {peakMarker(ks.leadArm, KINETIC_COLOR.lead_arm)}
        {peakMarker(ks.hands, KINETIC_COLOR.hands)}
        <text x={padL} y={height - 4} fill="#64748b" fontSize={10}>
          Top
        </text>
        <text x={width - padR - 24} y={height - 4} fill="#64748b" fontSize={10}>
          Impact
        </text>
      </svg>
      <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-slate-400">
        {(['pelvis', 'torso', 'lead_arm', 'hands'] as KineticSegment[]).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: KINETIC_COLOR[s] }} />
            {KINETIC_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  );
};

const KineticSequenceSection: React.FC<{ analysis: SwingAnalysis }> = ({ analysis }) => {
  const ks = analysis.summary.kineticSequence;
  if (!ks) return null;
  const orderUi = KINETIC_ORDER_UI[ks.order];
  return (
    <section className="rounded-lg bg-slate-900 border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100">키네틱 시퀀스</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-800/60">
            PRO
          </span>
        </div>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${orderUi.badge}`}
        >
          {orderUi.label}
        </span>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <KineticTile segment="pelvis" peak={ks.pelvis} />
          <KineticTile segment="torso" peak={ks.torso} />
          <KineticTile segment="lead_arm" peak={ks.leadArm} />
          <KineticTile segment="hands" peak={ks.hands} />
        </div>
        <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">{orderUi.hint}</p>
        {ks.peakSpanMs != null && (
          <p className="mt-1 text-[10px] text-slate-500">
            첫 피크 → 마지막 피크: <span className="font-semibold text-slate-300">{ks.peakSpanMs}ms</span>
            <span className="ml-1 text-slate-600">(투어 평균 75–150ms)</span>
          </p>
        )}
        <KineticChart ks={ks} />
      </div>
    </section>
  );
};

const DiagnosticsSection: React.FC<{ analysis: SwingAnalysis }> = ({ analysis }) => {
  const faults = useMemo(() => detectFaults(analysis), [analysis]);
  if (faults.length === 0) {
    return (
      <section className="rounded-lg bg-slate-900 border border-emerald-800/50 p-4">
        <div className="flex items-center gap-2">
          <Stethoscope size={16} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100">코칭 진단</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-800/60">
            BETA
          </span>
        </div>
        <p className="mt-2 text-xs text-emerald-300">
          측정 임계치 안에서 감지된 주요 결점이 없습니다. 좋은 스윙입니다 👏
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-lg bg-slate-900 border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Stethoscope size={16} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100">코칭 진단</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-800/60">
            BETA
          </span>
        </div>
        <span className="text-[11px] text-slate-500">감지된 결점 {faults.length}건</span>
      </div>
      <div className="p-4 space-y-3">
        {faults.map((f) => {
          const tone = FAULT_TONE[f.severity];
          return (
            <article
              key={f.id}
              className={`rounded-lg border ${tone.ring} bg-slate-900/60 overflow-hidden`}
            >
              <header className="flex items-start gap-2 px-3 py-2.5 border-b border-slate-800/70">
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${tone.badge} flex-shrink-0`}
                >
                  {tone.label}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-100">{f.title}</h3>
                  <p className="mt-0.5 text-[11px] text-slate-400 leading-relaxed">
                    {f.description}
                  </p>
                </div>
              </header>
              {f.drills.length > 0 && (
                <div className="px-3 py-2.5 space-y-2 bg-slate-950/40">
                  <div className="flex items-center gap-1.5">
                    <Dumbbell size={12} className="text-emerald-400" />
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                      추천 드릴
                    </span>
                  </div>
                  {f.drills.map((d, i) => (
                    <div
                      key={i}
                      className="rounded bg-slate-800/50 border border-slate-800 px-2.5 py-2"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-100">{d.name}</p>
                        {d.duration && (
                          <span className="text-[10px] text-slate-500 flex-shrink-0">
                            {d.duration}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                        {d.description}
                      </p>
                      {d.props && d.props.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {d.props.map((p) => (
                            <span
                              key={p}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};

interface SwingVideoAnalysisProps {
  /** Optional preset video URL. If omitted the user picks a file. */
  initialVideoUrl?: string;
  onDone?: (analysis: SwingAnalysis) => void;
}

export const SwingVideoAnalysis: React.FC<SwingVideoAnalysisProps> = ({
  initialVideoUrl,
  onDone,
}) => {
  const [videoUrl, setVideoUrl] = useState<string | undefined>(initialVideoUrl);
  const [pickedObjectUrl, setPickedObjectUrl] = useState<string | undefined>();
  const [progress, setProgress] = useState<SwingAnalysisProgress | null>(null);
  const [analysis, setAnalysis] = useState<SwingAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      if (pickedObjectUrl) URL.revokeObjectURL(pickedObjectUrl);
    };
  }, [pickedObjectUrl]);

  const handleFile = (file: File) => {
    if (pickedObjectUrl) URL.revokeObjectURL(pickedObjectUrl);
    const url = URL.createObjectURL(file);
    setPickedObjectUrl(url);
    setVideoUrl(url);
    setAnalysis(null);
    setError(null);
  };

  const runAnalysis = async () => {
    if (!videoUrl) return;
    setBusy(true);
    setError(null);
    setAnalysis(null);
    setProgress({ processedFrames: 0, totalFrames: 0, stage: 'loading' });
    try {
      const result = await swingAnalysisService.analyzeSwingFromVideo(videoUrl, {
        onProgress: setProgress,
      });
      setAnalysis(result);
      onDone?.(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setAnalysis(null);
    setError(null);
    setProgress(null);
  };

  const progressPct = progress && progress.totalFrames > 0
    ? Math.round((progress.processedFrames / progress.totalFrames) * 100)
    : 0;

  return (
    <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-200">스윙 비디오 분석</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-800/60">
            BETA
          </span>
        </div>
        {analysis && (
          <button
            onClick={reset}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-100"
          >
            <RefreshCw size={12} />
            다시 분석
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Input */}
        {!analysis && (
          <div className="flex flex-col sm:flex-row gap-3 items-stretch">
            <label className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-dashed border-slate-700 bg-slate-900 hover:bg-slate-800 cursor-pointer transition-colors">
              <Upload size={16} className="text-slate-400" />
              <span className="text-sm text-slate-300">
                {videoUrl ? '다른 영상 선택' : '스윙 영상 선택 (mp4/mov)'}
              </span>
              <input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
            <button
              disabled={!videoUrl || busy}
              onClick={runAnalysis}
              className="px-5 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 min-w-[140px]"
            >
              {busy ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  분석 중...
                </>
              ) : (
                '분석 시작'
              )}
            </button>
          </div>
        )}

        {/* Preview */}
        {videoUrl && !analysis && !busy && (
          <video
            src={videoUrl}
            controls
            className="w-full rounded-lg border border-slate-800 bg-black max-h-[320px]"
          />
        )}

        {/* Progress */}
        {busy && progress && (
          <div className="rounded-lg bg-slate-900 border border-slate-800 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                {progress.stage === 'loading' && '모델 로딩 중...'}
                {progress.stage === 'sampling' && `프레임 분석 중 (${progress.processedFrames}/${progress.totalFrames})`}
                {progress.stage === 'segmenting' && '이벤트 감지 중...'}
                {progress.stage === 'done' && '완료'}
              </span>
              <span className="text-slate-300 font-semibold">{progressPct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-950/40 border border-red-900/60 p-3 flex items-start gap-2">
            <X size={14} className="text-red-400 mt-0.5" />
            <span className="text-xs text-red-300">{error}</span>
          </div>
        )}

        {/* Results */}
        {analysis && (
          <div className="space-y-4">
            <SummaryBar summary={analysis.summary} />
            {analysis.warnings.length > 0 && (
              <div className="rounded-lg bg-yellow-950/30 border border-yellow-900/50 p-3 space-y-1">
                {analysis.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-yellow-300">
                    <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {EVENT_ORDER.map((name) => {
                const evt = analysis.events[name];
                const frame = evt ? analysis.frames[evt.frameIndex] : undefined;
                const overlay =
                  name === 'impact'
                    ? swingPlaneOverlay(analysis)
                    : undefined;
                const clubHead =
                  name === 'impact' && analysis.summary.impactClubHead
                    ? {
                        x: analysis.summary.impactClubHead.x2d,
                        y: analysis.summary.impactClubHead.y2d,
                        label:
                          analysis.summary.clubHeadSpeedKmh != null
                            ? `${analysis.summary.clubHeadSpeedKmh.toFixed(0)} km/h`
                            : 'CLUB',
                      }
                    : undefined;
                const trajectory =
                  name === 'impact' && analysis.summary.impactZoneTrajectory
                    ? {
                        points: analysis.summary.impactZoneTrajectory.positions.map((p) => ({
                          x: p.x2d,
                          y: p.y2d,
                        })),
                        color: '#22d3ee',
                      }
                    : undefined;
                return (
                  <EventSnapshot
                    key={name}
                    event={evt}
                    frame={frame}
                    videoUrl={analysis.videoUrl}
                    overlay={overlay}
                    clubHead={clubHead}
                    trajectory={trajectory}
                  />
                );
              })}
            </div>
            <PlaybackSection analysis={analysis} />
            <KineticSequenceSection analysis={analysis} />
            <DiagnosticsSection analysis={analysis} />
            <p className="text-[11px] text-slate-500 leading-relaxed">
              총 {analysis.frames.length}프레임 (실효 {analysis.sampledFps.toFixed(1)}fps) 분석 완료.
              현재는 정면 카메라 기준 회전 신호로 이벤트를 감지합니다. 스윙 플레인, 클럽 헤드 트래킹은 후속 단계에서 추가됩니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
