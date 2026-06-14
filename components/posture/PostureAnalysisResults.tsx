import React, { useEffect, useRef, useState } from 'react';
import { PostureAnalysisResult, SkeletonAnalysis, PostureCapture } from '../../types/postureAnalysis';
import { skeletonAnalysisService } from '../../services/skeletonAnalysisService';
import {
  ChevronLeft,
  Download,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  User,
  Activity,
  TrendingUp,
} from 'lucide-react';

interface PostureAnalysisResultsProps {
  result: PostureAnalysisResult;
  onBack: () => void;
  onSave?: () => void;
}

interface AnnotatedImageProps {
  capture: PostureCapture;
  skeleton: SkeletonAnalysis;
  label: string;
}

const AnnotatedImage: React.FC<AnnotatedImageProps> = ({ capture, skeleton, label }) => {
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

  return (
    <div className="flex flex-col rounded-xl overflow-hidden border border-slate-700 bg-slate-900">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800">
        <span className="text-sm font-semibold text-slate-200">{label}</span>
        <span className="text-xs font-medium">
          {isDrawn ? (
            <span className="text-emerald-400">신뢰도 {confidence}%</span>
          ) : hasError ? (
            <span className="text-red-400">스켈레톤 적용 실패</span>
          ) : (
            <span className="text-slate-500">렌더링 중...</span>
          )}
        </span>
      </div>
      <div className="bg-black">
        {/* 원본 사진 – canvas 렌더링 전 또는 오류 시 표시 */}
        <img
          src={capture.imageData}
          alt={label}
          className={`w-full h-auto max-h-80 object-contain block ${isDrawn ? 'hidden' : ''}`}
        />
        {/* 스켈레톤 오버레이 canvas – 그리기 완료 후 표시 */}
        <canvas
          ref={canvasRef}
          className={isDrawn ? 'block' : 'hidden'}
          style={{ maxWidth: '100%', height: 'auto', maxHeight: '320px' }}
        />
      </div>
    </div>
  );
};

interface ScoreBarProps {
  label: string;
  score: number;
  max?: number;
}

const ScoreBar: React.FC<ScoreBarProps> = ({ label, score, max = 100 }) => {
  const pct = Math.round((score / max) * 100);
  const color =
    pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-yellow-400' : 'bg-red-500';
  const textColor =
    pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-slate-300">{label}</span>
        <span className={`font-bold ${textColor}`}>{Math.round(score)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-700">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

interface OverallScoreRingProps {
  score: number;
}

const OverallScoreRing: React.FC<OverallScoreRingProps> = ({ score }) => {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const grade =
    score >= 90
      ? '매우 우수'
      : score >= 80
      ? '우수'
      : score >= 70
      ? '양호'
      : score >= 60
      ? '보통'
      : '개선 필요';
  const color =
    score >= 80 ? '#10b981' : score >= 60 ? '#facc15' : '#ef4444';

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={112} height={112} viewBox="0 0 112 112">
        <circle cx={56} cy={56} r={r} fill="none" stroke="#1e293b" strokeWidth={10} />
        <circle
          cx={56}
          cy={56}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeLinecap="round"
          transform="rotate(-90 56 56)"
        />
        <text x={56} y={52} textAnchor="middle" fill={color} fontSize={22} fontWeight="bold" dy="0.35em">
          {Math.round(score)}
        </text>
        <text x={56} y={74} textAnchor="middle" fill="#94a3b8" fontSize={10}>
          / 100
        </text>
      </svg>
      <span className="text-sm font-semibold" style={{ color }}>{grade}</span>
    </div>
  );
};

export const PostureAnalysisResults: React.FC<PostureAnalysisResultsProps> = ({
  result,
  onBack,
  onSave,
}) => {
  const { balance, problemAreas, recommendations, frontCapture, sideCapture, frontSkeleton, sideSkeleton } =
    result;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-400 hover:text-slate-100 transition-colors text-sm"
        >
          <ChevronLeft size={18} />
          돌아가기
        </button>
        <h1 className="text-base font-bold tracking-wide">신체 자세 분석 결과</h1>
        <span className="text-xs text-slate-500">
          {new Date(result.createdAt).toLocaleDateString('ko-KR')}
        </span>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* ── 분석 사진 ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <User size={16} className="text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">분석 이미지</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <AnnotatedImage capture={frontCapture} skeleton={frontSkeleton} label="정면 스켈레톤 분석" />
            <AnnotatedImage capture={sideCapture} skeleton={sideSkeleton} label="측면 스켈레톤 분석" />
          </div>
        </section>

        {/* ── 종합 점수 + 항목별 ── */}
        <section className="rounded-xl bg-slate-900 border border-slate-800 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} className="text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">체형 밸런스 점수</h2>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Ring */}
            <div className="flex-shrink-0">
              <OverallScoreRing score={balance.overallScore} />
              <p className="text-center text-xs text-slate-500 mt-1">종합 점수</p>
            </div>

            {/* Bars */}
            <div className="flex-1 w-full space-y-4">
              <ScoreBar label="어깨 정렬" score={balance.shoulderAlignment} />
              <ScoreBar label="골반 정렬" score={balance.hipAlignment} />
              <ScoreBar label="척추 각도" score={balance.spineAngle} />
              <ScoreBar label="머리 위치" score={balance.headForwardPosition} />
              <ScoreBar label="무릎 정렬" score={balance.kneeAlignment} />
            </div>
          </div>
        </section>

        {/* ── 문제점 ── */}
        {problemAreas.length > 0 && (
          <section className="rounded-xl bg-slate-900 border border-orange-900/40 p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={16} className="text-orange-400" />
              <h2 className="text-sm font-semibold text-orange-300 uppercase tracking-wider">발견된 문제점</h2>
            </div>
            <ul className="space-y-2">
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
              <TrendingUp size={16} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-emerald-300 uppercase tracking-wider">개선 권장사항</h2>
            </div>
            <ol className="space-y-3">
              {recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold">
                    {i + 1}
                  </span>
                  {rec}
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ── 액션 버튼 ── */}
        <div className="flex gap-3 pb-8">
          {onSave && (
            <button
              onClick={onSave}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
            >
              <Download size={18} />
              결과 저장
            </button>
          )}
          <button
            onClick={onBack}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors border border-slate-700"
          >
            <RefreshCw size={18} />
            새로 분석하기
          </button>
        </div>

      </div>
    </div>
  );
};
