import { GoogleGenAI } from '@google/genai';
import { classifyBodyType, BodyShapePatternScores } from './bodyAnalysisService';
import {
  ComparisonResult,
  GolfData,
  ShotMetrics,
} from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger('gemini');

// Initialize the Gemini client
// Note: key can come from Vite env directly or process.env replacements from vite.config.
const apiKey =
  import.meta.env.VITE_GEMINI_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.API_KEY;
if (!apiKey) {
  log.warn('Gemini API key is not set. AI features will not work.');
}

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

/**
 * Fetches a blob from a local blob URL
 */
const getBlobFromUrl = async (url: string): Promise<Blob> => {
  const response = await fetch(url);
  return await response.blob();
};

const LONG_FORM_AUDIO_THRESHOLD_BYTES = 20 * 1024 * 1024; // ~20MB+
const MAX_FILE_PROCESSING_RETRIES = 20;
const FILE_PROCESSING_POLL_INTERVAL_MS = 1500;

const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const waitForUploadedFile = async (name: string) => {
  for (let i = 0; i < MAX_FILE_PROCESSING_RETRIES; i++) {
    const file = await ai!.files.get({ name });
    if (file.state === 'ACTIVE' && file.uri) {
      return file;
    }
    if (file.state === 'FAILED') {
      throw new Error('업로드한 오디오 파일 처리에 실패했습니다.');
    }
    await wait(FILE_PROCESSING_POLL_INTERVAL_MS);
  }
  throw new Error('오디오 파일 처리 시간이 초과되었습니다.');
};

const toMediaPart = async (
  blob: Blob,
  mimeType: string,
  uploadedFileNames: string[]
) => {
  // Long-form audio is uploaded as a Gemini file so the full lesson recording can be processed reliably.
  if (mimeType.startsWith('audio/') && blob.size >= LONG_FORM_AUDIO_THRESHOLD_BYTES) {
    const uploaded = await ai!.files.upload({
      file: blob,
      config: { mimeType },
    });

    if (!uploaded.name) {
      throw new Error('오디오 파일 업로드에 실패했습니다.');
    }

    uploadedFileNames.push(uploaded.name);
    const activeFile = await waitForUploadedFile(uploaded.name);

    return {
      fileData: {
        fileUri: activeFile.uri,
        mimeType: activeFile.mimeType || mimeType,
      },
    };
  }

  return fileToGenerativePart(blob, mimeType);
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
      'Gemini API key is not configured. Please set VITE_GEMINI_API_KEY (or GEMINI_API_KEY) in your .env file.'
    );
  }

  const uploadedFileNames: string[] = [];

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
        return toMediaPart(blob, input.mimeType, uploadedFileNames);
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
      3. 코치가 실제로 전달한 교정 포인트를 중심으로 정리하세요.
      4. 정보가 불충분하면 단정하지 말고 "추가 확인이 필요"하다고 부드럽게 표현하세요.
      5. 오디오가 포함된 경우, 반드시 **전체 녹음본이 끝난 뒤 확보된 전체 맥락**을 기준으로 요약하세요.
      6. 여러 미디어/음성 조각이 있어도 최종 결과는 **하나의 통합 레슨 리포트**로 작성하세요.
      7. "AI 분석" 같은 표현 대신 회원에게 공유 가능한 "레슨 리포트" 톤을 유지하세요.
      8. 아래 형식을 준수해 마크다운으로 출력하세요.

      ---

      ## 📝 오늘의 레슨 요약
      (오늘 어떤 동작과 흐름을 중심으로 레슨했는지 3~5문장으로 정리)

      ## 🎯 핵심 코칭 포인트
      - (교정/유지가 필요한 핵심 포인트를 3개 내외로 정리)
      - (각 항목은 회원이 이해하기 쉬운 문장으로 작성)

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
    log.error('Gemini Lesson Summary Error:', error);
    throw error;
  } finally {
    await Promise.allSettled(
      uploadedFileNames.map((name) => ai!.files.delete({ name }))
    );
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
      'Gemini API key is not configured. Please set VITE_GEMINI_API_KEY (or GEMINI_API_KEY) in your .env file.'
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
    log.error('Golf Data Extraction Error:', error);
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
      'Gemini API key is not configured. Please set VITE_GEMINI_API_KEY (or GEMINI_API_KEY) in your .env file.'
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
    log.error('Hole Summary Error:', error);
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
      'Gemini API key is not configured. Please set VITE_GEMINI_API_KEY (or GEMINI_API_KEY) in your .env file.'
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
    log.error('Compare Analysis Error:', error);
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
      'Gemini API key is not configured. Please set VITE_GEMINI_API_KEY (or GEMINI_API_KEY) in your .env file.'
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
    log.error('Body photo analysis failed:', error);
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
      'Gemini API key is not configured. Please set VITE_GEMINI_API_KEY (or GEMINI_API_KEY) in your .env file.'
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
    log.error('Swing Sequence Timestamp Error:', error);
    throw error;
  }
};


// ─── Text-only AI functions are delegated to Claude ──────────────────────────
export {
  generateGolfMissions,
  generateTrainingProgram,
  generateWeeklyInsight,
  generateCoachXChatResponse,
  generateCoachXInsights,
  generateCoachXGrowthProfile,
} from './claudeService';
