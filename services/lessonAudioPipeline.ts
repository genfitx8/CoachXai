/**
 * lessonAudioPipeline — 장시간(30–50분) 레슨 오디오의 저장·분석·요약 파이프라인.
 *
 * 왜 별도 파이프라인인가
 * ----------------------
 * 기존 흐름은 MediaRecorder 블롭 하나를 메모리에 들고 있다가 레슨 종료 후
 * 오디오 전체를 base64 inlineData 로 AI 게이트웨이에 실어 보냈다. 50분
 * 녹음이면 원본만 15–20MB, base64 팽창 후 서버의 JSON 바디 한도(10mb)를
 * 넘겨 413 으로 죽고, 탭이 죽으면 녹음 전체가 유실됐다. 이 모듈은 그 두
 * 문제를 구조적으로 없앤다:
 *
 *  1. **단일 레코더 + 타임슬라이스 분할** — MediaRecorder **하나**를
 *     SEGMENT_TARGET_SEC 타임슬라이스로 계속 돌린다. 매 청크는 (a) IndexedDB
 *     에 순서대로 영속화되는 크래시 대비 아카이브이자 (b) 필기용 세그먼트다.
 *     타임슬라이스 청크는 첫 청크에만 컨테이너 헤더(init segment)가 있어
 *     단독으로는 디코딩이 안 되므로, 첫 청크에서 헤더를 바이트 스캔으로
 *     떼어내(webm Cluster / mp4 moof 경계) 이후 청크 앞에 붙여 독립 재생
 *     가능한 조각을 만든다(MSE 세그먼트 방식). 과거에는 세그먼트용 레코더를
 *     10초마다 정지→재생성하는 방식을 썼는데, 모바일 브라우저에서 레코더
 *     재생성이 조용히 실패해 첫 세그먼트 이후 필기가 멈추는 버그가 있었다
 *     — 이 설계는 레코더를 한 번만 만들므로 그 문제가 원천적으로 없다.
 *
 *  2. **실시간 필기(전사)** — ~10초 세그먼트가 닫히는 즉시 동시성 제한
 *     큐를 통해 `lesson_audio_transcribe` 로 받아쓰기하고, 그 텍스트가
 *     화면의 필기 노트에 이어 붙는다. 코치가 옆에서 노트를 적는 듯한
 *     경험이 이 경로의 목적이라 요약하지 않고 들리는 대로 적는다.
 *     하단 "요약 노트"는 별도 5분 주기(SUMMARY_INTERVAL_SEC)로 지금까지의
 *     필기를 다시 요약한다.
 *
 *  3. **텍스트 map-reduce 최종 요약** — 종료 시에는 오디오가 아니라 필기
 *     노트(텍스트)만 `lesson_summary_merge` 로 보내 최종 리포트를 만든다.
 *     50분 레슨도 요약 단계는 텍스트 한 번 호출이라 수 초면 끝난다.
 *
 * 복구 모델
 * ---------
 * 세션 메타(노트 포함)와 오디오(청크·세그먼트)는 전용 IndexedDB 에 산다.
 * 페이지가 죽으면 상태가 'recording' 인 세션이 남고, 컴패니언이 다음
 * 마운트에서 이를 감지해 복구를 제안한다. 복구는 archive 청크를 순서대로
 * 이어붙여(단일 레코더 산출물이므로 유효한 파일) 전체 오디오를 되살리고,
 * 이미 끝난 세그먼트 노트를 그대로 재사용한다.
 */

import { invokeBackendAI, getResponseText } from './geminiService';
import { promptService } from './promptService';
import { firebaseService } from './firebase';
import { createLogger } from '../utils/logger';

const log = createLogger('lessonAudio');

// ─── Tunables ────────────────────────────────────────────────────────────────

/**
 * 세그먼트(필기 단위) 목표 길이. 코치가 옆에서 받아 적는 듯한 경험이
 * 목표라 ~10초마다 그 구간 음성을 전사해 노트에 이어 붙인다. 전사 호출
 * 지연(1~3초)을 더하면 말한 내용이 약 12–13초 뒤 화면에 적힌다.
 * 50분 레슨 기준 ~300회의 전사 호출이 생기지만 개별 호출은 10초짜리
 * 오디오(base64 ~80KB) + flash-lite 라 저비용이다.
 */
export const SEGMENT_TARGET_SEC = 10;
/**
 * 하단 "요약 노트" 갱신 주기. 필기(전사)와 달리 요약은 맥락이 어느 정도
 * 쌓여야 의미가 있어 5분에 한 번 전체 필기를 다시 요약한다.
 */
export const SUMMARY_INTERVAL_SEC = 300;
/**
 * 음성 위주 콘텐츠에 충분한 비트레이트. 48kbps opus 기준 50분 ≈ 18MB
 * (아카이브), 10초 청크 ≈ 60KB → base64 후에도 서버 10mb 한도에 여유.
 */
export const AUDIO_BITS_PER_SECOND = 48_000;
/** 세그먼트 분석 동시 실행 한도. */
export const ANALYSIS_CONCURRENCY = 2;
/** 세그먼트 분석 재시도 횟수(최초 시도 포함). */
export const ANALYSIS_MAX_ATTEMPTS = 3;
/** 복구 대상 세션 보존 기한. */
const SESSION_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

// ─── Types ───────────────────────────────────────────────────────────────────

export type SegmentNoteStatus = 'pending' | 'analyzing' | 'done' | 'failed';

/** 세그먼트 하나에 대한 AI 분석 노트. transcript 는 압축 전사. */
export interface LessonSegmentNote {
  index: number;
  /** 레슨 시작 기준 오프셋(초). */
  startSec: number;
  durationSec: number;
  status: SegmentNoteStatus;
  transcript: string;
  /** 코치가 강조한 교정 포인트. */
  keyPoints: string[];
  /** 언급된 드릴/과제. */
  drills: string[];
  /** 수치 언급 ("드라이버 캐리 210m" 등) — 최종 리포트가 그대로 인용한다. */
  metrics: string[];
  /** 이 구간에서 관찰된 학생 상태/이슈. */
  studentState: string;
}

/**
 * 녹음 런(run) — 한 번의 연속 녹음 구간. 앱 전환·종료로 레코더가 죽었다가
 * 같은 세션으로 재개되면 새 런이 시작된다. 런마다 독립된 컨테이너
 * 헤더를 가지므로, 최종 오디오는 런 단위로 하나씩 유효한 파일이 된다.
 */
export interface RecordingRunMarker {
  /** 이 런의 첫 archive 청크 인덱스. */
  firstChunk: number;
  /** 이 런이 시작된 시점의 누적 녹음 시간(초). */
  baseSec: number;
}

export interface LessonAudioSessionMeta {
  id: string;
  studentName: string;
  startedAt: number;
  updatedAt: number;
  status: 'recording' | 'finished';
  mimeType: string;
  /** archive 청크 수 — 복구 시 이어붙일 개수. */
  chunkCount: number;
  recordedSec: number;
  notes: LessonSegmentNote[];
  /** 녹음 런 경계 — 재개(resume)가 만든 구간들. 구버전 메타에는 없다. */
  runs?: RecordingRunMarker[];
  /** 마지막 롤링 요약 — 재개 시 요약 노트를 그대로 복원한다. */
  liveSummary?: string;
}

/** 컴패니언 → 레슨 폼 핸드오프 페이로드. 노트 원본은 파이프라인이 들고 있다. */
export interface LiveLessonHandoff {
  sessionId: string;
  recordedDurationSec: number;
  noteCount: number;
  /** 핸드오프 시점에 아직 분석 중이던 세그먼트 수. */
  pendingCount: number;
  /**
   * 코치가 검토 화면에서 확인/수정한 필기 전문. 있으면 최종 리포트는
   * 세션 노트 대신 이 텍스트를 근거로 생성한다 — 코치가 고친 내용이
   * 항상 이긴다.
   */
  editedTranscript?: string;
  /** 코치가 검토 화면에서 확인/수정한 요약 — 최종 리포트의 참고 자료. */
  editedSummary?: string;
}

export interface RecoverableLessonSession {
  id: string;
  studentName: string;
  startedAt: number;
  /** 마지막 활동 시각 — "방금 끊긴" 세션 판정(로그인 직후 자동 안내)용. */
  updatedAt: number;
  recordedSec: number;
  analyzedCount: number;
  segmentCount: number;
}

export interface LiveSessionSnapshot {
  recordedSec: number;
  segmentCount: number;
  analyzedCount: number;
  failedCount: number;
  latestKeyPoints: string[];
  /** 지금까지의 롤링 요약(불릿 텍스트). 세그먼트 분석이 쌓일 때마다 갱신. */
  liveSummary: string;
  /** 롤링 요약이 현재 재생성 중인가 — UI 스피너용. */
  liveSummaryUpdating: boolean;
}

// ─── MIME negotiation ────────────────────────────────────────────────────────

const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
];

/**
 * 기기별 지원 오디오 컨테이너 협상. Chrome/Android WebView 는 webm/opus,
 * iOS(Safari WebView) 는 audio/mp4 로 떨어진다. Gemini 는 둘 다 받는다.
 */
export const pickAudioMimeType = (): string => {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
    return 'audio/webm';
  }
  for (const candidate of AUDIO_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return '';
};

/** 컨테이너 MIME → 저장 파일 확장자. */
export const audioExtensionForMime = (mime: string): string =>
  mime.includes('mp4') ? 'm4a' : 'webm';

// ─── IndexedDB persistence ───────────────────────────────────────────────────

const DB_NAME = 'coachxai_lesson_audio';
const DB_VERSION = 1;
const BLOB_STORE = 'blobs'; // archive 청크 + 세그먼트 blob
const SESSION_STORE = 'sessions'; // 세션 메타(JSON)

const chunkKey = (sessionId: string, n: number) =>
  // 사전순 == 숫자순이 되도록 zero-pad. 50분 / 5s = 600청크라 5자리면 넉넉하다.
  `chunk:${sessionId}:${String(n).padStart(5, '0')}`;
const segmentKey = (sessionId: string, n: number) =>
  `seg:${sessionId}:${String(n).padStart(4, '0')}`;

let dbPromise: Promise<IDBDatabase> | null = null;

const openDB = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(BLOB_STORE)) {
          db.createObjectStore(BLOB_STORE);
        }
        if (!db.objectStoreNames.contains(SESSION_STORE)) {
          db.createObjectStore(SESSION_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
};

const idbPut = async (store: string, key: string, value: unknown): Promise<void> => {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

const idbGet = async <T>(store: string, key: string): Promise<T | undefined> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
};

const idbKeysByPrefix = async (store: string, prefix: string): Promise<string[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    // prefix 범위 스캔: [prefix, prefix + '￿')
    const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
    const req = tx.objectStore(store).getAllKeys(range);
    req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String));
    req.onerror = () => reject(req.error);
  });
};

const idbDelete = async (store: string, key: string): Promise<void> => {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

const idbAllSessionMetas = async (): Promise<LessonAudioSessionMeta[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSION_STORE, 'readonly');
    const req = tx.objectStore(SESSION_STORE).getAll();
    req.onsuccess = () => resolve((req.result as LessonAudioSessionMeta[]) ?? []);
    req.onerror = () => reject(req.error);
  });
};

// ─── Pure helpers (unit-tested) ──────────────────────────────────────────────

export const formatClock = (totalSec: number): string => {
  const sec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * 타임슬라이스 첫 청크에서 컨테이너 헤더(init segment)가 끝나는 오프셋을
 * 찾는다. 이 지점 앞부분을 이후 청크에 접두하면 청크 하나하나가 독립
 * 디코딩 가능한 파일이 된다(MSE 세그먼트 방식).
 *
 * - webm(opus): 첫 Cluster 엘리먼트 ID `1F 43 B6 75` 의 시작 오프셋.
 * - fMP4(Safari): 첫 `moof` 박스의 시작(= 'moof' 문자열 4바이트 앞).
 *
 * 못 찾으면 -1 — 호출부는 헤더 없이 청크를 그대로 쓰는 폴백을 택한다.
 */
export const findInitSegmentEnd = (bytes: Uint8Array): number => {
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (
      bytes[i] === 0x1f &&
      bytes[i + 1] === 0x43 &&
      bytes[i + 2] === 0xb6 &&
      bytes[i + 3] === 0x75
    ) {
      return i;
    }
  }
  // mp4 박스 헤더는 [size:4]['moof':4] — 'moof' 는 6D 6F 6F 66.
  for (let i = 4; i + 3 < bytes.length; i++) {
    if (
      bytes[i] === 0x6d &&
      bytes[i + 1] === 0x6f &&
      bytes[i + 2] === 0x6f &&
      bytes[i + 3] === 0x66
    ) {
      return i - 4;
    }
  }
  return -1;
};

const toStringArray = (value: unknown, max = 8): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, max);
};

/**
 * `lesson_audio_segment` 응답(JSON 텍스트)을 세그먼트 노트로 정규화한다.
 * responseSchema 를 걸어 보내지만, 런타임이 스키마를 지원하지 않는 경로
 * (레거시 Agent Runtime)에서도 살아남도록 방어적으로 파싱한다.
 */
export const parseSegmentNoteResponse = (
  text: string,
  base: { index: number; startSec: number; durationSec: number }
): LessonSegmentNote => {
  let parsed: Record<string, unknown> = {};
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const candidate = JSON.parse(match[0]);
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        parsed = candidate as Record<string, unknown>;
      }
    } catch {
      // JSON 이 아니면 전체 텍스트를 전사로 간주한다.
    }
  }

  const transcript =
    typeof parsed.transcript === 'string' && parsed.transcript.trim()
      ? parsed.transcript.trim()
      : match
      ? ''
      : text.trim();

  return {
    ...base,
    status: 'done',
    transcript,
    keyPoints: toStringArray(parsed.keyPoints),
    drills: toStringArray(parsed.drills),
    metrics: toStringArray(parsed.metrics, 12),
    studentState:
      typeof parsed.studentState === 'string' ? parsed.studentState.trim() : '',
  };
};

export interface SegmentPromptContext {
  studentName: string;
  index: number;
  startSec: number;
  durationSec: number;
  /** 직전 세그먼트까지 누적된 핵심 포인트 — 중복 서술을 줄이는 컨텍스트. */
  previousKeyPoints: string[];
}

export const buildSegmentPrompt = (ctx: SegmentPromptContext): string => {
  const window = `${formatClock(ctx.startSec)}–${formatClock(
    ctx.startSec + ctx.durationSec
  )}`;
  const prior = ctx.previousKeyPoints.length
    ? `\n**이전 구간까지의 핵심 포인트(중복 서술 대신 변화/진행만 기록):**\n${ctx.previousKeyPoints
        .slice(-8)
        .map((p) => `- ${p}`)
        .join('\n')}`
    : '';
  return `골프 레슨 현장 녹음의 일부 구간입니다. 학생: ${ctx.studentName}, 구간: ${window}.
이 오디오 구간을 분석해 아래 JSON 하나만 반환하세요.
{
  "transcript": "구간 대화의 압축 전사. 코칭 지시·피드백 위주로 3~8문장, 한국어.",
  "keyPoints": ["코치가 강조한 교정/코칭 포인트"],
  "drills": ["언급된 드릴·연습 과제"],
  "metrics": ["언급된 수치 그대로 (예: '드라이버 캐리 210m', '어깨 회전 80도')"],
  "studentState": "이 구간에서 관찰된 학생의 상태·문제·개선 (1~2문장)"
}
규칙:
- 타구음·잡음뿐이고 대화가 없으면 transcript 는 "코칭 대화 없음(연습 타격 구간)" 으로 쓰고 배열은 비워두세요.
- 들리지 않는 내용을 지어내지 마세요. 수치는 들린 그대로만 기록하세요.${prior}`;
};

/**
 * 세그먼트 노트들을 최종 리포트 생성용 텍스트 블록으로 조립한다.
 * 분석 실패 구간은 공백으로 숨기지 않고 명시해 리포트가 과잉 일반화하지
 * 않도록 한다.
 */
const isEmptyDoneNote = (n: LessonSegmentNote): boolean =>
  n.status === 'done' &&
  !n.transcript &&
  n.keyPoints.length === 0 &&
  n.drills.length === 0 &&
  n.metrics.length === 0 &&
  !n.studentState;

export const buildMergePrompt = (
  notes: LessonSegmentNote[],
  coachNotes: string,
  opts: { studentName?: string; totalDurationSec?: number } = {}
): string => {
  // 무음 구간(빈 전사)은 프롬프트만 부풀린다 — 10초 필기 단위에서는
  // 이런 구간이 수십 개씩 나오므로 조용히 걸러낸다.
  const ordered = [...notes]
    .filter((n) => !isEmptyDoneNote(n))
    .sort((a, b) => a.index - b.index);
  const blocks = ordered.map((n) => {
    // 실시간 음성인식 노트는 발화 시점만 있다(duration 0) — 단일 시각 표기.
    const window =
      n.durationSec > 0
        ? `${formatClock(n.startSec)}–${formatClock(n.startSec + n.durationSec)}`
        : formatClock(n.startSec);
    if (n.status !== 'done') {
      return `[${window}] (이 구간은 오디오 분석에 실패해 내용이 없습니다)`;
    }
    const lines = [`[${window}] ${n.transcript || '(대화 없음)'}`];
    if (n.keyPoints.length) lines.push(`  포인트: ${n.keyPoints.join(' / ')}`);
    if (n.drills.length) lines.push(`  드릴: ${n.drills.join(' / ')}`);
    if (n.metrics.length) lines.push(`  수치: ${n.metrics.join(' / ')}`);
    if (n.studentState) lines.push(`  학생 상태: ${n.studentState}`);
    return lines.join('\n');
  });

  const header = [
    opts.studentName ? `- **학생**: ${opts.studentName}` : null,
    opts.totalDurationSec
      ? `- **레슨 길이**: 약 ${Math.round(opts.totalDurationSec / 60)}분`
      : null,
    `- **분석 구간**: ${ordered.filter((n) => n.status === 'done').length}/${
      ordered.length
    }`,
  ]
    .filter(Boolean)
    .join('\n');

  return `아래는 레슨 전체 녹음을 시간 구간별로 AI 분석한 노트입니다. 이 노트만을 근거로 최종 레슨 요약 리포트를 작성하세요.

**레슨 정보:**
${header}

**구간별 분석 노트:**
${blocks.join('\n\n')}

**코치 추가 메모:** "${coachNotes || '(없음)'}"

작성 규칙:
- 시간 흐름을 따라가되, 같은 교정 포인트가 여러 구간에 반복되면 하나로 묶고 변화(개선/악화)를 언급하세요.
- 노트에 있는 수치는 그대로 인용하세요. 노트에 없는 사실을 추가하지 마세요.
- 분석 실패 구간이 있으면 리포트 말미에 한 줄로 알려주세요.`;
};

// ─── Micro-segment transcription (필기 기본 경로) ────────────────────────────

/**
 * `lesson_audio_transcribe` 응답을 전사 텍스트로 정규화한다. 스키마를 걸어
 * 보내지만 스키마 미지원 런타임에서는 평문이 올 수 있어 방어적으로 파싱한다.
 */
export const parseTranscriptResponse = (text: string): string => {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed && typeof parsed === 'object' && typeof parsed.text === 'string') {
        return parsed.text.trim();
      }
    } catch {
      // JSON 이 아니면 아래 평문 경로로.
    }
  }
  const trimmed = text.trim();
  // 무음 구간을 모델이 굳이 문장으로 알려온 경우는 빈 필기로 취급한다.
  if (/^\(?\s*(대화|말|음성)\s*없음\)?\.?$/.test(trimmed)) return '';
  return trimmed;
};

export const buildTranscribePrompt = (ctx: SegmentPromptContext): string => {
  const window = `${formatClock(ctx.startSec)}–${formatClock(
    ctx.startSec + ctx.durationSec
  )}`;
  return `골프 레슨 현장 녹음의 짧은 구간(${window}, 학생: ${ctx.studentName})입니다.
이 구간에서 들리는 말을 받아 적으세요. JSON 하나만 반환합니다: {"text": "..."}
규칙:
- 코치와 학생의 발화를 들리는 그대로, 자연스러운 한국어 문장으로 적으세요. 요약하지 마세요.
- 잡음·타구음뿐이고 발화가 없으면 {"text": ""} 를 반환하세요.
- 들리지 않는 내용을 지어내지 마세요.`;
};

const transcribeSchema = {
  type: 'OBJECT',
  properties: { text: { type: 'STRING' } },
  required: ['text'],
} as const;

/**
 * 기본 필기 분석기 — ~10초 구간을 전사만 한다(요약·구조화 없음).
 * 결과는 transcript 만 채워진 LessonSegmentNote 로 흘러들어, 병합 요약·
 * 복구·핸드오프 등 기존 노트 경로를 그대로 탄다.
 */
export const transcribeLessonAudioSegment: SegmentAnalyzer = async (
  blob,
  mimeType,
  ctx
) => {
  const data = await blobToBase64(blob);
  const result = await invokeBackendAI<unknown>('lesson_audio_transcribe', {
    prompt: buildTranscribePrompt(ctx),
    mediaParts: [{ inlineData: { data, mimeType } }],
    responseMimeType: 'application/json',
    responseSchema: transcribeSchema,
  });
  const text = getResponseText(result);
  if (text == null) throw new Error('전사 응답이 비어 있습니다.');
  return {
    index: ctx.index,
    startSec: ctx.startSec,
    durationSec: ctx.durationSec,
    status: 'done',
    transcript: parseTranscriptResponse(text),
    keyPoints: [],
    drills: [],
    metrics: [],
    studentState: '',
  };
};

// ─── Segment analysis (AI call) ──────────────────────────────────────────────

const segmentNoteSchema = {
  type: 'OBJECT',
  properties: {
    transcript: { type: 'STRING' },
    keyPoints: { type: 'ARRAY', items: { type: 'STRING' } },
    drills: { type: 'ARRAY', items: { type: 'STRING' } },
    metrics: { type: 'ARRAY', items: { type: 'STRING' } },
    studentState: { type: 'STRING' },
  },
  required: ['transcript', 'keyPoints', 'drills', 'metrics', 'studentState'],
} as const;

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export type SegmentAnalyzer = (
  blob: Blob,
  mimeType: string,
  ctx: SegmentPromptContext
) => Promise<LessonSegmentNote>;

/** 기본 세그먼트 분석기 — 백엔드 AI 게이트웨이의 `lesson_audio_segment` 호출. */
export const analyzeLessonAudioSegment: SegmentAnalyzer = async (
  blob,
  mimeType,
  ctx
) => {
  const data = await blobToBase64(blob);
  const result = await invokeBackendAI<unknown>('lesson_audio_segment', {
    prompt: buildSegmentPrompt(ctx),
    mediaParts: [{ inlineData: { data, mimeType } }],
    responseMimeType: 'application/json',
    responseSchema: segmentNoteSchema,
  });
  const text = getResponseText(result);
  if (!text) throw new Error('세그먼트 분석 응답이 비어 있습니다.');
  return parseSegmentNoteResponse(text, {
    index: ctx.index,
    startSec: ctx.startSec,
    durationSec: ctx.durationSec,
  });
};

// ─── Analysis queue ──────────────────────────────────────────────────────────

interface QueueJob {
  index: number;
  run: () => Promise<void>;
}

/**
 * 동시성 제한 + 지수 백오프 재시도 큐. 레슨 중 네트워크가 잠깐 끊겨도
 * 세그먼트 분석이 조용히 죽지 않고 재시도된다. 주입식으로 만들어 테스트가
 * 실제 타이머 없이 검증할 수 있게 한다.
 */
export class SegmentAnalysisQueue {
  private queue: QueueJob[] = [];
  private active = 0;
  private settlePromise: Promise<void> = Promise.resolve();
  private settleResolve: (() => void) | null = null;

  constructor(
    private readonly concurrency: number = ANALYSIS_CONCURRENCY,
    private readonly maxAttempts: number = ANALYSIS_MAX_ATTEMPTS,
    private readonly backoffMs: (attempt: number) => number = (attempt) =>
      1500 * 2 ** (attempt - 1),
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms))
  ) {}

  /** task 는 시도 1회분. 실패 시 큐가 maxAttempts 까지 재시도한다. */
  enqueue(index: number, task: () => Promise<void>, onGiveUp?: (err: unknown) => void): void {
    const job: QueueJob = {
      index,
      run: async () => {
        for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
          try {
            await task();
            return;
          } catch (err) {
            if (attempt === this.maxAttempts) {
              log.error(`세그먼트 #${index} 분석 최종 실패:`, err);
              onGiveUp?.(err);
              return;
            }
            await this.sleep(this.backoffMs(attempt));
          }
        }
      },
    };
    this.queue.push(job);
    if (this.active === 0 && this.settleResolve === null) {
      this.settlePromise = new Promise((r) => {
        this.settleResolve = r;
      });
    }
    this.pump();
  }

  private pump(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.active += 1;
      void job.run().finally(() => {
        this.active -= 1;
        if (this.active === 0 && this.queue.length === 0) {
          this.settleResolve?.();
          this.settleResolve = null;
        } else {
          this.pump();
        }
      });
    }
  }

  get pendingCount(): number {
    return this.active + this.queue.length;
  }

  /** 큐가 빌 때까지 대기 (timeoutMs 초과 시 그냥 반환). */
  async settle(timeoutMs?: number): Promise<void> {
    if (this.pendingCount === 0) return;
    if (timeoutMs == null) {
      await this.settlePromise;
      return;
    }
    await Promise.race([
      this.settlePromise,
      new Promise<void>((r) => setTimeout(r, timeoutMs)),
    ]);
  }
}

// ─── Rolling live summary ────────────────────────────────────────────────────

/**
 * 레슨 진행 중 화면에 띄우는 "지금까지 요약" 프롬프트. 최종 리포트
 * (buildMergePrompt)와 달리 짧은 불릿에 최적화한다 — 코치가 매트 건너편에서
 * 한눈에 훑는 용도라 형식보다 밀도가 중요하다.
 */
export const buildRollingSummaryPrompt = (
  notes: LessonSegmentNote[],
  studentName: string
): string => {
  const done = [...notes]
    .filter((n) => n.status === 'done' && !isEmptyDoneNote(n))
    .sort((a, b) => a.index - b.index);
  const blocks = done.map((n) => {
    const window =
      n.durationSec > 0
        ? `${formatClock(n.startSec)}–${formatClock(n.startSec + n.durationSec)}`
        : formatClock(n.startSec);
    const lines = [`[${window}] ${n.transcript || '(대화 없음)'}`];
    if (n.keyPoints.length) lines.push(`  포인트: ${n.keyPoints.join(' / ')}`);
    if (n.metrics.length) lines.push(`  수치: ${n.metrics.join(' / ')}`);
    return lines.join('\n');
  });

  return `진행 중인 골프 레슨(학생: ${studentName})의 지금까지의 구간별 분석 노트입니다.

${blocks.join('\n\n')}

지금까지의 레슨 내용을 코치가 한눈에 훑을 수 있는 실시간 요약으로 정리하세요.
규칙:
- "- " 로 시작하는 불릿 3~5개, 각 불릿은 한 문장(한국어).
- 가장 중요한 교정 포인트부터. 반복 언급된 포인트는 하나로 묶고 진행 상황(개선/유지)을 덧붙이세요.
- 노트에 있는 수치는 그대로 인용하고, 노트에 없는 내용은 만들지 마세요.
- 머리말·맺음말 없이 불릿만 출력하세요.`;
};

export type RollingSummarizer = (
  notes: LessonSegmentNote[],
  studentName: string
) => Promise<string>;

/** 기본 롤링 요약기 — 텍스트만 보내므로 호출당 수 초·저비용. */
export const generateRollingLessonSummary: RollingSummarizer = async (
  notes,
  studentName
) => {
  const result = await invokeBackendAI<unknown>('lesson_live_summary', {
    prompt: buildRollingSummaryPrompt(notes, studentName),
  });
  const text = getResponseText(result);
  if (!text) throw new Error('실시간 요약 응답이 비어 있습니다.');
  return text.trim();
};

/**
 * 롤링 요약 갱신 조율기: 세그먼트 노트가 완성될 때마다 notify 되지만
 * 요약 호출은 **항상 한 개만** 비행한다. 비행 중 새 노트가 들어오면
 * dirty 로 표시했다가 끝난 뒤 최신 상태로 한 번 더 돌린다(trailing).
 * 실패하면 이전 요약을 유지한다 — 다음 노트가 어차피 재시도 기회다.
 */
export class RollingSummaryController {
  private inFlight = false;
  private dirty = false;
  private latestNotes: LessonSegmentNote[] = [];
  private latestStudent = '';

  constructor(
    private readonly summarize: RollingSummarizer,
    private readonly onUpdate: (summary: string) => void,
    private readonly onStateChange?: (updating: boolean) => void
  ) {}

  get isUpdating(): boolean {
    return this.inFlight;
  }

  notify(notes: LessonSegmentNote[], studentName: string): void {
    this.latestNotes = notes;
    this.latestStudent = studentName;
    if (this.inFlight) {
      this.dirty = true;
      return;
    }
    void this.run();
  }

  private async run(): Promise<void> {
    if (!this.latestNotes.some((n) => n.status === 'done')) return;
    this.inFlight = true;
    this.onStateChange?.(true);
    try {
      do {
        this.dirty = false;
        try {
          const summary = await this.summarize(this.latestNotes, this.latestStudent);
          if (summary) this.onUpdate(summary);
        } catch (err) {
          log.warn('롤링 요약 갱신 실패(이전 요약 유지):', err);
        }
      } while (this.dirty);
    } finally {
      this.inFlight = false;
      this.onStateChange?.(false);
    }
  }
}

// ─── Live recording session ──────────────────────────────────────────────────

export interface LessonAudioSessionOptions {
  studentName: string;
  /** 테스트/오프라인 대체용 분석기 주입 지점. */
  analyzer?: SegmentAnalyzer;
  /** 테스트용 롤링 요약기 주입 지점. */
  rollingSummarizer?: RollingSummarizer;
  /** 노트 변경(분석 완료/실패)마다 호출 — UI 라이브 티커용. */
  onNotesChanged?: (notes: LessonSegmentNote[]) => void;
  segmentTargetSec?: number;
  summaryIntervalSec?: number;
}

export interface StopResult {
  /**
   * 녹음 런별 오디오 파일. 중단 없이 끝난 레슨은 1개, 앱 전환·종료 후
   * 재개된 레슨은 런 수만큼 나온다. 런마다 독립 헤더를 가진 유효한
   * 파일이라 각각 그대로 재생·저장할 수 있다(서로 다른 컨테이너 파일을
   * 이어붙인 단일 blob 은 대부분의 플레이어가 첫 런까지만 재생하므로
   * 합치지 않는다).
   */
  runBlobs: Array<{ blob: Blob; durationSec: number }>;
  mimeType: string;
  /** 전체 누적 녹음 시간(모든 런 합). */
  durationSec: number;
  handoff: LiveLessonHandoff;
}

/**
 * 레슨 1회분의 라이브 녹음 세션. UI(컴패니언)는 이 객체만 잡고 있으면 되고,
 * 저장·분석·복구는 전부 이 안에서 처리된다.
 */
export class LessonAudioSession {
  readonly id: string;
  readonly mimeType: string;

  private readonly opts: Required<Pick<LessonAudioSessionOptions, 'studentName'>> &
    LessonAudioSessionOptions;
  private readonly analyzer: SegmentAnalyzer;
  private readonly queue = new SegmentAnalysisQueue();
  private readonly rollingSummary: RollingSummaryController;
  private liveSummary = '';
  private liveSummaryUpdating = false;

  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;

  /** 현재 런의 archive 청크(메모리). 이전 런의 청크는 IDB 에만 있다. */
  private archiveChunks: Blob[] = [];
  private chunkCount = 0;
  private notes: LessonSegmentNote[] = [];
  /** 노트 식별자 발급기 — 청크 전사와 실시간 음성 노트가 공유한다. */
  private noteSeq = 0;
  /**
   * 필기 소스. 'speech' = 온디바이스 실시간 인식이 addSpeechNote 로 노트를
   * 넣는 중이므로 청크 AI 전사는 끈다(오디오 아카이브는 계속). 'ai' =
   * 인식 미지원/실패 기기 폴백 — 10초 청크를 AI 로 전사한다.
   */
  private transcriptSource: 'ai' | 'speech' = 'ai';
  /** 녹음 런 경계 — beginRun 마다 하나씩 쌓인다. */
  private runs: RecordingRunMarker[] = [];
  /** 현재 런 첫 청크에서 떼어낸 컨테이너 헤더 — 이후 청크에 접두. */
  private initSegment: Promise<Blob | null> | null = null;
  private recordedSec = 0;
  private lastSummaryAtSec = 0;
  private paused = false;
  private stopped = false;
  private tickTimer: number | null = null;
  private startedAt = Date.now();

  constructor(opts: LessonAudioSessionOptions, resumeMeta?: LessonAudioSessionMeta) {
    this.id = resumeMeta
      ? resumeMeta.id
      : `la_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 8)}`;
    if (resumeMeta) {
      this.notes = resumeMeta.notes ?? [];
      this.noteSeq = this.notes.reduce((max, n) => Math.max(max, n.index + 1), 0);
      this.chunkCount = resumeMeta.chunkCount ?? 0;
      this.recordedSec = resumeMeta.recordedSec ?? 0;
      this.lastSummaryAtSec = resumeMeta.recordedSec ?? 0;
      this.startedAt = resumeMeta.startedAt ?? Date.now();
      this.runs = resumeMeta.runs ?? [{ firstChunk: 0, baseSec: 0 }];
      this.liveSummary = resumeMeta.liveSummary ?? '';
    }
    this.opts = opts;
    this.analyzer = opts.analyzer ?? transcribeLessonAudioSegment;
    this.mimeType = pickAudioMimeType();
    this.rollingSummary = new RollingSummaryController(
      opts.rollingSummarizer ?? generateRollingLessonSummary,
      (summary) => {
        this.liveSummary = summary;
        this.emitNotes();
      },
      (updating) => {
        this.liveSummaryUpdating = updating;
        this.emitNotes();
      }
    );
  }

  get recordedDurationSec(): number {
    return this.recordedSec;
  }

  snapshot(): LiveSessionSnapshot {
    const done = this.notes.filter((n) => n.status === 'done');
    return {
      recordedSec: this.recordedSec,
      segmentCount: this.notes.length,
      analyzedCount: done.length,
      failedCount: this.notes.filter((n) => n.status === 'failed').length,
      latestKeyPoints: done
        .flatMap((n) => n.keyPoints)
        .slice(-3)
        .reverse(),
      liveSummary: this.liveSummary,
      liveSummaryUpdating: this.liveSummaryUpdating,
    };
  }

  getNotes(): LessonSegmentNote[] {
    return [...this.notes];
  }

  /**
   * 크래시·앱 종료로 끊긴 세션을 같은 id 로 복원한다. 필기 노트·요약·
   * 누적 녹음 시간이 그대로 살아나고, 이후 `start()` 가 새 녹음 런을
   * 이어붙인다. 메타가 없으면(이미 저장·폐기됨) null.
   */
  static async resume(
    sessionId: string,
    opts: LessonAudioSessionOptions
  ): Promise<LessonAudioSession | null> {
    const meta = await idbGet<LessonAudioSessionMeta>(
      SESSION_STORE,
      sessionId
    ).catch(() => undefined);
    if (!meta) return null;
    return new LessonAudioSession({ ...opts, studentName: meta.studentName }, meta);
  }

  async start(stream: MediaStream): Promise<void> {
    registry.set(this.id, this);
    this.beginRun(stream);
    await this.persistMeta();

    // 1초 틱: 녹음 시간 적산 + 요약 노트 주기 판정. (청크 분할은 레코더의
    // 타임슬라이스가 담당하므로 여기서 할 일이 없다.)
    if (this.tickTimer != null) window.clearInterval(this.tickTimer);
    this.tickTimer = window.setInterval(() => {
      if (this.paused || this.stopped) return;
      this.recordedSec += 1;
      // 하단 "요약 노트"는 필기와 별개의 5분 주기 — 매 전사마다 요약을
      // 다시 돌리면 낭비이고, 코치도 5분 단위 정리를 원한다.
      if (
        this.recordedSec - this.lastSummaryAtSec >=
        (this.opts.summaryIntervalSec ?? SUMMARY_INTERVAL_SEC)
      ) {
        this.lastSummaryAtSec = this.recordedSec;
        this.rollingSummary.notify(this.getNotes(), this.opts.studentName);
      }
    }, 1000);
  }

  /** 새 녹음 런 시작 — 최초 start() 와 재개(restartRecording) 공용 경로. */
  private beginRun(stream: MediaStream): void {
    this.stream = stream;
    this.runs.push({ firstChunk: this.chunkCount, baseSec: this.recordedSec });
    this.archiveChunks = [];
    this.initSegment = null;

    const recorderOpts: MediaRecorderOptions = {
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      ...(this.mimeType ? { mimeType: this.mimeType } : {}),
    };

    // 단일 레코더 + 타임슬라이스: 매 청크가 아카이브(IDB 영속)이자 필기
    // 세그먼트다. 런 도중에는 레코더를 재생성하지 않으므로 모바일에서
    // 재생성이 실패해 필기가 멈추는 문제가 구조적으로 없다.
    const recorder = new MediaRecorder(stream, recorderOpts);
    recorder.ondataavailable = (e) => {
      if (e.data.size === 0) return;
      this.handleChunk(e.data);
    };
    recorder.start((this.opts.segmentTargetSec ?? SEGMENT_TARGET_SEC) * 1000);
    this.recorder = recorder;
  }

  /** 레코더가 살아 있는가 — 백그라운드 복귀 시 자동 재개 판정용. */
  get isRecorderAlive(): boolean {
    return this.recorder != null && this.recorder.state !== 'inactive';
  }

  /**
   * 죽은 레코더를 같은 세션의 새 런으로 되살린다(백그라운드 복귀 경로).
   * 이미 살아 있거나 종료된 세션이면 아무것도 하지 않는다.
   */
  restartRecording(stream: MediaStream): void {
    if (this.stopped || this.isRecorderAlive) return;
    this.beginRun(stream);
    if (this.paused) {
      // 일시정지 중 죽었다면 재개도 일시정지 상태로 — 코치의 의도 유지.
      try {
        this.recorder?.pause();
      } catch {
        this.paused = false;
      }
    }
    void this.persistMeta();
  }

  /** 백그라운드 진입 등 위험 신호에 메타를 즉시 영속화한다. */
  checkpoint(): Promise<void> {
    return this.persistMeta();
  }

  /**
   * 타임슬라이스 청크 하나 = 아카이브 조각 + 필기 세그먼트.
   * 런의 첫 청크에서 컨테이너 헤더를 떼어 두고, 이후 청크는 그 헤더를
   * 접두해 독립 디코딩 가능한 조각으로 만들어 전사 큐에 넣는다.
   */
  private handleChunk(chunk: Blob): void {
    const run = this.runs[this.runs.length - 1];
    const chunkIndex = this.chunkCount++;
    // 타임슬라이스는 녹음 시간 기준으로 균일하므로(일시정지 중에는 청크도
    // 멈춘다) 런 기준 오프셋 + 런 내 청크 서수로 시각을 유도한다 — 1초
    // 틱과의 발화 순서 경합으로 타임스탬프가 밀리지 않는다.
    const target = this.opts.segmentTargetSec ?? SEGMENT_TARGET_SEC;
    const startSec = run.baseSec + (chunkIndex - run.firstChunk) * target;
    const durationSec = Math.max(1, this.recordedSec - startSec);

    // 크래시 대비 아카이브 영속화 (런별 파일 = 런 구간 청크 concat).
    this.archiveChunks.push(chunk);
    void idbPut(BLOB_STORE, chunkKey(this.id, chunkIndex), chunk)
      .then(() => this.persistMeta())
      .catch((err) => log.warn('archive 청크 저장 실패:', err));

    if (chunkIndex === run.firstChunk) {
      // 헤더 추출은 비동기(arrayBuffer) — 이후 청크들이 then 으로 기다린다.
      // speech 모드에서도 추출은 해 둔다: 인식이 도중에 죽어 ai 폴백으로
      // 전환되면 그 시점 이후 청크에 헤더가 필요하다.
      this.initSegment = chunk
        .arrayBuffer()
        .then((buf) => {
          const end = findInitSegmentEnd(new Uint8Array(buf));
          if (end <= 0) {
            log.warn('init segment 경계를 찾지 못함 — 청크 단독 전사로 폴백');
            return null;
          }
          return chunk.slice(0, end, chunk.type);
        })
        .catch(() => null);
      if (this.transcriptSource === 'ai') {
        // 첫 청크는 헤더를 포함한 완결 파일이므로 그대로 전사한다.
        this.enqueueSegment(this.noteSeq++, startSec, durationSec, chunk);
      }
      return;
    }

    if (this.transcriptSource !== 'ai') return;

    // 종료 직전의 초단편(<3s) 꼬리는 분석 가치가 없다.
    if (durationSec < 3 && this.stopped) return;

    const init = this.initSegment ?? Promise.resolve(null);
    void init.then((header) => {
      const blob = header
        ? new Blob([header, chunk], { type: this.mimeType || 'audio/webm' })
        : chunk;
      this.enqueueSegment(this.noteSeq++, startSec, durationSec, blob);
    });
  }

  /**
   * 필기 소스 전환. 컴패니언이 온디바이스 인식 가용 여부에 따라 호출한다
   * — speech 로 두면 청크 AI 전사를 멈추고(오디오 아카이브는 계속),
   * 인식이 도중에 죽으면 ai 로 되돌려 다음 청크부터 폴백 전사가 붙는다.
   */
  setTranscriptSource(source: 'ai' | 'speech'): void {
    this.transcriptSource = source;
  }

  /**
   * 온디바이스 실시간 인식이 확정한 발화 한 줄을 필기 노트로 넣는다.
   * 이후의 요약·최종 리포트·복구가 전부 이 노트를 재료로 쓴다.
   */
  addSpeechNote(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || this.stopped) return;
    const note: LessonSegmentNote = {
      index: this.noteSeq++,
      startSec: this.recordedSec,
      durationSec: 0,
      status: 'done',
      transcript: trimmed,
      keyPoints: [],
      drills: [],
      metrics: [],
      studentState: '',
    };
    this.notes = [...this.notes, note];
    this.emitNotes();
    void this.persistMeta();
  }

  pause(): void {
    if (this.paused || this.stopped) return;
    this.paused = true;
    try {
      this.recorder?.pause();
    } catch (err) {
      log.warn('pause 실패:', err);
    }
  }

  resume(): void {
    if (!this.paused || this.stopped) return;
    this.paused = false;
    try {
      this.recorder?.resume();
    } catch (err) {
      log.warn('resume 실패:', err);
    }
  }

  get isPaused(): boolean {
    return this.paused;
  }

  private enqueueSegment(
    index: number,
    startSec: number,
    durationSec: number,
    blob: Blob
  ): void {
    const note: LessonSegmentNote = {
      index,
      startSec,
      durationSec,
      status: 'analyzing',
      transcript: '',
      keyPoints: [],
      drills: [],
      metrics: [],
      studentState: '',
    };
    this.notes = [...this.notes.filter((n) => n.index !== index), note].sort(
      (a, b) => a.index - b.index
    );
    this.emitNotes();

    const ctx: SegmentPromptContext = {
      studentName: this.opts.studentName,
      index,
      startSec,
      durationSec,
      previousKeyPoints: this.notes
        .filter((n) => n.status === 'done')
        .flatMap((n) => n.keyPoints),
    };

    this.queue.enqueue(
      index,
      async () => {
        const analyzed = await this.analyzer(blob, this.mimeType || 'audio/webm', ctx);
        this.updateNote(index, {
          ...analyzed,
          index,
          startSec,
          durationSec,
          status: 'done',
        });
      },
      () => {
        this.updateNote(index, { ...note, status: 'failed' });
      }
    );
  }

  private updateNote(index: number, next: LessonSegmentNote): void {
    this.notes = this.notes
      .map((n) => (n.index === index ? next : n))
      .sort((a, b) => a.index - b.index);
    this.emitNotes();
    void this.persistMeta();
  }

  private emitNotes(): void {
    this.opts.onNotesChanged?.(this.getNotes());
  }

  private persistMeta(): Promise<void> {
    const meta: LessonAudioSessionMeta = {
      id: this.id,
      studentName: this.opts.studentName,
      startedAt: this.startedAt,
      updatedAt: Date.now(),
      status: this.stopped ? 'finished' : 'recording',
      mimeType: this.mimeType || 'audio/webm',
      chunkCount: this.chunkCount,
      recordedSec: this.recordedSec,
      notes: this.notes,
      runs: this.runs,
      liveSummary: this.liveSummary,
    };
    return idbPut(SESSION_STORE, this.id, meta).catch((err) => {
      log.warn('세션 메타 저장 실패:', err);
    });
  }

  /** 녹음 종료. 마지막 세그먼트 분석은 백그라운드 큐에서 계속된다. */
  async stop(): Promise<StopResult> {
    this.stopped = true;
    if (this.tickTimer != null) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    // 레코더 정지 — onstop 직전에 마지막 부분 청크의 dataavailable 이
    // 먼저 도착하므로, onstop 을 기다리면 꼬리 청크까지 처리된 상태다.
    const recorder = this.recorder;
    this.recorder = null;
    await new Promise<void>((resolve) => {
      if (!recorder || recorder.state === 'inactive') {
        resolve();
        return;
      }
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    await this.persistMeta();

    // 런별 오디오 조립: 마지막(현재) 런은 메모리 청크로, 이전 런들은
    // (재개 전 데이터라 메모리에 없으므로) IDB 아카이브에서 읽는다.
    const mime = this.mimeType || 'audio/webm';
    const runBlobs: Array<{ blob: Blob; durationSec: number }> = [];
    for (let i = 0; i < this.runs.length; i++) {
      const run = this.runs[i];
      const isLast = i === this.runs.length - 1;
      const endChunk = isLast ? this.chunkCount : this.runs[i + 1].firstChunk;
      const endSec = isLast ? this.recordedSec : this.runs[i + 1].baseSec;
      let chunks: Blob[];
      if (isLast) {
        chunks = this.archiveChunks;
      } else {
        chunks = [];
        for (let c = run.firstChunk; c < endChunk; c++) {
          const blob = await idbGet<Blob>(BLOB_STORE, chunkKey(this.id, c)).catch(
            () => undefined
          );
          if (blob) chunks.push(blob);
        }
      }
      if (chunks.length === 0) continue;
      runBlobs.push({
        blob: new Blob(chunks, { type: mime }),
        durationSec: Math.max(1, endSec - run.baseSec),
      });
    }

    return {
      runBlobs,
      mimeType: mime,
      durationSec: this.recordedSec,
      handoff: {
        sessionId: this.id,
        recordedDurationSec: this.recordedSec,
        noteCount: this.notes.length,
        pendingCount: this.queue.pendingCount,
      },
    };
  }

  /** 저장 없이 폐기(코치가 나가기 선택). */
  async discard(): Promise<void> {
    this.stopped = true;
    if (this.tickTimer != null) window.clearInterval(this.tickTimer);
    try {
      if (this.recorder && this.recorder.state !== 'inactive') {
        this.recorder.onstop = null;
        this.recorder.ondataavailable = null;
        this.recorder.stop();
      }
    } catch {
      // teardown은 best-effort
    }
    registry.delete(this.id);
    await discardLessonAudioSession(this.id);
  }

  /** 분석 큐 대기 (핸드오프 이후 폼이 최종 요약 전에 호출). */
  settleAnalyses(timeoutMs?: number): Promise<void> {
    return this.queue.settle(timeoutMs);
  }
}

// ─── Session registry + cross-surface APIs ───────────────────────────────────

/** 살아있는 세션(녹음 중이거나 방금 종료돼 분석이 진행 중인 것)의 레지스트리. */
const registry = new Map<string, LessonAudioSession>();

export const getLiveLessonSession = (
  sessionId: string
): LessonAudioSession | undefined => registry.get(sessionId);

/**
 * 세션의 최신 세그먼트 노트를 수집한다. 살아있는 세션이면 진행 중인 분석을
 * `waitMs` 까지 기다렸다가 반환하고, 죽은 세션(복구본)이면 IDB 메타를 읽는다.
 */
export const collectSessionNotes = async (
  sessionId: string,
  opts: { waitMs?: number } = {}
): Promise<LessonSegmentNote[]> => {
  const live = registry.get(sessionId);
  if (live) {
    await live.settleAnalyses(opts.waitMs ?? 25_000);
    return live.getNotes();
  }
  const meta = await idbGet<LessonAudioSessionMeta>(SESSION_STORE, sessionId).catch(
    () => undefined
  );
  return meta?.notes ?? [];
};

/** 세션의 IDB 데이터(청크·세그먼트·메타)를 전부 삭제한다. */
export const discardLessonAudioSession = async (sessionId: string): Promise<void> => {
  registry.delete(sessionId);
  try {
    const keys = [
      ...(await idbKeysByPrefix(BLOB_STORE, `chunk:${sessionId}:`)),
      ...(await idbKeysByPrefix(BLOB_STORE, `seg:${sessionId}:`)),
    ];
    await Promise.all(keys.map((k) => idbDelete(BLOB_STORE, k)));
    await idbDelete(SESSION_STORE, sessionId);
  } catch (err) {
    log.warn('세션 폐기 실패(무시):', err);
  }
};

/**
 * 크래시/미저장으로 남은 세션 목록. 정상 저장 흐름은 저장 완료 시
 * `discardLessonAudioSession` 을 호출하므로, IDB 에 남아 있으면서 현재
 * 레지스트리에 없는 세션은 전부 "레슨 기록으로 저장되지 못한" 녹음이다.
 * ('recording' = 녹음 중 크래시, 'finished' = 종료 후 저장 전에 이탈)
 */
export const findRecoverableSessions = async (): Promise<
  RecoverableLessonSession[]
> => {
  try {
    const metas = await idbAllSessionMetas();
    return metas
      .filter((m) => !registry.has(m.id))
      .filter((m) => m.recordedSec >= 10)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((m) => ({
        id: m.id,
        studentName: m.studentName,
        startedAt: m.startedAt,
        updatedAt: m.updatedAt,
        recordedSec: m.recordedSec,
        analyzedCount: m.notes.filter((n) => n.status === 'done').length,
        segmentCount: m.notes.length,
      }));
  } catch (err) {
    log.warn('복구 세션 조회 실패:', err);
    return [];
  }
};

/** 보존 기한이 지난 세션 정리 — 컴패니언 마운트 시 best-effort 로 호출. */
export const purgeStaleLessonAudioSessions = async (): Promise<void> => {
  try {
    const metas = await idbAllSessionMetas();
    const cutoff = Date.now() - SESSION_RETENTION_MS;
    await Promise.all(
      metas
        .filter((m) => m.updatedAt < cutoff)
        .map((m) => discardLessonAudioSession(m.id))
    );
  } catch {
    // best-effort
  }
};

// ─── Final summary (map-reduce) ──────────────────────────────────────────────

/**
 * 세그먼트 노트만으로 최종 레슨 리포트를 생성한다. 오디오는 다시 보내지
 * 않으므로 레슨 길이와 무관하게 텍스트 1회 호출로 끝난다. 코치별 커스텀
 * `lesson_summary` 시스템 프롬프트를 그대로 써서 기존 단발 경로와 동일한
 * 리포트 포맷을 유지한다.
 */
export const generateLessonSummaryFromNotes = async (
  notes: LessonSegmentNote[],
  coachNotes: string,
  opts: {
    studentName?: string;
    totalDurationSec?: number;
    coachId?: string;
    /** 스윙 사진 등 가벼운 이미지 컨텍스트(inlineData part). */
    imageParts?: Array<{ inlineData: { data: string; mimeType: string } }>;
  } = {}
): Promise<string> => {
  const usable = notes.filter((n) => n.status === 'done');
  if (usable.length === 0) {
    throw new Error('사용 가능한 세그먼트 분석 노트가 없습니다.');
  }

  const systemInstruction = await promptService.getActiveSystemPrompt(
    'lesson_summary',
    firebaseService.isInitialized(),
    opts.coachId
  );

  const result = await invokeBackendAI<unknown>('lesson_summary_merge', {
    prompt: buildMergePrompt(notes, coachNotes, opts),
    systemInstruction,
    ...(opts.imageParts?.length ? { mediaParts: opts.imageParts.slice(0, 4) } : {}),
  });

  const text = getResponseText(result);
  if (!text) throw new Error('레슨 요약 병합 응답이 비어 있습니다.');
  return text;
};

/**
 * 검토 화면의 필기 전문("[m:ss] 내용" 줄 형식, 코치가 자유 편집 가능)을
 * 타임스탬프 붙은 라인 배열로 되돌린다. 시각 표기가 없거나 깨진 줄은
 * 직전 줄의 시각을 물려받는다 — 코치가 중간에 새 줄을 끼워 넣어도
 * 기록 구조가 무너지지 않게.
 */
export const parseReviewedTranscript = (
  text: string
): Array<{ startSec: number; text: string }> => {
  const out: Array<{ startSec: number; text: string }> = [];
  let lastSec = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^\[(\d+(?::\d{2}){1,2})\]\s*(.*)$/);
    if (match) {
      const parts = match[1].split(':').map(Number);
      lastSec =
        parts.length === 3
          ? parts[0] * 3600 + parts[1] * 60 + parts[2]
          : parts[0] * 60 + parts[1];
      if (match[2].trim()) out.push({ startSec: lastSec, text: match[2].trim() });
    } else {
      out.push({ startSec: lastSec, text: line });
    }
  }
  return out;
};

/**
 * 코치가 검토 화면에서 확인/수정한 필기 전문으로 최종 리포트 프롬프트를
 * 조립한다. 편집본이 있으면 세션 노트보다 이 텍스트가 우선한다.
 */
export const buildMergePromptFromTranscript = (
  transcript: string,
  coachNotes: string,
  opts: { studentName?: string; totalDurationSec?: number; coachSummary?: string } = {}
): string => {
  const header = [
    opts.studentName ? `- **학생**: ${opts.studentName}` : null,
    opts.totalDurationSec
      ? `- **레슨 길이**: 약 ${Math.round(opts.totalDurationSec / 60)}분`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  return `아래는 레슨 중 실시간으로 받아 적은 뒤 코치가 직접 확인·수정한 레슨 필기 전문입니다. 이 필기만을 근거로 최종 레슨 요약 리포트를 작성하세요.

${header ? `**레슨 정보:**\n${header}\n\n` : ''}**레슨 필기 전문(코치 확인본):**
${transcript.trim()}
${
  opts.coachSummary?.trim()
    ? `\n**코치가 정리한 요약(참고):**\n${opts.coachSummary.trim()}\n`
    : ''
}
**코치 추가 메모:** "${coachNotes || '(없음)'}"

작성 규칙:
- 시간 흐름을 따라가되, 같은 교정 포인트가 반복되면 하나로 묶고 변화(개선/악화)를 언급하세요.
- 필기에 있는 수치는 그대로 인용하세요. 필기에 없는 사실을 추가하지 마세요.
- 코치가 정리한 요약이 있으면 그 강조점을 리포트에 반영하세요.`;
};

/**
 * 검토·편집을 거친 필기 전문 기반 최종 리포트 생성. 코치별 커스텀
 * `lesson_summary` 시스템 프롬프트를 그대로 써서 리포트 포맷을 유지한다.
 */
export const generateLessonSummaryFromTranscript = async (
  transcript: string,
  coachNotes: string,
  opts: {
    studentName?: string;
    totalDurationSec?: number;
    coachSummary?: string;
    coachId?: string;
  } = {}
): Promise<string> => {
  if (!transcript.trim()) {
    throw new Error('필기 내용이 비어 있습니다.');
  }
  const systemInstruction = await promptService.getActiveSystemPrompt(
    'lesson_summary',
    firebaseService.isInitialized(),
    opts.coachId
  );
  const result = await invokeBackendAI<unknown>('lesson_summary_merge', {
    prompt: buildMergePromptFromTranscript(transcript, coachNotes, opts),
    systemInstruction,
  });
  const text = getResponseText(result);
  if (!text) throw new Error('레슨 요약 병합 응답이 비어 있습니다.');
  return text;
};
