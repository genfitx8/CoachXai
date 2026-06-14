import React, { useEffect, useRef, useState } from 'react';
import { PostureCapture } from '../../types/postureAnalysis';

/* ─────────────────────────────────────────────
   Approximate skeleton coordinates (0–1 normalized)
   for a person standing in full-body frame
───────────────────────────────────────────── */
interface KP { x: number; y: number; r: number }

// Front view – indices: 0=nose 1=Lshoulder 2=Rshoulder 3=Lelbow 4=Relbow
//              5=Lwrist 6=Rwrist 7=Lhip 8=Rhip 9=Lknee 10=Rknee 11=Lankle 12=Rankle
const FRONT_KPS: KP[] = [
  { x: 0.50, y: 0.06, r: 6 },
  { x: 0.36, y: 0.22, r: 7 },
  { x: 0.64, y: 0.22, r: 7 },
  { x: 0.28, y: 0.40, r: 5 },
  { x: 0.72, y: 0.40, r: 5 },
  { x: 0.24, y: 0.57, r: 4 },
  { x: 0.76, y: 0.57, r: 4 },
  { x: 0.39, y: 0.55, r: 7 },
  { x: 0.61, y: 0.55, r: 7 },
  { x: 0.39, y: 0.73, r: 6 },
  { x: 0.61, y: 0.73, r: 6 },
  { x: 0.39, y: 0.91, r: 5 },
  { x: 0.61, y: 0.91, r: 5 },
];
const FRONT_CONN: [number, number][] = [
  [1, 2], [1, 3], [3, 5], [2, 4], [4, 6],
  [1, 7], [2, 8], [7, 8], [7, 9], [9, 11], [8, 10], [10, 12],
];

// Side view – indices: 0=nose 1=shoulder 2=elbow 3=wrist 4=hip 5=knee 6=ankle
const SIDE_KPS: KP[] = [
  { x: 0.56, y: 0.06, r: 6 },
  { x: 0.51, y: 0.22, r: 7 },
  { x: 0.44, y: 0.40, r: 5 },
  { x: 0.41, y: 0.57, r: 4 },
  { x: 0.53, y: 0.55, r: 7 },
  { x: 0.52, y: 0.73, r: 6 },
  { x: 0.52, y: 0.91, r: 5 },
];
const SIDE_CONN: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [1, 4], [4, 5], [5, 6],
];

/* ─────────────────────────────────────────────
   Canvas drawing helpers
───────────────────────────────────────────── */
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.min(Math.max(t, 0), 1);
}
function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 2);
}
function phaseProg(t: number, start: number, end: number) {
  return Math.min(Math.max((t - start) / (end - start), 0), 1);
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  kps: KP[],
  conns: [number, number][],
  isSide: boolean,
  t: number,          // 0–1 cycling progress
) {
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // ── Photo (slightly dimmed) ──
  ctx.globalAlpha = 0.8;
  ctx.drawImage(img, 0, 0);
  ctx.globalAlpha = 1;

  // ── Phase 1 · Scan line (t 0–0.28) ──
  const scanP = easeOut(phaseProg(t, 0, 0.28));
  const scanY = scanP * H;

  if (t < 0.32) {
    // Glow band
    const grad = ctx.createLinearGradient(0, Math.max(0, scanY - 60), 0, scanY + 6);
    grad.addColorStop(0, 'rgba(16,185,129,0)');
    grad.addColorStop(0.6, 'rgba(16,185,129,0.12)');
    grad.addColorStop(1, 'rgba(16,185,129,0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, Math.max(0, scanY - 60), W, 66);

    // Scan line
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = Math.max(2, W * 0.003);
    ctx.shadowColor = '#10b981';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, scanY);
    ctx.lineTo(W, scanY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Corner brackets (scanning style)
    const bSize = W * 0.06;
    const bAlpha = phaseProg(t, 0, 0.05);
    ctx.strokeStyle = `rgba(16,185,129,${bAlpha})`;
    ctx.lineWidth = Math.max(2, W * 0.003);
    [[0, 0], [W, 0], [0, H], [W, H]].forEach(([bx, by]) => {
      const sx = bx === 0 ? 1 : -1;
      const sy = by === 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(bx + sx * bSize, by);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx, by + sy * bSize);
      ctx.stroke();
    });
  }

  // ── Phase 2 · Keypoints appear (t 0.20–0.45) ──
  const kpGlobalP = phaseProg(t, 0.20, 0.45);
  kps.forEach((kp, i) => {
    const threshold = i / kps.length;
    if (kpGlobalP < threshold) return;

    const fadeIn = easeOut(Math.min((kpGlobalP - threshold) / (1 / kps.length + 0.01), 1));
    const x = kp.x * W;
    const y = kp.y * H;

    // Outer pulse ring
    const ringScale = 1 + (1 - fadeIn) * 1.5;
    ctx.strokeStyle = `rgba(16,185,129,${fadeIn * 0.4})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, kp.r * ringScale + 5, 0, Math.PI * 2);
    ctx.stroke();

    // Dot
    ctx.shadowColor = '#10b981';
    ctx.shadowBlur = 10 * fadeIn;
    ctx.fillStyle = `rgba(16,185,129,${fadeIn})`;
    ctx.beginPath();
    ctx.arc(x, y, kp.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  // ── Phase 3 · Skeleton lines draw (t 0.42–0.68) ──
  const connP = phaseProg(t, 0.42, 0.68);
  conns.forEach(([i1, i2], ci) => {
    const threshold = ci / conns.length;
    if (connP < threshold) return;

    const kp1 = kps[i1], kp2 = kps[i2];
    if (!kp1 || !kp2) return;

    const drawP = easeOut(Math.min((connP - threshold) / (1 / conns.length + 0.01), 1));
    const x1 = kp1.x * W, y1 = kp1.y * H;
    const x2 = kp2.x * W, y2 = kp2.y * H;

    ctx.strokeStyle = `rgba(0,255,128,${0.85 * drawP})`;
    ctx.lineWidth = Math.max(2, W * 0.003);
    ctx.shadowColor = '#00ff80';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(lerp(x1, x2, drawP), lerp(y1, y2, drawP));
    ctx.stroke();
    ctx.shadowBlur = 0;
  });

  // ── Phase 4 · Angle analysis overlay (t 0.65–0.90) ──
  const angleP = easeOut(phaseProg(t, 0.65, 0.90));
  if (angleP > 0) {
    ctx.globalAlpha = angleP;

    if (!isSide) {
      // Front view: shoulder alignment line
      const lSh = kps[1], rSh = kps[2];
      const lHip = kps[7], rHip = kps[8];

      if (lSh && rSh) {
        const x1 = lSh.x * W, y1 = lSh.y * H;
        const x2 = rSh.x * W, y2 = rSh.y * H;
        const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
        const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

        // Dashed horizontal reference
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = 'rgba(251,191,36,0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x1 - 15, y1); ctx.lineTo(x2 + 15, y1);
        ctx.stroke();
        ctx.setLineDash([]);

        // Shoulder line
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.shadowBlur = 0;

        // Label
        ctx.fillStyle = '#fbbf24';
        ctx.font = `bold ${Math.max(12, W * 0.022)}px sans-serif`;
        ctx.fillText(`어깨 ${Math.abs(angle).toFixed(1)}°`, midX - 30, midY - 12);
      }

      if (lHip && rHip) {
        const x1 = lHip.x * W, y1 = lHip.y * H;
        const x2 = rHip.x * W, y2 = rHip.y * H;
        const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
        const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

        // Dashed horizontal reference
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = 'rgba(167,139,250,0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x1 - 15, y1); ctx.lineTo(x2 + 15, y1);
        ctx.stroke();
        ctx.setLineDash([]);

        // Hip line
        ctx.strokeStyle = '#a78bfa';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#a78bfa';
        ctx.font = `bold ${Math.max(12, W * 0.022)}px sans-serif`;
        ctx.fillText(`골반 ${Math.abs(angle).toFixed(1)}°`, midX - 25, midY + 18);
      }

      // Spine line (mid-hip → mid-shoulder)
      if (lSh && rSh && lHip && rHip) {
        const mShX = (lSh.x + rSh.x) / 2 * W, mShY = (lSh.y + rSh.y) / 2 * H;
        const mHpX = (lHip.x + rHip.x) / 2 * W, mHpY = (lHip.y + rHip.y) / 2 * H;
        const spineAngle = Math.atan2(mShX - mHpX, mHpY - mShY) * 180 / Math.PI;

        // Vertical reference
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = 'rgba(52,211,153,0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(mHpX, mHpY); ctx.lineTo(mHpX, mShY - 10);
        ctx.stroke();
        ctx.setLineDash([]);

        // Spine line
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#34d399'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.moveTo(mHpX, mHpY); ctx.lineTo(mShX, mShY); ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#34d399';
        ctx.font = `bold ${Math.max(12, W * 0.022)}px sans-serif`;
        ctx.fillText(`척추 ${Math.abs(spineAngle).toFixed(1)}°`, mShX + 8, mShY + 16);
      }

    } else {
      // Side view: head forward + spine tilt
      const nose = kps[0], sh = kps[1], hip = kps[4], knee = kps[5], ankle = kps[6];

      // Head forward posture
      if (nose && sh) {
        const nx = nose.x * W, ny = nose.y * H;
        const sx = sh.x * W, sy = sh.y * H;
        const forwardDist = (nx - sx) / W;
        const headAngle = Math.atan2(nx - sx, sy - ny) * 180 / Math.PI;

        ctx.setLineDash([5, 3]);
        ctx.strokeStyle = 'rgba(251,191,36,0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx, ny); ctx.lineTo(sx, sy);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 5;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(nx, ny); ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#fbbf24';
        ctx.font = `bold ${Math.max(11, W * 0.022)}px sans-serif`;
        ctx.fillText(`거북목 ${Math.abs(headAngle).toFixed(1)}°`, nx + 8, ny + 4);
      }

      // Spine tilt
      if (sh && hip) {
        const sx = sh.x * W, sy = sh.y * H;
        const hx = hip.x * W, hy = hip.y * H;
        const tilt = Math.atan2(sx - hx, hy - sy) * 180 / Math.PI;

        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = 'rgba(129,140,248,0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(hx, hy); ctx.lineTo(hx, sy);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#818cf8'; ctx.shadowBlur = 7;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(sx, sy); ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#818cf8';
        ctx.font = `bold ${Math.max(11, W * 0.022)}px sans-serif`;
        ctx.fillText(`척추 ${Math.abs(tilt).toFixed(1)}°`, sx + 8, sy + 14);
      }

      // Knee angle
      if (hip && knee && ankle) {
        const hx = hip.x * W, hy = hip.y * H;
        const kx = knee.x * W, ky = knee.y * H;
        const ax = ankle.x * W, ay = ankle.y * H;

        const v1x = hx - kx, v1y = hy - ky;
        const v2x = ax - kx, v2y = ay - ky;
        const dot = v1x * v2x + v1y * v2y;
        const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
        const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
        const kneeAngle = Math.acos(Math.min(dot / (mag1 * mag2 + 1e-6), 1)) * 180 / Math.PI;

        ctx.fillStyle = '#34d399';
        ctx.font = `bold ${Math.max(11, W * 0.022)}px sans-serif`;
        ctx.fillText(`무릎 ${kneeAngle.toFixed(0)}°`, kx + 8, ky + 6);
      }
    }

    ctx.globalAlpha = 1;
  }

  // ── Phase 5 · Hold & fade-out blink (t 0.90–1.0) ──
  if (t > 0.90) {
    const fade = 1 - phaseProg(t, 0.90, 0.98);
    // Small flash: "완료" banner
    ctx.globalAlpha = fade * 0.7;
    ctx.fillStyle = '#10b981';
    ctx.fillRect(0, H * 0.45, W, H * 0.10);
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.max(14, W * 0.035)}px sans-serif`;
    ctx.fillText('분석 완료', W / 2, H * 0.515);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }
}

/* ─────────────────────────────────────────────
   Single-canvas animated component
───────────────────────────────────────────── */
interface AnimatedCanvasProps {
  capture: PostureCapture;
  kps: KP[];
  conns: [number, number][];
  isSide: boolean;
  label: string;
}

const AnimatedCanvas: React.FC<AnimatedCanvasProps> = ({ capture, kps, conns, isSide, label }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    let startTime = 0;
    const CYCLE = 9; // seconds per cycle

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      startTime = performance.now();

      const loop = (now: number) => {
        const elapsed = (now - startTime) / 1000;
        const t = (elapsed % CYCLE) / CYCLE;
        drawFrame(ctx, canvas, img, kps, conns, isSide, t);
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    };
    img.onerror = () => {
      // Fallback: just draw the photo
      canvas.width = 640; canvas.height = 480;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 640, 480);
    };
    img.src = capture.imageData;

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [capture, kps, conns, isSide]);

  return (
    <div className="flex flex-col rounded-xl overflow-hidden border border-slate-700 bg-slate-900">
      <div className="px-3 py-2 bg-slate-800 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300">{label}</span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-emerald-400">실시간 분석</span>
        </span>
      </div>
      <div className="bg-black">
        <canvas
          ref={canvasRef}
          style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
        />
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Public export – full analyzing view
───────────────────────────────────────────── */
interface PostureAnalyzingViewProps {
  frontCapture: PostureCapture;
  sideCapture: PostureCapture;
}

const STAGES = [
  { label: '신체 포인트 감지 중...', sub: 'MediaPipe AI가 33개 골격 포인트를 탐색합니다' },
  { label: '골격 구조 연결 중...', sub: '감지된 포인트로 골격 라인을 그립니다' },
  { label: '기울기 분석 중...', sub: '어깨·골반·척추의 기울기 각도를 측정합니다' },
  { label: '체형 밸런스 계산 중...', sub: '좌우·전후 체형 불균형 점수를 산출합니다' },
];

export const PostureAnalyzingView: React.FC<PostureAnalyzingViewProps> = ({
  frontCapture,
  sideCapture,
}) => {
  const [stageIdx, setStageIdx] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Cycle stages every 2.2s
    const stageTimer = setInterval(() => {
      setStageIdx((s) => (s + 1) % STAGES.length);
    }, 2200);

    // Smooth progress bar (completes in ~12s, then loops slowly)
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      // Slow approach to 95% over ~12s, never quite reaches 100% until real done
      const p = 95 * (1 - Math.exp(-elapsed / 10));
      setProgress(p);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      clearInterval(stageTimer);
      cancelAnimationFrame(raf);
    };
  }, []);

  const stage = STAGES[stageIdx];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top bar */}
      <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <h1 className="text-base font-bold">AI 스켈레톤 분석</h1>
        <span className="text-xs text-slate-500">처리 중...</span>
      </div>

      <div className="flex-1 max-w-5xl w-full mx-auto px-4 py-5 space-y-5">

        {/* Animated canvases */}
        <div className="grid grid-cols-2 gap-4">
          <AnimatedCanvas
            capture={frontCapture}
            kps={FRONT_KPS}
            conns={FRONT_CONN}
            isSide={false}
            label="정면 스켈레톤"
          />
          <AnimatedCanvas
            capture={sideCapture}
            kps={SIDE_KPS}
            conns={SIDE_CONN}
            isSide={true}
            label="측면 스켈레톤"
          />
        </div>

        {/* Stage info */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8 flex-shrink-0">
              <div className="absolute inset-0 rounded-full border-2 border-slate-700" />
              <div className="absolute inset-0 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100">{stage.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{stage.sub}</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-500">
              <span>분석 진행</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Analysis steps checklist */}
        <div className="grid grid-cols-2 gap-3">
          {STAGES.map((s, i) => {
            const done = i < stageIdx;
            const active = i === stageIdx;
            return (
              <div
                key={i}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs transition-all ${
                  done
                    ? 'border-emerald-800 bg-emerald-900/20 text-emerald-300'
                    : active
                    ? 'border-emerald-600 bg-emerald-900/30 text-emerald-200'
                    : 'border-slate-800 bg-slate-900 text-slate-500'
                }`}
              >
                <span
                  className={`flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                    done
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : active
                      ? 'border-emerald-400 text-emerald-400 animate-pulse'
                      : 'border-slate-700 text-slate-600'
                  }`}
                >
                  {done ? '✓' : i + 1}
                </span>
                {s.label.replace(' 중...', '')}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
};
