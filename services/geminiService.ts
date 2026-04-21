import { GoogleGenAI } from '@google/genai';
import { classifyBodyType, BodyShapePatternScores } from './bodyAnalysisService';
import {
  ComparisonResult,
  GolfData,
  ClientProfile,
  Lesson,
  ShotMetrics,
  TrainingProgramConfig,
  QuickLogEntry,
  WeeklyInsight,
  CoachProfile,
} from '../types';
import {
  CoachXLanguage,
  CoachXInsight,
  CoachGrowthProfile,
  generateHeuristicResponse,
  generateCoachInsights,
  generateCoachGrowthProfile,
} from './coachXService';
import { promptService } from './promptService';
import { firebaseService } from './firebase';

// Initialize the Gemini client
// Note: process.env.API_KEY or process.env.GEMINI_API_KEY is injected by the environment.
const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('Gemini API key is not set. AI features will not work.');
}

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

/**
 * Fetches a blob from a local blob URL
 */
const getBlobFromUrl = async (url: string): Promise<Blob> => {
  const response = await fetch(url);
  return await response.blob();
};

/**
 * Converts a File object or Blob to a Base64 string for Gemini inline data.
 */
const fileToGenerativePart = async (file: Blob, mimeType: string) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove the Data URL prefix (e.g., "data:video/mp4;base64,")
      resolve(result.split(',')[1]);
    };
    reader.readAsDataURL(file);
  });

  return {
    inlineData: {
      data: await base64EncodedDataPromise,
      mimeType: mimeType,
    },
  };
};

export interface AnalysisInput {
  data: File | string; // File object or URL string
  mimeType: string;
}

export interface BodyPhotoAnalysisResult {
  bodyType:
    | '이상체형'
    | '삼각체형'
    | '역삼각체형'
    | '사각체형'
    | '모래시계형'
    | '마름모꼴체형'
    | '둥근체형'
    | '튜브체형';
  structuralInput: {
    frontAxisTiltDeg?: number;
    headTiltDeg?: number;
    shoulderTiltDeg?: number;
    pelvisTiltDeg?: number;
    kneeTiltDeg?: number;
  };
  patternScores?: BodyShapePatternScores;
  coachComment: string;
}

const LESSON_BODY_TYPES: BodyPhotoAnalysisResult['bodyType'][] = [
  '이상체형',
  '삼각체형',
  '역삼각체형',
  '사각체형',
  '모래시계형',
  '마름모꼴체형',
  '둥근체형',
  '튜브체형',
];

const toOptionalNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Number(value.toFixed(1));
};

const parsePatternScores = (value: unknown): BodyShapePatternScores | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const parsed: BodyShapePatternScores = {
    이상체형: toOptionalNumber(source.이상체형),
    삼각체형: toOptionalNumber(source.삼각체형),
    역삼각체형: toOptionalNumber(source.역삼각체형),
    사각체형: toOptionalNumber(source.사각체형),
    모래시계형: toOptionalNumber(source.모래시계형),
    마름모꼴체형: toOptionalNumber(source.마름모꼴체형),
    둥근체형: toOptionalNumber(source.둥근체형),
    튜브체형: toOptionalNumber(source.튜브체형),
  };

  const hasScore = Object.values(parsed).some((score) => score !== undefined);
  return hasScore ? parsed : undefined;
};

export const parseBodyPhotoAnalysisResponse = (
  text: string
): BodyPhotoAnalysisResult => {
  const parsed = JSON.parse(text);
  const rawBodyType = String(parsed?.bodyType ?? '사각체형');
  const fallbackBodyType = LESSON_BODY_TYPES.includes(
    rawBodyType as BodyPhotoAnalysisResult['bodyType']
  )
    ? (rawBodyType as BodyPhotoAnalysisResult['bodyType'])
    : '사각체형';
  const patternScores = parsePatternScores(parsed?.patternScores);
  const bodyType = patternScores ? classifyBodyType(patternScores) : fallbackBodyType;

  return {
    bodyType,
    patternScores,
    structuralInput: {
      frontAxisTiltDeg: toOptionalNumber(parsed?.structuralInput?.frontAxisTiltDeg),
      headTiltDeg: toOptionalNumber(parsed?.structuralInput?.headTiltDeg),
      shoulderTiltDeg: toOptionalNumber(parsed?.structuralInput?.shoulderTiltDeg),
      pelvisTiltDeg: toOptionalNumber(parsed?.structuralInput?.pelvisTiltDeg),
      kneeTiltDeg: toOptionalNumber(parsed?.structuralInput?.kneeTiltDeg),
    },
    coachComment:
      typeof parsed?.coachComment === 'string' && parsed.coachComment.trim()
        ? parsed.coachComment.trim()
        : '정면/측면 전신 사진 기반 자동 분석 결과입니다.',
  };
};

/**
 * Summarizes multiple golf lesson assets (videos, images, audio) using Gemini 2.5 Flash.
 * Generates a member-facing lesson summary report from coach feedback and media context.
 */
export const analyzeSwingVideo = async (
  mediaInputs: AnalysisInput[],
  userNotes: string,
  swingAngle?: 'FRONT' | 'SIDE'
): Promise<string> => {
  if (!ai) {
    throw new Error(
      'Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file.'
    );
  }

  try {
    // Convert all inputs to generative parts
    const mediaParts = await Promise.all(
      mediaInputs.map(async (input) => {
        let blob: Blob;
        if (typeof input.data === 'string') {
          blob = await getBlobFromUrl(input.data);
        } else {
          blob = input.data;
        }
        return fileToGenerativePart(blob, input.mimeType);
      })
    );

    const angleText =
      swingAngle === 'FRONT'
        ? '정면(Front View)'
        : swingAngle === 'SIDE'
        ? '측면(Side View)'
        : '알 수 없음(자동 감지)';

    const prompt = `
      당신은 코치가 회원에게 전달할 레슨 리포트를 정리해주는 AI입니다.
      업로드된 자료를 바탕으로, 평가/판정 중심이 아닌 **회원 친화적인 레슨 요약 리포트**를 작성해주세요.

      **리포트 참고 자료:**
      - **촬영 앵글**: ${angleText}
      - **오디오 데이터**: 레슨 현장의 대화 및 타구음
      - **비주얼 데이터**: 스윙 영상 및 이미지
      - **추가 메모**: "${userNotes}"

      **작성 원칙:**
      1. 회원이 바로 이해할 수 있는 쉬운 표현을 사용하세요.
      2. 분석/진단/평가/판정 느낌의 과한 표현은 피하고, 관찰된 내용 중심으로 정리하세요.
      3. 코치가 실제로 전달한 교정 포인트와 다음 연습 방향을 구체적으로 담아주세요.
      4. 정보가 불충분하면 단정하지 말고 "추가 확인이 필요"하다고 부드럽게 표현하세요.
      5. 아래 형식을 준수해 마크다운으로 출력하세요.

      ---

      ## 📝 오늘의 레슨 요약
      (오늘 어떤 동작과 흐름을 중심으로 레슨했는지 3~5문장으로 정리)

      ## 🎯 핵심 코칭 포인트
      - (교정/유지가 필요한 핵심 포인트를 3개 내외로 정리)
      - (각 항목은 회원이 이해하기 쉬운 문장으로 작성)

      ## ✅ 다음 연습 가이드
      1. (다음 연습에서 우선순위가 높은 연습 2~3개 제안)
      2. (연습 시 체크할 기준이나 감각 포인트 제시)
      3. (무리 없는 빈도/순서 가이드 제시)

      ---

      *회원에게 바로 공유할 수 있는 톤으로 정리해주세요.*
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [...mediaParts, { text: prompt }],
      },
      config: {
        temperature: 0.4,
      },
    });

    if (response.text) {
      return response.text;
    } else {
      throw new Error('레슨 요약을 생성하지 못했습니다.');
    }
  } catch (error) {
    console.error('Gemini Lesson Summary Error:', error);
    throw error;
  }
};

/**
 * Extracts golf metrics from an image (Launch monitor screen like GDR, Trackman)
 * OR extracts Score from a Scorecard image for a specific user.
 */
export const extractGolfData = async (
  imageInput: AnalysisInput,
  clientName?: string // Name to search for in scorecard
): Promise<{
  textAnalysis: string;
  golfData: GolfData | null;
  score?: number;
}> => {
  if (!ai) {
    throw new Error(
      'Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file.'
    );
  }

  try {
    let blob: Blob;
    if (typeof imageInput.data === 'string') {
      blob = await getBlobFromUrl(imageInput.data);
    } else {
      blob = imageInput.data;
    }
    const mediaPart = await fileToGenerativePart(blob, imageInput.mimeType);

    const prompt = `
      이 이미지는 두 가지 중 하나입니다:
      1. **골프 시뮬레이터(GDR, 카카오VX, 트랙맨 등)의 데이터 화면**
      2. **골프 스코어카드(필드 또는 스크린 게임 결과)**

      이미지를 분석하여 다음 작업을 수행하고 JSON으로 응답해주세요.

      **Case 1: 스코어카드인 경우**
      - 여러 사람의 이름과 점수가 있을 수 있습니다.
      - **대상 사용자 이름**: "${clientName || '사용자'}"
      - 위 이름과 일치하거나 가장 유사한 이름을 찾으세요. (예: "${clientName}" -> "김철수")
      - 그 사람의 **Total Score(총 타수)**를 추출하여 'score' 필드에 넣으세요.
      - 찾을 수 없다면 가장 눈에 띄는(주인공인) 점수를 추출하세요.
      - golfData의 수치들은 null로 두세요.

      **Case 2: 시뮬레이터 데이터인 경우**
      - 화면에 있는 비거리, 스피드 등 수치를 추출하여 'metrics' 객체에 넣으세요.
      - score는 null로 두세요.

      **추출해야 할 데이터 필드 (반드시 아래 영문 Key 사용, 단위 무시, 숫자만):**
      - score (스코어카드일 때 총 타수)
      - carryDistance (캐리 거리)
      - totalDistance (총 거리)
      - ballSpeed (볼 스피드)
      - clubHeadSpeed (클럽 헤드 스피드)
      - launchAngle (발사각)
      - backSpin (백스핀)
      - sideSpin (사이드스핀)
      - smashFactor (정타율/스매시팩터)
      
      **응답 형식 (JSON):**
      \`\`\`json
      {
        "isScorecard": boolean,
        "score": 85, 
        "metrics": {
          "carryDistance": 150.5,
          "totalDistance": 160.2,
          "ballSpeed": 65.0,
          "clubHeadSpeed": 45.0,
          "smashFactor": 1.45,
          ...
        },
        "comment": "스코어카드: 김철수님의 기록은 85타입니다. / 시뮬레이터: 볼 스피드가 아주 훌륭합니다."
      }
      \`\`\`
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [mediaPart, { text: prompt }],
      },
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text;
    if (!text) throw new Error('분석 실패');

    const result = JSON.parse(text);
    return {
      textAnalysis: result.comment,
      golfData: result.metrics,
      score: result.score,
    };
  } catch (error) {
    console.error('Golf Data Extraction Error:', error);
    return {
      textAnalysis: '데이터 분석 중 오류가 발생했습니다.',
      golfData: null,
    };
  }
};

/**
 * Summarizes audio feedback for a specific golf hole AND extracts structured metrics.
 */
export const summarizeHoleVoice = async (
  audioBlob: Blob,
  holeNumber: number,
  par: number,
  score: number,
  putts: number
): Promise<{ summary: string; metrics: ShotMetrics }> => {
  if (!ai) {
    throw new Error(
      'Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file.'
    );
  }

  try {
    const mediaPart = await fileToGenerativePart(audioBlob, audioBlob.type);

    const prompt = `
      당신은 전문적인 골프 캐디입니다.
      ${holeNumber}번 홀(Par ${par})에서 플레이어가 기록한 음성 메모를 분석해주세요.
      
      **기록 정보:**
      - 타수: ${score}
      - 퍼팅 수: ${putts}
      
      **요청사항:**
      1. 음성 내용을 듣고 해당 홀의 플레이 내용(티샷, 세컨샷, 어프로치, 퍼팅 등)을 시간 순서대로 요약해주세요.
      2. **중요:** 음성 내용에서 다음 데이터가 언급되었다면 추출하여 JSON으로 반환해주세요.
         - 티샷 비거리 (미터 단위)
         - 티샷 방향 (페어웨이 중앙/센터, 좌측/왼쪽, 우측/오른쪽, OB, 해저드 중 하나)
         - 세컨샷 남은 거리 (미터 단위)
         - 파온(GIR) 여부 (true/false, 언급 없으면 타수와 퍼팅 수로 추정)
         - (파온 실패 시) 어프로치 남은 거리 (미터 단위)
         - 첫번째 퍼팅 남은 거리 (미터 단위)

      **응답 형식 (JSON):**
      \`\`\`json
      {
        "summary": "티샷은 230m 페어웨이 중앙으로 잘 갔습니다. 세컨샷 140m 남은 상황에서 7번 아이언으로 온그린에 성공했습니다. 5m 버디 퍼팅이 조금 짧아서 파로 마무리했습니다.",
        "metrics": {
          "teeDistance": 230,
          "teeDirection": "CENTER", // CENTER, LEFT, RIGHT, OB, HAZARD
          "secondShotDistance": 140,
          "parOn": true,
          "approachDistance": null, // GIR 성공 시 null
          "firstPuttDistance": 5
        }
      }
      \`\`\`
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [mediaPart, { text: prompt }],
      },
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text;
    if (!text) throw new Error('No response');

    return JSON.parse(text);
  } catch (error) {
    console.error('Hole Summary Error:', error);
    return { summary: '분석 실패', metrics: {} };
  }
};

/**
 * Compares two swing videos, images, or audio records to analyze progress.
 */
export const compareSwings = async (
  oldVideoUrl: string,
  newVideoUrl: string,
  oldDate: string,
  newDate: string
): Promise<ComparisonResult> => {
  if (!ai) {
    throw new Error(
      'Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file.'
    );
  }

  try {
    const oldBlob = await getBlobFromUrl(oldVideoUrl);
    const newBlob = await getBlobFromUrl(newVideoUrl);

    // Detect mime type directly from blob
    const oldMime = oldBlob.type;
    const newMime = newBlob.type;

    const oldMediaPart = await fileToGenerativePart(oldBlob, oldMime);
    const newMediaPart = await fileToGenerativePart(newBlob, newMime);

    const isAudioComparison =
      oldMime.startsWith('audio/') || newMime.startsWith('audio/');

    let prompt = '';

    if (isAudioComparison) {
      prompt = `
          당신은 전문적인 골프 코치입니다. 
          두 개의 레슨 데이터가 있습니다. (하나 또는 둘 다 음성 녹음일 수 있습니다.)
          첫 번째 데이터: ${oldDate} (과거)
          두 번째 데이터: ${newDate} (최근)
          
          이 두 레슨의 내용을 비교하여(코치의 피드백 변화 등) 사용자가 어떤 부분에서 발전했거나 변화했는지 분석해주세요.
       `;
    } else {
      prompt = `
          당신은 전문적인 골프 코치입니다. 
          두 개의 골프 스윙 데이터(영상 또는 사진)가 있습니다.
          첫 번째 데이터: ${oldDate} (과거)
          두 번째 데이터: ${newDate} (최근)
          
          이 두 스윙을 시각적으로 비교하여 사용자가 얼마나 발전했는지 분석해주세요.
       `;
    }

    const commonPrompt = `
      다음 JSON 형식으로 정확하게 출력해주세요 (마크다운 코드 블록 없이 순수 JSON만 출력):
      {
        "improvementScore": 0에서 100 사이의 숫자 (발전 정도),
        "summary": "발전 사항에 대한 한 줄 요약",
        "keyChanges": ["변경점1", "변경점2", "변경점3"],
        "coachComment": "격려와 구체적인 피드백이 담긴 긴 코멘트 (마크다운 지원)"
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { text: `Data 1 (Old - ${oldDate}):` },
          oldMediaPart,
          { text: `Data 2 (New - ${newDate}):` },
          newMediaPart,
          { text: prompt + commonPrompt },
        ],
      },
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text;
    if (!text) throw new Error('No response from AI');

    return JSON.parse(text) as ComparisonResult;
  } catch (error) {
    console.error('Compare Analysis Error:', error);
    throw error;
  }
};

/**
 * 정면/측면 전신 사진 2장을 분석해 신체분석 입력값을 자동 생성합니다.
 */
export const analyzeBodyPhotos = async (params: {
  frontImage: AnalysisInput;
  sideImage: AnalysisInput;
}): Promise<BodyPhotoAnalysisResult> => {
  if (!ai) {
    throw new Error(
      'Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file.'
    );
  }

  const toBlob = async (input: AnalysisInput): Promise<Blob> => {
    if (typeof input.data === 'string') {
      return getBlobFromUrl(input.data);
    }
    return input.data;
  };

  try {
    const [frontBlob, sideBlob] = await Promise.all([
      toBlob(params.frontImage),
      toBlob(params.sideImage),
    ]);

    const [frontPart, sidePart] = await Promise.all([
      fileToGenerativePart(frontBlob, params.frontImage.mimeType),
      fileToGenerativePart(sideBlob, params.sideImage.mimeType),
    ]);

    const prompt = `
      너는 체형/정렬 분석 보조 AI다.
      입력된 두 이미지는 각각
      - 첫 번째: 정면 전신 사진
      - 두 번째: 측면 전신 사진
      이다.

      아래 JSON만 출력해라.
      - bodyType: 다음 중 1개 [이상체형, 삼각체형, 역삼각체형, 사각체형, 모래시계형, 마름모꼴체형, 둥근체형, 튜브체형]
      - patternScores: 각 체형별 구성비(%) 추정치
        {
          "이상체형": number | null,
          "삼각체형": number | null,
          "역삼각체형": number | null,
          "사각체형": number | null,
          "모래시계형": number | null,
          "마름모꼴체형": number | null,
          "둥근체형": number | null,
          "튜브체형": number | null
        }
      - structuralInput.frontAxisTiltDeg: number | null
      - structuralInput.headTiltDeg: number | null
      - structuralInput.shoulderTiltDeg: number | null
      - structuralInput.pelvisTiltDeg: number | null
      - structuralInput.kneeTiltDeg: number | null
      - coachComment: 한국어 1~2문장 요약

      제약:
      - 단위는 모두 degree(°) 기준 수치로 반환
      - 추정이 어려운 값은 null
      - bodyType은 patternScores 중 가장 큰 값을 가진 체형과 일치시켜라.
      - 코드블록 없이 순수 JSON만 반환
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [frontPart, sidePart, { text: prompt }],
      },
      config: {
        responseMimeType: 'application/json',
      },
    });

    if (!response.text) {
      throw new Error('신체 사진 분석 결과를 생성하지 못했습니다.');
    }

    return parseBodyPhotoAnalysisResponse(response.text);
  } catch (error) {
    console.error('Body photo analysis failed:', error);
    throw error;
  }
};

/**
 * Identifies the timestamps for 8 key swing phases using Gemini.
 */
export const getSwingPhaseTimestamps = async (
  videoBlob: Blob
): Promise<{ label: string; time: number }[]> => {
  if (!ai) {
    throw new Error(
      'Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file.'
    );
  }

  try {
    const mediaPart = await fileToGenerativePart(videoBlob, videoBlob.type);

    const prompt = `
      Analyze this golf swing video. Identify the exact timestamp (in seconds, as a floating point number) for the following 8 key phases:
      
      1. Address (Setup)
      2. Takeaway (Start of backswing)
      3. Half Swing (Backswing arm parallel to ground)
      4. Top of Swing
      5. Downswing (Mid-downswing, arm parallel to ground)
      6. Impact (Club hits ball)
      7. Follow Through (Arm parallel to ground after impact)
      8. Finish (End of swing)

      Return ONLY a JSON object where the keys are exactly these English labels: "Address", "Takeaway", "HalfSwing", "Top", "Downswing", "Impact", "FollowThrough", "Finish".
      The values must be the time in seconds (e.g., 1.5).

      Example JSON format:
      {
        "Address": 0.0,
        "Takeaway": 0.5,
        "HalfSwing": 1.1,
        "Top": 1.8,
        "Downswing": 2.1,
        "Impact": 2.3,
        "FollowThrough": 2.8,
        "Finish": 3.5
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [mediaPart, { text: prompt }],
      },
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text;
    if (!text) throw new Error('AI analysis failed');

    const result = JSON.parse(text);

    // Map English keys to Korean labels expected by the UI
    const mapping: { [key: string]: string } = {
      Address: '어드레스',
      Takeaway: '테이크어웨이',
      HalfSwing: '하프스윙',
      Top: '탑',
      Downswing: '다운스윙',
      Impact: '임팩트',
      FollowThrough: '팔로우스루',
      Finish: '피니쉬',
    };

    const timestamps = Object.keys(result)
      .map((key) => ({
        label: mapping[key] || key,
        time: parseFloat(result[key]),
      }))
      .filter((item) => !isNaN(item.time));

    return timestamps;
  } catch (error) {
    console.error('Swing Sequence Timestamp Error:', error);
    throw error;
  }
};

/**
 * Generates personalized daily mission suggestions for the client
 * based on their profile, stats, and recent lesson feedback.
 */
export const generateGolfMissions = async (
  profile: ClientProfile,
  recentLessons: Lesson[]
): Promise<string[]> => {
  if (!ai) {
    throw new Error(
      'Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file.'
    );
  }

  try {
    // 1. Gather Context
    const handicapInfo = profile.handicap
      ? `핸디캡: ${profile.handicap}`
      : '핸디캡 정보 없음 (초보자 가정)';
    const goalInfo = profile.memo
      ? `사용자 목표: ${profile.memo}`
      : '특별한 목표 없음 (기본기 향상)';
    const bestScoreInfo = profile.bestScore ? `라베: ${profile.bestScore}` : '';

    // Get recent 3 lessons context (Coach notes + AI Analysis)
    const recentContext = recentLessons
      .slice(0, 3)
      .map((l, i) => {
        return `레슨 ${i + 1} (${l.date}): 코치메모-[${
          l.coachNotes
        }], AI분석-[${l.aiAnalysis || '없음'}]`;
      })
      .join('\n');

    const prompt = `
      당신은 회원의 골프 실력 향상을 돕는 AI 전담 코치입니다.
      아래 회원의 정보를 바탕으로 **오늘 수행하면 좋을 맞춤형 연습 과제(미션) 3가지**를 추천해주세요.

      **회원 정보:**
      - ${handicapInfo}
      - ${bestScoreInfo}
      - ${goalInfo}

      **최근 레슨 및 연습 기록:**
      ${
        recentContext ||
        '최근 기록이 없습니다. 일반적인 기초 연습을 추천해주세요.'
      }

      **요청사항:**
      1. 회원의 약점이나 최근 코치에게 지적받은 내용을 보완할 수 있는 구체적인 연습법이어야 합니다.
      2. 각 미션은 "드라이버 빈스윙 20회", "퍼팅 거리감 연습 10분" 처럼 명확한 행동 지침이어야 합니다.
      3. 너무 길지 않게(20자 내외) 작성해주세요.
      4. JSON 배열 형태로 출력해주세요.

      Example JSON:
      ["아이언 어드레스 척추각 유지하며 빈스윙 30회", "퍼팅 3m 거리감 익히기 20분", "드라이버 헤드 던지기 연습"]
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text;
    if (!text) throw new Error('Mission generation failed');

    return JSON.parse(text) as string[];
  } catch (error) {
    console.error('Generate Missions Error:', error);
    // Fallback missions
    return [
      '빈 스윙 50회 하며 리듬 익히기',
      '퍼팅 스트로크 연습 10분',
      '스트레칭 5분으로 유연성 기르기',
    ];
  }
};

/**
 * Generates a structured training program for a member based on their lesson-record
 * history and the user-supplied program configuration.
 *
 * @param profile - The client's profile (handicap, experience, goals, etc.)
 * @param lessons - The client's accumulated lesson records to analyse.
 * @param config  - User-entered program settings (dates, frequency, duration, goal).
 * @returns Markdown-formatted week-by-week training program.
 */
export const generateTrainingProgram = async (
  profile: ClientProfile,
  lessons: Lesson[],
  config: TrainingProgramConfig
): Promise<string> => {
  // Fallback plan used when Gemini is unavailable or when there are too few lesson records.
  const fallbackPlan = (goal: string) => `## 훈련 프로그램 (기본 플랜)

> 레슨 기록 데이터 또는 AI 서비스가 부족하여 기본 플랜을 제공합니다.

### 목표: ${goal}

**1주차** – 기초 점검
- 어드레스·그립·스탠스 교정
- 빈스윙 50회 (리듬·템포 확인)
- 퍼팅 직선 스트로크 20분

**2주차** – 반복 훈련
- 7번 아이언 50볼 집중 연습
- 숏게임 칩샷 30분
- 피니시 자세 유지 연습

**3주차** – 응용 훈련
- 필드 또는 스크린 라운드 1회
- 부족한 클럽 집중 연습 30분
- 멘탈·루틴 점검

**4주차** – 점검 및 정리
- 전체 스윙 영상 셀프 촬영 후 비교
- 코치 피드백 반영 교정 집중
- 목표 재설정
`;

  if (!ai) {
    return fallbackPlan(config.performanceGoal);
  }

  try {
    const handicapInfo = profile.handicap
      ? `핸디캡: ${profile.handicap}`
      : '핸디캡 정보 없음 (초보자 가정)';
    const bestScoreInfo = profile.bestScore ? `라베: ${profile.bestScore}` : '';
    const goalInfo = profile.memo
      ? `사용자 메모/목표: ${profile.memo}`
      : '';

    // Summarise up to 10 most recent lesson records for context
    const lessonContext = lessons.length === 0
      ? '레슨 기록 없음 (기본기 중심으로 구성해 주세요)'
      : lessons
          .slice(0, 10)
          .map((l, i) => {
            const parts: string[] = [
              `레슨 ${i + 1} (${l.date}, ${l.title})`,
            ];
            if (l.coachNotes) parts.push(`코치메모: ${l.coachNotes}`);
            if (l.aiAnalysis) parts.push(`AI분석: ${l.aiAnalysis}`);
            if (l.golfData?.carryDistance)
              parts.push(`캐리거리: ${l.golfData.carryDistance}m`);
            if (l.tags?.length) parts.push(`태그: ${l.tags.join(', ')}`);
            return parts.join(' | ');
          })
          .join('\n');

    // Calculate approximate number of weeks
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const start = new Date(config.startDate).getTime();
    const end = new Date(config.endDate).getTime();
    const weeks = Math.max(1, Math.round((end - start) / msPerWeek));

    const prompt = `
당신은 전문 골프 코치 AI입니다. 아래 회원 정보와 레슨 기록을 바탕으로 맞춤형 훈련 프로그램을 작성해주세요.

**회원 정보:**
- 이름: ${profile.name}
- ${handicapInfo}
${bestScoreInfo ? `- ${bestScoreInfo}` : ''}
${goalInfo ? `- ${goalInfo}` : ''}

**프로그램 설정:**
- 기간: ${config.startDate} ~ ${config.endDate} (약 ${weeks}주)
- 주간 훈련 빈도: 주 ${config.frequencyPerWeek}회
- 회당 훈련 시간: ${config.sessionDurationMinutes}분
- 향상 목표: ${config.performanceGoal}

**최근 레슨 기록 요약:**
${lessonContext}

**작성 지침:**
1. 주차별로 구체적인 훈련 계획을 작성해주세요 (1주차, 2주차, ...).
2. 각 주차에는 주요 훈련 포커스와 구체적인 드릴/연습 방법을 포함해주세요.
3. 레슨 기록에서 발견된 약점이나 반복적으로 지적된 부분을 우선 반영해주세요.
4. 1회 세션에서 할 수 있는 훈련량으로 현실적으로 조정해주세요 (${config.sessionDurationMinutes}분 기준).
5. 마크다운 형식으로 작성하고, 읽기 쉽고 실용적으로 구성해주세요.
6. 한국어로 작성해주세요.

프로그램을 작성해주세요:
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [{ text: prompt }],
      },
    });

    const text = response.text;
    if (!text) throw new Error('Training program generation failed');
    return text;
  } catch (error) {
    console.error('Generate Training Program Error:', error);
    return fallbackPlan(config.performanceGoal);
  }
};

const MOOD_LABELS: Record<string, string> = {
  GREAT: '매우 좋음',
  GOOD: '좋음',
  OKAY: '보통',
  BAD: '나쁨',
  TERRIBLE: '매우 나쁨',
};

const AREA_LABELS: Record<string, string> = {
  DRIVER: '드라이버',
  IRON: '아이언',
  SHORT_GAME: '숏게임',
  PUTTING: '퍼팅',
  ROUND: '라운드',
  OTHER: '기타',
};

/**
 * Generates a weekly AI insight summary from a client's recent quick log entries.
 * Returns a structured WeeklyInsight (without id/clientId/coachId/weekStart/weekEnd/generatedAt,
 * those are set by the caller).
 */
export const generateWeeklyInsight = async (
  logs: QuickLogEntry[],
  recentLessons: Lesson[] = [],
  clientProfile?: ClientProfile
): Promise<Pick<WeeklyInsight, 'summary' | 'keyPatterns' | 'recommendedFocus'>> => {
  const fallback = (): Pick<WeeklyInsight, 'summary' | 'keyPatterns' | 'recommendedFocus'> => {
    const goodPoints = logs.map((l) => l.goodPoint).filter(Boolean);
    const problems = logs.map((l) => l.problemPoint).filter(Boolean);
    return {
      summary: `이번 주 ${logs.length}건의 기록을 바탕으로 분석한 결과입니다.`,
      keyPatterns: [
        goodPoints.length > 0 ? `잘된 점: ${goodPoints[0]}` : '',
        problems.length > 0 ? `개선 필요: ${problems[0]}` : '',
      ].filter(Boolean),
      recommendedFocus: problems.length > 0
        ? `${problems[0]} 개선에 집중하세요.`
        : '꾸준한 기록과 연습을 이어가세요.',
    };
  };

  if (!ai || logs.length === 0) return fallback();

  try {
    const logSummaries = logs.map((l, i) => {
      const parts = [
        `기록 ${i + 1} (${l.logDate})`,
        `컨디션: ${MOOD_LABELS[l.mood] ?? l.mood}`,
        `잘된 점: ${l.goodPoint}`,
        `문제점: ${l.problemPoint}`,
      ];
      if (l.practiceArea) parts.push(`연습 영역: ${AREA_LABELS[l.practiceArea] ?? l.practiceArea}`);
      if (l.notes) parts.push(`메모: ${l.notes}`);
      return parts.join(' | ');
    }).join('\n');

    const lessonContext = recentLessons.length === 0
      ? ''
      : '\n\n**최근 레슨 기록 (참고용):**\n' + recentLessons.slice(0, 5).map((l, i) => {
          const parts = [`레슨 ${i + 1} (${l.date}): ${l.title}`];
          if (l.coachNotes) parts.push(`코치노트: ${l.coachNotes}`);
          return parts.join(' | ');
        }).join('\n');

    const profileContext = clientProfile
      ? `\n회원: ${clientProfile.name}${clientProfile.handicap ? `, 핸디캡 ${clientProfile.handicap}` : ''}`
      : '';

    const prompt = `당신은 전문 골프 코치 AI입니다. 아래 회원의 이번 주 빠른 기록 ${logs.length}건을 분석해 주간 인사이트를 작성해주세요.${profileContext}

**이번 주 빠른 기록:**
${logSummaries}${lessonContext}

**작성 지침:**
- summary: 이번 주 전반적인 흐름을 2~3문장으로 요약 (한국어)
- keyPatterns: 반복되는 패턴이나 두드러진 이슈 2~4개를 배열로 (각 항목 한 문장)
- recommendedFocus: 다음 주 핵심 집중 포인트 1~2개를 포함한 실용적 제안 (2~3문장)

반드시 아래 JSON 형식으로만 응답하세요:
{
  "summary": "...",
  "keyPatterns": ["...", "..."],
  "recommendedFocus": "..."
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: prompt }] },
    });

    const text = response.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.summary || !Array.isArray(parsed.keyPatterns) || !parsed.recommendedFocus) {
      throw new Error('Invalid JSON structure');
    }
    return {
      summary: parsed.summary,
      keyPatterns: parsed.keyPatterns,
      recommendedFocus: parsed.recommendedFocus,
    };
  } catch (error) {
    console.error('Generate Weekly Insight Error:', error);
    return fallback();
  }
};

// ─── CoachX Gemini-backed intelligence ────────────────────────────────────────

// ─── CoachX module-level constants ──────────────────────────────────────────

const COACHX_TOPIC_KEYWORDS = [
  '슬라이스','훅','어드레스','그립','백스윙','임팩트','체중이동','퍼팅','어프로치','드라이버','아이언',
  'slice','hook','address','grip','backswing','impact','putting','driver',
];

const COACHX_VALID_INSIGHT_TYPES = new Set(['pattern', 'attention', 'curriculum', 'coach_growth', 'stagnation']);

const COACHX_INSIGHT_ICON_MAP: Record<string, string> = {
  pattern: '🔄',
  attention: '⭐',
  curriculum: '🗓️',
  coach_growth: '📈',
  stagnation: '⏸️',
};

/**
 * Generates a Gemini-backed CoachX chat response for a coach's question.
 *
 * Builds a structured prompt from the coach's lesson history and client data,
 * then calls Gemini 2.5 Flash for a supportive, data-driven coaching reply.
 * Falls back to the heuristic response if Gemini is unavailable or the call fails.
 *
 * @param userMessage  The coach's question or request
 * @param allLessons   Full lesson history for this coach
 * @param clients      Registered client profiles for this coach
 * @param language     Output language (ko | en | ja)
 */
export const generateCoachXChatResponse = async (
  userMessage: string,
  allLessons: Lesson[],
  clients: ClientProfile[],
  language: CoachXLanguage = 'ko'
): Promise<string> => {
  const fallback = () => generateHeuristicResponse(userMessage, allLessons, clients, language);

  if (!ai) return fallback();

  try {
    const memberCount = new Set(allLessons.map(l => `${l.clientName}_${l.clientPhone}`)).size;

    // Build a concise lesson context (most recent 15 lessons)
    const recentLessons = [...allLessons]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 15);

    const lessonContext = recentLessons.length > 0
      ? recentLessons.map(l => {
          const parts = [`[${l.date}] ${l.title}`];
          if (l.clientName) parts.push(`Member: ${l.clientName}`);
          if (l.coachNotes) parts.push(`Note: ${l.coachNotes}`);
          if (l.tags?.length) parts.push(`Tags: ${l.tags.join(', ')}`);
          return parts.join(' | ');
        }).join('\n')
      : 'No lesson records yet.';

    const clientContext = clients.length > 0
      ? clients.slice(0, 15).map(c => {
          const parts = [c.name];
          if (c.handicap) parts.push(`handicap ${c.handicap}`);
          return parts.join(', ');
        }).join('; ')
      : 'No registered clients.';

    const LANG_INSTRUCTION: Record<CoachXLanguage, string> = {
      ko: '반드시 한국어로 답변하세요.',
      en: 'Respond entirely in English.',
      ja: '必ず日本語で回答してください。',
      th: 'Respond entirely in English.',
    };

    // Load admin-managed system prompt; fall back to built-in if none is active
    const isFirebaseMode = firebaseService.isInitialized();
    const systemPrompt = await promptService.getActiveSystemPrompt('coachx_chat', isFirebaseMode);

    const prompt = `${systemPrompt}

Coach context:
- Total lesson records: ${allLessons.length}
- Total members: ${memberCount}
- Registered clients: ${clientContext}

Recent lesson history (up to 15 most recent):
${lessonContext}

Coach's question: "${userMessage}"

Language instruction: ${LANG_INSTRUCTION[language]}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: prompt }] },
      config: { temperature: 0.7 },
    });

    const text = response.text ?? '';
    if (!text.trim()) throw new Error('Empty response from Gemini');
    return text;
  } catch (error) {
    console.error('CoachX Gemini chat error:', error);
    return fallback();
  }
};

/**
 * Generates Gemini-backed CoachX insights for a coach's home dashboard.
 *
 * Produces richer, more nuanced insights than the heuristic version by using
 * Gemini 2.5 Flash to interpret lesson patterns, member trends, and coaching
 * opportunities. Returns a structured `CoachXInsight[]` array.
 * Falls back to heuristic insights if Gemini is unavailable or parsing fails.
 *
 * @param allLessons   Full lesson history for this coach
 * @param coachProfile Coach profile object
 * @param language     Output language (ko | en | ja)
 */
export const generateCoachXInsights = async (
  allLessons: Lesson[],
  coachProfile: CoachProfile,
  language: CoachXLanguage = 'ko'
): Promise<CoachXInsight[]> => {
  const fallback = () => generateCoachInsights(allLessons, coachProfile, language);

  if (!ai || allLessons.length === 0) return fallback();

  try {
    const memberCount = new Set(allLessons.map(l => `${l.clientName}_${l.clientPhone}`)).size;

    // Summarise topic frequency from all lessons
    const topicCounts: Record<string, number> = {};
    for (const l of allLessons) {
      const text = `${l.title} ${l.coachNotes ?? ''} ${(l.tags ?? []).join(' ')}`.toLowerCase();
      for (const kw of COACHX_TOPIC_KEYWORDS) {
        if (text.includes(kw)) topicCounts[kw] = (topicCounts[kw] ?? 0) + 1;
      }
    }
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `${k}(${v})`)
      .join(', ');

    // Recent activity (last 30 days)
    const cutoff30 = Date.now() - 30 * 86_400_000;
    const recentCount = allLessons.filter(l => l.createdAt >= cutoff30).length;

    // Inactive members (45+ days)
    const clientLastLesson: Record<string, number> = {};
    for (const l of allLessons) {
      const key = `${l.clientName}_${l.clientPhone}`;
      if (!clientLastLesson[key] || l.createdAt > clientLastLesson[key]) {
        clientLastLesson[key] = l.createdAt;
      }
    }
    const staleCutoff = Date.now() - 45 * 86_400_000;
    const staleMembers = Object.entries(clientLastLesson)
      .filter(([, t]) => t < staleCutoff)
      .map(([k]) => k.split('_')[0]);

    const LANG_INSTRUCTION: Record<CoachXLanguage, string> = {
      ko: '반드시 한국어로 작성하세요.',
      en: 'Write entirely in English.',
      ja: '必ず日本語で記述してください。',
      th: 'Write entirely in English.',
    };

    // Load admin-managed system prompt; fall back to built-in if none is active
    const isFirebaseMode = firebaseService.isInitialized();
    const systemPrompt = await promptService.getActiveSystemPrompt('coachx_insights', isFirebaseMode);

    const prompt = `${systemPrompt}

Coach: ${coachProfile.name}
Total lessons: ${allLessons.length} | Members: ${memberCount}
Lessons last 30 days: ${recentCount}
Most frequent lesson topics: ${topTopics || 'none recorded'}
Members inactive 45+ days: ${staleMembers.length > 0 ? staleMembers.slice(0, 5).join(', ') : 'none'}

Language instruction: ${LANG_INSTRUCTION[language]}

Example format:
[
  {"type":"pattern","title":"슬라이스 교정 집중 구간","body":"..."},
  {"type":"attention","title":"High activity members this month","body":"..."}
]`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: prompt }] },
    });

    const text = response.text ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array in Gemini response');

    const parsed: CoachXInsight[] = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty insight array');

    return parsed
      .filter(i => i.title && i.body && COACHX_VALID_INSIGHT_TYPES.has(i.type))
      .map(i => ({ ...i, icon: COACHX_INSIGHT_ICON_MAP[i.type] ?? '💡' }));
  } catch (error) {
    console.error('CoachX Gemini insights error:', error);
    return fallback();
  }
};

/**
 * Generates a Gemini-backed CoachX coach growth profile.
 *
 * Builds on the heuristic `generateCoachGrowthProfile()` result for all
 * deterministic metrics (activity stats, topic breakdown, member trends), then
 * uses Gemini 2.5 Flash to produce:
 *   - Personalised `recommendedActions` grounded in the coach's actual data
 *   - A `geminiSummary` narrative paragraph for the Coach Growth tab
 *
 * Falls back to the heuristic profile if Gemini is unavailable or fails.
 *
 * @param allLessons   Full lesson history for this coach
 * @param clients      Registered client profiles for this coach
 * @param coachProfile Coach profile object
 * @param language     Output language (ko | en | ja)
 */
export const generateCoachXGrowthProfile = async (
  allLessons: Lesson[],
  clients: ClientProfile[],
  coachProfile: CoachProfile,
  language: CoachXLanguage = 'ko'
): Promise<CoachGrowthProfile> => {
  const fallback = () => generateCoachGrowthProfile(allLessons, clients, language);

  if (!ai || allLessons.length === 0) return fallback();

  // Compute the heuristic profile for deterministic metrics
  const heuristicProfile = generateCoachGrowthProfile(allLessons, clients, language);

  try {
    const memberCount = new Set(allLessons.map(l => `${l.clientName}_${l.clientPhone}`)).size;

    const topTopics = heuristicProfile.topicBreakdown
      .slice(0, 5)
      .map(t => `${t.topic}(${t.count})`)
      .join(', ');

    const growthOpp = heuristicProfile.growthOpportunities.join(', ') || 'none identified';

    const { memberTrends } = heuristicProfile;
    const trendSummary = `improving:${memberTrends.improving}, plateau:${memberTrends.plateau}, new:${memberTrends.new}, inactive:${memberTrends.inactive}`;

    const LANG_INSTRUCTION: Record<CoachXLanguage, string> = {
      ko: '반드시 한국어로 작성하세요.',
      en: 'Write entirely in English.',
      ja: '必ず日本語で記述してください。',
      th: 'Write entirely in English.',
    };

    const prompt = `You are CoachX, an AI coaching intelligence assistant for golf coaches.

Coach: ${coachProfile.name}
Total lessons recorded: ${allLessons.length} | Total members: ${memberCount}
Lessons this month: ${heuristicProfile.lessonsThisMonth} | Last month: ${heuristicProfile.lessonsLastMonth}
Active members (last 90 days): ${heuristicProfile.activeMembersCount}
Avg sessions per active member: ${heuristicProfile.avgSessionsPerActiveMember}
Top lesson topics (with frequency): ${topTopics || 'none recorded'}
Potential coaching expansion areas: ${growthOpp}
Member growth trends: ${trendSummary}

Your task is to generate two things:

1. "recommendedActions": array of 3–5 short, supportive, data-driven action strings for the coach.
   - Ground each in the data above; never use generic filler.
   - Tone: supportive and constructive ("this could help" rather than "you are lacking").

2. "geminiSummary": a single paragraph (3–5 sentences) that gives the coach a personalised overview
   of their coaching practice and development direction, referencing their actual stats.
   - Supportive, encouraging, globally appropriate tone.
   - No bullet points; plain prose only.

Rules:
- ${LANG_INSTRUCTION[language]}
- Return ONLY a valid JSON object, nothing else.

Example format:
{
  "recommendedActions": ["Action 1...", "Action 2...", "Action 3..."],
  "geminiSummary": "Your coaching practice this month..."
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: prompt }] },
      config: { temperature: 0.7 },
    });

    const text = response.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object in Gemini response');

    const parsed: { recommendedActions?: string[]; geminiSummary?: string } = JSON.parse(jsonMatch[0]);

    const actions = Array.isArray(parsed.recommendedActions) && parsed.recommendedActions.length > 0
      ? parsed.recommendedActions.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
      : heuristicProfile.recommendedActions;

    const summary = typeof parsed.geminiSummary === 'string' && parsed.geminiSummary.trim().length > 0
      ? parsed.geminiSummary.trim()
      : undefined;

    return {
      ...heuristicProfile,
      recommendedActions: actions,
      geminiSummary: summary,
    };
  } catch (error) {
    console.error('CoachX Gemini growth profile error:', error);
    return fallback();
  }
};
