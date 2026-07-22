import { classifyBodyType, BodyShapePatternScores } from './bodyAnalysisService';
import {
  ComparisonResult,
  GolfData,
  ClientProfile,
  Lesson,
  Homework,
  ShotMetrics,
  TrainingProgramConfig,
  QuickLogEntry,
  WeeklyInsight,
  MotionCaptureData,
  CoachProfile,
  WeeklySchedule,
  TrainingCategory,
  TrainingDiagnosis,
  ScheduleSession,
  CategoryAllocation,
  DispersionSession,
  ShotDispersionEntry,
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
import { createLogger } from '../utils/logger';

const log = createLogger('gemini');

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

const getAiApiEndpoint = (): string => {
  if (API_BASE) return `${API_BASE}/api/ai/invoke`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/ai/invoke`;
  }
  return '/api/ai/invoke';
};

interface InlineDataPart {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

const invokeBackendAI = async <T>(feature: string, payload: unknown): Promise<T> => {
  const response = await fetch(getAiApiEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feature, payload }),
  });

  let body: { ok?: boolean; result?: T; error?: string } | null = null;
  try {
    body = await response.json() as { ok?: boolean; result?: T; error?: string };
  } catch {
    if (response.ok) {
      throw new Error('Failed to parse AI backend response.');
    }
  }

  if (!response.ok || !body?.ok) {
    const message = body?.error || `AI backend request failed (HTTP ${response.status})`;
    throw new Error(message);
  }

  return body.result as T;
};

const getResponseText = (result: unknown): string | null => {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return null;

  const record = result as Record<string, unknown>;
  if (typeof record.text === 'string') return record.text;
  if (typeof record.response === 'string') return record.response;
  if (typeof record.output === 'string') return record.output;

  return null;
};

const getJsonTextFromResult = (result: unknown): string => {
  const text = getResponseText(result);
  if (text) return text;
  return typeof result === 'object' ? JSON.stringify(result) : '';
};

const parseJsonObjectFromText = (text: string): Record<string, unknown> | null => {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const parseJsonArrayFromText = (text: string): unknown[] | null => {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Fetches a blob from a local blob URL
 */
const getBlobFromUrl = async (url: string): Promise<Blob> => {
  const response = await fetch(url);
  return await response.blob();
};

const toMediaPart = async (blob: Blob, mimeType: string): Promise<InlineDataPart> =>
  fileToGenerativePart(blob, mimeType);

/**
 * Converts a File object or Blob to a Base64 string for backend Agent Runtime calls.
 */
const fileToGenerativePart = async (
  file: Blob,
  mimeType: string
): Promise<InlineDataPart> => {
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

export interface EquipmentPhotoAnalysisResult {
  driverModel?: string;
  ironModel?: string;
  shaftFlex?: string;
  ballBrand?: string;
  summary: string;
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

const toOptionalTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
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

export const parseEquipmentPhotoAnalysisResponse = (
  text: string
): EquipmentPhotoAnalysisResult => {
  const parsed = JSON.parse(text);

  return {
    driverModel: toOptionalTrimmedString(parsed?.driverModel),
    ironModel: toOptionalTrimmedString(parsed?.ironModel),
    shaftFlex: toOptionalTrimmedString(parsed?.shaftFlex),
    ballBrand: toOptionalTrimmedString(parsed?.ballBrand),
    summary:
      toOptionalTrimmedString(parsed?.summary) ??
      '장비 사진 기반 자동 분석 결과입니다.',
  };
};

/**
 * Summarizes multiple golf lesson assets (videos, images, audio) via backend Agent Runtime.
 * Generates a member-facing lesson summary report from coach feedback and media context.
 */
export const analyzeSwingVideo = async (
  mediaInputs: AnalysisInput[],
  userNotes: string,
  swingAngle?: 'FRONT' | 'SIDE'
): Promise<string> => {
  const fallback = () => {
    const note = userNotes?.trim();
    return `## 📝 오늘의 레슨 요약\n\n${
      note ? note : '레슨 요약을 자동 생성하지 못해 코치 메모를 기준으로 저장합니다.'
    }\n\n## 🎯 핵심 코칭 포인트\n- 업로드된 자료를 다시 확인해 핵심 포인트를 정리해 주세요.\n- AI 연동이 설정되면 보다 상세한 리포트를 자동 생성할 수 있습니다.`;
  };

  try {
    // Convert all inputs to generative parts, skipping any that fail to load
    const settled = await Promise.allSettled(
      mediaInputs.map(async (input) => {
        let blob: Blob;
        if (typeof input.data === 'string') {
          blob = await getBlobFromUrl(input.data);
        } else {
          blob = input.data;
        }
        return toMediaPart(blob, input.mimeType);
      })
    );
    const mediaParts = settled
      .filter((r): r is PromiseFulfilledResult<InlineDataPart> => r.status === 'fulfilled')
      .map((r) => r.value);
    settled
      .filter((r) => r.status === 'rejected')
      .forEach((r) => log.error('미디어 로드 실패 (건너뜀):', (r as PromiseRejectedResult).reason));

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

    const result = await invokeBackendAI<unknown>('lesson_summary', {
      prompt,
      mediaParts,
      temperature: 0.4,
    });

    const text = getResponseText(result);
    if (text) return text;
    throw new Error('레슨 요약을 생성하지 못했습니다.');
  } catch (error) {
    log.error('AI Lesson Summary Error:', error);
    return fallback();
  }
};

/**
 * Extracts golf metrics from an image (Launch monitor screen like GDR, Trackman)
 * OR extracts Score from a Scorecard image for a specific user.
 */
const parseDispersionSession = (raw: unknown): DispersionSession | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const club = typeof r.club === 'string' ? r.club.trim() : '';
  const targetDistanceM = toOptionalNumber(r.targetDistanceM);
  const avgPinDistanceM = toOptionalNumber(r.avgPinDistanceM);
  if (!club || targetDistanceM === undefined || avgPinDistanceM === undefined) return null;

  const rawShots = Array.isArray(r.shots) ? r.shots : [];
  const shots: ShotDispersionEntry[] = [];
  for (const s of rawShots) {
    if (!s || typeof s !== 'object') continue;
    const item = s as Record<string, unknown>;
    const shotNo = toOptionalNumber(item.shotNo);
    const pinDistanceM = toOptionalNumber(item.pinDistanceM);
    if (shotNo === undefined || pinDistanceM === undefined) continue;
    shots.push({
      shotNo,
      pinDistanceM,
      hitTarget: typeof item.hitTarget === 'boolean' ? item.hitTarget : undefined,
      sideM: toOptionalNumber(item.sideM),
      carryM: toOptionalNumber(item.carryM),
      totalM: toOptionalNumber(item.totalM),
    });
  }

  const shotCount = toOptionalNumber(r.shotCount) ?? shots.length;
  const hitCount = toOptionalNumber(r.hitCount) ?? shots.filter((s) => s.hitTarget).length;

  const source =
    r.source === 'TRACKMAN' || r.source === 'GDR' || r.source === 'KAKAOVX' || r.source === 'OTHER'
      ? (r.source as DispersionSession['source'])
      : undefined;

  return {
    club,
    targetDistanceM,
    shotCount,
    hitCount,
    avgPinDistanceM,
    shots,
    source,
  };
};

export const extractGolfData = async (
  imageInput: AnalysisInput,
  clientName?: string // Name to search for in scorecard
): Promise<{
  textAnalysis: string;
  golfData: GolfData | null;
  score?: number;
  dispersionSession?: DispersionSession;
}> => {
  try {
    let blob: Blob;
    if (typeof imageInput.data === 'string') {
      blob = await getBlobFromUrl(imageInput.data);
    } else {
      blob = imageInput.data;
    }
    const mediaPart = await fileToGenerativePart(blob, imageInput.mimeType);

    const prompt = `
      이 이미지는 다음 중 하나입니다:
      1. **골프 시뮬레이터/런치모니터(GDR, 카카오VX, 트랙맨, GC Quad, Foresight 등)의 데이터 화면 (단일 샷/평균)**
      2. **골프 스코어카드(필드 또는 스크린 게임 결과)**
      3. **근접샷(Approach/Proximity) 세션 요약 화면** — 특정 목표거리(예: 100m)를 향해 여러 샷을 친 후, 클럽/목표거리/평균 핀 이격거리/타겟 명중률(예: 3/8)/샷별 핀 이격거리 리스트가 표시된 화면. Case 1과 동시에 존재할 수 있습니다.

      이미지를 분석하여 다음 작업을 수행하고 JSON으로 응답해주세요.

      **Case 1: 스코어카드인 경우**
      - 여러 사람의 이름과 점수가 있을 수 있습니다.
      - **대상 사용자 이름**: "${clientName || '사용자'}"
      - 위 이름과 일치하거나 가장 유사한 이름을 찾으세요. (예: "${clientName}" -> "김철수")
      - 그 사람의 **Total Score(총 타수)**를 추출하여 'score' 필드에 넣으세요.
      - 찾을 수 없다면 가장 눈에 띄는(주인공인) 점수를 추출하세요.
      - golfData의 수치들은 null로 두세요.

      **Case 2: 시뮬레이터/런치모니터 데이터인 경우**
      - 화면에 있는 비거리, 스피드 등 수치를 추출하여 'metrics' 객체에 넣으세요.
      - score는 null로 두세요.
      - **여러 샷이 표(테이블) 형태로 나열되어 있고 'Average'(평균) 행이 있다면, 반드시 그 Average 행의 값을 사용하세요.** 개별 샷 번호(1, 2, 3...) 행의 값을 쓰지 마세요.
      - 눈 아이콘이 꺼져있거나(hidden), 취소선이 그어져 회색으로 표시된 행은 분석에서 제외된 샷이므로 무시하고, 이미 계산되어 있는 Average 행 값을 그대로 신뢰하세요.
      - 'Consistency'(일관성) 행은 사용하지 마세요.
      - 컬럼 이름은 장비/화면마다 다르게 표기될 수 있으니 아래 매핑을 참고해 유사한 의미의 컬럼을 찾아 매핑하세요.

      **추출해야 할 데이터 필드 (반드시 아래 영문 Key 사용, 단위 무시, 숫자만. 부호(+/-)가 있는 값은 부호를 유지):**
      - score (스코어카드일 때 총 타수)
      - carryDistance (Carry, 캐리 거리)
      - totalDistance (Total, 총 거리)
      - ballSpeed (Ball Speed, 볼 스피드)
      - clubHeadSpeed (Club Speed, 클럽(헤드) 스피드)
      - launchAngle (Launch Angle, 발사각 — 없다면 생략, Attack Angle과 혼동하지 말 것)
      - attackAngle (Attack Ang./Attack Angle, 어택 앵글)
      - backSpin (Back Spin, 백스핀 — Spin Rate가 백/사이드로 분리되어 있을 때만)
      - sideSpin (Side Spin, 사이드스핀 — Spin Rate가 백/사이드로 분리되어 있을 때만)
      - spinRate (Spin Rate, 스핀량 — 백/사이드 분리 없이 총 스핀량 하나만 있을 때)
      - smashFactor (Smash Factor, 정타율/스매시팩터)
      - clubPath (Club Path, 클럽 패스)
      - dynamicLoft (Dyn. Loft/Dynamic Loft, 다이나믹 로프트)
      - spinLoft (Spin Loft, 스핀 로프트)
      - faceAngle (Face Angle, 페이스 앵글)
      - sideTotal (Side Tot./Side Total, 사이드 토탈 거리 — 오른쪽(R)이면 양수(+), 왼쪽(L)이면 음수(-)로 변환)

      **Case 3(근접샷 세션 요약)일 때 추가로 추출할 데이터** — 화면에 목표거리(예: 100m)와 여러 샷의 핀거리, 명중률이 표시된 경우:
      - dispersionSession.club: 사용 클럽 라벨 그대로 (예: "52°", "PW", "9I")
      - dispersionSession.targetDistanceM: 목표 거리(미터, 숫자만)
      - dispersionSession.shotCount: 총 샷 수. 명중률 표기가 "3/8" 형태면 분모(8)를 사용.
      - dispersionSession.hitCount: 타겟 명중 수. "3/8" 형태면 분자(3).
      - dispersionSession.avgPinDistanceM: 평균 핀 이격거리(미터). "평균 핀으로부터", "Avg Distance to Pin" 등의 라벨.
      - dispersionSession.shots: 화면에 보이는 개별 샷 리스트(순서대로). 각 항목:
        - shotNo: 샷 번호(정수, 화면의 #4/#5 등 그대로)
        - pinDistanceM: 해당 샷의 핀 이격거리(미터)
        - hitTarget: 명중 표시(체크/원형 성공 아이콘)가 있으면 true, 없으면 false, 판별 불가면 생략
        - sideM: 좌우편차가 표시되면 R을 +, L을 -로 (예: 3.2L → -3.2). 없으면 생략.
      - dispersionSession.source: 로고나 UI로 식별 가능한 경우 "TRACKMAN" | "GDR" | "KAKAOVX" | "OTHER". 확신 없으면 "OTHER".
      - Case 3에서도 화면 상단에 현재/평균 샷의 탄도 수치(캐리, 볼스피드 등)가 함께 있으면 metrics에도 채워주세요. (Case 1과 병렬)

      **응답 형식 (JSON, 필드는 이미지에서 확인 가능한 것만 포함. dispersionSession은 Case 3일 때만 포함):**
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
          "attackAngle": -0.8,
          "spinRate": 4195,
          "clubPath": -0.1,
          "dynamicLoft": 21.7,
          "spinLoft": 22.7,
          "sideTotal": 12.7
        },
        "dispersionSession": {
          "club": "52°",
          "targetDistanceM": 100,
          "shotCount": 8,
          "hitCount": 3,
          "avgPinDistanceM": 9.2,
          "shots": [
            { "shotNo": 4, "pinDistanceM": 8.2, "hitTarget": true },
            { "shotNo": 5, "pinDistanceM": 10.4, "hitTarget": true },
            { "shotNo": 6, "pinDistanceM": 5.8, "hitTarget": true },
            { "shotNo": 7, "pinDistanceM": 8.5, "hitTarget": true }
          ],
          "source": "TRACKMAN"
        },
        "comment": "스코어카드: 김철수님의 기록은 85타입니다. / 시뮬레이터: 볼 스피드가 아주 훌륭합니다."
      }
      \`\`\`
    `;

    const result = await invokeBackendAI<unknown>('extract_golf_data', {
      prompt,
      mediaParts: [mediaPart],
      responseMimeType: 'application/json',
    });
    const text = getJsonTextFromResult(result);
    if (!text) throw new Error('분석 실패');

    const parsedResult = JSON.parse(text);
    const dispersionSession = parseDispersionSession(parsedResult.dispersionSession);
    return {
      textAnalysis: parsedResult.comment,
      golfData: parsedResult.metrics,
      score: parsedResult.score,
      ...(dispersionSession ? { dispersionSession } : {}),
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

    const result = await invokeBackendAI<unknown>('hole_voice_summary', {
      prompt,
      mediaParts: [mediaPart],
      responseMimeType: 'application/json',
    });
    const text = getJsonTextFromResult(result);
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
  const fallback = (): ComparisonResult => ({
    improvementScore: 50,
    summary: 'AI 비교 분석을 사용할 수 없어 기본 비교 결과를 제공합니다.',
    keyChanges: ['비교 대상 레슨의 핵심 포인트를 수동으로 확인해 주세요.'],
    coachComment: '현재 AI 백엔드 연결이 없어 자동 비교 분석을 생성하지 못했습니다.',
  });

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

    const result = await invokeBackendAI<unknown>('compare_swings', {
      prompt: prompt + commonPrompt,
      mediaParts: [
        oldMediaPart,
        newMediaPart,
      ],
      metadata: { oldDate, newDate },
      responseMimeType: 'application/json',
    });
    const text = getJsonTextFromResult(result);
    if (!text) throw new Error('No response from AI');

    return JSON.parse(text) as ComparisonResult;
  } catch (error) {
    log.error('AI Compare Analysis Error:', error);
    return fallback();
  }
};

/**
 * 정면/측면 전신 사진 2장을 분석해 신체분석 입력값을 자동 생성합니다.
 */
export const analyzeBodyPhotos = async (params: {
  frontImage: AnalysisInput;
  sideImage: AnalysisInput;
}): Promise<BodyPhotoAnalysisResult> => {
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

    const result = await invokeBackendAI<unknown>('analyze_body_photos', {
      prompt,
      mediaParts: [frontPart, sidePart],
      responseMimeType: 'application/json',
    });
    const text = getJsonTextFromResult(result);
    if (!text) {
      throw new Error('신체 사진 분석 결과를 생성하지 못했습니다.');
    }

    return parseBodyPhotoAnalysisResponse(text);
  } catch (error) {
    log.error('AI body photo analysis failed:', error);
    throw error;
  }
};

export const analyzeEquipmentPhoto = async (
  imageInput: AnalysisInput
): Promise<EquipmentPhotoAnalysisResult> => {
  try {
    const blob =
      typeof imageInput.data === 'string'
        ? await getBlobFromUrl(imageInput.data)
        : imageInput.data;
    const mediaPart = await fileToGenerativePart(blob, imageInput.mimeType);

    const prompt = `
      너는 골프 장비 식별 보조 AI다.
      입력된 이미지는 골퍼의 장비 사진이다.

      이미지에서 확인 가능한 정보만 바탕으로 아래 JSON만 출력해라.
      {
        "driverModel": string | null,
        "ironModel": string | null,
        "shaftFlex": string | null,
        "ballBrand": string | null,
        "summary": string
      }

      규칙:
      - driverModel: 드라이버 헤드/커버/라벨에서 식별 가능한 모델명
      - ironModel: 아이언 세트 또는 아이언 헤드에서 식별 가능한 모델명
      - shaftFlex: 샤프트 강도 표기 (예: L, A, R, SR, S, X)
      - ballBrand: 골프공 브랜드/라인명
      - 식별이 어렵거나 보이지 않으면 null
      - summary는 한국어 1~2문장으로, 어떤 항목을 식별했는지 간단히 설명
      - 추정이 불확실하면 단정하지 말고 "확인 필요"처럼 표현
      - 코드블록 없이 순수 JSON만 반환
    `;

    const result = await invokeBackendAI<unknown>('analyze_equipment_photo', {
      prompt,
      mediaParts: [mediaPart],
      responseMimeType: 'application/json',
    });
    const text = getJsonTextFromResult(result);
    if (!text) {
      throw new Error('장비 사진 분석 결과를 생성하지 못했습니다.');
    }

    return parseEquipmentPhotoAnalysisResponse(text);
  } catch (error) {
    log.error('AI equipment photo analysis failed:', error);
    throw error;
  }
};

/**
 * Identifies the timestamps for 8 key swing phases using backend AI runtime.
 */
export const getSwingPhaseTimestamps = async (
  videoBlob: Blob
): Promise<{ label: string; time: number }[]> => {
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

    const result = await invokeBackendAI<unknown>('swing_phase_timestamps', {
      prompt,
      mediaParts: [mediaPart],
      responseMimeType: 'application/json',
    });
    const text = getJsonTextFromResult(result);
    if (!text) throw new Error('AI analysis failed');

    const parsedResult = JSON.parse(text);

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

    const timestamps = Object.keys(parsedResult)
      .map((key) => ({
        label: mapping[key] || key,
        time: parseFloat(parsedResult[key]),
      }))
      .filter((item) => !isNaN(item.time));

    return timestamps;
  } catch (error) {
    log.error('Swing Sequence Timestamp Error:', error);
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

    const result = await invokeBackendAI<unknown>('golf_missions', {
      prompt,
      responseMimeType: 'application/json',
    });
    const text = getJsonTextFromResult(result);
    if (!text) throw new Error('Mission generation failed');

    return JSON.parse(text) as string[];
  } catch (error) {
    log.error('Generate Missions Error:', error);
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
  // Fallback plan used when AI runtime is unavailable or when there are too few lesson records.
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

    const result = await invokeBackendAI<unknown>('training_program', { prompt });
    const text = getResponseText(result);
    if (!text) throw new Error('Training program generation failed');
    return text;
  } catch (error) {
    log.error('Generate Training Program Error:', error);
    return fallbackPlan(config.performanceGoal);
  }
};

// ── Weekly Schedule Generator ────────────────────────────────────────────────

const CATEGORY_LABELS: Record<TrainingCategory, string> = {
  SHORT_GAME: '숏게임',
  PUTTING: '퍼팅',
  CONTROL_SHOT: '컨트롤 샷',
  SWING: '스윙',
  TARGETING: '타겟팅',
  BALL_FLIGHT: '구질 구현',
  REST: '휴식',
};

const CATEGORY_KEYS: TrainingCategory[] = [
  'SHORT_GAME',
  'PUTTING',
  'CONTROL_SHOT',
  'SWING',
  'TARGETING',
  'BALL_FLIGHT',
  'REST',
];

const isTrainingCategory = (value: unknown): value is TrainingCategory =>
  typeof value === 'string' && (CATEGORY_KEYS as string[]).includes(value);

const roundToHalfHour = (minutes: number): number =>
  Math.max(30, Math.round(minutes / 30) * 30);

const summariseAllocations = (sessions: ScheduleSession[]): CategoryAllocation[] => {
  const totals = new Map<TrainingCategory, number>();
  for (const s of sessions) {
    totals.set(s.category, (totals.get(s.category) ?? 0) + s.durationMinutes);
  }
  const total = Array.from(totals.values()).reduce((a, b) => a + b, 0) || 1;
  return Array.from(totals.entries())
    .map(([category, minutes]) => ({
      category,
      minutes,
      ratio: minutes / total,
    }))
    .sort((a, b) => b.minutes - a.minutes);
};

/** Simple heuristic diagnosis used when the AI backend is unavailable. */
const buildHeuristicDiagnosis = (
  lessons: Lesson[],
  quickLogs: QuickLogEntry[],
): TrainingDiagnosis => {
  const areaCounts = new Map<TrainingCategory, number>();
  const bump = (cat: TrainingCategory) =>
    areaCounts.set(cat, (areaCounts.get(cat) ?? 0) + 1);

  for (const l of lessons.slice(0, 20)) {
    const text = `${l.title ?? ''} ${l.coachNotes ?? ''} ${l.aiAnalysis ?? ''} ${(l.tags ?? []).join(' ')}`;
    if (/퍼팅|putt/i.test(text)) bump('PUTTING');
    if (/어프로치|칩|피치|숏게임|웨지/.test(text)) bump('SHORT_GAME');
    if (/드라이버|스윙|톱|다운스윙|피니시/.test(text)) bump('SWING');
    if (/방향|타겟|얼라인|정확/.test(text)) bump('TARGETING');
    if (/슬라이스|훅|드로|페이드|구질|페이스|패스/.test(text)) bump('BALL_FLIGHT');
    if (/거리|컨트롤/.test(text)) bump('CONTROL_SHOT');
  }
  for (const q of quickLogs.slice(0, 30)) {
    if (q.practiceArea === 'PUTTING') bump('PUTTING');
    if (q.practiceArea === 'SHORT_GAME') bump('SHORT_GAME');
    if (q.practiceArea === 'DRIVER' || q.practiceArea === 'IRON') bump('SWING');
    if (/슬라이스|훅|드로|페이드/.test(q.problemPoint ?? '')) bump('BALL_FLIGHT');
  }

  const max = Math.max(1, ...Array.from(areaCounts.values()));
  const weakAreas = Array.from(areaCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category, count]) => ({
      category,
      reason: `최근 기록에서 ${CATEGORY_LABELS[category]} 관련 언급 ${count}회`,
      severity: count / max,
    }));

  return {
    summary:
      lessons.length + quickLogs.length === 0
        ? '분석할 기록이 부족합니다. 기본 밸런스 프로그램을 제안합니다.'
        : `최근 레슨 ${lessons.length}건, 빠른기록 ${quickLogs.length}건을 기반으로 진단했습니다.`,
    weakAreas,
    strengths: [],
  };
};

/** Build a default weekly grid modelled on the reference document (short 70% / long 30%). */
const buildFallbackSchedule = (config: TrainingProgramConfig): WeeklySchedule => {
  const totalMinutesTarget = config.frequencyPerWeek * config.sessionDurationMinutes;
  // Reference blueprint: 40h/week distribution used as ratios.
  const referenceRatios: Record<TrainingCategory, number> = {
    PUTTING: 6 / 40,
    SHORT_GAME: 20 / 40,
    CONTROL_SHOT: 2 / 40,
    SWING: 5 / 40,
    TARGETING: 5 / 40,
    BALL_FLIGHT: 2 / 40,
    REST: 0,
  };

  const days = Math.min(config.frequencyPerWeek, 6);
  const sessions: ScheduleSession[] = [];
  const order: TrainingCategory[] = [
    'SHORT_GAME',
    'PUTTING',
    'SWING',
    'TARGETING',
    'CONTROL_SHOT',
    'BALL_FLIGHT',
  ];

  let cursor = 0;
  for (let day = 0; day < days; day++) {
    const category = order[cursor % order.length];
    cursor++;
    sessions.push({
      id: `sess_${day}_${cursor}`,
      dayOfWeek: day,
      startTime: '10:00',
      durationMinutes: config.sessionDurationMinutes,
      category,
      label: CATEGORY_LABELS[category],
    });
  }

  const allocations = CATEGORY_KEYS.filter((c) => c !== 'REST').map((category) => {
    const minutes = Math.round(referenceRatios[category] * totalMinutesTarget);
    return {
      category,
      minutes,
      ratio: totalMinutesTarget > 0 ? minutes / totalMinutesTarget : 0,
    };
  });

  return {
    totalMinutes: sessions.reduce((sum, s) => sum + s.durationMinutes, 0),
    allocations,
    sessions,
    overview: '기록이 부족하여 기본 밸런스 스케줄을 제안합니다. 코치가 편집해 주세요.',
  };
};

const summariseLessonsForSchedule = (lessons: Lesson[]): string => {
  if (!lessons.length) return '레슨 기록 없음';
  return lessons
    .slice(0, 12)
    .map((l, i) => {
      const parts: string[] = [`#${i + 1} ${l.date} · ${l.title ?? ''}`];
      if (l.coachNotes) parts.push(`코치메모: ${l.coachNotes.slice(0, 140)}`);
      if (l.aiAnalysis) parts.push(`AI: ${l.aiAnalysis.slice(0, 140)}`);
      if (l.golfData?.carryDistance) parts.push(`캐리 ${l.golfData.carryDistance}m`);
      if (l.tags?.length) parts.push(`태그: ${l.tags.join(',')}`);
      return parts.join(' | ');
    })
    .join('\n');
};

const summariseQuickLogs = (logs: QuickLogEntry[]): string => {
  if (!logs.length) return '빠른기록 없음';
  return logs
    .slice(0, 15)
    .map(
      (q) =>
        `${q.logDate} [${q.mood}] 잘된점: ${q.goodPoint} / 문제점: ${q.problemPoint}${
          q.practiceArea ? ` (연습:${q.practiceArea})` : ''
        }`,
    )
    .join('\n');
};

/** Parse whatever the AI returns into a WeeklySchedule, tolerating small shape drift. */
const coerceWeeklySchedule = (
  raw: Record<string, unknown> | null,
  config: TrainingProgramConfig,
): WeeklySchedule | null => {
  if (!raw) return null;
  const sessionsRaw = Array.isArray(raw.sessions) ? raw.sessions : null;
  if (!sessionsRaw) return null;

  const sessions: ScheduleSession[] = [];
  sessionsRaw.forEach((entry, idx) => {
    if (!entry || typeof entry !== 'object') return;
    const rec = entry as Record<string, unknown>;
    const dayOfWeek = Number(rec.dayOfWeek);
    const durationMinutes = roundToHalfHour(Number(rec.durationMinutes) || config.sessionDurationMinutes);
    const startTime =
      typeof rec.startTime === 'string' && /^\d{2}:\d{2}$/.test(rec.startTime)
        ? rec.startTime
        : '10:00';
    const category: TrainingCategory = isTrainingCategory(rec.category)
      ? rec.category
      : 'SHORT_GAME';
    if (Number.isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return;

    sessions.push({
      id: typeof rec.id === 'string' ? rec.id : `sess_${idx}_${Date.now()}`,
      dayOfWeek,
      startTime,
      durationMinutes,
      category,
      label: typeof rec.label === 'string' && rec.label ? rec.label : CATEGORY_LABELS[category],
      note: typeof rec.note === 'string' ? rec.note : undefined,
    });
  });

  if (!sessions.length) return null;

  const allocations = summariseAllocations(sessions);
  return {
    totalMinutes: sessions.reduce((sum, s) => sum + s.durationMinutes, 0),
    allocations,
    sessions,
    overview: typeof raw.overview === 'string' ? raw.overview : undefined,
  };
};

const coerceDiagnosis = (raw: Record<string, unknown> | null): TrainingDiagnosis | null => {
  if (!raw) return null;
  const summary = typeof raw.summary === 'string' ? raw.summary : '';
  const weakRaw = Array.isArray(raw.weakAreas) ? raw.weakAreas : [];
  const strengthsRaw = Array.isArray(raw.strengths) ? raw.strengths : [];
  const weakAreas = weakRaw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const rec = entry as Record<string, unknown>;
      if (!isTrainingCategory(rec.category)) return null;
      const severityNum = Number(rec.severity);
      return {
        category: rec.category,
        reason: typeof rec.reason === 'string' ? rec.reason : '',
        severity: Number.isFinite(severityNum) ? Math.max(0, Math.min(1, severityNum)) : 0.5,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
  const strengths = strengthsRaw
    .map((s) => (typeof s === 'string' ? s : ''))
    .filter((s) => s.length > 0);
  if (!summary && !weakAreas.length) return null;
  return { summary, weakAreas, strengths };
};

export interface WeeklyScheduleResult {
  schedule: WeeklySchedule;
  diagnosis: TrainingDiagnosis;
}

/**
 * Analyses a student's records (lessons + quick logs) and produces a
 * data-driven weekly training schedule the coach can edit.
 */
export const generateWeeklySchedule = async (
  profile: ClientProfile,
  lessons: Lesson[],
  quickLogs: QuickLogEntry[],
  config: TrainingProgramConfig,
): Promise<WeeklyScheduleResult> => {
  const fallback = (): WeeklyScheduleResult => ({
    schedule: buildFallbackSchedule(config),
    diagnosis: buildHeuristicDiagnosis(lessons, quickLogs),
  });

  try {
    const totalWeeklyMinutes = config.frequencyPerWeek * config.sessionDurationMinutes;
    const lessonContext = summariseLessonsForSchedule(lessons);
    const quickContext = summariseQuickLogs(quickLogs);
    const profileInfo = [
      `이름: ${profile.name}`,
      profile.handicap != null ? `핸디캡: ${profile.handicap}` : '핸디캡 정보 없음',
      profile.bestScore != null ? `라베: ${profile.bestScore}` : '',
      profile.memo ? `메모: ${profile.memo}` : '',
    ]
      .filter(Boolean)
      .join('\n- ');

    const prompt = `당신은 골프 코치 AI입니다. 학생의 기록을 분석해 데이터 기반의 주간 훈련 스케줄을 JSON으로 생성합니다.

**핵심 원칙:**
- 참고 훈련 비율: 숏게임 70% / 롱게임 30% (숏게임 = SHORT_GAME + PUTTING + CONTROL_SHOT).
- 학생의 약점이 뚜렷하면 해당 카테고리 시간을 15~30% 늘려 균형을 조정합니다.
- 사이클: 분석 → 피드백 → 솔루션 → 재분석.

**회원 정보:**
- ${profileInfo}

**프로그램 설정:**
- 기간: ${config.startDate} ~ ${config.endDate}
- 주간 훈련 빈도: ${config.frequencyPerWeek}회
- 회당 훈련 시간: ${config.sessionDurationMinutes}분 (총 주간 ${totalWeeklyMinutes}분)
- 향상 목표: ${config.performanceGoal}

**최근 레슨 기록:**
${lessonContext}

**최근 학생 빠른기록:**
${quickContext}

**출력 형식:** 아래 JSON 스키마만 반환하세요. 다른 텍스트/마크다운 금지.
{
  "diagnosis": {
    "summary": "학생의 현재 상태 요약 (한국어, 2~3문장)",
    "weakAreas": [
      { "category": "SHORT_GAME | PUTTING | CONTROL_SHOT | SWING | TARGETING | BALL_FLIGHT", "reason": "근거 (한국어)", "severity": 0.0~1.0 }
    ],
    "strengths": ["유지할 강점 (한국어)"]
  },
  "schedule": {
    "overview": "이번 주 전체 방향 (한국어)",
    "sessions": [
      {
        "dayOfWeek": 0~6 (0=월,6=일),
        "startTime": "HH:MM",
        "durationMinutes": 30 단위 정수,
        "category": "SHORT_GAME | PUTTING | CONTROL_SHOT | SWING | TARGETING | BALL_FLIGHT",
        "label": "셀에 표시할 짧은 이름 (한국어)",
        "note": "코치 참고용 상세 (한국어, 옵션)"
      }
    ]
  }
}

**세션 생성 지침:**
- 총 세션 수 ≒ ${config.frequencyPerWeek} (허용범위 ±1).
- 각 세션 duration ≒ ${config.sessionDurationMinutes}분 (30/60/90 등).
- 약점 카테고리는 최소 1회 이상 등장.
- 참고 스케줄 예시 (오전 10-12시 숏게임, 12-13시 퍼팅, 14-15시 스윙, 15-16시 타겟팅 등)를 참고하되 학생 기록에 맞게 조정.
`;

    const result = await invokeBackendAI<unknown>('training_program', { prompt });
    const text = getJsonTextFromResult(result);
    const parsed = parseJsonObjectFromText(text);
    if (!parsed) throw new Error('Weekly schedule JSON parse failed');

    const diagnosis =
      coerceDiagnosis(parsed.diagnosis as Record<string, unknown> | null) ??
      buildHeuristicDiagnosis(lessons, quickLogs);
    const schedule =
      coerceWeeklySchedule(parsed.schedule as Record<string, unknown> | null, config) ??
      buildFallbackSchedule(config);

    return { schedule, diagnosis };
  } catch (error) {
    log.error('generateWeeklySchedule error:', error);
    return fallback();
  }
};

/** Recompute the allocation summary — used after a coach edits the grid. */
export const recomputeScheduleAllocations = (schedule: WeeklySchedule): WeeklySchedule => {
  const allocations = summariseAllocations(schedule.sessions);
  return {
    ...schedule,
    totalMinutes: schedule.sessions.reduce((sum, s) => sum + s.durationMinutes, 0),
    allocations,
  };
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

  if (logs.length === 0) return fallback();

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

    const result = await invokeBackendAI<unknown>('weekly_insight', { prompt });
    const text = getResponseText(result);
    const parsed = (text ? parseJsonObjectFromText(text) : result) as Record<string, unknown> | null;
    if (!parsed || !parsed.summary || !Array.isArray(parsed.keyPatterns) || !parsed.recommendedFocus) {
      throw new Error('Invalid JSON structure');
    }
    return {
      summary: parsed.summary as string,
      keyPatterns: parsed.keyPatterns as string[],
      recommendedFocus: parsed.recommendedFocus as string,
    };
  } catch (error) {
    log.error('Generate Weekly Insight Error:', error);
    return fallback();
  }
};

// ─── CoachX runtime-backed intelligence ────────────────────────────────────────

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
 * Generates a runtime-backed CoachX chat response for a coach's question.
 *
 * Builds a structured prompt from the coach's lesson history and client data,
 * then calls backend Agent Runtime for a supportive, data-driven coaching reply.
 * Falls back to the heuristic response if runtime is unavailable or the call fails.
 *
 * @param userMessage      The coach's question or request
 * @param allLessons       Full lesson history for this coach
 * @param clients          Registered client profiles for this coach
 * @param language         Output language (ko | en | ja)
 * @param conversationHistory  Prior chat turns (role + content) for multi-turn context
 */
export const generateCoachXChatResponse = async (
  userMessage: string,
  allLessons: Lesson[],
  clients: ClientProfile[],
  language: CoachXLanguage = 'ko',
  conversationHistory: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<string> => {
  const fallback = () => generateHeuristicResponse(userMessage, allLessons, clients, language);

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

    // Format prior conversation turns (exclude the current message; last 10 turns max)
    const historyToInclude = conversationHistory.slice(-10);
    const conversationBlock = historyToInclude.length > 0
      ? '\nConversation history (oldest → newest):\n' +
        historyToInclude
          .map(m => `${m.role === 'user' ? 'Coach' : 'CoachX'}: ${m.content}`)
          .join('\n') +
        '\n'
      : '';

    const prompt = `${systemPrompt}

--- Provided data (answer ONLY from this) ---
Coach context:
- Total lesson records: ${allLessons.length}
- Total members: ${memberCount}
- Registered clients: ${clientContext}

Recent lesson history (up to 15 most recent):
${lessonContext}
${conversationBlock}
--- End of provided data ---

Coach's question: "${userMessage}"

IMPORTANT: Answer strictly based on the provided data and conversation history above.
Do not introduce topics unrelated to the conversation or golf coaching.
Language instruction: ${LANG_INSTRUCTION[language]}`;

    const result = await invokeBackendAI<unknown>('coachx_chat', {
      prompt,
      temperature: 0.7,
      language,
    });
    const text = getResponseText(result) ?? '';
    if (!text.trim()) throw new Error('Empty response from Gemini');
    return text;
  } catch (error) {
    log.error('CoachX runtime chat error:', error);
    return fallback();
  }
};

/**
 * Generates runtime-backed CoachX insights for a coach's home dashboard.
 *
 * Produces richer, more nuanced insights than the heuristic version by using
 * backend runtime to interpret lesson patterns, member trends, and coaching
 * opportunities. Returns a structured `CoachXInsight[]` array.
 * Falls back to heuristic insights if runtime is unavailable or parsing fails.
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

  if (allLessons.length === 0) return fallback();

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

    const result = await invokeBackendAI<unknown>('coachx_insights', { prompt, language });
    const text = getResponseText(result);
    const parsed = (text ? parseJsonArrayFromText(text) : result) as CoachXInsight[] | null;
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty insight array');

    return parsed
      .filter(i => i.title && i.body && COACHX_VALID_INSIGHT_TYPES.has(i.type))
      .map(i => ({ ...i, icon: COACHX_INSIGHT_ICON_MAP[i.type] ?? '💡' }));
  } catch (error) {
    log.error('CoachX runtime insights error:', error);
    return fallback();
  }
};

/**
 * Generates a runtime-backed CoachX coach growth profile.
 *
 * Builds on the heuristic `generateCoachGrowthProfile()` result for all
 * deterministic metrics (activity stats, topic breakdown, member trends), then
 * uses backend runtime to produce:
 *   - Personalised `recommendedActions` grounded in the coach's actual data
 *   - A `geminiSummary` narrative paragraph for the Coach Growth tab
 *
 * Falls back to the heuristic profile if runtime is unavailable or fails.
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

  if (allLessons.length === 0) return fallback();

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

    const result = await invokeBackendAI<unknown>('coachx_growth_profile', {
      prompt,
      temperature: 0.7,
      language,
    });
    const text = getResponseText(result);
    const parsed = (text
      ? parseJsonObjectFromText(text)
      : result) as { recommendedActions?: string[]; geminiSummary?: string } | null;
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid growth profile response');
    }

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
    log.error('CoachX runtime growth profile error:', error);
    return fallback();
  }
};

/**
 * Analyzes motion capture screenshots (K-Motion, 3D tracking systems) to extract
 * body movement measurements and provide golf coaching analysis.
 */
export const analyzeMotionCapture = async (
  imageInputs: AnalysisInput[],
  coachNotes?: string
): Promise<MotionCaptureData> => {
  const mediaParts = await Promise.all(
    imageInputs.map(async (input) => {
      const blob = typeof input.data === 'string'
        ? await getBlobFromUrl(input.data)
        : input.data;
      return fileToGenerativePart(blob, input.mimeType);
    })
  );

  const prompt = `
이 이미지들은 골프 스윙 3D 모션 캡처 시스템(K-Motion, Swing Catalyst 등)의 화면 캡처입니다.
화면 오른쪽 패널에는 스켈레톤 모델과 다음 7가지 측정값이 표시됩니다:
- 고개가 앞으로 쏠림 (Head forward tilt, cm, 방향: 앞/뒤)
- 머리 좌우로 흔들림 (Head lateral sway, cm, 방향: 좌/우/정)
- 상체 상부 밀림 (Upper body forward push, cm, 방향: 앞/뒤/정)
- 머리 들림 (Head lift/dip, cm, 방향: 상/하)
- 상체 상부 좌우 이동 (Upper body lateral move, cm, 방향: 좌/우/정)
- 골반 밀림 (Hip slide, cm, 방향: 앞/뒤/정)
- 상체 상부 들림 (Upper body rise, cm, 방향: 상/하)

각 이미지의 화면 하단 타임라인에서 현재 시간(초)을 읽을 수 있습니다.

**지시사항:**
1. 각 이미지에서 위 7가지 측정값과 타임라인 시간을 추출하세요.
2. 방향 텍스트를 부호로 변환하세요: 앞/우/상 = 양수, 뒤/좌/하/정 = 0 또는 음수 (정은 0).
3. 스윙 단계는 타임라인 시간을 기준으로 추정하세요 (예: 0초 근처 = 어드레스 또는 임팩트, 음수 = 백스윙).
4. 측정값을 바탕으로 골프 코칭 분석을 마크다운으로 작성하세요.
${coachNotes ? `\n코치 메모: "${coachNotes}"` : ''}

**응답은 반드시 아래 JSON 형식으로만 출력하세요 (다른 텍스트 없이):**
{
  "measurements": [
    {
      "swingPhase": "스윙 단계명",
      "timeSeconds": 0.0,
      "headForwardTilt": 0,
      "headLateralSway": 0,
      "upperBodyPush": 0,
      "headLift": 0,
      "upperBodyLateralMove": 0,
      "hipSlide": 0,
      "upperBodyLift": 0
    }
  ],
  "aiAnalysis": "## 모션 데이터 분석\\n\\n[마크다운 형식의 코칭 피드백]"
}

aiAnalysis에는 다음을 포함하세요:
- 주요 이슈 (수치가 큰 항목 중심)
- 스윙 단계별 주목할 패턴
- 구체적인 교정 방향 및 연습 방법
- 전반적인 평가 (회원 친화적 톤)
`;

  try {
    const result = await invokeBackendAI<unknown>('motion_capture_analysis', {
      prompt,
      mediaParts,
      temperature: 0.3,
      responseMimeType: 'application/json',
    });

    const text = getResponseText(result);
    const parsed = text ? parseJsonObjectFromText(text) : (result as Record<string, unknown> | null);

    if (parsed && Array.isArray(parsed.measurements) && typeof parsed.aiAnalysis === 'string') {
      return {
        measurements: parsed.measurements as MotionCaptureData['measurements'],
        aiAnalysis: parsed.aiAnalysis,
        analyzedAt: Date.now(),
      };
    }
    throw new Error('Invalid motion capture response format');
  } catch (error) {
    log.error('Motion capture analysis error:', error);
    return {
      measurements: [],
      aiAnalysis: '## 모션 데이터 분석\n\n이미지에서 모션 데이터를 추출하지 못했습니다. 이미지가 K-Motion 또는 유사한 3D 모션 캡처 시스템의 화면인지 확인해주세요.',
      analyzedAt: Date.now(),
    };
  }
};

export interface TrackmanScreenAnalysisResult {
  clubSpeed?: number;
  ballSpeed?: number;
  smashFactor?: number;
  launchAngle?: number;
  spinRate?: number;
  carryDistance?: number;
  totalDistance?: number;
}

const parseTrackmanScreenResponse = (text: string): TrackmanScreenAnalysisResult => {
  try {
    const parsed = JSON.parse(text);
    const toNum = (v: unknown): number | undefined => {
      const n = typeof v === 'string' ? parseFloat(v) : Number(v);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    return {
      clubSpeed: toNum(parsed?.clubSpeed),
      ballSpeed: toNum(parsed?.ballSpeed),
      smashFactor: toNum(parsed?.smashFactor),
      launchAngle: toNum(parsed?.launchAngle),
      spinRate: toNum(parsed?.spinRate),
      carryDistance: toNum(parsed?.carryDistance),
      totalDistance: toNum(parsed?.totalDistance),
    };
  } catch {
    return {};
  }
};

export const analyzeTrackmanScreen = async (
  imageInput: AnalysisInput
): Promise<TrackmanScreenAnalysisResult> => {
  try {
    const blob =
      typeof imageInput.data === 'string'
        ? await getBlobFromUrl(imageInput.data)
        : imageInput.data;
    const mediaPart = await fileToGenerativePart(blob, imageInput.mimeType);

    const prompt = `
      너는 골프 런치 모니터(트랙맨, GC Quad, Foresight 등) 화면에서 수치를 읽어내는 AI다.
      입력된 이미지는 런치 모니터 화면 캡처 또는 사진이다.

      화면에 표시된 수치를 정확히 읽어 아래 JSON만 출력해라.
      숫자를 읽을 수 없거나 해당 항목이 없으면 null로 표기해라.

      {
        "clubSpeed": number | null,
        "ballSpeed": number | null,
        "smashFactor": number | null,
        "launchAngle": number | null,
        "spinRate": number | null,
        "carryDistance": number | null,
        "totalDistance": number | null
      }

      각 필드 설명:
      - clubSpeed: 클럽 헤드 스피드 (m/s 또는 mph — 화면 단위 그대로 읽어라, mph이면 m/s로 변환하지 말 것)
      - ballSpeed: 볼 스피드 (m/s 또는 mph)
      - smashFactor: 스매시 팩터 (소수점 2~3자리, 보통 1.2~1.5 범위)
      - launchAngle: 발사각 (도, °)
      - spinRate: 스핀 (rpm)
      - carryDistance: 캐리 거리 (m 또는 yards — 화면 단위 그대로)
      - totalDistance: 토탈 거리 (m 또는 yards)

      규칙:
      - 화면에 표시된 숫자를 그대로 읽어라. 단위 변환하지 마라.
      - 숫자 외에 다른 텍스트는 출력하지 마라.
      - 코드블록 없이 순수 JSON만 반환해라.
    `;

    const result = await invokeBackendAI<unknown>('analyze_trackman_screen', {
      prompt,
      mediaParts: [mediaPart],
      responseMimeType: 'application/json',
    });
    const text = getJsonTextFromResult(result);
    if (!text) return {};
    return parseTrackmanScreenResponse(text);
  } catch (error) {
    log.error('AI trackman screen analysis failed:', error);
    return {};
  }
};

const DAY_LABELS: Record<string, string> = {
  mon: '월요일', tue: '화요일', wed: '수요일', thu: '목요일',
  fri: '금요일', sat: '토요일', sun: '일요일',
};

const buildRichGolferContext = (
  myLessons: Lesson[],
  quickLogs: QuickLogEntry[],
  homeworkList: Homework[],
  clientProfile: ClientProfile
): string => {
  const sections: string[] = [];

  // Body analysis (from profile or most recent lesson that has it)
  const bodyAnalysis =
    clientProfile.memberBodyAnalysis ??
    myLessons.find(l => l.memberBodyAnalysis)?.memberBodyAnalysis;
  if (bodyAnalysis) {
    const highImpactFactors = bodyAnalysis.structuralFactors
      ?.filter(f => f.impact === '상' || f.impact === '하')
      .map(f => `${f.name}(${f.impact})`)
      .join(', ');
    const lines = [
      `체형: ${bodyAnalysis.bodyType} | 스윙 유형: ${bodyAnalysis.swingType}`,
    ];
    if (highImpactFactors) lines.push(`주요 구조 특성: ${highImpactFactors}`);
    if (bodyAnalysis.coachComment) lines.push(`코치 의견: ${bodyAnalysis.coachComment}`);
    sections.push(`[신체 분석]\n${lines.join('\n')}`);
  }

  // Recent lessons / practice / round records
  const recentLessons = [...myLessons]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 15);

  if (recentLessons.length > 0) {
    const AREA_KO: Record<string, string> = {
      DRIVER: '드라이버', IRON: '아이언', SHORT_GAME: '숏게임',
      PUTTING: '퍼팅', ROUND: '라운드', OTHER: '기타',
    };
    const lessonLines = recentLessons.map(l => {
      const typeLabel =
        l.recordType === 'SCORE' ? '라운드'
        : l.recordType === 'PRACTICE' ? '연습'
        : '레슨';
      const header = `[${l.date}] ${l.title} (${typeLabel}${l.club ? ` · ${l.club}` : ''})`;
      const parts: string[] = [header];

      if (l.coachNotes) parts.push(`  코치 노트: ${l.coachNotes.substring(0, 300)}`);
      if (l.aiAnalysis) parts.push(`  AI 분석: ${l.aiAnalysis.substring(0, 300)}`);

      if (l.golfData) {
        const gd = l.golfData;
        const nums: string[] = [];
        if (gd.ballSpeed != null)     nums.push(`볼속도 ${gd.ballSpeed}km/h`);
        if (gd.clubHeadSpeed != null) nums.push(`헤드속도 ${gd.clubHeadSpeed}km/h`);
        if (gd.carryDistance != null) nums.push(`캐리 ${gd.carryDistance}m`);
        if (gd.totalDistance != null) nums.push(`총거리 ${gd.totalDistance}m`);
        if (gd.launchAngle != null)   nums.push(`런치앵글 ${gd.launchAngle}°`);
        if (gd.backSpin != null)      nums.push(`백스핀 ${gd.backSpin}rpm`);
        if (gd.sideSpin != null)      nums.push(`사이드스핀 ${gd.sideSpin}rpm`);
        if (gd.smashFactor != null)   nums.push(`스매시팩터 ${gd.smashFactor}`);
        if (gd.clubPath != null)      nums.push(`클럽패스 ${gd.clubPath}°`);
        if (gd.faceAngle != null)     nums.push(`페이스앵글 ${gd.faceAngle}°`);
        if (nums.length) parts.push(`  구질 데이터: ${nums.join(' | ')}`);
      }

      if (l.motionCaptureData?.measurements?.length) {
        const mc = l.motionCaptureData;
        const nums: string[] = [];
        mc.measurements.forEach(m => {
          const p = m.swingPhase ? `[${m.swingPhase}] ` : '';
          if (m.headLift != null && m.headLift !== 0)            nums.push(`${p}머리들림 ${m.headLift}cm`);
          if (m.hipSlide != null && m.hipSlide !== 0)            nums.push(`${p}힙슬라이드 ${m.hipSlide}cm`);
          if (m.upperBodyPush != null && m.upperBodyPush !== 0)  nums.push(`${p}상체밀림 ${m.upperBodyPush}cm`);
          if (m.headLateralSway != null && m.headLateralSway !== 0) nums.push(`${p}머리흔들림 ${m.headLateralSway}cm`);
          if (m.upperBodyLift != null && m.upperBodyLift !== 0)  nums.push(`${p}상체들림 ${m.upperBodyLift}cm`);
        });
        if (nums.length) parts.push(`  모션캡처: ${nums.slice(0, 6).join(' | ')}`);
        if (mc.aiAnalysis) parts.push(`  모션 분석: ${mc.aiAnalysis.substring(0, 200)}`);
      }

      if (l.scorecardDetail) {
        const sc = l.scorecardDetail;
        parts.push(`  스코어카드: ${sc.courseName} | ${sc.totalScore}타 | 퍼팅 ${sc.totalPutts}개`);
        const badHoles = sc.holes
          .filter(h => h.score > h.par + 2)
          .map(h => `홀${h.holeNumber}(${h.score}타·${h.putts}퍼팅)`);
        if (badHoles.length) parts.push(`  어려웠던 홀: ${badHoles.slice(0, 6).join(', ')}`);
        const gir = sc.holes.filter(h => h.score <= h.par).length;
        parts.push(`  파온: ${gir}홀/${sc.holes.length}홀`);
      }

      if (l.tags?.length) parts.push(`  태그: ${l.tags.join(', ')}`);

      return parts.join('\n');
    });
    sections.push(`[레슨·연습·라운드 기록 (최근 ${recentLessons.length}개)]\n${lessonLines.join('\n\n')}`);
  }

  // Quick logs
  const recentLogs = [...quickLogs]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10);

  if (recentLogs.length > 0) {
    const MOOD_KO: Record<string, string> = {
      GREAT: '최고', GOOD: '좋음', OKAY: '보통', BAD: '나쁨', TERRIBLE: '최악',
    };
    const AREA_KO: Record<string, string> = {
      DRIVER: '드라이버', IRON: '아이언', SHORT_GAME: '숏게임',
      PUTTING: '퍼팅', ROUND: '라운드', OTHER: '기타',
    };
    const logLines = recentLogs.map(log => {
      const parts = [`[${log.logDate}] 기분: ${MOOD_KO[log.mood] || log.mood}`];
      if (log.practiceArea) parts.push(`분야: ${AREA_KO[log.practiceArea] || log.practiceArea}`);
      if (log.goodPoint) parts.push(`잘된 점: ${log.goodPoint.substring(0, 100)}`);
      if (log.problemPoint) parts.push(`문제점: ${log.problemPoint.substring(0, 100)}`);
      if (log.notes) parts.push(`메모: ${log.notes.substring(0, 80)}`);
      return parts.join(' | ');
    });

    // Most-practiced area
    const areaFreq: Record<string, number> = {};
    recentLogs.forEach(log => {
      if (log.practiceArea) areaFreq[log.practiceArea] = (areaFreq[log.practiceArea] || 0) + 1;
    });
    const topArea = Object.entries(areaFreq).sort((a, b) => b[1] - a[1])[0];
    const topAreaNote = topArea
      ? `→ 주요 연습 분야: ${AREA_KO[topArea[0]] || topArea[0]} (${topArea[1]}회)`
      : '';

    sections.push(
      `[연습 일지 (최근 ${recentLogs.length}개)]\n${logLines.join('\n')}${topAreaNote ? `\n${topAreaNote}` : ''}`
    );
  }

  // All pending homework
  const pendingHw = homeworkList.filter(h => !h.isCompleted);
  if (pendingHw.length > 0) {
    const hwLines = pendingHw
      .map(h => `- [${h.date || '기한 없음'}] ${h.title}`)
      .join('\n');
    sections.push(`[미완료 숙제·미션 (${pendingHw.length}개)]\n${hwLines}`);
  }

  return sections.join('\n\n');
};

const buildCoachContext = (coachProfile: CoachProfile | undefined, designatedCoachName: string | undefined): string => {
  if (!coachProfile) {
    return `담당 코치: ${designatedCoachName || '미지정'}`;
  }

  const lines: string[] = [
    `담당 코치 이름: ${coachProfile.name}`,
  ];
  if (coachProfile.phone) lines.push(`코치 연락처: ${coachProfile.phone}`);
  if (coachProfile.email) lines.push(`코치 이메일: ${coachProfile.email}`);

  const schedule = coachProfile.workingSchedule;
  if (schedule && Object.keys(schedule).length > 0) {
    const scheduleParts: string[] = [];
    for (const [day, entry] of Object.entries(schedule)) {
      if (!entry) continue;
      const label = DAY_LABELS[day] ?? day;
      if (entry.isClosed) {
        scheduleParts.push(`${label}: 휴무`);
      } else {
        scheduleParts.push(`${label}: ${entry.open} ~ ${entry.close}`);
      }
    }
    if (scheduleParts.length > 0) {
      lines.push(`코치 스케줄:\n${scheduleParts.map(s => `  - ${s}`).join('\n')}`);
    }
  }

  return lines.join('\n');
};

export const generateStudentChatResponse = async (
  userMessage: string,
  myLessons: Lesson[],
  clientProfile: ClientProfile,
  homeworkList: Homework[],
  language: CoachXLanguage = 'ko',
  coachProfile?: CoachProfile,
  quickLogs: QuickLogEntry[] = [],
  conversationHistory: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<string> => {
  try {
    const golferContext = buildRichGolferContext(myLessons, quickLogs, homeworkList, clientProfile);
    const coachContext = buildCoachContext(coachProfile, clientProfile.designatedCoach);

    const LANG_INSTRUCTION: Record<CoachXLanguage, string> = {
      ko: '반드시 한국어로 답변하세요. 친근하고 격려하는 톤으로 말해주세요.',
      en: 'Respond entirely in English. Use a friendly and encouraging tone.',
      ja: '必ず日本語で回答してください。フレンドリーで励ますトーンで話してください。',
      th: 'Respond in English with a friendly and encouraging tone.',
    };

    // Format prior conversation turns (last 10 turns max)
    const historyToInclude = conversationHistory.slice(-10);
    const conversationBlock = historyToInclude.length > 0
      ? '\n=== 이전 대화 내역 (오래된 순) ===\n' +
        historyToInclude
          .map(m => `${m.role === 'user' ? '학생' : 'CoachX'}: ${m.content}`)
          .join('\n') +
        '\n'
      : '';

    const prompt = `당신은 학생 전용 AI 골프 코칭 어시스턴트 "CoachX AI"입니다.

【역할 범위 — 아래 주제만 답변하세요】
• 골프 스윙, 기술, 연습 방법
• 아래 제공된 기록 데이터 기반의 개인화된 분석
• 코치 예약, 스케줄, 연락처 (아래 코치 정보 기준)
• 숙제·미션 관련 질문

골프·코칭과 무관한 질문(날씨, 음식, 일반 상식 등)은 정중히 거절하고
골프 관련 주제로 안내하세요. 절대 엉뚱한 내용을 지어내지 마세요.

--- 제공 데이터 (이 데이터만 기반으로 답변) ---
=== 학생 프로필 ===
이름: ${clientProfile.name}
핸디캡: ${clientProfile.handicap || '미입력'}
베스트 스코어: ${clientProfile.bestScore || '미입력'}
총 레슨·기록 수: ${myLessons.length}

=== 지정 코치 정보 ===
${coachContext}

=== 골프 기록 데이터 ===
${golferContext || '기록 없음 (기본기 위주로 조언해 주세요)'}
${conversationBlock}--- 제공 데이터 끝 ---

=== 학생 질문 ===
"${userMessage}"

언어 지시: ${LANG_INSTRUCTION[language]}

답변 원칙:
- 이전 대화 내역이 있으면 반드시 맥락을 이어받아 답변하세요
- 제공된 기록 데이터 외 정보는 지어내지 마세요; 데이터가 없으면 솔직히 말하세요
- 위 기록 데이터를 직접 참조하여 날짜나 수치를 언급하며 구체적으로 답변하세요
- 반복되는 문제 패턴(태그, 코치 노트, 연습 일지의 문제점)이 있다면 명확히 짚어주세요
- 구질 데이터(볼속도, 비거리, 클럽패스, 페이스앵글 등)가 있으면 수치를 활용해 분석하세요
- 모션캡처 수치가 있으면 신체 움직임의 원인과 교정 방법을 연결해 설명하세요
- 스코어카드 데이터가 있으면 퍼팅 수, 파온율, 어려웠던 홀 등을 구체적으로 활용하세요
- 연습 일지의 자기 보고 내용과 레슨 데이터를 교차 분석하세요
- 코치 스케줄이나 연락처 질문은 위 코치 정보를 정확히 활용하세요
- 800자 이내로 명확하고 실용적으로 답변하세요`;

    const result = await invokeBackendAI<unknown>('student_chat', {
      prompt,
      temperature: 0.7,
      language,
    });
    const text = getResponseText(result) ?? '';
    if (!text.trim()) throw new Error('Empty response');
    return text;
  } catch (error) {
    log.error('Student chat error:', error);
    const name = clientProfile.name;
    const fallbacks: Record<CoachXLanguage, string> = {
      ko: `안녕하세요, ${name}님! 현재 AI 서비스에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해주세요. 궁금한 점은 코치님께 직접 문의해보세요!`,
      en: `Hi ${name}! The AI service is temporarily unavailable. Please try again shortly or contact your coach directly.`,
      ja: `こんにちは、${name}さん！AIサービスに現在接続できません。しばらくしてから再度お試しください。`,
      th: `Hi ${name}! The AI service is temporarily unavailable. Please try again shortly.`,
    };
    return fallbacks[language] ?? fallbacks['ko'];
  }
};
