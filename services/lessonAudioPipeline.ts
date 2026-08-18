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
 *  1. **세그먼트 분할 녹음** — 하나의 MediaStream 에 MediaRecorder 두 개를
 *     붙인다. `archive` 레코더는 타임슬라이스 청크를 IndexedDB 에 계속
 *     흘려 써서(청크 단위 append) 크래시가 나도 마지막 몇 초만 잃는
 *     전체-레슨 아카이브를 만든다. `segment` 레코더는 SEGMENT_TARGET_SEC
 *     마다 정지→재시작해 **독립적으로 디코딩 가능한** 짧은 파일을 만든다.
 *     (한 레코더의 타임슬라이스 청크는 헤더가 첫 청크에만 있어 단독으로는
 *     못 쓰기 때문에 레코더를 둘로 나눈다. 저비트레이트 opus 인코더 두 개
 *     정도는 모바일에서도 무시할 수준의 비용이다.)
 *
 *  2. **레슨 중 증분 분석** — 세그먼트가 닫히는 즉시 동시성 제한 큐를 통해
 *     `lesson_audio_segment` 피처로 전사+코칭노트를 뽑는다. 3분 세그먼트
 *     하나는 base64 로도 ~1.5MB 라 서버 한도에 안전하고, 레슨이 끝날
 *     시점엔 대부분의 구간이 이미 분석돼 있다.
 *
 *  3. **텍스트 map-reduce 최종 요약** — 종료 시에는 오디오가 아니라 세그먼트
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
 * 세그먼트 목표 길이. 2분 = 30–50분 레슨에서 15–25개 세그먼트.
 * 실시간 요약의 갱신 주기이기도 하다 — 더 길면 화면 요약이 굼떠 보이고,
 * 더 짧으면 구간 컨텍스트가 얕아져 전사·노트 품질이 떨어진다.
 */
export const SEGMENT_TARGET_SEC = 120;
/** 첫 세그먼트만 짧게 끊어 레슨 시작 ~1분 안에 첫 필기·요약이 뜨게 한다. */
export const FIRST_SEGMENT_TARGET_SEC = 60;
/** archive 레코더의 청크 주기 — 크래시 시 최대 유실 폭. */
export const ARCHIVE_TIMESLICE_MS = 5000;
/**
 * 음성 위주 콘텐츠에 충분한 비트레이트. 48kbps opus 기준 50분 ≈ 18MB
 * (아카이브), 3분 세그먼트 ≈ 1.1MB → base64 후에도 서버 10mb 한도 안쪽.
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
}

/** 컴패니언 → 레슨 폼 핸드오프 페이로드. 노트 원본은 파이프라인이 들고 있다. */
export interface LiveLessonHandoff {
  sessionId: string;
  recordedDurationSec: number;
  noteCount: number;
  /** 핸드오프 시점에 아직 분석 중이던 세그먼트 수. */
  pendingCount: number;
}

export interface RecoverableLessonSession {
  id: string;
  studentName: string;
  startedAt: number;
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
export const buildMergePrompt = (
  notes: LessonSegmentNote[],
  coachNotes: string,
  opts: { studentName?: string; totalDurationSec?: number } = {}
): string => {
  const ordered = [...notes].sort((a, b) => a.index - b.index);
  const blocks = ordered.map((n) => {
    const window = `${formatClock(n.startSec)}–${formatClock(
      n.startSec + n.durationSec
    )}`;
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
    .filter((n) => n.status === 'done')
    .sort((a, b) => a.index - b.index);
  const blocks = done.map((n) => {
    const window = `${formatClock(n.startSec)}–${formatClock(
      n.startSec + n.durationSec
    )}`;
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
}

export interface StopResult {
  /** archive 레코더가 만든 전체 레슨 오디오(단일 유효 파일). */
  fullAudioBlob: Blob;
  mimeType: string;
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
  private archiveRecorder: MediaRecorder | null = null;
  private segmentRecorder: MediaRecorder | null = null;

  private archiveChunks: Blob[] = [];
  private chunkCount = 0;
  private notes: LessonSegmentNote[] = [];
  private segmentIndex = 0;
  private segmentStartSec = 0;
  private segmentActiveSec = 0;
  private recordedSec = 0;
  private paused = false;
  private stopped = false;
  private tickTimer: number | null = null;
  private startedAt = Date.now();

  constructor(opts: LessonAudioSessionOptions) {
    this.id = `la_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    this.opts = opts;
    this.analyzer = opts.analyzer ?? analyzeLessonAudioSegment;
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

  async start(stream: MediaStream): Promise<void> {
    this.stream = stream;
    this.startedAt = Date.now();
    registry.set(this.id, this);

    const recorderOpts: MediaRecorderOptions = {
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      ...(this.mimeType ? { mimeType: this.mimeType } : {}),
    };

    // archive: 청크를 IDB 로 흘려 써서 크래시 내성을 확보한다.
    const archive = new MediaRecorder(stream, recorderOpts);
    archive.ondataavailable = (e) => {
      if (e.data.size === 0) return;
      this.archiveChunks.push(e.data);
      const n = this.chunkCount++;
      void idbPut(BLOB_STORE, chunkKey(this.id, n), e.data)
        .then(() => this.persistMeta())
        .catch((err) => log.warn('archive 청크 저장 실패:', err));
    };
    archive.start(ARCHIVE_TIMESLICE_MS);
    this.archiveRecorder = archive;

    this.startSegmentRecorder();
    await this.persistMeta();

    // 1초 틱: 녹음 시간 적산 + 세그먼트 회전 판정.
    this.tickTimer = window.setInterval(() => {
      if (this.paused || this.stopped) return;
      this.recordedSec += 1;
      this.segmentActiveSec += 1;
      const target =
        this.segmentIndex <= 1
          ? Math.min(
              FIRST_SEGMENT_TARGET_SEC,
              this.opts.segmentTargetSec ?? SEGMENT_TARGET_SEC
            )
          : this.opts.segmentTargetSec ?? SEGMENT_TARGET_SEC;
      if (this.segmentActiveSec >= target) {
        this.rotateSegment();
      }
    }, 1000);
  }

  pause(): void {
    if (this.paused || this.stopped) return;
    this.paused = true;
    try {
      this.archiveRecorder?.pause();
      this.segmentRecorder?.pause();
    } catch (err) {
      log.warn('pause 실패:', err);
    }
  }

  resume(): void {
    if (!this.paused || this.stopped) return;
    this.paused = false;
    try {
      this.archiveRecorder?.resume();
      this.segmentRecorder?.resume();
    } catch (err) {
      log.warn('resume 실패:', err);
    }
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /**
   * 세그먼트 레코더를 닫고(완결 파일 생성) 즉시 새로 시작한다.
   * onstop 은 비동기라 다음 레코더는 바로 띄운다 — 경계에서 수십 ms 겹치거나
   * 빌 수 있지만 전사 품질에는 영향이 없다.
   */
  private rotateSegment(): void {
    const closing = this.segmentRecorder;
    this.segmentRecorder = null;
    if (closing && closing.state !== 'inactive') closing.stop();
    if (!this.stopped) this.startSegmentRecorder();
  }

  private startSegmentRecorder(): void {
    if (!this.stream) return;
    const startSec = this.recordedSec;
    this.segmentStartSec = startSec;
    this.segmentActiveSec = 0;
    const index = this.segmentIndex++;

    const chunks: Blob[] = [];
    const recorderOpts: MediaRecorderOptions = {
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      ...(this.mimeType ? { mimeType: this.mimeType } : {}),
    };
    const rec = new MediaRecorder(this.stream, recorderOpts);
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      const durationSec = Math.max(1, this.recordedSec - startSec);
      const blob = new Blob(chunks, { type: this.mimeType || 'audio/webm' });
      // 잡음만 있는 초단편(<3s)은 분석 가치가 없다.
      if (blob.size === 0 || durationSec < 3) return;
      this.onSegmentClosed(index, startSec, durationSec, blob);
    };
    rec.start();
    this.segmentRecorder = rec;
  }

  private onSegmentClosed(
    index: number,
    startSec: number,
    durationSec: number,
    blob: Blob
  ): void {
    void idbPut(BLOB_STORE, segmentKey(this.id, index), blob).catch((err) =>
      log.warn('세그먼트 저장 실패:', err)
    );

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
        // 세그먼트 분석 결과는 이미 노트로 영속화되므로 오디오 원본은
        // 정리해 IDB 사용량을 낮춘다. (전체 아카이브 청크는 유지)
        void idbDelete(BLOB_STORE, segmentKey(this.id, index)).catch(() => {});
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
    // 새 구간 분석이 확정될 때마다 화면의 롤링 요약을 재생성한다.
    // 컨트롤러가 단일 비행을 보장하므로 여기서는 그냥 알리기만 한다.
    if (next.status === 'done' && !this.stopped) {
      this.rollingSummary.notify(this.getNotes(), this.opts.studentName);
    }
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

    // 마지막 세그먼트 마감 (onstop 이 큐에 분석을 넣는다)
    const seg = this.segmentRecorder;
    this.segmentRecorder = null;
    const segStopped = new Promise<void>((resolve) => {
      if (!seg || seg.state === 'inactive') {
        resolve();
        return;
      }
      const prev = seg.onstop;
      seg.onstop = (e) => {
        prev?.call(seg, e);
        resolve();
      };
      seg.stop();
    });

    const archive = this.archiveRecorder;
    this.archiveRecorder = null;
    const archiveStopped = new Promise<void>((resolve) => {
      if (!archive || archive.state === 'inactive') {
        resolve();
        return;
      }
      archive.onstop = () => resolve();
      archive.stop();
    });

    await Promise.all([segStopped, archiveStopped]);
    await this.persistMeta();

    const fullAudioBlob = new Blob(this.archiveChunks, {
      type: this.mimeType || 'audio/webm',
    });

    return {
      fullAudioBlob,
      mimeType: this.mimeType || 'audio/webm',
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
      if (this.segmentRecorder && this.segmentRecorder.state !== 'inactive') {
        this.segmentRecorder.onstop = null;
        this.segmentRecorder.stop();
      }
      if (this.archiveRecorder && this.archiveRecorder.state !== 'inactive') {
        this.archiveRecorder.onstop = null;
        this.archiveRecorder.stop();
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
        recordedSec: m.recordedSec,
        analyzedCount: m.notes.filter((n) => n.status === 'done').length,
        segmentCount: m.notes.length,
      }));
  } catch (err) {
    log.warn('복구 세션 조회 실패:', err);
    return [];
  }
};

export interface RecoveredSessionAudio {
  blob: Blob;
  mimeType: string;
  durationSec: number;
  notes: LessonSegmentNote[];
}

/**
 * 크래시 세션의 전체 오디오를 archive 청크에서 재조립한다. 청크는 단일
 * MediaRecorder 산출물이므로 순서대로 이어붙이면 유효한 파일이 된다.
 */
export const recoverSessionAudio = async (
  sessionId: string
): Promise<RecoveredSessionAudio | null> => {
  const meta = await idbGet<LessonAudioSessionMeta>(SESSION_STORE, sessionId).catch(
    () => undefined
  );
  if (!meta) return null;
  const keys = (await idbKeysByPrefix(BLOB_STORE, `chunk:${sessionId}:`)).sort();
  const chunks: Blob[] = [];
  for (const key of keys) {
    const blob = await idbGet<Blob>(BLOB_STORE, key);
    if (blob) chunks.push(blob);
  }
  if (chunks.length === 0) return null;
  return {
    blob: new Blob(chunks, { type: meta.mimeType }),
    mimeType: meta.mimeType,
    durationSec: meta.recordedSec,
    notes: meta.notes,
  };
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
