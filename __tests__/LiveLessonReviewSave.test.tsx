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
  mimeType: 'audio/webm',
  /** 정밀 전사용 오디오 조각. 기본은 없음 — 실시간 필기 경로를 본다. */
  flushRecordedTail: vi.fn(async () => {}),
  getTranscriptionSlices: vi.fn(async () => [] as unknown[]),
  applyPreciseNotes: vi.fn(),
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
  applySpeakerTurns: vi.fn(),
  applyRepairedNotes: vi.fn(),
  getNotes: () => notes,
  snapshot: () => ({
    recordedSec: 63,
    analyzedCount: 1,
    pendingCount: 0,
    liveSummary: '그립 압력 위주로 진행',
    liveSummaryUpdating: false,
  }),
};

// 실제 모듈의 순수 헬퍼(buildTranscriptText·groupTranscriptParagraphs 등)는
// 그대로 쓰고, 녹음 세션과 네트워크를 타는 것만 스텁으로 갈아 끼운다.
vi.mock('../services/lessonAudioPipeline', async () => ({
  ...(await vi.importActual<
    typeof import('../services/lessonAudioPipeline')
  >('../services/lessonAudioPipeline')),
  LessonAudioSession: vi.fn(function LessonAudioSessionMock() {
    return sessionStub;
  }),
  findRecoverableSessions: vi.fn(async () => []),
  purgeStaleLessonAudioSessions: vi.fn(async () => {}),
  discardLessonAudioSession: vi.fn(async () => {}),
  generateRollingLessonSummary: vi.fn(async () => '요약'),
  // 검토 초안 3단계(교정 → 화자 분류 → 이중 요약)는 모두 네트워크를 타므로
  // 스텁으로 갈아 끼운다. 교정·라벨링은 통과만 시키고, 요약은 코치/학생
  // 두 칸이 각각 채워지는 경로를 본다.
  repairTranscriptTerms: vi.fn(async (given: unknown) => given),
  labelTranscriptSpeakers: vi.fn(async (given: unknown) => given),
  // 정밀 전사(녹음 전체 다시 받아 적기)도 네트워크를 탄다 — 기본은 통과.
  preciseTranscribeNotes: vi.fn(async () => null),
  generateDualLessonSummary: vi.fn(async () => ({
    coach: '- 그립 압력 교정',
    student: '- 손목이 아프다고 함',
  })),
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
// 실제 컨텍스트는 살려 둔다 — 공용 BackButton 이 LanguageContext 를 직접
// 읽으므로, 전체를 갈아끼우면 그 export 가 사라져 렌더가 터진다.
vi.mock('../components/LanguageContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/LanguageContext')>()),
  useLanguage: () => ({ language: 'ko', t: (key: string) => key }),
}));

import {
  labelTranscriptSpeakers,
  preciseTranscribeNotes,
} from '../services/lessonAudioPipeline';
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

  it('저장 버튼을 기기 제스처 바에 가리지 않게 띄운다', async () => {
    await openReviewScreen();

    const save = await screen.findByRole('button', { name: /기록 저장하기/ });
    expect(save).toBeInTheDocument();
    expect(save).not.toBeDisabled();

    // 탭바가 사라진 단일 화면 개편 이후에도, 검토 오버레이는 기기
    // 제스처 바 인셋(pb-safe)을 직접 예약해야 푸터가 가려지지 않는다.
    const reviewRoot = save.closest('.absolute.inset-0');
    expect(reviewRoot).not.toBeNull();
    expect(reviewRoot!.className).toContain('pb-safe');
    expect(reviewRoot!.className).toContain('bg-base');
  });

  it('정밀 전사가 되면 그 필기를 쓰고 화자 분류 단계를 건너뛴다', async () => {
    // 녹음 조각이 있으면 검토 단계가 같은 오디오를 다시 받아 적는다 —
    // 레슨 기록의 정확도를 결정하는 패스라, 결과가 있으면 실시간 필기를
    // 대체해야 한다. 화자 라벨이 함께 오므로 분류 단계는 돌 필요가 없다.
    sessionStub.getTranscriptionSlices.mockResolvedValueOnce([
      { blob: new Blob(['a']), startSec: 0, durationSec: 300 },
    ]);
    vi.mocked(preciseTranscribeNotes).mockResolvedValueOnce([
      {
        index: 0,
        startSec: 0,
        durationSec: 300,
        status: 'done',
        transcript: '얼리 익스텐션부터 잡고 갈게요',
        turns: [{ speaker: 'coach', text: '얼리 익스텐션부터 잡고 갈게요' }],
        keyPoints: [],
        drills: [],
        metrics: [],
        studentState: '',
      },
    ] as never);

    await openReviewScreen();

    expect(sessionStub.applyPreciseNotes).toHaveBeenCalled();
    expect(labelTranscriptSpeakers).not.toHaveBeenCalled();
    const draft = await screen.findByDisplayValue(
      /얼리 익스텐션부터 잡고 갈게요/
    );
    expect(draft).toBeInTheDocument();
  });

  it('코치 요약과 학생 요약을 나눠 띄운다', async () => {
    await openReviewScreen();

    // 검토 초안은 교정 → 화자 분류 → 이중 요약을 차례로 거친다.
    const coach = await screen.findByPlaceholderText(/요약이 아직 없어요/, undefined, {
      timeout: 5_000,
    });
    const student = await screen.findByPlaceholderText(/학생이 말한 내용이/);
    expect(coach).toHaveValue('- 그립 압력 교정');
    expect(student).toHaveValue('- 손목이 아프다고 함');
  });

  it('저장 버튼을 누르면 편집한 필기·두 요약이 저장 흐름으로 넘어간다', async () => {
    const onFinish = await openReviewScreen();

    const coach = await screen.findByPlaceholderText(/요약이 아직 없어요/, undefined, {
      timeout: 5_000,
    });
    fireEvent.change(coach, { target: { value: '그립 압력 교정' } });
    const student = await screen.findByPlaceholderText(/학생이 말한 내용이/);
    fireEvent.change(student, { target: { value: '손목 통증을 호소' } });

    fireEvent.click(screen.getByRole('button', { name: /기록 저장하기/ }));

    await waitFor(() => expect(onFinish).toHaveBeenCalled());
    const [, handoff] = onFinish.mock.calls[0];
    // 기록에 저장되는 본문은 소제목으로 갈린 합본이고, 두 칸은 따로도 간다.
    expect(handoff.editedSummary).toBe(
      '**코치 요약**\n그립 압력 교정\n\n**학생 요약**\n손목 통증을 호소',
    );
    expect(handoff.editedCoachSummary).toBe('그립 압력 교정');
    expect(handoff.editedStudentSummary).toBe('손목 통증을 호소');
    expect(handoff.editedTranscript).toContain('그립 압력');
  });
});
