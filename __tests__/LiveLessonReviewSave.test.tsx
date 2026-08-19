/**
 * 레슨 동반(3c) — "레슨 기록 확인" 검토 화면의 저장 버튼 회귀 테스트.
 *
 * 검토 화면은 동반 오버레이 루트 안에 `absolute inset-0` 으로 얹히는데,
 * 절대 위치의 기준은 루트의 *패딩 박스*라서 루트가 하단 탭바용으로 잡아 둔
 * 여백까지 그대로 덮었다. 그 결과 코치 하단 탭바(fixed, 같은 z-50, DOM 상
 * 더 뒤)가 검토 화면 푸터 위에 그려져 "기록 저장하기" 버튼이 화면에서
 * 사라진 것처럼 보였다. 검토 화면도 탭바 높이를 예약해야 한다.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ─── 파이프라인/마이크/인식 목 ────────────────────────────────────────────────

const notes = [
  {
    index: 0,
    startSec: 0,
    durationSec: 10,
    status: 'done',
    transcript: '어드레스에서 그립 압력을 부드럽게 가져가세요',
    keyPoints: [],
    drills: [],
    metrics: [],
    studentState: '',
  },
];

const sessionStub = {
  isRecorderAlive: true,
  isPaused: false,
  start: vi.fn(async () => {}),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(async () => ({
    runBlobs: [],
    handoff: { sessionId: 'sess-1', studentName: '한윤슬' },
  })),
  checkpoint: vi.fn(async () => {}),
  settleAnalyses: vi.fn(async () => {}),
  setTranscriptSource: vi.fn(),
  getNotes: () => notes,
  snapshot: () => ({
    recordedSec: 63,
    analyzedCount: 1,
    pendingCount: 0,
    liveSummary: '그립 압력 위주로 진행',
    liveSummaryUpdating: false,
  }),
};

vi.mock('../services/lessonAudioPipeline', () => ({
  LessonAudioSession: vi.fn(function LessonAudioSessionMock() {
    return sessionStub;
  }),
  findRecoverableSessions: vi.fn(async () => []),
  purgeStaleLessonAudioSessions: vi.fn(async () => {}),
  discardLessonAudioSession: vi.fn(async () => {}),
  generateRollingLessonSummary: vi.fn(async () => '요약'),
  formatClock: (sec: number) =>
    `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`,
}));

vi.mock('../utils/mediaPermissions', () => ({
  requestMediaStream: vi.fn(async () => ({ getTracks: () => [] })),
  isMediaPermissionError: () => false,
}));

vi.mock('../hooks/useLiveTranscription', () => ({
  useLiveTranscription: () => ({
    active: true,
    interim: '',
    degraded: false,
    start: vi.fn(async () => true),
    pause: vi.fn(),
    resume: vi.fn(async () => {}),
    stop: vi.fn(),
  }),
}));

// 권한 모달이 언어 컨텍스트를 읽는다.
vi.mock('../components/LanguageContext', () => ({
  useLanguage: () => ({ language: 'ko', t: (key: string) => key }),
}));

import { LiveLessonCompanion } from '../components/LiveLessonCompanion';

/** 녹음 시작 → 레슨 종료로 검토(레슨 기록 확인) 화면까지 연다. */
async function openReviewScreen(onFinish = vi.fn()) {
  render(
    <LiveLessonCompanion
      studentName="한윤슬"
      lessonDate="2026-08-19"
      onFinish={onFinish}
      onCancel={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: /레슨 녹음 시작/ }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /일시정지/ })).toBeInTheDocument(),
  );

  fireEvent.click(screen.getByRole('button', { name: /레슨 종료/ }));
  await screen.findByText('레슨 기록 확인');
  return onFinish;
}

describe('레슨 기록 확인 화면', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('저장 버튼을 코치 하단 탭바에 가리지 않게 띄운다', async () => {
    await openReviewScreen();

    const save = await screen.findByRole('button', { name: /기록 저장하기/ });
    expect(save).toBeInTheDocument();
    expect(save).not.toBeDisabled();

    // 검토 화면 자체가 탭바 높이를 예약해야 푸터가 탭바 위로 올라온다.
    const reviewRoot = save.closest('.absolute.inset-0');
    expect(reviewRoot).not.toBeNull();
    expect(reviewRoot!.className).toContain('coach-nav-clearance');
    expect(reviewRoot!.className).toContain('bg-base');
  });

  it('저장 버튼을 누르면 편집한 필기·요약이 저장 흐름으로 넘어간다', async () => {
    const onFinish = await openReviewScreen();

    const summary = await screen.findByPlaceholderText(/요약이 아직 없어요/);
    fireEvent.change(summary, { target: { value: '그립 압력 교정' } });

    fireEvent.click(screen.getByRole('button', { name: /기록 저장하기/ }));

    await waitFor(() => expect(onFinish).toHaveBeenCalled());
    const [, handoff] = onFinish.mock.calls[0];
    expect(handoff.editedSummary).toBe('그립 압력 교정');
    expect(handoff.editedTranscript).toContain('그립 압력');
  });
});
