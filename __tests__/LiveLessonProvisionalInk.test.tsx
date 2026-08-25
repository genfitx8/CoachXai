/**
 * 레슨 동반 — 말하는 즉시 흐르는 잠정 줄("실시간 느낌").
 *
 * 필기의 원천은 녹음 + AI 전사지만, 그것만 두면 확정 줄이 구간(20초)마다
 * 한 번씩 나타나 코치 눈에는 아무것도 안 적히는 것처럼 보인다. 브라우저
 * 인식기의 문장을 연한 잉크의 잠정 줄로 즉시 적고, 그 시간대의 AI 필기가
 * 도착하면 걷어내 같은 말이 두 번 남지 않게 한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

/** 훅이 확정 문장을 흘려보내는 통로 — 테스트가 직접 발화를 만든다. */
let emitFinal: ((text: string) => void) | null = null;
/** 세션이 필기를 바꿀 때 컴포넌트로 올려 보내는 콜백. */
let pushNotes: ((notes: unknown[]) => void) | null = null;
let recordedSec = 0;

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
  flushRecordedTail: vi.fn(async () => {}),
  getTranscriptionSlices: vi.fn(async () => []),
  applyPreciseNotes: vi.fn(),
  applySpeakerTurns: vi.fn(),
  applyRepairedNotes: vi.fn(),
  getNotes: () => [],
  snapshot: () => ({
    recordedSec,
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
  LessonAudioSession: vi.fn(function LessonAudioSessionMock(opts: {
    onNotesChanged?: (notes: unknown[]) => void;
  }) {
    pushNotes = opts.onNotesChanged ?? null;
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
      degraded: false,
      start: vi.fn(async () => true),
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

const doneNote = (startSec: number, durationSec: number, transcript: string) => ({
  index: startSec,
  startSec,
  durationSec,
  status: 'done',
  transcript,
  keyPoints: [],
  drills: [],
  metrics: [],
  studentState: '',
});

const startLesson = async () => {
  render(
    <LiveLessonCompanion
      studentName="한윤슬"
      lessonDate="2026-08-24"
      onFinish={vi.fn()}
      onCancel={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /레슨 녹음 시작/ }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /일시정지/ })).toBeInTheDocument()
  );
};

describe('잠정 줄(실시간 느낌)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emitFinal = null;
    pushNotes = null;
    recordedSec = 0;
  });

  it('인식된 문장이 확정 필기를 기다리지 않고 바로 화면에 적힌다', async () => {
    await startLesson();

    recordedSec = 5;
    fireEvent(window, new Event('resize')); // 렌더 트리거용 no-op
    emitFinal?.('어깨를 조금만 더 돌려보세요');

    expect(
      await screen.findByText(/어깨를 조금만 더 돌려보세요/)
    ).toBeInTheDocument();
  });

  it('그 시간대의 AI 필기가 도착하면 잠정 줄을 걷어낸다', async () => {
    await startLesson();

    recordedSec = 5;
    emitFinal?.('어깨를 조금만 더 돌려보세요');
    expect(
      await screen.findByText(/어깨를 조금만 더 돌려보세요/)
    ).toBeInTheDocument();

    // 0–20초 구간의 확정 필기가 도착 — 잠정 줄(5초 지점)은 덮인다.
    recordedSec = 25;
    pushNotes?.([doneNote(0, 20, '어깨를 조금 더 돌려 볼게요')]);

    await waitFor(() =>
      expect(
        screen.queryByText(/어깨를 조금만 더 돌려보세요/)
      ).not.toBeInTheDocument()
    );
    expect(screen.getByText(/어깨를 조금 더 돌려 볼게요/)).toBeInTheDocument();
  });

  it('전사를 건너뛴 조용한 구간의 잠정 줄도 시간이 지나면 정리한다', async () => {
    await startLesson();

    recordedSec = 5;
    emitFinal?.('짧게 한마디');
    expect(await screen.findByText(/짧게 한마디/)).toBeInTheDocument();

    // 말소리가 없어 확정 필기가 영영 오지 않는 구간 — 나이로 정리된다.
    recordedSec = 200;
    pushNotes?.([]);

    await waitFor(() =>
      expect(screen.queryByText(/짧게 한마디/)).not.toBeInTheDocument()
    );
  });
});
