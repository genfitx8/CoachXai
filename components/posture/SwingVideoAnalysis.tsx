import React, { useEffect, useRef, useState } from 'react';
import { Upload, Loader2, AlertTriangle, Target, RefreshCw, X } from 'lucide-react';
import { swingAnalysisService } from '../../services/swingAnalysisService';
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
  top: '백스윙 톱',
  impact: '임팩트',
  finish: '피니시',
};

const EVENT_ORDER: SwingEventName[] = ['address', 'top', 'impact', 'finish'];

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

function drawKeypoints(
  canvas: HTMLCanvasElement,
  bg: HTMLVideoElement | HTMLImageElement | null,
  keypoints: SkeletonKeypoint[],
  overlay?: OverlayLine,
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
}

interface EventSnapshotProps {
  event: SwingEvent | undefined;
  frame: SwingFrame | undefined;
  videoUrl: string;
  overlay?: OverlayLine;
}

const EventSnapshot: React.FC<EventSnapshotProps> = ({ event, frame, videoUrl, overlay }) => {
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
      drawKeypoints(canvas, video, frame.keypoints, overlay);
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
  }, [event, frame, videoUrl, overlay]);

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
        <span className="text-xs font-semibold text-slate-200">{EVENT_LABEL[event.name]}</span>
        <span className="text-[10px] text-slate-500">t={event.t.toFixed(2)}s</span>
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
              value={metricAngle('spineTilt3D')}
              tone={impactTone(undefined, 0, 0)}
              hint="목표 30–40°"
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
      {summary.swingPlaneAngle != null && (
        <span className="text-[10px] font-semibold px-2 py-1 rounded border border-slate-700 bg-slate-800/70 text-slate-300">
          스윙 플레인{' '}
          <span className={planeTone}>{summary.swingPlaneAngle.toFixed(1)}°</span>
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {EVENT_ORDER.map((name) => {
                const evt = analysis.events[name];
                const frame = evt ? analysis.frames[evt.frameIndex] : undefined;
                const overlay =
                  name === 'impact'
                    ? swingPlaneOverlay(analysis)
                    : undefined;
                return (
                  <EventSnapshot
                    key={name}
                    event={evt}
                    frame={frame}
                    videoUrl={analysis.videoUrl}
                    overlay={overlay}
                  />
                );
              })}
            </div>
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
