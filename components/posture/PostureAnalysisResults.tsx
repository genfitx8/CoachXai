import React from 'react';
import { PostureAnalysisResult } from '../../types/postureAnalysis';
import { SkeletonVisualization } from './SkeletonVisualization';
import { Button } from '../Button';
import { ChevronLeft, Download, AlertCircle, CheckCircle } from 'lucide-react';

interface PostureAnalysisResultsProps {
  result: PostureAnalysisResult;
  onBack: () => void;
  onSave?: () => void;
}

export const PostureAnalysisResults: React.FC<PostureAnalysisResultsProps> = ({
  result,
  onBack,
  onSave,
}) => {
  const { balance, problemAreas, recommendations, frontCapture, sideCapture, frontSkeleton, sideSkeleton } = result;

  const getScoreColor = (score: number): string => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreGrade = (score: number): string => {
    if (score >= 90) return '매우 우수';
    if (score >= 80) return '우수';
    if (score >= 70) return '양호';
    if (score >= 60) return '보통';
    return '개선 필요';
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center text-blue-600 hover:text-blue-800 mb-4"
        >
          <ChevronLeft size={20} />
          <span>돌아가기</span>
        </button>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">신체 자세 분석 결과</h2>
        <p className="text-gray-600">
          촬영 일시: {new Date(result.createdAt).toLocaleString('ko-KR')}
        </p>
      </div>

      {/* Overall Score */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg p-6 mb-6">
        <div className="text-center">
          <div className="text-5xl font-bold mb-2">{balance.overallScore}점</div>
          <div className="text-xl">{getScoreGrade(balance.overallScore)}</div>
        </div>
      </div>

      {/* Detailed Scores */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 shadow">
          <div className="text-sm text-gray-600 mb-1">어깨 정렬</div>
          <div className={`text-2xl font-bold ${getScoreColor(balance.shoulderAlignment)}`}>
            {balance.shoulderAlignment}
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <div className="text-sm text-gray-600 mb-1">골반 정렬</div>
          <div className={`text-2xl font-bold ${getScoreColor(balance.hipAlignment)}`}>
            {balance.hipAlignment}
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <div className="text-sm text-gray-600 mb-1">척추 각도</div>
          <div className={`text-2xl font-bold ${getScoreColor(balance.spineAngle)}`}>
            {balance.spineAngle}
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <div className="text-sm text-gray-600 mb-1">머리 위치</div>
          <div className={`text-2xl font-bold ${getScoreColor(balance.headForwardPosition)}`}>
            {balance.headForwardPosition}
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <div className="text-sm text-gray-600 mb-1">무릎 정렬</div>
          <div className={`text-2xl font-bold ${getScoreColor(balance.kneeAlignment)}`}>
            {balance.kneeAlignment}
          </div>
        </div>
      </div>

      {/* Skeleton Visualizations */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <SkeletonVisualization
          capture={frontCapture}
          skeleton={frontSkeleton}
          title="정면 스켈레톤 분석"
        />
        <SkeletonVisualization
          capture={sideCapture}
          skeleton={sideSkeleton}
          title="측면 스켈레톤 분석"
        />
      </div>

      {/* Problem Areas */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="text-xl font-bold mb-4 flex items-center">
          <AlertCircle className="mr-2 text-orange-500" size={24} />
          발견된 문제점
        </h3>
        <div className="space-y-2">
          {problemAreas.map((problem, index) => (
            <div key={index} className="flex items-start">
              <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 mr-3 flex-shrink-0" />
              <p className="text-gray-700">{problem}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="text-xl font-bold mb-4 flex items-center">
          <CheckCircle className="mr-2 text-green-500" size={24} />
          개선 권장사항
        </h3>
        <div className="space-y-3">
          {recommendations.map((recommendation, index) => (
            <div key={index} className="flex items-start bg-green-50 p-3 rounded">
              <div className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center mr-3 flex-shrink-0 text-sm font-bold">
                {index + 1}
              </div>
              <p className="text-gray-700">{recommendation}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-3">
        {onSave && (
          <Button onClick={onSave} className="flex items-center">
            <Download size={20} className="mr-2" />
            결과 저장
          </Button>
        )}
        <Button onClick={onBack} variant="secondary">
          새로 분석하기
        </Button>
      </div>
    </div>
  );
};
