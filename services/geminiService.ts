import { GoogleGenAI } from '@google/genai';
import {
  ComparisonResult,
  GolfData,
  ClientProfile,
  Lesson,
  ShotMetrics,
  TrainingProgramConfig,
  CoachMaterialType,
} from '../types';

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

/**
 * Analyzes multiple golf lesson assets (videos, images, audio) using Gemini 2.5 Flash.
 * Generates a comprehensive lesson note summarizing coach feedback and visual analysis.
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
      당신은 골프 스윙 메커니즘에 정통한 전문 분석 AI입니다.
      코치가 회원에게 더 나은 레슨을 제공할 수 있도록, 업로드된 자료를 바탕으로 심도 있고 전문적인 **'스윙 분석 리포트'**를 작성해주세요.

      **분석 자료:**
      - **촬영 앵글**: ${angleText}
      - **오디오 데이터**: 레슨 현장의 대화 및 타구음
      - **비주얼 데이터**: 스윙 영상 및 이미지
      - **추가 정보**: "${userNotes}"

      **분석 지침:**
      1. **전문성 강화**: 스윙의 기술적 결함과 장점을 골프 역학적 관점에서 구체적으로 분석하세요.
      2. **문제 해결 중심**: 단순한 현상 나열이 아닌, 문제의 근본 원인(Root Cause)과 해결책을 제시하세요.
      3. **코칭 지원**: 코치가 회원을 지도할 때 유용한 구체적인 교정법과 드릴을 포함하세요.
      4. 다음 형식을 준수하여 마크다운으로 출력하세요:

      ---
      
      ## 🎯 레슨 핵심 요약 (Voice & Context)
      (현장 음성과 메모를 바탕으로 파악된 레슨의 주안점 및 현재 상태 요약)

      ## 🔍 스윙 메커니즘 분석 (${
        swingAngle === 'FRONT'
          ? '정면'
          : swingAngle === 'SIDE'
          ? '측면'
          : '종합'
      })
      - **Setup & Posture**: (어드레스 및 셋업 분석)
      - **Backswing & Transition**: (백스윙 탑, 전환 동작의 시퀀스 분석)
      - **Impact & Follow**: (임팩트 순간의 클럽 페이스/경로 및 피니쉬 분석)
      - **Strength & Weakness**: (잘된 점과 보완이 시급한 점)

      ## 🛠️ 솔루션 및 트레이닝 가이드
      1. **Technical Fix**: (기술적 교정 방법)
      2. **Practice Drills**: (구체적인 연습 방법 및 횟수 제안)

      ---
      
      *AI 분석을 통해 코치님의 레슨에 깊이를 더해드립니다.*
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
      throw new Error('분석 결과를 생성하지 못했습니다.');
    }
  } catch (error) {
    console.error('Gemini Analysis Error:', error);
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

// ── Coach Material Labels (for prompt context) ──────────────────────────────

const MATERIAL_TYPE_LABELS: Record<CoachMaterialType, string> = {
  LESSON_GUIDE: '레슨 가이드',
  DRILL_SHEET: '드릴 시트',
  SWING_TIPS: '스윙 팁',
  COURSE_STRATEGY: '코스 전략',
  CUSTOM: '커스텀 교재',
};

/**
 * Generates a coach material document for a specific client based on their
 * lesson history, the chosen material type and the coach's goal/request.
 *
 * @param profile  - The client's profile.
 * @param lessons  - The client's recent lesson records to use as context.
 * @param materialType - The type of material to generate.
 * @param goal     - The coach's goal or custom request for this material.
 * @returns Markdown-formatted material content.
 */
export const generateCoachMaterial = async (
  profile: ClientProfile,
  lessons: Lesson[],
  materialType: CoachMaterialType,
  goal: string
): Promise<string> => {
  const typeLabel = MATERIAL_TYPE_LABELS[materialType];

  const fallbackContent = () => `## ${typeLabel} (기본 템플릿)

> AI 서비스 또는 레슨 기록 데이터가 부족하여 기본 템플릿을 제공합니다.

### 목표
${goal || '(목표 미입력)'}

### 현재 주요 과제
- 코치 확인 필요

### 핵심 훈련 포인트
1. 기초 자세 점검
2. 반복 드릴 수행
3. 피드백 반영

### 드릴 / 실천 항목
- 어드레스 확인: 10분
- 빈스윙 반복: 50회
- 실구 타격: 집중 20볼

### 주의사항
- 무리한 비거리 추구 금지
- 자세 우선, 결과는 나중에

### 다음 단계
다음 레슨에서 진행 상황 점검
`;

  if (!ai) {
    return fallbackContent();
  }

  try {
    const handicapInfo = profile.handicap
      ? `핸디캡: ${profile.handicap}`
      : '핸디캡 정보 없음 (초보자 가정)';
    const bestScoreInfo = profile.bestScore ? `라베: ${profile.bestScore}` : '';
    const memoInfo = profile.memo ? `코치 메모: ${profile.memo}` : '';

    // Summarise up to 8 most recent lesson records for context
    const lessonContext =
      lessons.length === 0
        ? '레슨 기록 없음 (기초 위주로 구성해 주세요)'
        : lessons
            .slice(0, 8)
            .map((l, i) => {
              const parts: string[] = [
                `레슨 ${i + 1} (${l.date}, ${l.title})`,
              ];
              if (l.coachNotes) parts.push(`코치메모: ${l.coachNotes}`);
              if (l.aiAnalysis) parts.push(`AI분석: ${l.aiAnalysis.slice(0, 200)}`);
              if (l.golfData?.carryDistance)
                parts.push(`캐리거리: ${l.golfData.carryDistance}m`);
              if (l.tags?.length) parts.push(`태그: ${l.tags.join(', ')}`);
              return parts.join(' | ');
            })
            .join('\n');

    const prompt = `
당신은 전문 골프 코치 AI입니다. 아래 회원 정보와 레슨 기록을 바탕으로 맞춤형 **${typeLabel}** 교재를 작성해주세요.

**회원 정보:**
- 이름: ${profile.name}
- ${handicapInfo}
${bestScoreInfo ? `- ${bestScoreInfo}` : ''}
${memoInfo ? `- ${memoInfo}` : ''}

**교재 목표 / 코치 요청:**
${goal || '일반적인 기술 향상'}

**최근 레슨 기록 요약:**
${lessonContext}

**작성 지침:**
1. 다음 항목을 포함하여 체계적으로 작성해주세요:
   - 제목 (## 로 시작)
   - 간략 요약 (현재 상태 및 이 교재의 목적)
   - 현재 주요 과제 / 포커스 포인트
   - 핵심 훈련 포인트 (번호 목록)
   - 드릴 / 실천 항목 (구체적인 방법, 횟수 포함)
   - 주의사항
   - 다음 단계 / 목표
2. 레슨 기록에서 발견된 반복 문제나 개선 필요 사항을 우선 반영해주세요.
3. 실용적이고 구체적인 내용으로 작성해주세요.
4. 마크다운 형식으로 작성해주세요.
5. 한국어로 작성해주세요.

교재를 작성해주세요:
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [{ text: prompt }],
      },
    });

    const text = response.text;
    if (!text) throw new Error('Coach material generation failed');
    return text;
  } catch (error) {
    console.error('Generate Coach Material Error:', error);
    return fallbackContent();
  }
};
