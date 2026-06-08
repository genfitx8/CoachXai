import { PoseLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';
import {
  SkeletonKeypoint,
  SkeletonAnalysis,
  PostureBalance,
  PostureCapture,
} from '../types/postureAnalysis';
import { createLogger } from '../utils/logger';

const log = createLogger('skeletonAnalysisService');

let poseLandmarker: PoseLandmarker | null = null;
let isInitializing = false;

const POSE_CONNECTIONS = [
  [11, 12], // shoulders
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
  [11, 23], [12, 24], // torso
  [23, 24], // hips
  [23, 25], [25, 27], // left leg
  [24, 26], [26, 28], // right leg
];

const LANDMARK_NAMES = [
  'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer',
  'right_eye_inner', 'right_eye', 'right_eye_outer',
  'left_ear', 'right_ear', 'mouth_left', 'mouth_right',
  'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist',
  'left_pinky', 'right_pinky',
  'left_index', 'right_index',
  'left_thumb', 'right_thumb',
  'left_hip', 'right_hip',
  'left_knee', 'right_knee',
  'left_ankle', 'right_ankle',
  'left_heel', 'right_heel',
  'left_foot_index', 'right_foot_index',
];

async function initializePoseLandmarker(): Promise<PoseLandmarker> {
  if (poseLandmarker) return poseLandmarker;

  if (isInitializing) {
    // Wait for initialization to complete
    while (isInitializing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (poseLandmarker) return poseLandmarker;
  }

  isInitializing = true;
  try {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    log.info('Pose landmarker initialized successfully');
    return poseLandmarker;
  } catch (error) {
    log.error('Failed to initialize pose landmarker', error);
    throw new Error('스켈레톤 분석 모델을 초기화할 수 없습니다.');
  } finally {
    isInitializing = false;
  }
}

function calculateAngle(p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }): number {
  const radians = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) {
    angle = 360 - angle;
  }
  return angle;
}

async function analyzePoseFromImage(imageData: string): Promise<SkeletonAnalysis> {
  const landmarker = await initializePoseLandmarker();

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const result = landmarker.detect(img);

        if (!result.landmarks || result.landmarks.length === 0) {
          throw new Error('신체를 감지할 수 없습니다. 전신이 보이도록 다시 촬영해주세요.');
        }

        const landmarks = result.landmarks[0];
        const keypoints: SkeletonKeypoint[] = landmarks.map((lm, index) => ({
          x: lm.x,
          y: lm.y,
          z: lm.z,
          confidence: lm.visibility ?? 0.5,
          name: LANDMARK_NAMES[index] || `point_${index}`,
        }));

        // Calculate important angles
        const angles: Record<string, number> = {};

        // Shoulder angle (relative to horizontal)
        if (keypoints[11] && keypoints[12]) {
          const shoulderAngle = Math.atan2(
            keypoints[12].y - keypoints[11].y,
            keypoints[12].x - keypoints[11].x
          ) * (180 / Math.PI);
          angles.shoulderAlignment = Math.abs(shoulderAngle);
        }

        // Hip angle
        if (keypoints[23] && keypoints[24]) {
          const hipAngle = Math.atan2(
            keypoints[24].y - keypoints[23].y,
            keypoints[24].x - keypoints[23].x
          ) * (180 / Math.PI);
          angles.hipAlignment = Math.abs(hipAngle);
        }

        // Spine angle (from hip to shoulder)
        if (keypoints[11] && keypoints[23]) {
          const spineAngle = Math.atan2(
            keypoints[11].y - keypoints[23].y,
            keypoints[11].x - keypoints[23].x
          ) * (180 / Math.PI);
          angles.spineAngle = 90 - Math.abs(spineAngle);
        }

        // Knee angles
        if (keypoints[23] && keypoints[25] && keypoints[27]) {
          angles.leftKneeAngle = calculateAngle(keypoints[23], keypoints[25], keypoints[27]);
        }
        if (keypoints[24] && keypoints[26] && keypoints[28]) {
          angles.rightKneeAngle = calculateAngle(keypoints[24], keypoints[26], keypoints[28]);
        }

        // Calculate deviations
        const deviations: Record<string, number> = {};
        if (angles.shoulderAlignment) {
          deviations.shoulderTilt = angles.shoulderAlignment;
        }
        if (angles.hipAlignment) {
          deviations.hipTilt = angles.hipAlignment;
        }

        const avgConfidence = keypoints.reduce((sum, kp) => sum + kp.confidence, 0) / keypoints.length;

        resolve({
          keypoints,
          angles,
          deviations,
          confidence: avgConfidence,
        });
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => reject(new Error('이미지를 로드할 수 없습니다.'));
    img.src = imageData;
  });
}

function calculatePostureBalance(
  frontAnalysis: SkeletonAnalysis,
  sideAnalysis: SkeletonAnalysis
): PostureBalance {
  // Shoulder alignment (0-100, higher is better)
  const shoulderScore = Math.max(0, 100 - (frontAnalysis.angles.shoulderAlignment || 0) * 5);

  // Hip alignment
  const hipScore = Math.max(0, 100 - (frontAnalysis.angles.hipAlignment || 0) * 5);

  // Spine angle (ideal is around 0-5 degrees from vertical)
  const spineDeviation = Math.abs((sideAnalysis.angles.spineAngle || 0) - 0);
  const spineScore = Math.max(0, 100 - spineDeviation * 2);

  // Head forward position (from side view)
  const headForwardScore = sideAnalysis.keypoints[0] && sideAnalysis.keypoints[11]
    ? Math.max(0, 100 - Math.abs(sideAnalysis.keypoints[0].x - sideAnalysis.keypoints[11].x) * 200)
    : 50;

  // Knee alignment
  const leftKneeIdeal = 180;
  const rightKneeIdeal = 180;
  const leftKneeDeviation = Math.abs((frontAnalysis.angles.leftKneeAngle || leftKneeIdeal) - leftKneeIdeal);
  const rightKneeDeviation = Math.abs((frontAnalysis.angles.rightKneeAngle || rightKneeIdeal) - rightKneeIdeal);
  const kneeScore = Math.max(0, 100 - ((leftKneeDeviation + rightKneeDeviation) / 2));

  const overallScore = Math.round(
    (shoulderScore * 0.25 + hipScore * 0.25 + spineScore * 0.25 + headForwardScore * 0.15 + kneeScore * 0.1)
  );

  return {
    shoulderAlignment: Math.round(shoulderScore),
    hipAlignment: Math.round(hipScore),
    spineAngle: Math.round(spineScore),
    headForwardPosition: Math.round(headForwardScore),
    kneeAlignment: Math.round(kneeScore),
    overallScore,
  };
}

function generateProblemAreas(balance: PostureBalance): string[] {
  const problems: string[] = [];

  if (balance.shoulderAlignment < 70) {
    problems.push('어깨 불균형이 감지되었습니다.');
  }
  if (balance.hipAlignment < 70) {
    problems.push('골반 불균형이 관찰됩니다.');
  }
  if (balance.spineAngle < 70) {
    problems.push('척추 정렬에 개선이 필요합니다.');
  }
  if (balance.headForwardPosition < 70) {
    problems.push('거북목 자세가 보입니다.');
  }
  if (balance.kneeAlignment < 70) {
    problems.push('무릎 정렬 불균형이 있습니다.');
  }

  if (problems.length === 0) {
    problems.push('전반적으로 양호한 자세입니다.');
  }

  return problems;
}

function generateRecommendations(balance: PostureBalance, problems: string[]): string[] {
  const recommendations: string[] = [];

  if (balance.shoulderAlignment < 70) {
    recommendations.push('어깨 스트레칭과 등 근육 강화 운동을 추천합니다.');
  }
  if (balance.hipAlignment < 70) {
    recommendations.push('골반 교정 스트레칭과 코어 강화 운동이 필요합니다.');
  }
  if (balance.spineAngle < 70) {
    recommendations.push('척추 정렬을 위한 자세 교정 운동을 시작하세요.');
  }
  if (balance.headForwardPosition < 70) {
    recommendations.push('목 스트레칭과 턱 당기기 운동으로 거북목을 개선하세요.');
  }
  if (balance.kneeAlignment < 70) {
    recommendations.push('하체 근력 운동과 무릎 정렬 교정 운동이 도움됩니다.');
  }

  if (balance.overallScore >= 80) {
    recommendations.push('현재 자세를 유지하며 정기적인 체크업을 권장합니다.');
  }

  return recommendations;
}

export const skeletonAnalysisService = {
  async analyzePosture(
    frontCapture: PostureCapture,
    sideCapture: PostureCapture
  ): Promise<{
    frontSkeleton: SkeletonAnalysis;
    sideSkeleton: SkeletonAnalysis;
    balance: PostureBalance;
    problemAreas: string[];
    recommendations: string[];
  }> {
    try {
      log.info('Starting posture analysis');

      const [frontSkeleton, sideSkeleton] = await Promise.all([
        analyzePoseFromImage(frontCapture.imageData),
        analyzePoseFromImage(sideCapture.imageData),
      ]);

      const balance = calculatePostureBalance(frontSkeleton, sideSkeleton);
      const problemAreas = generateProblemAreas(balance);
      const recommendations = generateRecommendations(balance, problemAreas);

      log.info('Posture analysis completed', { balance });

      return {
        frontSkeleton,
        sideSkeleton,
        balance,
        problemAreas,
        recommendations,
      };
    } catch (error) {
      log.error('Posture analysis failed', error);
      throw error;
    }
  },

  drawSkeleton(
    canvas: HTMLCanvasElement,
    imageData: string,
    skeleton: SkeletonAnalysis
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;

        // Draw image
        ctx.drawImage(img, 0, 0);

        // Draw skeleton
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 3;
        ctx.fillStyle = '#FF0000';

        // Draw connections
        POSE_CONNECTIONS.forEach(([start, end]) => {
          const kp1 = skeleton.keypoints[start];
          const kp2 = skeleton.keypoints[end];
          if (kp1 && kp2 && kp1.confidence > 0.3 && kp2.confidence > 0.3) {
            ctx.beginPath();
            ctx.moveTo(kp1.x * canvas.width, kp1.y * canvas.height);
            ctx.lineTo(kp2.x * canvas.width, kp2.y * canvas.height);
            ctx.stroke();
          }
        });

        // Draw keypoints
        skeleton.keypoints.forEach((kp) => {
          if (kp.confidence > 0.3) {
            ctx.beginPath();
            ctx.arc(kp.x * canvas.width, kp.y * canvas.height, 5, 0, 2 * Math.PI);
            ctx.fill();
          }
        });

        resolve();
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageData;
    });
  },
};
