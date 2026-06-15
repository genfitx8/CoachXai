import React, { useEffect, useRef, useState } from 'react';
import { PostureAnalysisResult, SkeletonAnalysis, PostureCapture } from '../../types/postureAnalysis';
import { skeletonAnalysisService } from '../../services/skeletonAnalysisService';
import {
  ChevronLeft,
  Download,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Activity,
  TrendingUp,
  ZoomIn,
} from 'lucide-react';

interface PostureAnalysisResultsProps {
  result: PostureAnalysisResult;
  onBack: () => void;
  onSave?: () => void;
}

/* ── Skeleton canvas with fallback original photo ── */
interface AnnotatedImageProps {
  capture: PostureCapture;
  skeleton: SkeletonAnalysis;
  label: string;
  onZoom: (src: string) => void;
}

const AnnotatedImage: React.FC<AnnotatedImageProps> = ({ capture, skeleton, label, onZoom }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawn, setIsDrawn] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [confidence, setConfidence] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDrawn(false);
    setHasError(false);

    skeletonAnalysisService
      .drawSkeleton(canvas, capture.imageData, skeleton)
      .then(() => {
        setConfidence(Math.round(skeleton.confidence * 100));
        setIsDrawn(true);
      })
      .catch((e) => {
        console.error('draw skeleton error:', e);
        setHasError(true);
      });
  }, [capture, skeleton]);

  const displaySrc = isDrawn && canvasRef.current
    ? canvasRef.current.toDataURL()
    : capture.imageData;

  return (
    <div className="rounded-xl overflow-hidden border border-slate-700 bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800">
        <span className="text-xs font-semibold text-slate-200">{label}</span>
        <div className="flex items-center gap-3">
          {isDrawn && (
            <span className="text-xs text-emerald-400">신뢰도 {confidence}%</span>
          )}
          {!isDrawn && !hasError && (
            <span className="text-xs text-slate-500">렌더링 중...</span>
          )}
          {hasError && (
            <span className="text-xs text-red-400">오버레이 실패</span>
          )}
          <button
            onClick={() => onZoom(displaySrc)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-100 transition-colors"
          >
            <ZoomIn size={12} />
            확대
          </button>
        </div>
      </div>
      {/* Image area */}
      <div
        className="relative bg-black cursor-pointer group"
        onClick={() => onZoom(displaySrc)}
      >
        {/* Fallback: original photo while canvas loads */}
        <img
          src={capture.imageData}
          alt={label}
          className={`w-full object-contain block ${isDrawn ? 'hidden' : ''}`}
          style={{ maxHeight: '340px' }}
        />
        {/* Canvas with skeleton overlay */}
        <canvas
          ref={canvasRef}
          className={isDrawn ? 'block' : 'hidden'}
          style={{ maxWidth: '100%', height: 'auto', maxHeight: '340px' }}
        />
        {/* Zoom hint overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center pointer-events-none">
          <ZoomIn
            size={32}
            className="text-white opacity-0 group-hover:opacity-70 transition-opacity"
          />
        </div>
      </div>
    </div>
  );
};

/* ── Score bar ── */
const ScoreBar: React.FC<{ label: string; score: number }> = ({ label, score }) => {
  const pct = Math.min(Math.max(Math.round(score), 0), 100);
  const barColor = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-yellow-400' : 'bg-red-500';
  const textColor = pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs">
        <span className="text-slate-300">{label}</span>
        <span className={`font-bold ${textColor}`}>{pct}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-700">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

/* ── Overall score ring ── */
const OverallScoreRing: React.FC<{ score: number }> = ({ score }) => {
  const r = 50;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const grade =
    score >= 90 ? '매우 우수' : score >= 80 ? '우수' : score >= 70 ? '양호' : score >= 60 ? '보통' : '개선 필요';
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#facc15' : '#ef4444';

  return (
    <div className="flex items-center gap-5">
      <svg width={120} height={120} viewBox="0 0 120 120">
        <circle cx={60} cy={60} r={r} fill="none" stroke="#1e293b" strokeWidth={10} />
        <circle
          cx={60} cy={60} r={r}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
        />
        <text x={60} y={58} textAnchor="middle" fill={color} fontSize={26} fontWeight="bold" dy="0.35em">
          {Math.round(score)}
        </text>
        <text x={60} y={80} textAnchor="middle" fill="#64748b" fontSize={11}>
          / 100
        </text>
      </svg>
      <div>
        <p className="text-2xl font-bold text-slate-100">종합 점수</p>
        <p className="text-base font-semibold mt-1" style={{ color }}>{grade}</p>
        <p className="text-xs text-slate-500 mt-1">체형 밸런스 평가</p>
      </div>
    </div>
  );
};

/* ── Main results component ── */
export const PostureAnalysisResults: React.FC<PostureAnalysisResultsProps> = ({
  result,
  onBack,
  onSave,
}) => {
  const { balance, problemAreas, recommendations, frontCapture, sideCapture, frontSkeleton, sideSkeleton } = result;
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-400 hover:text-slate-100 transition-colors text-sm"
        >
          <ChevronLeft size={18} />
          돌아가기
        </button>
        <h1 className="text-base font-bold">신체 자세 분석 결과</h1>
        <span className="text-xs text-slate-500">
          {new Date(result.createdAt).toLocaleDateString('ko-KR')}
        </span>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* ── 종합 점수 배너 ── */}
        <section className="rounded-xl bg-slate-900 border border-slate-800 px-6 py-5">
          <OverallScoreRing score={balance.overallScore} />
        </section>

        {/* ── 정면 이미지 + 전면 관련 점수 ── */}
        <section className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
            <Activity size={15} className="text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-200">정면 분석</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-0">
            {/* Image */}
            <div className="md:border-r border-slate-800">
              <AnnotatedImage
                capture={frontCapture}
                skeleton={frontSkeleton}
                label="정면 스켈레톤"
                onZoom={setZoomSrc}
              />
            </div>
            {/* Metrics */}
            <div className="px-5 py-5 flex flex-col justify-center space-y-5">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">정면 측정 항목</p>
                <div className="space-y-4">
                  <ScoreBar label="어깨 정렬" score={balance.shoulderAlignment} />
                  <ScoreBar label="골반 정렬" score={balance.hipAlignment} />
                  <ScoreBar label="척추 각도" score={balance.spineAngle} />
                </div>
              </div>
              <div className="pt-2 border-t border-slate-800">
                <p className="text-xs text-slate-500">
                  어깨·골반의 좌우 수평 정렬과 정면에서 본 척추 기울기를 측정합니다.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── 측면 이미지 + 측면 관련 점수 ── */}
        <section className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
            <Activity size={15} className="text-blue-400" />
            <h2 className="text-sm font-semibold text-slate-200">측면 분석</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-0">
            {/* Image */}
            <div className="md:border-r border-slate-800">
              <AnnotatedImage
                capture={sideCapture}
                skeleton={sideSkeleton}
                label="측면 스켈레톤"
                onZoom={setZoomSrc}
              />
            </div>
            {/* Metrics */}
            <div className="px-5 py-5 flex flex-col justify-center space-y-5">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">측면 측정 항목</p>
                <div className="space-y-4">
                  <ScoreBar label="머리 위치 (거북목)" score={balance.headForwardPosition} />
                  <ScoreBar label="무릎 정렬" score={balance.kneeAlignment} />
                </div>
              </div>
              <div className="pt-2 border-t border-slate-800">
                <p className="text-xs text-slate-500">
                  측면에서 확인한 머리의 전방 돌출(거북목)과 무릎 굽힘 각도를 측정합니다.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── 발견된 문제점 ── */}
        {problemAreas.length > 0 && (
          <section className="rounded-xl bg-slate-900 border border-orange-900/40 p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={15} className="text-orange-400" />
              <h2 className="text-sm font-semibold text-orange-300 uppercase tracking-wider">발견된 문제점</h2>
            </div>
            <ul className="space-y-2.5">
              {problemAreas.map((problem, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
                  {problem}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── 개선 권장사항 ── */}
        {recommendations.length > 0 && (
          <section className="rounded-xl bg-slate-900 border border-emerald-900/40 p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={15} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-emerald-300 uppercase tracking-wider">개선 권장사항</h2>
            </div>
            <ol className="space-y-3">
              {recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-700 flex items-center justify-center text-white text-xs font-bold">
                    {i + 1}
                  </span>
                  {rec}
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ── 액션 버튼 ── */}
        <div className="flex gap-3 pb-10">
          {onSave && (
            <button
              onClick={onSave}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
            >
              <Download size={18} />
              결과 저장
            </button>
          )}
          <button
            onClick={onBack}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors border border-slate-700"
          >
            <RefreshCw size={18} />
            새로 분석하기
          </button>
        </div>

      </div>

      {/* ── 이미지 확대 모달 ── */}
      {zoomSrc && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoomSrc(null)}
        >
          <img
            src={zoomSrc}
            alt="확대 보기"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setZoomSrc(null)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors text-lg"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};
