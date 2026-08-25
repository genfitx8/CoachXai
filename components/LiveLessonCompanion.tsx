import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mic,
  Camera,
  Video,
  Trash2,
  CheckCircle2,
  Clock,
  Plus,
  Pause,
  Play,
  Radio,
  Sparkles,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  isMediaPermissionError,
  requestMediaStream,
} from '../utils/mediaPermissions';
import { PermissionDeniedModal } from './PermissionDeniedModal';
import {
  LessonAudioSession,
  buildTranscriptText,
  formatDualSummary,
  generateDualLessonSummary,
  labelTranscriptSpeakers,
  preciseTranscribeNotes,
  repairTranscriptTerms,
  findRecoverableSessions,
  formatClock,
  purgeStaleLessonAudioSessions,
  discardLessonAudioSession,
  type LessonDualSummary,
  type LessonSegmentNote,
  type LiveLessonHandoff,
  type LiveSessionSnapshot,
  type RecoverableLessonSession,
} from '../services/lessonAudioPipeline';
import { LessonNotebook } from './LessonNotebook';
import { BackButton } from './ui/BackButton';
import { useLiveTranscription } from '../hooks/useLiveTranscription';

/**
 * 3c · 레슨 중 동반 (Live Lesson Companion)
 *
 * A dedicated during-lesson surface for the coach. The redesign asks
 * for something the coach can prop up on the mat and glance at with
 * dirty hands: a big rolling timer, a whole-lesson recording card, and
 * a lightweight capture pane for swing photos/videos. When the lesson
 * ends the coach hands the captured artifacts off to the review screen
 * (8b) via `onFinish` — this component never persists on its own, so
 * the parent decides how to upload/store the artifacts.
 *
 * Photos and clips fall through to a native camera input
 * (`capture="environment"`) — the coach is already looking at the phone
 * camera, and this avoids the second permission prompt + surface
 * complexity of a live video preview during a live lesson.
 *
 * 레슨 전체 녹음(30–50분 연속)은 `lessonAudioPipeline` 의 세션이 담당한다:
 * 세그먼트 분할 저장(IndexedDB, 크래시 복구 가능) + 레슨 중 세그먼트별
 * AI 분석이 백그라운드로 돌아, 종료 시점에는 요약 재료(구간 노트)가 이미
 * 준비돼 있다. 종료하면 전체 오디오가 클립으로 승격되고 세션 핸드오프가
 * `onFinish` 의 두 번째 인자로 리뷰 화면에 전달된다.
 */

export interface CapturedClip {
  id: string;
  kind: 'voice' | 'photo' | 'video';
  blob: Blob;
  /** Duration in seconds for voice/video, 0 for photos. */
  durationSec: number;
  /** Client-side thumbnail URL (object URL) for playback/preview. */
  previewUrl: string;
  /** Wall clock capture time so the summary knows the sequence. */
  capturedAt: number;
}

export interface LiveLessonCompanionProps {
  /** Student name shown in the header. */
  studentName: string;
  /** Lesson date string (e.g. "2025-08-12") for the header. */
  lessonDate?: string;
  /**
   * Called when the coach hits 종료. Parent uploads + routes to review.
   * `liveSession` 은 전체-레슨 녹음이 있었을 때의 세션 핸드오프 — 리뷰
   * 화면(NewLessonForm)이 이 id로 구간 분석 노트를 수거해 빠른 최종
   * 요약(map-reduce)을 돌린다.
   */
  onFinish: (clips: CapturedClip[], liveSession?: LiveLessonHandoff) => void;
  /** Called when the coach dismisses without finishing (early exit). */
  onCancel: () => void;
}

const formatDuration = (totalSec: number): string => {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatElapsed = (totalSec: number): string => {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/**
 * 정밀 전사(녹음 전체 다시 받아 적기) 대기 한도.
 *
 * 다른 단계보다 후하게 준다 — 이 패스가 레슨 기록의 정확도를 결정하고,
 * 코치도 "조금 기다리더라도 정확한 필기"를 원한다. 5분 조각을 3개씩
 * 병렬로 도는 구조라 50분 레슨이면 대략 40~60초다. 넘기면 실시간 필기를
 * 그대로 쓰므로 기록을 잃지는 않는다.
 */
const REVIEW_PRECISE_TIMEOUT_MS = 150_000;

/**
 * 잠정 줄(브라우저 인식)을 화면에 남겨 두는 최대 시간(초).
 *
 * 보통은 그 시간대의 AI 필기가 도착하면서 걷힌다. 말소리가 없어 전사를
 * 건너뛴 구간은 확정 필기가 오지 않으므로, 이 나이를 넘긴 잠정 줄은 그냥
 * 정리한다 — 구간 길이(20초)에 전사 왕복을 더한 것보다 넉넉하게 잡는다.
 */
const PROVISIONAL_MAX_AGE_SEC = 75;

/** 검토 화면을 여는 데 요약 응답을 기다려 줄 최대 시간. */
const REVIEW_SUMMARY_TIMEOUT_MS = 15_000;
/**
 * 화자 라벨링 대기 한도. 필기가 긴 레슨이면 묶음을 두어 번 나눠 호출한다.
 */
const REVIEW_LABEL_TIMEOUT_MS = 15_000;
/**
 * 용어 교정 대기 한도. 교정은 줄마다 본문을 다시 받아 오는 작업이라
 * 라벨링보다 응답이 길고, 긴 레슨이면 묶음을 여러 번 나눠 호출한다.
 * 그래서 시간이 다 되면 **새 묶음을 시작하지 않는** 선(deadline)을 함께
 * 넘겨, 앞부분 교정까지는 살려서 돌려받는다. 아래 race 는 호출 하나가
 * 통째로 멎었을 때를 위한 최후 방어선이라 조금 더 길게 잡는다.
 */
const REVIEW_REPAIR_TIMEOUT_MS = 15_000;
const REVIEW_REPAIR_HARD_TIMEOUT_MS = 20_000;

/**
 * 검토 초안을 만드는 3단계. 셋은 앞 단계의 결과를 근거로 삼기 때문에
 * 순서대로 돈다 — 잘못 적힌 용어를 먼저 되돌려야 화자 판단의 단서(지시
 * 어휘)가 살고, 화자가 갈려야 코치 요약과 학생 요약을 나눠 쓸 수 있다.
 */
type ReviewStage = 'precise' | 'repair' | 'speaker' | 'summary';

const REVIEW_STAGE_LABELS: Record<ReviewStage, string> = {
  precise: '녹음을 처음부터 다시 듣고 정확히 받아 적고 있어요…',
  repair: '필기를 코칭 용어로 다듬고 있어요…',
  speaker: '코치와 학생의 말을 구분하고 있어요…',
  summary: '코치 요약과 학생 요약을 만들고 있어요…',
};

/**
 * 검토 초안 단계 하나를 시간 제한 아래 돌린다. 어느 단계가 늘어지거나
 * 실패해도 검토 화면이 '정리 중'에 갇히면(저장 버튼 비활성) 코치는 레슨
 * 기록을 아예 못 쓰므로, 못 받으면 그 단계만 건너뛴다.
 */
const withReviewTimeout = <T,>(work: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([
    work,
    new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), ms)),
  ]).catch(() => fallback);

const randomId = () =>
  `clip_${Math.random().toString(36).slice(2, 10)}_${performance.now().toFixed(0)}`;

/**
 * 레슨 녹음용 마이크 제약. 기본값(`{audio:true}`)으로 잡으면 브라우저가
 * 통화용 프로파일을 골라, 매트 건너편 학생 목소리가 묻히고 타구음이 그대로
 * 실린다. 받아 적을 오디오의 품질이 곧 필기 정확도라 여기서부터 맞춘다.
 *
 *  - echoCancellation 끔: 스피커 출력이 없는 현장에서 이걸 켜면 원거리
 *    음성을 반향으로 보고 깎아낸다 — 학생 목소리가 가장 먼저 사라진다.
 *  - noiseSuppression 켬: 타구음·바람·기계음을 줄인다.
 *  - autoGainControl 켬: 코치(가까움)와 학생(멀리)의 음량 차를 메운다.
 *  - 모노 48kHz: 전사 모델에 필요한 건 방향이 아니라 또렷한 한 채널이다.
 *
 * 제약을 못 받아 주는 기기가 있으므로 실패하면 기본 오디오로 물러선다 —
 * 품질보다 "녹음이 되는 것"이 먼저다.
 */
const LESSON_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  sampleRate: 48_000,
  echoCancellation: false,
  noiseSuppression: true,
  autoGainControl: true,
};

const requestLessonMic = async (): Promise<MediaStream> => {
  try {
    return await requestMediaStream({ audio: LESSON_AUDIO_CONSTRAINTS });
  } catch (e) {
    // 권한 거부는 제약 문제가 아니다 — 그대로 올려 보내 안내 모달을 띄운다.
    if (isMediaPermissionError(e) && e.kind === 'denied') throw e;
    return requestMediaStream({ audio: true });
  }
};

export const LiveLessonCompanion: React.FC<LiveLessonCompanionProps> = ({
  studentName,
  lessonDate,
  onFinish,
  onCancel,
}) => {
  // ─── Elapsed lesson timer ─────────────────────────────────────────────────
  const [lessonStartAt] = useState(() => Date.now());
  const [elapsedSec, setElapsedSec] = useState(0);
  const [timerPaused, setTimerPaused] = useState(false);
  useEffect(() => {
    if (timerPaused) return;
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - lessonStartAt) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [lessonStartAt, timerPaused]);

  // ─── 레슨 전체 녹음 (segmented pipeline) ──────────────────────────────────
  const lessonSessionRef = useRef<LessonAudioSession | null>(null);
  const [lessonRecState, setLessonRecState] = useState<
    'idle' | 'recording' | 'paused' | 'finishing'
  >('idle');
  const [sessionSnapshot, setSessionSnapshot] =
    useState<LiveSessionSnapshot | null>(null);
  /** 필기 노트 — 종이 노트(LessonNotebook)가 이 배열을 그린다. */
  const [liveNotes, setLiveNotes] = useState<LessonSegmentNote[]>([]);
  const lessonStreamRef = useRef<MediaStream | null>(null);
  /**
   * 백그라운드 복귀 재시작이 진행 중인지. visibilitychange 는 짧은 시간에
   * 여러 번 올 수 있는데(화면 껐다 켜기, 앱 전환), getUserMedia 가 끝나기
   * 전에 두 번째 재시작이 겹치면 레코더가 중복 생성되거나 살아 있는
   * 레코더의 스트림을 끊어 필기가 중복/유실된다.
   */
  const restartInFlightRef = useRef(false);

  /**
   * 아직 AI 필기가 도착하지 않은 구간의 **잠정 문장**(브라우저 음성 인식).
   *
   * 정확도 우선 정책: 레슨 필기의 원천은 녹음된 오디오를 AI 가 받아 적은
   * 결과다. 브라우저의 일반 어휘 인식기는 골프 코칭 용어를 모르고 현장
   * 소음에 약해, 그 결과를 그대로 기록에 남기면 정확도가 거기에 묶인다.
   *
   * 그렇다고 인식기를 버리면 확정 필기가 20초에 한 번씩만 나타나 "받아
   * 적히는 느낌"이 사라진다. 그래서 인식기의 문장은 **연한 잉크의 잠정
   * 줄**로 즉시 적고, 그 시간대의 AI 필기가 도착하면 조용히 걷어낸다 —
   * 코치는 말하는 즉시 글이 흐르는 것을 보고, 남는 기록은 정확한 쪽이다.
   */
  const [provisional, setProvisional] = useState<
    { text: string; atSec: number }[]
  >([]);
  const transcription = useLiveTranscription({
    lang: 'ko-KR',
    onFinal: (text) => {
      const atSec = lessonSessionRef.current?.snapshot().recordedSec ?? 0;
      setProvisional((prev) => [...prev, { text, atSec }]);
    },
  });
  /** 미리보기 인식이 살아 있는가 — 화면 표시에만 쓴다. */
  const previewActive = transcription.active && !transcription.degraded;

  /**
   * 확정 필기가 덮은 구간의 잠정 줄을 걷어낸다.
   *
   * 말소리가 없어 전사를 건너뛴 구간은 확정 필기가 영영 오지 않으므로,
   * 시간이 지난 잠정 줄도 함께 정리한다 — 그러지 않으면 연한 잉크가 화면
   * 끝까지 쌓인다.
   */
  useEffect(() => {
    const coveredUntil = liveNotes
      .filter((n) => n.status === 'done')
      .reduce((max, n) => Math.max(max, n.startSec + n.durationSec), 0);
    const nowSec = sessionSnapshot?.recordedSec ?? 0;
    setProvisional((prev) => {
      const next = prev.filter(
        (p) => p.atSec >= coveredUntil && nowSec - p.atSec <= PROVISIONAL_MAX_AGE_SEC
      );
      return next.length === prev.length ? prev : next;
    });
  }, [liveNotes, sessionSnapshot?.recordedSec]);

  /** 노트 끝에 흐르는 연한 잉크 — 잠정 문장 + 지금 말하는 중인 잠정 텍스트. */
  const provisionalTail = [...provisional.map((p) => p.text), transcription.interim]
    .filter(Boolean)
    .join(' ');

  /**
   * 종료 전 검토 단계 — 코치가 전체 필기와 요약을 확인·수정한 뒤
   * "기록 저장하기"를 눌러야 저장 흐름(onFinish)으로 넘어간다.
   * 열려 있는 동안 세션은 일시정지 상태라 "이어서 녹음"으로 복귀 가능.
   */
  const [reviewDraft, setReviewDraft] = useState<{
    transcriptText: string;
    /** 코치가 말한 것 — 교정 지시·드릴. */
    coachSummaryText: string;
    /** 학생이 말한 것 — 느낌·질문·반응. */
    studentSummaryText: string;
    /** 준비 중일 때 지금 돌고 있는 단계 — 화면의 진행 문구가 이걸 읽는다. */
    stage: ReviewStage;
    preparing: boolean;
    saving: boolean;
  } | null>(null);

  // 크래시/미저장 세션 복구 배너 — "이어서 쓰기"로 같은 세션을 재개한다.
  const [recoverable, setRecoverable] = useState<RecoverableLessonSession | null>(
    null
  );

  useEffect(() => {
    if (typeof indexedDB === 'undefined') return;
    let cancelled = false;
    void purgeStaleLessonAudioSessions().then(() =>
      findRecoverableSessions().then((sessions) => {
        if (!cancelled && sessions.length > 0) setRecoverable(sessions[0]);
      })
    );
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Screen Wake Lock — 레슨 녹음 중 화면이 잠들며 WebView 가 정지되는 것이
   * 현장에서 녹음이 끊기는 1순위 원인이라, 녹음하는 동안은 화면을 깨워
   * 둔다. 미지원 브라우저에서는 조용히 무시된다.
   */
  const wakeLockRef = useRef<{ release?: () => Promise<void> } | null>(null);
  const acquireWakeLock = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wl = (navigator as any).wakeLock;
      if (wl?.request) wakeLockRef.current = await wl.request('screen');
    } catch {
      // 배터리 세이버 등으로 거부될 수 있다 — 기능 자체는 계속 동작.
    }
  }, []);
  const releaseWakeLock = useCallback(() => {
    try {
      void wakeLockRef.current?.release?.();
    } catch {
      // best-effort
    }
    wakeLockRef.current = null;
  }, []);
  useEffect(() => releaseWakeLock, [releaseWakeLock]);

  /**
   * 백그라운드 전환/복귀 대응 — 레슨 동반의 생존성 핵심.
   *  - 숨겨질 때: 세션 메타를 즉시 체크포인트(앱이 그대로 죽어도 필기·
   *    청크는 IndexedDB 에 남아 재진입 시 이어갈 수 있다).
   *  - 돌아올 때: OS 가 레코더를 죽였으면 마이크를 다시 잡아 같은 세션에
   *    새 녹음 런을 이어붙이고, wake lock 을 재획득한다(백그라운드 전환
   *    시 OS 가 wake lock 을 자동 해제한다).
   */
  useEffect(() => {
    const onVisibilityChange = () => {
      const session = lessonSessionRef.current;
      if (!session) return;
      if (document.visibilityState === 'hidden') {
        void session.checkpoint();
        return;
      }
      void acquireWakeLock();
      // 일시정지(검토 단계 포함) 중에는 아무것도 되살리지 않는다. 되살리면
      // 멈춘 동안 오간 말이 필기로 들어가 코치가 레슨에서 하지 않은 대화가
      // 기록에 남는다 — 모바일에서는 화면을 껐다 켜기만 해도 이 경로가 돈다.
      if (session.isPaused) return;
      // 미리보기 인식은 있으면 좋고 없어도 그만 — 기록은 녹음이 책임진다.
      void transcription.resume();
      if (!session.isRecorderAlive && !restartInFlightRef.current) {
        restartInFlightRef.current = true;
        requestLessonMic()
          .then((stream) => {
            const s = lessonSessionRef.current;
            // getUserMedia 대기 중 레코더가 이미 복구됐다면(연속 visible
            // 이벤트 레이스) 새 스트림은 쓰지 않고 반납한다 — 살아 있는
            // 레코더의 스트림을 끊으면 재시작 루프가 돈다.
            if (!s || s.isRecorderAlive) {
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
            lessonStreamRef.current?.getTracks().forEach((t) => t.stop());
            lessonStreamRef.current = stream;
            s.restartRecording(stream);
          })
          .catch((e) => {
            console.error('[LiveLessonCompanion] 복귀 후 녹음 재개 실패', e);
          })
          .finally(() => {
            restartInFlightRef.current = false;
          });
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [acquireWakeLock]);

  // 1초 틱으로 세션 스냅샷(녹음 시간·분석 진행 상황)을 UI에 반영한다.
  useEffect(() => {
    if (lessonRecState !== 'recording' && lessonRecState !== 'paused') return;
    const id = window.setInterval(() => {
      const session = lessonSessionRef.current;
      if (session) setSessionSnapshot(session.snapshot());
    }, 1000);
    return () => window.clearInterval(id);
  }, [lessonRecState]);

  const [permissionModalOpen, setPermissionModalOpen] = useState(false);

  // ─── Captured clip list ───────────────────────────────────────────────────
  const [clips, setClips] = useState<CapturedClip[]>([]);
  const addClip = useCallback(
    (kind: CapturedClip['kind'], blob: Blob, durationSec: number) => {
      const clip: CapturedClip = {
        id: randomId(),
        kind,
        blob,
        durationSec,
        previewUrl: URL.createObjectURL(blob),
        capturedAt: Date.now(),
      };
      setClips((prev) => [...prev, clip]);
    },
    []
  );
  const removeClip = useCallback((id: string) => {
    setClips((prev) => {
      const target = prev.find((c) => c.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((c) => c.id !== id);
    });
  }, []);
  // Revoke any lingering object URLs when the component unmounts (e.g. cancel).
  useEffect(() => {
    return () => {
      clips.forEach((c) => URL.revokeObjectURL(c.previewUrl));
    };
    // We only want this on unmount; clips get their own revoke via removeClip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Best-effort teardown if the coach navigates away mid-record.
  useEffect(() => {
    return () => {
      lessonStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ─── 레슨 전체 녹음 핸들러 ────────────────────────────────────────────────
  /**
   * speech-first 마이크 정책: 실시간 인식이 시작되면 마이크를 인식기에
   * 전담시키고 오디오 녹음은 켜지 않는다(동시 사용 시 인식이 죽는 기기가
   * 많다 — 실시간 필기가 "안 되던" 실제 원인). 인식이 불가하면 기존
   * 녹음 + 10초 AI 전사 모드로 간다.
   */
  const startLessonRecording = async () => {
    try {
      const session = new LessonAudioSession({
        studentName,
        onNotesChanged: (notes) => {
          const s = lessonSessionRef.current;
          if (s) setSessionSnapshot(s.snapshot());
          setLiveNotes(notes);
        },
      });
      lessonSessionRef.current = session;

      // 녹음이 먼저다 — 기록의 원천이라 마이크를 확보하지 못하면 시작하지
      // 않는다. 미리보기 인식은 그 뒤에 곁들인다(실패해도 레슨은 그대로).
      const stream = await requestLessonMic();
      lessonStreamRef.current = stream;
      session.setTranscriptSource('ai');
      await session.start(stream);
      void transcription.start();
      setSessionSnapshot(session.snapshot());
      setLessonRecState('recording');
      void acquireWakeLock();
    } catch (e) {
      lessonSessionRef.current = null;
      if (isMediaPermissionError(e) && e.kind === 'denied') {
        setPermissionModalOpen(true);
      } else {
        console.error('[LiveLessonCompanion] lesson mic unavailable', e);
        alert('마이크를 사용할 수 없습니다.');
      }
    }
  };

  const toggleLessonPause = () => {
    const session = lessonSessionRef.current;
    if (!session) return;
    if (session.isPaused) {
      session.resume();
      void transcription.resume();
      setLessonRecState('recording');
    } else {
      // 인식을 먼저 멈춘다 — 멈추는 순간 남아 있던 파셜(코치가 말하던
      // 문장)은 필기로 확정되고, 그 뒤로는 세션이 일시정지라 아무것도
      // 들어가지 않는다. 순서가 반대면 그 마지막 문장을 잃는다.
      transcription.pause();
      session.pause();
      setLessonRecState('paused');
    }
  };

  /**
   * 세션 종료 공통 경로: 레코더를 닫고 전체 오디오 클립 + 핸드오프를
   * 돌려준다. 클립은 state 를 거치지 않고 호출자가 직접 handoff 배열에
   * 합친다 — setState 반영 전에 onFinish 가 실행되면 클립이 유실되기
   * 때문이다. 마지막 세그먼트 분석은 파이프라인 큐에서 백그라운드로
   * 계속되므로 여기서 기다리지 않는다 — 리뷰 화면이 요약 직전에 수거한다.
   */
  const stopLessonSession = async (): Promise<{
    handoff: LiveLessonHandoff;
    audioClips: CapturedClip[];
  } | null> => {
    const session = lessonSessionRef.current;
    if (!session) return null;
    lessonSessionRef.current = null;
    transcription.stop();
    releaseWakeLock();
    try {
      const result = await session.stop();
      lessonStreamRef.current?.getTracks().forEach((t) => t.stop());
      lessonStreamRef.current = null;
      // 녹음 런(연속 구간)마다 유효한 오디오 파일 하나 — 중단 없이 끝난
      // 레슨은 1개, 재개된 레슨은 런 수만큼 클립이 된다.
      const audioClips: CapturedClip[] = result.runBlobs
        .filter((r) => r.blob.size > 0)
        .map((r) => ({
          id: randomId(),
          kind: 'voice' as const,
          blob: r.blob,
          durationSec: r.durationSec,
          previewUrl: URL.createObjectURL(r.blob),
          capturedAt: Date.now(),
        }));
      return { handoff: result.handoff, audioClips };
    } catch (e) {
      console.error('[LiveLessonCompanion] lesson recording stop failed', e);
      return null;
    } finally {
      setLessonRecState('idle');
      setSessionSnapshot(null);
      setLiveNotes([]);
      setProvisional([]);
    }
  };

  // ─── 복구 배너 핸들러 — 끊긴 세션을 같은 자리에서 이어서 쓴다 ────────────
  const handleResumeRecoverable = async () => {
    if (!recoverable) return;
    try {
      const session = await LessonAudioSession.resume(recoverable.id, {
        studentName: recoverable.studentName,
        onNotesChanged: (notes) => {
          const s = lessonSessionRef.current;
          if (s) setSessionSnapshot(s.snapshot());
          setLiveNotes(notes);
        },
      });
      if (!session) {
        alert('이어서 쓸 녹음 데이터를 찾지 못했습니다.');
        return;
      }
      lessonSessionRef.current = session;

      // 새 레슨 시작과 같은 정책으로 이어간다 — 녹음 + AI 전사가 기록.
      const stream = await requestLessonMic();
      lessonStreamRef.current = stream;
      session.setTranscriptSource('ai');
      await session.start(stream);
      void transcription.start();
      // 기존 필기·요약이 노트에 즉시 실린다(재타이핑 없음 — LessonNotebook
      // 이 마운트 시점 줄은 애니메이션 없이 그린다).
      setLiveNotes(session.getNotes());
      setSessionSnapshot(session.snapshot());
      setLessonRecState('recording');
      void acquireWakeLock();
    } catch (e) {
      if (isMediaPermissionError(e) && e.kind === 'denied') {
        setPermissionModalOpen(true);
      } else {
        console.error('[LiveLessonCompanion] resume failed', e);
        alert('녹음을 이어가지 못했습니다.');
      }
    } finally {
      setRecoverable(null);
    }
  };

  const handleDiscardRecoverable = () => {
    if (recoverable) void discardLessonAudioSession(recoverable.id);
    setRecoverable(null);
  };

  // ─── Native camera capture (photo + video) ────────────────────────────────
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const handleCameraFile =
    (kind: 'photo' | 'video') =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      let dur = 0;
      if (kind === 'video') {
        // Best-effort duration probe. If it fails, coach still sees the clip.
        const el = document.createElement('video');
        el.preload = 'metadata';
        el.src = URL.createObjectURL(file);
        el.onloadedmetadata = () => {
          dur = Math.round(el.duration || 0);
          URL.revokeObjectURL(el.src);
          addClip(kind, file, dur);
        };
        el.onerror = () => {
          URL.revokeObjectURL(el.src);
          addClip(kind, file, 0);
        };
      } else {
        addClip(kind, file, 0);
      }
      e.target.value = '';
    };

  // ─── Finish handoff ──────────────────────────────────────────────────────
  /**
   * 레슨 종료: 녹음 세션이 있으면 바로 저장으로 가지 않고 검토 단계를
   * 연다 — 세션은 일시정지만 하고, 코치가 필기 전문과 요약을 확인·수정한
   * 뒤 "기록 저장하기"를 눌러야 onFinish 로 넘어간다.
   */
  const handleFinish = async () => {
    const session = lessonSessionRef.current;
    if (!session) {
      // 전체 녹음 없이 캡처만 한 레슨 — 기존처럼 바로 리뷰 화면으로.
      onFinish(clips, undefined);
      return;
    }

    // 인식 → 세션 순서로 멈춘다(toggleLessonPause 와 같은 이유): 말하던
    // 문장은 살리고, 검토하는 동안 오간 말은 필기에 넣지 않는다.
    transcription.pause();
    session.pause();
    setLessonRecState('paused');
    const setStage = (stage: ReviewStage) =>
      setReviewDraft((d) => (d ? { ...d, stage } : d));
    setReviewDraft({
      transcriptText: '',
      coachSummaryText: '',
      studentSummaryText: '',
      stage: 'precise',
      preparing: true,
      saving: false,
    });

    // 진행 중이던 전사(AI 폴백 경로)를 잠깐 기다렸다가 초안을 만든다.
    await session.settleAnalyses(10_000);
    let notes = session
      .getNotes()
      .filter((n) => n.status === 'done' && n.transcript);

    // ── 0단계: 정밀 전사 ─────────────────────────────────────────────────
    // 실시간 필기는 짧은 구간을 따로따로 받아 적어 빠른 대신 경계에서
    // 문장이 잘리고 맥락이 없다. 여기서는 기다릴 여유가 있으므로 같은
    // 녹음을 5분짜리 조각으로 다시 들려 준다 — 대화 흐름이 통째로 들어가
    // 어휘도 화자 구분도 훨씬 정확해진다. 실패하거나 늦으면 실시간 필기를
    // 그대로 쓴다(기록을 잃지 않는 것이 먼저다).
    let speakerLabeled = false;
    try {
      // 레코더 버퍼에 남은 꼬리를 먼저 회수한다 — 마무리 멘트가 여기 있다.
      await session.flushRecordedTail();
      const slices = await session.getTranscriptionSlices();
      if (slices.length > 0) {
        const precise = await withReviewTimeout(
          preciseTranscribeNotes(slices, notes, studentName, session.mimeType),
          REVIEW_PRECISE_TIMEOUT_MS,
          null as LessonSegmentNote[] | null
        );
        if (precise?.length) {
          notes = precise;
          // 검토 화면·최종 리포트·복구 세션이 모두 정밀본을 보게 한다.
          session.applyPreciseNotes(precise);
          // 정밀 전사는 화자 라벨까지 붙여 온다 — 뒤의 분류를 건너뛴다.
          speakerLabeled = notes.some((n) => n.turns?.length);
        }
      }
    } catch (e) {
      // 정밀 전사가 어떻게 실패하든 검토 화면은 열려야 한다 — 실시간
      // 필기만으로도 코치는 기록을 저장할 수 있어야 하기 때문이다.
      console.error('[LiveLessonCompanion] 정밀 전사 실패 — 실시간 필기 사용', e);
    }

    // ── 1단계: 코칭 언어 교정 ────────────────────────────────────────────
    // 필기의 원천은 음성 인식이고, 골프 용어는 일반 어휘 모델이 가장 많이
    // 틀리는 부분이다. 뒤 두 단계(화자 분류·요약)가 모두 이 텍스트를 근거로
    // 삼으므로 교정이 맨 앞에 온다. 늘어지면 원문 그대로 다음 단계로 간다.
    const repaired = await withReviewTimeout(
      repairTranscriptTerms(notes, studentName, undefined, {
        deadlineAt: Date.now() + REVIEW_REPAIR_TIMEOUT_MS,
      }),
      REVIEW_REPAIR_HARD_TIMEOUT_MS,
      null as LessonSegmentNote[] | null
    );
    if (repaired) {
      notes = repaired;
      // 검토 화면·최종 리포트·복구 세션이 모두 같은 교정본을 보게 한다.
      session.applyRepairedNotes(repaired);
    }

    // ── 2단계: 화자 역할 분류 ────────────────────────────────────────────
    // 오디오 전사 경로는 구간마다 라벨이 붙어 오지만 온디바이스 인식 경로는
    // 텍스트뿐이라, 여기서 필기 전체를 한 번 읽어 코치/학생/주변을 배정한다.
    if (!speakerLabeled) {
      setStage('speaker');
      const labeled = await withReviewTimeout(
        labelTranscriptSpeakers(notes, studentName),
        REVIEW_LABEL_TIMEOUT_MS,
        null as LessonSegmentNote[] | null
      );
      if (labeled) {
        notes = labeled;
        session.applySpeakerTurns(labeled);
      }
    }

    // ── 3단계: 코치 요약 · 학생 요약 ─────────────────────────────────────
    // 화자가 갈린 필기라야 "코치가 시킨 것"과 "학생이 답한 것"을 나눠 적을
    // 수 있다. 실패하면 코치 요약 자리에 진행 중 롤링 요약을 남긴다 —
    // 요약 한 줄 없는 검토 화면보다는 나은 출발점이다.
    setStage('summary');
    const rolling = session.snapshot().liveSummary;
    const dual = notes.length
      ? await withReviewTimeout(
          generateDualLessonSummary(notes, studentName),
          REVIEW_SUMMARY_TIMEOUT_MS,
          { coach: '', student: '' } as LessonDualSummary
        )
      : { coach: '', student: '' };

    // 타임스탬프 없이 문단 단위로 이어 붙인다 — 코치가 읽는 것은 시각이
    // 아니라 대화 흐름이고, 실시간 인식이 한 문장을 여러 조각으로 끊어
    // 확정하므로 조각을 그대로 나열하면 단어 목록처럼 보인다. 화자가
    // 판정된 문단에는 "코치: " 표기가 붙는다.
    const transcriptText = buildTranscriptText(notes);

    setReviewDraft({
      transcriptText,
      coachSummaryText: dual.coach || rolling,
      studentSummaryText: dual.student,
      stage: 'summary',
      preparing: false,
      saving: false,
    });
  };

  /** 검토 확정: 여기서 비로소 녹음을 완전히 닫고 저장 흐름으로 넘긴다. */
  const handleConfirmSave = async () => {
    if (!reviewDraft || reviewDraft.preparing || reviewDraft.saving) return;
    setReviewDraft({ ...reviewDraft, saving: true });
    setLessonRecState('finishing');
    const stopped = await stopLessonSession();
    const finalClips = stopped ? [...clips, ...stopped.audioClips] : clips;
    const coachSummary = reviewDraft.coachSummaryText.trim();
    const studentSummary = reviewDraft.studentSummaryText.trim();
    onFinish(
      finalClips,
      stopped
        ? {
            ...stopped.handoff,
            editedTranscript: reviewDraft.transcriptText.trim() || undefined,
            // 기록에 저장되는 본문은 두 요약을 합친 하나다(소제목으로 갈린다).
            // 두 칸을 따로도 넘겨 코치/학생 화면이 각자 필요한 쪽만 읽는다.
            editedSummary:
              formatDualSummary({ coach: coachSummary, student: studentSummary }) ||
              undefined,
            editedCoachSummary: coachSummary || undefined,
            editedStudentSummary: studentSummary || undefined,
          }
        : undefined
    );
  };

  /** 검토에서 복귀 — 세션·인식을 다시 살려 레슨을 계속한다. */
  const handleResumeFromReview = () => {
    setReviewDraft(null);
    const session = lessonSessionRef.current;
    if (session) {
      session.resume();
      void transcription.resume();
      setLessonRecState('recording');
    }
  };

  /**
   * 나가기: 녹음 중이면 레코더만 닫고 IndexedDB 데이터는 남긴다 —
   * 다음 진입 때 복구 배너로 되살릴 수 있다.
   */
  const handleCancel = () => {
    if (lessonSessionRef.current) {
      void stopLessonSession();
    }
    onCancel();
  };

  // The bottom tab bar is gone in the single-surface relaunch, so the root
  // only reserves the device gesture bar (`pb-safe`) under the sticky
  // "레슨 종료" CTA. `pt-safe` does the same at the other end: this is a
  // fixed inset-0 overlay over the app header, so nothing else keeps its
  // own header off the status bar / notch.
  return (
    <div className="fixed inset-0 z-50 bg-base text-ink-high flex flex-col pt-safe pb-safe">
      <PermissionDeniedModal
        open={permissionModalOpen}
        kind="microphone"
        onClose={() => setPermissionModalOpen(false)}
        onRetry={() => {
          setPermissionModalOpen(false);
          void startLessonRecording();
        }}
      />

      {/* Header: 나가기 · student · elapsed timer · pause/resume.
          나가기 sits on the left as the shared BackButton — the companion is
          a full-screen overlay with no other way out, so the affordance has
          to look and sit like every other 뒤로 in the app (and clear 44x44,
          which the old 12px text link on the right did not). */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-base/85 border-b border-line-subtle">
        <div className="px-4 py-3 flex items-center gap-3">
          <BackButton
            onClick={handleCancel}
            tone="dark"
            label="나가기"
            className="flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-300">
              레슨 진행 중
            </div>
            <div className="text-[15px] font-bold text-ink-high truncate">
              {studentName}{' '}
              {lessonDate && (
                <span className="text-ink-muted font-normal">· {lessonDate}</span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 스크롤 본문 — 필기 노트가 길어져도 하단 '레슨 종료' CTA 는 푸터로
          항상 화면에 남고, 이 영역만 위아래로 스크롤된다. min-h-0 이 없으면
          flex 자식의 기본 min-height:auto 때문에 줄어들지 못해 푸터가
          화면 밖으로 밀려난다(저장 버튼을 못 누르던 버그의 원인). */}
      <div className="flex-1 min-h-0 overflow-y-auto">
      {/* 미저장/크래시 녹음 복구 배너 */}
      {recoverable && (
        <section className="px-5 pt-3">
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 flex items-center gap-3">
            <RotateCcw className="w-4 h-4 text-amber-300 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-bold text-ink-high">
                끊긴 레슨 녹음이 있어요
              </div>
              <div className="text-[11px] text-ink-muted">
                {recoverable.studentName} ·{' '}
                {formatClock(recoverable.recordedSec)} 녹음 · 필기{' '}
                {recoverable.analyzedCount}줄 · 이어서 계속 쓸 수 있어요
              </div>
            </div>
            <button
              type="button"
              onClick={handleResumeRecoverable}
              className="text-[12px] font-bold text-amber-300 px-2 py-1.5 flex-shrink-0"
            >
              이어서 쓰기
            </button>
            <button
              type="button"
              onClick={handleDiscardRecoverable}
              className="w-7 h-7 rounded-lg text-ink-muted hover:text-red-400 flex items-center justify-center flex-shrink-0"
              aria-label="복구 안 함"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      {/* Elapsed timer — large, readable across the mat */}
      <section className="px-5 pt-6 pb-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-ink-muted mb-1">
            경과
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-mono font-bold tabular-nums text-ink-high">
              {formatElapsed(elapsedSec)}
            </span>
            <Clock className="w-5 h-5 text-ink-muted" />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setTimerPaused((p) => !p)}
          className="w-11 h-11 rounded-full border border-line-subtle bg-white/[0.04] flex items-center justify-center text-ink-medium hover:text-ink-high"
          aria-label={timerPaused ? '타이머 재개' : '타이머 일시정지'}
        >
          {timerPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
        </button>
      </section>

      {/* 레슨 전체 녹음 — 30–50분 연속 녹음 + 실시간 구간 분석 */}
      <section className="px-5 pt-2 pb-2">
        <div
          className={`rounded-2xl border p-5 ${
            lessonRecState === 'recording'
              ? 'border-red-400/40 bg-red-500/[0.06]'
              : 'border-line-subtle bg-white/[0.03]'
          }`}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-red-500/15 border border-red-400/30 flex items-center justify-center">
              <Radio
                className={`w-4.5 h-4.5 text-red-300 ${
                  lessonRecState === 'recording' ? 'animate-pulse' : ''
                }`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold text-ink-high">
                레슨 전체 녹음
              </div>
              <div className="text-[11.5px] text-ink-muted">
                {lessonRecState === 'idle'
                  ? '녹음하면 말하는 즉시 노트에 받아 적혀요'
                  : lessonRecState === 'paused'
                  ? '일시정지됨 · 재개하면 이어서 녹음됩니다'
                  : lessonRecState === 'finishing'
                  ? '녹음을 마무리하고 있어요…'
                  : '녹음·필기 진행 중 · 자동 저장되고 있어요'}
              </div>
            </div>
            {sessionSnapshot && lessonRecState !== 'idle' && (
              <span className="text-[15px] font-mono font-bold text-red-400 tabular-nums">
                {formatClock(sessionSnapshot.recordedSec)}
              </span>
            )}
          </div>

          {lessonRecState === 'idle' ? (
            <button
              type="button"
              onClick={startLessonRecording}
              className="w-full h-14 rounded-xl bg-red-500 hover:bg-red-600 text-white flex items-center justify-center gap-2 text-[15px] font-bold transition-colors"
            >
              <Radio className="w-5 h-5" /> 레슨 녹음 시작
            </button>
          ) : (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={toggleLessonPause}
                  disabled={lessonRecState === 'finishing'}
                  className="flex-1 h-12 rounded-xl border border-line-subtle bg-white/[0.04] text-ink-high flex items-center justify-center gap-2 text-[14px] font-bold"
                >
                  {lessonRecState === 'paused' ? (
                    <>
                      <Play className="w-4.5 h-4.5" /> 재개
                    </>
                  ) : (
                    <>
                      <Pause className="w-4.5 h-4.5" /> 일시정지
                    </>
                  )}
                </button>
              </div>
              {sessionSnapshot && (
                <div className="mt-3 pt-3 border-t border-line-subtle">
                  <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                    <span className="tabular-nums">
                      {previewActive ? 'AI 받아쓰기 · 듣는 중' : 'AI 받아쓰기'}
                      {' · '}필기{' '}
                      {
                        liveNotes.filter(
                          (n) => n.status === 'done' && n.transcript
                        ).length
                      }
                      줄
                      {sessionSnapshot.failedCount > 0 &&
                        ` · 전사 실패 ${sessionSnapshot.failedCount}건`}
                    </span>
                  </div>
                </div>
              )}

              {/* 종이 노트 — 확정 필기 + 하단 형광펜 요약.
                  연한 잉크로 흐르는 줄은 브라우저 인식의 **미리보기**다.
                  코치가 "지금 들어오고 있다"를 바로 볼 수 있게만 하고,
                  정식 줄은 녹음을 AI 가 받아 적은 결과로 채워진다. */}
              <LessonNotebook
                lines={liveNotes
                  .filter((n) => n.status === 'done' && n.transcript)
                  .map((n) => ({
                    id: n.index,
                    atSec: n.startSec,
                    text: n.transcript,
                    turns: n.turns,
                  }))}
                writing={
                  lessonRecState === 'recording' ||
                  liveNotes.some((n) => n.status === 'analyzing')
                }
                interim={
                  lessonRecState === 'recording' ? provisionalTail : undefined
                }
                animateNewLines={!previewActive}
                summary={sessionSnapshot?.liveSummary ?? ''}
                summaryUpdating={sessionSnapshot?.liveSummaryUpdating ?? false}
              />
            </>
          )}

        </div>
      </section>

      {/* Photo / video capture — native camera fall-through */}
      <section className="px-5 pt-2 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="rounded-2xl border border-line-subtle bg-white/[0.03] p-4 flex flex-col items-center gap-2 hover:bg-white/[0.06] transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-sky-500/15 border border-sky-400/30 flex items-center justify-center">
              <Camera className="w-5 h-5 text-sky-300" />
            </div>
            <div className="text-[13px] font-bold text-ink-high">스윙 사진</div>
            <div className="text-[11px] text-ink-muted">한 장 촬영</div>
          </button>
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className="rounded-2xl border border-line-subtle bg-white/[0.03] p-4 flex flex-col items-center gap-2 hover:bg-white/[0.06] transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-purple-500/15 border border-purple-400/30 flex items-center justify-center">
              <Video className="w-5 h-5 text-purple-300" />
            </div>
            <div className="text-[13px] font-bold text-ink-high">스윙 영상</div>
            <div className="text-[11px] text-ink-muted">짧게 촬영</div>
          </button>
        </div>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleCameraFile('photo')}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          capture="environment"
          className="hidden"
          onChange={handleCameraFile('video')}
        />
      </section>

      {/* Captured clip list — 자체 스크롤 대신 본문 스크롤에 편승한다 */}
      <section className="px-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
            캡처된 항목
          </div>
          <div className="text-[11px] text-ink-muted">{clips.length}건</div>
        </div>
        {clips.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-subtle bg-white/[0.02] py-8 text-center">
            <Plus className="w-5 h-5 text-ink-muted mx-auto mb-1.5" />
            <div className="text-[12px] text-ink-muted">
              아직 캡처된 항목이 없어요
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {clips.map((c, idx) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-xl border border-line-subtle bg-white/[0.03] p-3"
              >
                <div className="w-11 h-11 rounded-lg bg-white/[0.04] border border-line-subtle flex items-center justify-center flex-shrink-0">
                  {c.kind === 'voice' ? (
                    <Mic className="w-5 h-5 text-emerald-300" />
                  ) : c.kind === 'photo' ? (
                    <Camera className="w-5 h-5 text-sky-300" />
                  ) : (
                    <Video className="w-5 h-5 text-purple-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-ink-high">
                    #{idx + 1}{' '}
                    {c.kind === 'voice'
                      ? '음성'
                      : c.kind === 'photo'
                      ? '사진'
                      : '영상'}
                  </div>
                  <div className="text-[11px] text-ink-muted tabular-nums">
                    {c.kind === 'photo'
                      ? `${Math.round(c.blob.size / 1024)}KB`
                      : `${formatDuration(c.durationSec)} · ${Math.round(
                          c.blob.size / 1024
                        )}KB`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeClip(c.id)}
                  className="w-9 h-9 rounded-lg text-ink-muted hover:text-red-400 flex items-center justify-center"
                  aria-label="삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>

      {/* Finish CTA — 스크롤 본문 밖의 고정 푸터라 항상 보인다 */}
      <footer className="z-10 backdrop-blur-md bg-base/85 border-t border-line-subtle px-5 py-3 flex-shrink-0">
        <button
          type="button"
          onClick={handleFinish}
          className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-[#04150e] text-[15px] font-bold flex items-center justify-center gap-2 transition-colors"
        >
          <CheckCircle2 className="w-5 h-5" />
          레슨 종료 · 기록 확인
        </button>
        <p className="text-[11px] text-ink-muted text-center mt-2">
          종료하면 필기 전문과 코치·학생 요약을 확인·수정한 뒤 저장할 수 있어요.
        </p>
      </footer>

      {/* 종료 전 검토 — 필기 전문·요약을 확인/수정한 뒤에만 저장으로 간다.
          이 오버레이는 루트의 *패딩 박스* 기준으로 inset-0 이라 루트가 잡아
          둔 하단 여백을 덮어쓴다 — 그래서 기기 제스처 바 인셋(`pb-safe`)을
          여기서도 직접 잡아야 '기록 저장하기' 버튼이 가려지지 않는다. */}
      {reviewDraft && (
        <div className="absolute inset-0 z-30 bg-base flex flex-col pt-safe pb-safe">
          <header className="px-5 py-4 border-b border-line-subtle flex-shrink-0">
            <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-300">
              레슨 기록 확인
            </div>
            <div className="text-[15px] font-bold text-ink-high">
              {studentName} · 저장 전에 필기와 두 요약을 확인해 주세요
            </div>
          </header>

          {reviewDraft.preparing ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2">
              <Sparkles className="w-6 h-6 text-emerald-300 animate-pulse" />
              <p className="text-[13px] text-ink-muted">
                {REVIEW_STAGE_LABELS[reviewDraft.stage]}
              </p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
              <div className="flex-1 min-h-[14rem] flex flex-col">
                <label className="text-[12px] font-bold text-ink-high mb-1.5">
                  레슨 필기 전문{' '}
                  <span className="text-ink-muted font-normal">
                    · 잘못 적힌 부분은 직접 고칠 수 있어요
                  </span>
                </label>
                <textarea
                  value={reviewDraft.transcriptText}
                  onChange={(e) =>
                    setReviewDraft((d) =>
                      d ? { ...d, transcriptText: e.target.value } : d
                    )
                  }
                  placeholder="받아 적힌 내용이 없어요. 직접 입력할 수도 있습니다."
                  className="flex-1 min-h-[12rem] w-full rounded-xl border border-line-subtle bg-white/[0.04] p-3 text-[13.5px] leading-relaxed text-ink-high placeholder:text-ink-muted focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>
              {/* 요약은 둘로 나뉜다 — 코치가 시킨 것과 학생이 답한 것은
                  다음 레슨에서 쓰이는 쓸모가 다르다. 한 칸에 합치면 학생의
                  말은 늘 코치 지시의 배경 설명으로 눌려 사라진다. */}
              <div>
                <label className="text-[12px] font-bold text-ink-high mb-1.5 block">
                  코치 요약{' '}
                  <span className="text-ink-muted font-normal">
                    · 오늘 짚은 교정 포인트·드릴
                  </span>
                </label>
                <textarea
                  value={reviewDraft.coachSummaryText}
                  onChange={(e) =>
                    setReviewDraft((d) =>
                      d ? { ...d, coachSummaryText: e.target.value } : d
                    )
                  }
                  rows={5}
                  placeholder="요약이 아직 없어요. 핵심 포인트를 직접 적어도 됩니다."
                  className="w-full rounded-xl border border-emerald-400/30 bg-emerald-500/[0.06] p-3 text-[13.5px] leading-relaxed text-ink-high placeholder:text-ink-muted focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>
              <div>
                <label className="text-[12px] font-bold text-ink-high mb-1.5 block">
                  학생 요약{' '}
                  <span className="text-ink-muted font-normal">
                    · 학생이 말한 느낌·질문·반응
                  </span>
                </label>
                <textarea
                  value={reviewDraft.studentSummaryText}
                  onChange={(e) =>
                    setReviewDraft((d) =>
                      d ? { ...d, studentSummaryText: e.target.value } : d
                    )
                  }
                  rows={4}
                  placeholder="학생이 말한 내용이 정리되지 않았어요. 기억나는 반응을 적어도 됩니다."
                  className="w-full rounded-xl border border-sky-400/30 bg-sky-500/[0.06] p-3 text-[13.5px] leading-relaxed text-ink-high placeholder:text-ink-muted focus:ring-2 focus:ring-sky-500 outline-none resize-none"
                />
              </div>
            </div>
          )}

          <footer className="flex-shrink-0 border-t border-line-subtle px-5 py-3 flex gap-2 backdrop-blur-md bg-base/85">
            <button
              type="button"
              onClick={handleResumeFromReview}
              disabled={reviewDraft.saving}
              className="flex-1 h-12 rounded-xl border border-line-subtle bg-white/[0.04] text-ink-high text-[14px] font-bold flex items-center justify-center gap-1.5"
            >
              <Mic className="w-4 h-4" /> 이어서 녹음
            </button>
            <button
              type="button"
              onClick={handleConfirmSave}
              disabled={reviewDraft.preparing || reviewDraft.saving}
              className="flex-[1.6] h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-[#04150e] text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <CheckCircle2 className="w-5 h-5" />
              {reviewDraft.saving ? '저장 준비 중…' : '기록 저장하기'}
            </button>
          </footer>
        </div>
      )}
    </div>
  );
};
