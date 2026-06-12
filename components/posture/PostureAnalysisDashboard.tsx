import React, { useState } from 'react';
import { PostureCapture, PostureAnalysisResult, PostureSession } from '../../types/postureAnalysis';
import { DualCameraCapture } from './DualCameraCapture';
import { PostureAnalysisResults } from './PostureAnalysisResults';
import { skeletonAnalysisService } from '../../services/skeletonAnalysisService';
import { Scan, ArrowLeft, Loader, Camera, Upload, Zap, CheckCircle2 } from 'lucide-react';

interface PostureAnalysisDashboardProps {
  memberName: string;
  onBack: () => void;
  onComplete?: (result: PostureAnalysisResult) => void;
}

type ViewMode = 'intro' | 'capture' | 'analyzing' | 'results';

export const PostureAnalysisDashboard: React.FC<PostureAnalysisDashboardProps> = ({
  memberName,
  onBack,
  onComplete,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('intro');
  const [result, setResult] = useState<PostureAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleStartAnalysis = () => {
    setViewMode('capture');
    setError(null);
  };

  const handleCapturesComplete = async (frontCapture: PostureCapture, sideCapture: PostureCapture) => {
    setViewMode('analyzing');
    setError(null);

    try {
      const analysis = await skeletonAnalysisService.analyzePosture(frontCapture, sideCapture);

      const analysisResult: PostureAnalysisResult = {
        id: `posture-${Date.now()}`,
        frontCapture,
        sideCapture,
        frontSkeleton: analysis.frontSkeleton,
        sideSkeleton: analysis.sideSkeleton,
        balance: analysis.balance,
        problemAreas: analysis.problemAreas,
        recommendations: analysis.recommendations,
        createdAt: new Date().toISOString(),
      };

      setResult(analysisResult);
      setViewMode('results');

      if (onComplete) {
        onComplete(analysisResult);
      }
    } catch (err) {
      console.error('Analysis failed:', err);
      setError(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.');
      setViewMode('capture');
    }
  };

  const handleBackFromResults = () => {
    setResult(null);
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

  if (viewMode === 'intro') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Back button */}
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-100 transition-colors text-sm mb-8"
          >
            <ArrowLeft size={18} />
            돌아가기
          </button>

          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-900/40 border border-emerald-700 mb-5">
              <Scan size={36} className="text-emerald-400" />
            </div>
            <h1 className="text-3xl font-bold mb-2">신체 자세 분석</h1>
            <p className="text-slate-400">AI 스켈레톤 분석으로 체형 밸런스를 정밀 측정합니다</p>
          </div>

          {/* Steps */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 mb-6 space-y-5">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">분석 과정</h2>
            {[
              {
                icon: Camera,
                step: '1',
                title: '정면 촬영 또는 업로드',
                desc: '전신이 보이는 정면 사진을 촬영하거나 파일로 업로드합니다.',
              },
              {
                icon: Camera,
                step: '2',
                title: '측면 촬영 또는 업로드',
                desc: '측면 전신 사진을 촬영하거나 파일로 업로드합니다.',
              },
              {
                icon: Zap,
                step: '3',
                title: 'AI 스켈레톤 분석',
                desc: 'MediaPipe 기반 AI가 33개 신체 포인트를 감지하고 분석합니다.',
              },
              {
                icon: CheckCircle2,
                step: '4',
                title: '체형 밸런스 평가',
                desc: '어깨·골반·척추·머리·무릎 정렬을 점수로 평가하고 개선 방안을 제시합니다.',
              },
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

          {/* Tips */}
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
            onClick={handleStartAnalysis}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-lg transition-colors shadow-lg shadow-emerald-900/40"
          >
            <Scan size={24} />
            분석 시작하기
          </button>
        </div>
      </div>
    );
  }

  if (viewMode === 'capture') {
    return (
      <DualCameraCapture
        onCapturesComplete={handleCapturesComplete}
        onCancel={() => setViewMode('intro')}
      />
    );
  }

  if (viewMode === 'analyzing') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="relative inline-flex mb-8">
            <div className="w-24 h-24 rounded-full border-4 border-slate-800" />
            <div className="absolute inset-0 w-24 h-24 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
            <Loader size={32} className="absolute inset-0 m-auto text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-slate-100 mb-2">AI 분석 중...</h2>
          <p className="text-slate-400 text-sm">스켈레톤 분석 및 체형 밸런스를 측정하고 있습니다</p>
          {error && (
            <div className="mt-6 px-4 py-3 bg-red-900/30 border border-red-700 rounded-xl text-red-300 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

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
