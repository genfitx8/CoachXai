import React, { useEffect, useRef } from 'react';
import { SkeletonAnalysis, PostureCapture } from '../../types/postureAnalysis';
import { skeletonAnalysisService } from '../../services/skeletonAnalysisService';

interface SkeletonVisualizationProps {
  capture: PostureCapture;
  skeleton: SkeletonAnalysis;
  title: string;
}

export const SkeletonVisualization: React.FC<SkeletonVisualizationProps> = ({
  capture,
  skeleton,
  title,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      skeletonAnalysisService.drawSkeleton(canvasRef.current, capture.imageData, skeleton)
        .catch((error) => console.error('Failed to draw skeleton:', error));
    }
  }, [capture, skeleton]);

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-gray-100 px-4 py-2 font-semibold">{title}</div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full h-auto"
        />
        <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white px-3 py-1 rounded text-sm">
          신뢰도: {Math.round(skeleton.confidence * 100)}%
        </div>
      </div>
    </div>
  );
};
