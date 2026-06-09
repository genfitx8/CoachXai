import React, { useState } from 'react';
import { PostureCapture, PostureAnalysisResult, PostureSession } from '../../types/postureAnalysis';
import { DualCameraCapture } from './DualCameraCapture';
import { PostureAnalysisResults } from './PostureAnalysisResults';
import { skeletonAnalysisService } from '../../services/skeletonAnalysisService';
import { Button } from '../Button';
import { Scan, ArrowLeft, Loader } from 'lucide-react';

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
      // Save to localStorage
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
      localStorage.setItem('posture_sessions', JSON.stringify(savedSessions.slice(0, 10))); // Keep last 10
      alert('결과가 저장되었습니다.');
    }
  };

  if (viewMode === 'intro') {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <button
          onClick={onBack}
          className="flex items-center text-blue-600 hover:text-blue-800 mb-6"
        >
          <ArrowLeft size={20} className="mr-1" />
          <span>돌아가기</span>
        </button>

        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <Scan size={32} className="text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">신체 자세 분석</h1>
            <p className="text-gray-600">
              스켈레톤 분석을 통한 체형 밸런스 측정
            </p>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">분석 과정</h2>
            <div className="space-y-4">
              <div className="flex items-start">
                <div className="flex items-center justify-center w-8 h-8 bg-blue-500 text-white rounded-full mr-3 flex-shrink-0 font-bold">
                  1
                </div>
                <div>
                  <h3 className="font-semibold">정면 실시간 촬영 또는 업로드</h3>
                  <p className="text-sm text-gray-600">전신이 보이는 정면 사진을 실시간으로 촬영하거나 파일을 업로드합니다.</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex items-center justify-center w-8 h-8 bg-blue-500 text-white rounded-full mr-3 flex-shrink-0 font-bold">
                  2
                </div>
                <div>
                  <h3 className="font-semibold">측면 실시간 촬영 또는 업로드</h3>
                  <p className="text-sm text-gray-600">측면 전신 사진을 실시간으로 촬영하거나 파일을 업로드합니다.</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex items-center justify-center w-8 h-8 bg-blue-500 text-white rounded-full mr-3 flex-shrink-0 font-bold">
                  3
                </div>
                <div>
                  <h3 className="font-semibold">AI 스켈레톤 분석</h3>
                  <p className="text-sm text-gray-600">MediaPipe 기반 AI가 신체 주요 포인트를 분석합니다.</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex items-center justify-center w-8 h-8 bg-blue-500 text-white rounded-full mr-3 flex-shrink-0 font-bold">
                  4
                </div>
                <div>
                  <h3 className="font-semibold">체형 밸런스 평가</h3>
                  <p className="text-sm text-gray-600">어깨, 골반, 척추 등의 정렬 상태를 평가하고 개선 방안을 제시합니다.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-yellow-800 mb-2">촬영 팁</h3>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• 밝은 조명 아래에서 촬영하세요</li>
              <li>• 전신이 화면에 들어오도록 촬영하세요</li>
              <li>• 몸에 밀착된 옷을 착용하면 더 정확합니다</li>
              <li>• 벽이나 무늬 없는 배경이 좋습니다</li>
            </ul>
          </div>

          <div className="text-center">
            <Button onClick={handleStartAnalysis} className="px-8 py-3 text-lg">
              <Scan size={24} className="mr-2" />
              분석 시작하기
            </Button>
          </div>
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
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg p-12 text-center">
          <Loader size={64} className="animate-spin text-blue-600 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">AI 분석 중...</h2>
          <p className="text-gray-600">
            스켈레톤 분석 및 체형 밸런스를 측정하고 있습니다.
          </p>
          {error && (
            <div className="mt-4 p-4 bg-red-50 text-red-700 rounded">
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
