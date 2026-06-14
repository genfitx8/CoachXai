import React, { useState } from 'react';
import { PostureCapture, PostureAnalysisResult, PostureSession } from '../../types/postureAnalysis';
import { DualCameraCapture } from './DualCameraCapture';
import { PostureAnalysisResults } from './PostureAnalysisResults';
import { skeletonAnalysisService } from '../../services/skeletonAnalysisService';
import {
  Scan, ArrowLeft, Camera, Upload, Zap, CheckCircle2,
  RotateCcw, Play, ZoomIn, AlertCircle,
} from 'lucide-react';
import { PostureAnalyzingView } from './PostureAnalyzingView';

interface PostureAnalysisDashboardProps {
  memberName: string;
  onBack: () => void;
  onComplete?: (result: PostureAnalysisResult) => void;
}

type ViewMode = 'intro' | 'capture' | 'preview' | 'analyzing' | 'results';

export const PostureAnalysisDashboard: React.FC<PostureAnalysisDashboardProps> = ({
  memberName,
  onBack,
  onComplete,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('intro');
  const [pendingCaptures, setPendingCaptures] = useState<{ front: PostureCapture; side: PostureCapture } | null>(null);
  const [result, setResult] = useState<PostureAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  const handleStartCapture = () => {
    setViewMode('capture');
    setError(null);
  };

  // Called by DualCameraCapture when both photos are ready → go to preview first
  const handleCapturesReady = (frontCapture: PostureCapture, sideCapture: PostureCapture) => {
    setPendingCaptures({ front: frontCapture, side: sideCapture });
    setViewMode('preview');
    setError(null);
  };

  // Called from preview when user confirms photos and wants to run analysis
  const handleConfirmAndAnalyze = async () => {
    if (!pendingCaptures) return;
    setViewMode('analyzing');
    setError(null);

    try {
      const analysis = await skeletonAnalysisService.analyzePosture(
        pendingCaptures.front,
        pendingCaptures.side,
      );

      const analysisResult: PostureAnalysisResult = {
        id: `posture-${Date.now()}`,
        frontCapture: pendingCaptures.front,
        sideCapture: pendingCaptures.side,
        frontSkeleton: analysis.frontSkeleton,
        sideSkeleton: analysis.sideSkeleton,
        balance: analysis.balance,
        problemAreas: analysis.problemAreas,
        recommendations: analysis.recommendations,
        createdAt: new Date().toISOString(),
      };

      setResult(analysisResult);
      setViewMode('results');

      if (onComplete) onComplete(analysisResult);
    } catch (err) {
      console.error('Analysis failed:', err);
      setError(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.');
      setViewMode('preview'); // stay on preview so user can retry
    }
  };

  const handleBackFromResults = () => {
    setResult(null);
    setPendingCaptures(null);
    setViewMode('intro');
  };

  const handleSaveResult = () => {
    if (result) {
      const savedSessions = JSON.parse(localStorage.getItem('posture_sessions') || '[]');
      const session: PostureSession = {
        id: result.id,
        memberName,
        captures: {
          front: result.frontCapture,
          side: result.sideCapture,
        },
        result,
        status: 'completed',
        createdAt: result.createdAt,
        updatedAt: new Date().toISOString(),
      };
      savedSessions.unshift(session);
      localStorage.setItem('posture_sessions', JSON.stringify(savedSessions.slice(0, 10)));
      alert('결과가 저장되었습니다.');
    }
  };

  /* ── INTRO ── */
  if (viewMode === 'intro') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-100 transition-colors text-sm mb-8"
          >
            <ArrowLeft size={18} />
            돌아가기
          </button>

          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-900/40 border border-emerald-700 mb-5">
              <Scan size={36} className="text-emerald-400" />
            </div>
            <h1 className="text-3xl font-bold mb-2">신체 자세 분석</h1>
            <p className="text-slate-400">AI 스켈레톤 분석으로 체형 밸런스를 정밀 측정합니다</p>
          </div>

          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 mb-6 space-y-5">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">분석 과정</h2>
            {[
              { icon: Camera, step: '1', title: '정면 촬영 또는 업로드', desc: '전신이 보이는 정면 사진을 촬영하거나 파일로 업로드합니다.' },
              { icon: Camera, step: '2', title: '측면 촬영 또는 업로드', desc: '측면 전신 사진을 촬영하거나 파일로 업로드합니다.' },
              { icon: CheckCircle2, step: '3', title: '사진 확인', desc: '촬영된 사진이 분석에 적합한지 확인하고 필요하면 다시 찍습니다.' },
              { icon: Zap, step: '4', title: 'AI 스켈레톤 분석', desc: 'MediaPipe 기반 AI가 33개 신체 포인트를 감지하고 분석합니다.' },
            ].map(({ icon: Icon, step, title, desc }) => (
              <div key={step} className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-sm font-bold text-white">
                  {step}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <Icon size={14} className="text-emerald-400" />
                    <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
                  </div>
                  <p className="text-xs text-slate-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4 mb-8">
            <h3 className="text-sm font-semibold text-amber-300 mb-2">촬영 팁</h3>
            <ul className="space-y-1 text-xs text-amber-200/80">
              <li>• 밝은 조명 아래에서 촬영하세요</li>
              <li>• 전신이 화면에 들어오도록 촬영하세요</li>
              <li>• 몸에 밀착된 옷을 착용하면 더 정확합니다</li>
              <li>• 벽이나 무늬 없는 배경이 좋습니다</li>
            </ul>
          </div>

          <button
            onClick={handleStartCapture}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-lg transition-colors shadow-lg shadow-emerald-900/40"
          >
            <Scan size={24} />
            분석 시작하기
          </button>
        </div>
      </div>
    );
  }

  /* ── CAPTURE ── */
  if (viewMode === 'capture') {
    return (
      <DualCameraCapture
        onCapturesComplete={handleCapturesReady}
        onCancel={() => setViewMode('intro')}
      />
    );
  }

  /* ── PREVIEW (사진 확인) ── */
  if (viewMode === 'preview' && pendingCaptures) {
    const { front, side } = pendingCaptures;

    const checklist = [
      '전신이 모두 보이나요?',
      '얼굴과 발끝이 화면 안에 있나요?',
      '배경이 단순하고 구분이 잘 되나요?',
      '흔들림 없이 선명한가요?',
    ];

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
          <button
            onClick={() => setViewMode('capture')}
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-100 transition-colors text-sm"
          >
            <ArrowLeft size={18} />
            다시 찍기
          </button>
          <h1 className="text-base font-bold">사진 확인</h1>
          <span className="text-xs text-slate-500">2 / 2</span>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

          {/* Guide */}
          <div className="flex items-start gap-3 px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-xl text-sm text-blue-200">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-blue-400" />
            촬영된 사진을 확인하세요. 분석이 잘 되려면 전신이 선명하게 보여야 합니다. 이미지를 탭하면 크게 볼 수 있습니다.
          </div>

          {/* Photo pair */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { capture: front, label: '정면' },
              { capture: side, label: '측면' },
            ].map(({ capture, label }) => (
              <div key={label} className="flex flex-col rounded-xl overflow-hidden border border-slate-700 bg-slate-900">
                <div className="px-3 py-2 bg-slate-800 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">{label} 사진</span>
                  <button
                    onClick={() => setZoomImage(capture.imageData)}
                    className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    <ZoomIn size={12} />
                    크게 보기
                  </button>
                </div>
                <div
                  className="relative bg-black cursor-pointer group"
                  onClick={() => setZoomImage(capture.imageData)}
                >
                  <img
                    src={capture.imageData}
                    alt={`${label} 사진`}
                    className="w-full h-56 object-contain"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <ZoomIn size={28} className="text-white opacity-0 group-hover:opacity-80 transition-opacity" />
                  </div>
                </div>
                <div className="px-3 py-2 text-xs text-slate-500">
                  {new Date(capture.timestamp).toLocaleTimeString('ko-KR')}
                </div>
              </div>
            ))}
          </div>

          {/* Checklist */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">사진 품질 체크리스트</h3>
            <ul className="space-y-2">
              {checklist.map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-slate-400">
                  <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Error (if analysis failed and returned here) */}
          {error && (
            <div className="flex items-start gap-2 px-4 py-3 bg-red-900/30 border border-red-700 rounded-xl text-sm text-red-300">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pb-8">
            <button
              onClick={() => setViewMode('capture')}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold transition-colors"
            >
              <RotateCcw size={18} />
              다시 촬영하기
            </button>
            <button
              onClick={handleConfirmAndAnalyze}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors shadow-lg shadow-emerald-900/30"
            >
              <Play size={18} />
              AI 분석 시작
            </button>
          </div>

        </div>

        {/* Zoom modal */}
        {zoomImage && (
          <div
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setZoomImage(null)}
          >
            <img
              src={zoomImage}
              alt="확대 보기"
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setZoomImage(null)}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ── ANALYZING ── */
  if (viewMode === 'analyzing' && pendingCaptures) {
    return (
      <PostureAnalyzingView
        frontCapture={pendingCaptures.front}
        sideCapture={pendingCaptures.side}
      />
    );
  }

  /* ── RESULTS ── */
  if (viewMode === 'results' && result) {
    return (
      <PostureAnalysisResults
        result={result}
        onBack={handleBackFromResults}
        onSave={handleSaveResult}
      />
    );
  }

  return null;
};
