export interface SkeletonKeypoint {
  x: number;
  y: number;
  z?: number;
  confidence: number;
  name: string;
}

export interface PostureCapture {
  id: string;
  type: 'front' | 'side';
  imageData: string; // base64 or blob URL
  timestamp: string;
  width: number;
  height: number;
}

export interface SkeletonAnalysis {
  keypoints: SkeletonKeypoint[];
  angles: Record<string, number>;
  deviations: Record<string, number>;
  confidence: number;
}

export interface PostureBalance {
  shoulderAlignment: number; // 0-100 score
  hipAlignment: number;
  spineAngle: number;
  headForwardPosition: number;
  kneeAlignment: number;
  overallScore: number;
}

export interface PostureAnalysisResult {
  id: string;
  frontCapture: PostureCapture;
  sideCapture: PostureCapture;
  frontSkeleton: SkeletonAnalysis;
  sideSkeleton: SkeletonAnalysis;
  balance: PostureBalance;
  problemAreas: string[];
  recommendations: string[];
  createdAt: string;
}

export interface PostureSession {
  id: string;
  memberName: string;
  captures: {
    front?: PostureCapture;
    side?: PostureCapture;
  };
  result?: PostureAnalysisResult;
  status: 'capturing' | 'analyzing' | 'completed' | 'error';
  createdAt: string;
  updatedAt: string;
}
