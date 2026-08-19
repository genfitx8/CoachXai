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
  findRecoverableSessions,
  formatClock,
  purgeStaleLessonAudioSessions,
  recoverSessionAudio,
  discardLessonAudioSession,
  type LessonSegmentNote,
  type LiveLessonHandoff,
  type LiveSessionSnapshot,
  type RecoverableLessonSession,
} from '../services/lessonAudioPipeline';

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

const randomId = () =>
  `clip_${Math.random().toString(36).slice(2, 10)}_${performance.now().toFixed(0)}`;

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
  /** ~10초 단위 필기(전사) 노트 — 화면의 필기 피드가 이 배열을 그린다. */
  const [liveNotes, setLiveNotes] = useState<LessonSegmentNote[]>([]);
  const lessonStreamRef = useRef<MediaStream | null>(null);

  // 새 필기 줄이 붙을 때마다 노트를 맨 아래로 스크롤한다.
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = transcriptScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [liveNotes]);

  // 크래시/미저장 세션 복구 배너
  const [recoverable, setRecoverable] = useState<RecoverableLessonSession | null>(
    null
  );
  const [recoveredHandoff, setRecoveredHandoff] = useState<LiveLessonHandoff | null>(
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
  const startLessonRecording = async () => {
    try {
      const stream = await requestMediaStream({ audio: true });
      lessonStreamRef.current = stream;
      const session = new LessonAudioSession({
        studentName,
        onNotesChanged: (notes) => {
          const s = lessonSessionRef.current;
          if (s) setSessionSnapshot(s.snapshot());
          setLiveNotes(notes);
        },
      });
      lessonSessionRef.current = session;
      await session.start(stream);
      setSessionSnapshot(session.snapshot());
      setLessonRecState('recording');
    } catch (e) {
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
      setLessonRecState('recording');
    } else {
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
    clip: CapturedClip | null;
  } | null> => {
    const session = lessonSessionRef.current;
    if (!session) return null;
    lessonSessionRef.current = null;
    try {
      const result = await session.stop();
      lessonStreamRef.current?.getTracks().forEach((t) => t.stop());
      lessonStreamRef.current = null;
      const clip: CapturedClip | null =
        result.fullAudioBlob.size > 0
          ? {
              id: randomId(),
              kind: 'voice',
              blob: result.fullAudioBlob,
              durationSec: result.durationSec,
              previewUrl: URL.createObjectURL(result.fullAudioBlob),
              capturedAt: Date.now(),
            }
          : null;
      return { handoff: result.handoff, clip };
    } catch (e) {
      console.error('[LiveLessonCompanion] lesson recording stop failed', e);
      return null;
    } finally {
      setLessonRecState('idle');
      setSessionSnapshot(null);
      setLiveNotes([]);
    }
  };

  // ─── 복구 배너 핸들러 ─────────────────────────────────────────────────────
  const handleRecover = async () => {
    if (!recoverable) return;
    try {
      const audio = await recoverSessionAudio(recoverable.id);
      if (audio) {
        addClip('voice', audio.blob, audio.durationSec);
        setRecoveredHandoff({
          sessionId: recoverable.id,
          recordedDurationSec: audio.durationSec,
          noteCount: audio.notes.length,
          pendingCount: 0,
        });
      }
    } catch (e) {
      console.error('[LiveLessonCompanion] recovery failed', e);
      alert('녹음 복구에 실패했습니다.');
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
  const handleFinish = async () => {
    setLessonRecState((s) => (s === 'idle' ? s : 'finishing'));
    const stopped = await stopLessonSession();
    const finalClips = stopped?.clip ? [...clips, stopped.clip] : clips;
    // 라이브 세션이 있으면 그 노트가 최신·최다 — 복구본보다 우선한다.
    onFinish(finalClips, stopped?.handoff ?? recoveredHandoff ?? undefined);
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

  // The coach bottom nav stays mounted on the 동반 탭 and is fixed at the same
  // z-index as this overlay, so it paints over whatever sits at the bottom
  // edge. `coach-nav-clearance` reserves its height (+ the device gesture bar)
  // on the root, otherwise the sticky "레슨 종료" CTA lands behind the tab bar.
  // `pt-safe` does the same at the other end: this is a fixed inset-0 overlay
  // over the app header, so nothing else keeps its own header off the status
  // bar / notch.
  return (
    <div className="fixed inset-0 z-50 bg-base text-ink-high flex flex-col pt-safe coach-nav-clearance">
      <PermissionDeniedModal
        open={permissionModalOpen}
        kind="microphone"
        onClose={() => setPermissionModalOpen(false)}
        onRetry={() => {
          setPermissionModalOpen(false);
          void startLessonRecording();
        }}
      />

      {/* Header: student · elapsed timer · pause/resume */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-base/85 border-b border-line-subtle">
        <div className="px-4 py-3 flex items-center gap-3">
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
          <button
            type="button"
            onClick={handleCancel}
            className="text-[12px] text-ink-muted hover:text-ink-medium px-3 py-1.5"
          >
            나가기
          </button>
        </div>
      </header>

      {/* 미저장/크래시 녹음 복구 배너 */}
      {recoverable && (
        <section className="px-5 pt-3">
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 flex items-center gap-3">
            <RotateCcw className="w-4 h-4 text-amber-300 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-bold text-ink-high">
                저장되지 않은 레슨 녹음이 있어요
              </div>
              <div className="text-[11px] text-ink-muted">
                {recoverable.studentName} ·{' '}
                {formatClock(recoverable.recordedSec)} 녹음 · 분석{' '}
                {recoverable.analyzedCount}/{recoverable.segmentCount}구간
              </div>
            </div>
            <button
              type="button"
              onClick={handleRecover}
              className="text-[12px] font-bold text-amber-300 px-2 py-1.5 flex-shrink-0"
            >
              복구
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
                  ? '녹음하면 음성이 10초 단위로 노트에 받아 적혀요'
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
                      필기{' '}
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

              {/* 필기 노트 — ~10초 단위로 음성이 텍스트로 받아 적힌다 */}
              <div className="mt-3 rounded-xl border border-line-subtle bg-white/[0.02] p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Mic
                    className={`w-3.5 h-3.5 ${
                      lessonRecState === 'recording'
                        ? 'text-red-300 animate-pulse'
                        : 'text-ink-muted'
                    }`}
                  />
                  <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
                    필기 노트
                  </span>
                  {liveNotes.some((n) => n.status === 'analyzing') && (
                    <span className="text-[10px] text-ink-muted animate-pulse">
                      적는 중…
                    </span>
                  )}
                </div>
                <div
                  ref={transcriptScrollRef}
                  className="max-h-56 min-h-[6rem] overflow-y-auto space-y-1.5 pr-1"
                >
                  {liveNotes.filter((n) => n.status === 'done' && n.transcript)
                    .length === 0 && (
                    <p className="text-[12px] text-ink-muted">
                      코칭 멘트가 들리면 약 10초 단위로 여기에 받아 적혀요
                    </p>
                  )}
                  {liveNotes
                    .filter((n) => n.status === 'done' && n.transcript)
                    .map((n) => (
                      <p
                        key={n.index}
                        className="text-[13px] leading-snug text-ink-high"
                      >
                        <span className="text-[10.5px] font-mono text-ink-muted mr-1.5 tabular-nums">
                          {formatClock(n.startSec)}
                        </span>
                        {n.transcript}
                      </p>
                    ))}
                </div>
              </div>

              {/* 요약 노트 — 5분마다 지금까지의 필기를 다시 요약 */}
              <div className="mt-2 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.05] p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                  <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-300">
                    요약 노트
                  </span>
                  <span className="text-[10px] text-ink-muted">5분마다 갱신</span>
                  {sessionSnapshot?.liveSummaryUpdating && (
                    <span className="text-[10px] text-ink-muted animate-pulse">
                      갱신 중…
                    </span>
                  )}
                </div>
                {sessionSnapshot?.liveSummary ? (
                  <div className="space-y-1">
                    {sessionSnapshot.liveSummary
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .map((line, i) => (
                        <p
                          key={`${i}-${line.slice(0, 16)}`}
                          className="text-[12.5px] leading-snug text-ink-high"
                        >
                          {line}
                        </p>
                      ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-ink-muted">
                    필기가 5분쯤 쌓이면 여기에 요약이 정리됩니다
                  </p>
                )}
              </div>
            </>
          )}

          {recoveredHandoff && (
            <div className="mt-3 text-[11px] text-emerald-300">
              복구된 녹음이 첨부됐어요 · 종료하면 요약에 반영됩니다
            </div>
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

      {/* Captured clip list */}
      <section className="flex-1 min-h-0 px-5 pb-4 overflow-y-auto">
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

      {/* Finish CTA */}
      <footer className="sticky bottom-0 z-10 backdrop-blur-md bg-base/85 border-t border-line-subtle px-5 py-3">
        <button
          type="button"
          onClick={handleFinish}
          className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-[#04150e] text-[15px] font-bold flex items-center justify-center gap-2 transition-colors"
        >
          <CheckCircle2 className="w-5 h-5" />
          레슨 종료 · 요약으로
        </button>
        <p className="text-[11px] text-ink-muted text-center mt-2">
          다음 화면에서 캡처를 확인하고 승인 전 검토할 수 있어요.
        </p>
      </footer>
    </div>
  );
};
