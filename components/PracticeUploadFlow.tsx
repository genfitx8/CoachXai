import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Sparkles, Upload, Video, X } from 'lucide-react';
import type { ClientProfile, Homework, Lesson } from '../types';
import { apiService } from '../services/apiService';

/**
 * 5d · Practice-clip upload flow.
 *
 * The redesign wants the student's drill upload to complete with a
 * short-lived agent confirmation — a "받았어요" moment that fires the
 * homework's progress increment AND acknowledges the coach will see
 * this in tomorrow's briefing. This component owns three states:
 *
 *  1. `picker` — file input + "선택하기" button. Student picks a clip.
 *  2. `uploading` — spinner + progress copy while the presign + PUT
 *     round-trip runs.
 *  3. `confirm` — checkmark + "코치님께 전달했어요" + the linked
 *     homework's new complete state. Auto-closes after five seconds
 *     so the student lands back on the home tab without extra taps.
 *
 * The screen only handles the round-trip and the storage-side lesson
 * record; the student-facing UI in ClientApp holds the SubView and the
 * "mark homework complete" call so we stay decoupled from that state.
 */

export interface PracticeUploadFlowProps {
  clientProfile: ClientProfile;
  /** The homework this upload closes out. Optional — a free upload skips
   *  the "다음 액션" completion badge but still creates the lesson row. */
  homework?: Homework;
  /**
   * Persist the practice lesson through the app's existing lesson save
   * path so it lands in the same store as coach-authored records. The
   * caller passes `onSaveNewRecord` from ClientApp.
   */
  onSaveLesson: (lesson: Lesson) => void | Promise<void>;
  /** Mark the linked homework complete once the video is up. */
  onMarkHomeworkComplete?: (homeworkId: string) => void;
  /** Called after the confirmation auto-closes or the student taps 닫기. */
  onClose: () => void;
}

type Stage = 'picker' | 'uploading' | 'confirm' | 'error';

const AUTO_CLOSE_MS = 5000;

export const PracticeUploadFlow: React.FC<PracticeUploadFlowProps> = ({
  clientProfile,
  homework,
  onSaveLesson,
  onMarkHomeworkComplete,
  onClose,
}) => {
  const [stage, setStage] = useState<Stage>('picker');
  const [progressLabel, setProgressLabel] = useState('업로드 중');
  const [error, setError] = useState<string | null>(null);
  const [savedLesson, setSavedLesson] = useState<Lesson | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stage !== 'confirm') return;
    const timer = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [stage, onClose]);

  const startPicker = () => {
    setError(null);
    inputRef.current?.click();
  };

  const handleFile = async (file: File) => {
    setStage('uploading');
    setProgressLabel('영상 업로드 중');
    setError(null);
    try {
      // Generate a fresh lesson UUID so the R2 key + lesson row line up.
      const lessonId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      setProgressLabel('영상 업로드 중');
      const videoUrl = await apiService.uploadPracticeVideo(file, lessonId);

      setProgressLabel('기록 저장 중');
      const now = Date.now();
      const lesson: Lesson = {
        id: lessonId,
        clientId: `${clientProfile.name}_${clientProfile.phone}`,
        clientName: clientProfile.name,
        clientPhone: clientProfile.phone,
        coachId: clientProfile.coachId,
        createdBy: 'CLIENT',
        recordType: 'PRACTICE',
        date: new Date(now).toISOString().slice(0, 10),
        title: homework ? `연습 · ${homework.title}` : '연습 영상',
        videoUrl,
        videoKey: `lessons/${lessonId}/main.${(file.type.split('/')[1] || 'mp4').toLowerCase()}`,
        mediaType: 'video',
        coachNotes: '',
        tags: homework ? ['practice', 'homework'] : ['practice'],
        createdAt: now,
      };
      await onSaveLesson(lesson);
      setSavedLesson(lesson);

      if (homework && !homework.isCompleted) {
        onMarkHomeworkComplete?.(homework.id);
      }

      setStage('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드에 실패했습니다');
      setStage('error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="연습 영상 업로드"
      onClick={stage === 'confirm' ? onClose : undefined}
    >
      <div
        className="w-full sm:max-w-sm bg-base border-t sm:border border-line-subtle sm:rounded-2xl rounded-t-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-line-subtle">
          <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
            연습 영상
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 rounded-lg text-ink-medium hover:text-ink-high hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5">
          {stage === 'picker' && (
            <PickerView
              homework={homework}
              onOpenPicker={startPicker}
              inputRef={inputRef}
              onFile={handleFile}
            />
          )}
          {stage === 'uploading' && <UploadingView label={progressLabel} />}
          {stage === 'confirm' && (
            <ConfirmView
              homework={homework}
              lessonTitle={savedLesson?.title ?? '연습 영상'}
            />
          )}
          {stage === 'error' && (
            <ErrorView
              message={error ?? '알 수 없는 오류'}
              onRetry={() => setStage('picker')}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Stage bodies ─────────────────────────────────────────────────────────

const PickerView: React.FC<{
  homework?: Homework;
  onOpenPicker: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  onFile: (f: File) => void;
}> = ({ homework, onOpenPicker, inputRef, onFile }) => (
  <>
    <div className="flex items-center gap-3 mb-4">
      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
        <Video className="w-5 h-5 text-emerald-300" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-bold text-ink-high">
          {homework ? homework.title : '연습 영상 올리기'}
        </div>
        <div className="text-[11px] text-ink-muted mt-0.5">
          {homework
            ? '이 드릴에 대한 연습 영상을 올리면 코치님께 전달됩니다.'
            : '연습 영상을 올리면 코치님께 전달됩니다.'}
        </div>
      </div>
    </div>

    <button
      type="button"
      onClick={onOpenPicker}
      className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-[#04150e] text-[14px] font-bold flex items-center justify-center gap-2 transition-colors"
    >
      <Upload className="w-4 h-4" />
      영상 선택하기
    </button>
    <input
      ref={inputRef}
      type="file"
      accept="video/*"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
      }}
    />

    <p className="text-[11px] text-ink-muted text-center mt-3 leading-relaxed">
      스마트폰의 사진첩 또는 카메라 앱에서 촬영한 영상 · 최대 500MB
    </p>
  </>
);

const UploadingView: React.FC<{ label: string }> = ({ label }) => (
  <div className="py-6 text-center">
    <Loader2 className="w-8 h-8 text-emerald-400 mx-auto mb-3 animate-spin" />
    <div className="text-[13px] text-ink-high font-bold">{label}</div>
    <div className="text-[11px] text-ink-muted mt-1">
      다른 일 하셔도 돼요 · 창을 닫으면 취소됩니다
    </div>
  </div>
);

const ConfirmView: React.FC<{ homework?: Homework; lessonTitle: string }> = ({
  homework,
  lessonTitle,
}) => (
  <div className="py-4 text-center">
    <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-400/50 mx-auto flex items-center justify-center mb-3">
      <Check className="w-6 h-6 text-emerald-300" />
    </div>
    <div className="text-[15px] font-bold text-ink-high mb-1">
      코치님께 전달했어요
    </div>
    <div className="text-[12px] text-ink-medium leading-relaxed">
      {lessonTitle} · 내일 아침 브리핑에서 함께 보실 거예요
    </div>
    {homework && (
      <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-bold text-emerald-300">
        <Sparkles className="w-3 h-3" />
        드릴 완료 표시됨
      </div>
    )}
  </div>
);

const ErrorView: React.FC<{
  message: string;
  onRetry: () => void;
  onClose: () => void;
}> = ({ message, onRetry, onClose }) => (
  <div className="py-4 text-center">
    <div className="text-[13px] font-bold text-amber-300 mb-2">
      영상 업로드 실패
    </div>
    <div className="text-[12px] text-ink-medium mb-4">{message}</div>
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClose}
        className="flex-1 h-10 rounded-lg border border-line-default text-ink-medium hover:text-ink-high text-[13px] font-bold"
      >
        닫기
      </button>
      <button
        type="button"
        onClick={onRetry}
        className="flex-1 h-10 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-[#04150e] text-[13px] font-bold"
      >
        다시 시도
      </button>
    </div>
  </div>
);
