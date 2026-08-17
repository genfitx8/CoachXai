import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mic,
  Square,
  Camera,
  Video,
  Trash2,
  CheckCircle2,
  Clock,
  Plus,
  Pause,
  Play,
} from 'lucide-react';
import {
  isMediaPermissionError,
  requestMediaStream,
} from '../utils/mediaPermissions';
import { PermissionDeniedModal } from './PermissionDeniedModal';

/**
 * 3c · 레슨 중 동반 (Live Lesson Companion)
 *
 * A dedicated during-lesson surface for the coach. The redesign asks
 * for something the coach can prop up on the mat and glance at with
 * dirty hands: a big rolling timer, one enormous "voice memo" button,
 * and a lightweight capture pane for swing photos/videos. When the
 * lesson ends the coach hands the captured artifacts off to the review
 * screen (8b) via `onFinish` — this component never persists on its
 * own, so the parent decides how to upload/store the artifacts.
 *
 * Voice memos use the browser's MediaRecorder in webm/opus. Photos and
 * clips fall through to a native camera input (`capture="environment"`)
 * — the coach is already looking at the phone camera, and this avoids
 * the second permission prompt + surface complexity of a live video
 * preview during a live lesson.
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
  /** Called when the coach hits 종료. Parent uploads + routes to review. */
  onFinish: (clips: CapturedClip[]) => void;
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

  // ─── Voice memo capture ───────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [permissionModalOpen, setPermissionModalOpen] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

  const startRecording = async () => {
    try {
      const stream = await requestMediaStream({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      const startedAt = performance.now();
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const dur = Math.round((performance.now() - startedAt) / 1000);
        addClip('voice', blob, dur);
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecSec(0);
      recTimerRef.current = window.setInterval(
        () => setRecSec((s) => s + 1),
        1000
      );
    } catch (e) {
      if (isMediaPermissionError(e) && e.kind === 'denied') {
        setPermissionModalOpen(true);
      } else {
        console.error('[LiveLessonCompanion] mic unavailable', e);
        alert('마이크를 사용할 수 없습니다.');
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recTimerRef.current) {
        window.clearInterval(recTimerRef.current);
        recTimerRef.current = null;
      }
    }
  };

  // Best-effort teardown if the coach navigates away mid-record.
  useEffect(() => {
    return () => {
      if (recTimerRef.current) window.clearInterval(recTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

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
  const handleFinish = () => {
    if (isRecording) stopRecording();
    onFinish(clips);
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
          startRecording();
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
            onClick={onCancel}
            className="text-[12px] text-ink-muted hover:text-ink-medium px-3 py-1.5"
          >
            나가기
          </button>
        </div>
      </header>

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

      {/* Voice memo — the primary during-lesson affordance */}
      <section className="px-5 py-4">
        <div className="rounded-2xl border border-line-subtle bg-white/[0.03] p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
              <Mic className="w-4.5 h-4.5 text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold text-ink-high">음성 메모</div>
              <div className="text-[11.5px] text-ink-muted">
                {isRecording
                  ? '녹음 중 · 멈추면 클립으로 추가됩니다'
                  : '레슨 중 코칭 포인트를 기록해두세요'}
              </div>
            </div>
            {isRecording && (
              <span className="text-[13px] font-mono font-bold text-red-400 tabular-nums">
                {formatDuration(recSec)}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            className={`w-full h-14 rounded-xl flex items-center justify-center gap-2 text-[15px] font-bold transition-colors ${
              isRecording
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-emerald-500 hover:bg-emerald-600 text-[#04150e]'
            }`}
          >
            {isRecording ? (
              <>
                <Square className="w-5 h-5" /> 녹음 정지
              </>
            ) : (
              <>
                <Mic className="w-5 h-5" /> 녹음 시작
              </>
            )}
          </button>
        </div>
      </section>

      {/* Photo / video capture — native camera fall-through */}
      <section className="px-5 pb-4">
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
