/**
 * 레슨 동반 — 누가 라이브 필기를 쓰는가.
 *
 * 짧은 오디오 조각을 AI 에 물으면 그건 전사가 아니라 추측이라, 코치가
 * 하지도 않은 문장이 적힌다. 그래서 화면에 흐르는 글은 **기기 음성
 * 인식기**가 쓴다 — 단어를 잘못 들을지언정 들린 말을 옮기고, 즉시 나온다.
 * 녹음은 처음부터 끝까지 돌아 검토 단계의 정밀 전사가 최종 기록을 만든다.
 *
 * 인식기를 못 쓰는 기기(또는 도중에 죽는 기기)에서는 AI 전사가 이어받는다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

/** 훅이 확정 문장을 흘려보내는 통로 — 테스트가 직접 발화를 만든다. */
let emitFinal: ((text: string) => void) | null = null;
/** 인식기가 포기했는가 — 렌더 사이에 바꿔 폴백 경로를 만든다. */
let degraded = false;
/** 인식기 start() 성공 여부. */
let speechStarts = true;

const sessionStub = {
  isRecorderAlive: true,
  isPaused: false,
  mimeType: 'audio/webm',
  start: vi.fn(async () => {}),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(async () => ({ runBlobs: [], handoff: {} })),
  checkpoint: vi.fn(async () => {}),
  settleAnalyses: vi.fn(async () => {}),
  setTranscriptSource: vi.fn(),
  addSpeechNote: vi.fn(),
  flushRecordedTail: vi.fn(async () => {}),
  getTranscriptionSlices: vi.fn(async () => []),
  applyPreciseNotes: vi.fn(),
  applySpeakerTurns: vi.fn(),
  applyRepairedNotes: vi.fn(),
  getNotes: () => [],
  snapshot: () => ({
    recordedSec: 10,
    analyzedCount: 0,
    pendingCount: 0,
    liveSummary: '',
    liveSummaryUpdating: false,
  }),
};

vi.mock('../services/lessonAudioPipeline', async () => ({
  ...(await vi.importActual<typeof import('../services/lessonAudioPipeline')>(
    '../services/lessonAudioPipeline'
  )),
  LessonAudioSession: vi.fn(function LessonAudioSessionMock() {
    return sessionStub;
  }),
  findRecoverableSessions: vi.fn(async () => []),
  purgeStaleLessonAudioSessions: vi.fn(async () => {}),
  discardLessonAudioSession: vi.fn(async () => {}),
}));

vi.mock('../utils/mediaPermissions', () => ({
  requestMediaStream: vi.fn(async () => ({ getTracks: () => [] })),
  isMediaPermissionError: () => false,
}));

vi.mock('../hooks/useLiveTranscription', () => ({
  useLiveTranscription: ({ onFinal }: { onFinal: (t: string) => void }) => {
    emitFinal = onFinal;
    return {
      active: true,
      interim: '',
      degraded,
      start: vi.fn(async () => speechStarts),
      pause: vi.fn(),
      resume: vi.fn(async () => {}),
      stop: vi.fn(),
    };
  },
}));

vi.mock('../components/LanguageContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/LanguageContext')>()),
  useLanguage: () => ({ language: 'ko', t: (key: string) => key }),
}));

import { LiveLessonCompanion } from '../components/LiveLessonCompanion';

const startLesson = async () => {
  const view = render(
    <LiveLessonCompanion
      studentName="한윤슬"
      lessonDate="2026-09-10"
      onFinish={vi.fn()}
      onCancel={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /레슨 녹음 시작/ }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /일시정지/ })).toBeInTheDocument()
  );
  return view;
};

describe('라이브 필기의 주인', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emitFinal = null;
    degraded = false;
    speechStarts = true;
  });

  it('인식기가 들은 말을 그대로 필기로 넣는다', async () => {
    await startLesson();

    emitFinal?.('어깨를 조금만 더 돌려보세요');

    expect(sessionStub.addSpeechNote).toHaveBeenCalledWith(
      '어깨를 조금만 더 돌려보세요'
    );
  });

  it('인식기가 붙으면 필기 원천을 인식기로 둔다', async () => {
    await startLesson();
    expect(sessionStub.setTranscriptSource).toHaveBeenCalledWith('speech');
  });

  it('인식기를 못 쓰는 기기에서는 AI 전사가 필기를 쓴다', async () => {
    speechStarts = false;
    await startLesson();
    expect(sessionStub.setTranscriptSource).toHaveBeenCalledWith('ai');
  });

  it('인식기가 도중에 포기하면 AI 전사가 이어받는다', async () => {
    const view = await startLesson();
    expect(sessionStub.setTranscriptSource).toHaveBeenLastCalledWith('speech');

    degraded = true;
    view.rerender(
      <LiveLessonCompanion
        studentName="한윤슬"
        lessonDate="2026-09-10"
        onFinish={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await waitFor(() =>
      expect(sessionStub.setTranscriptSource).toHaveBeenLastCalledWith('ai')
    );
  });
});
