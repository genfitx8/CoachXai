/**
 * 레슨 동반(LIVE_LESSON) 기록 카테고리 분리 테스트.
 *
 * 레슨 중 동반(3c)에서 넘어온 캡처(음성/사진/영상)는 더 이상 일반 레슨
 * 기록으로 저장되지 않고, 별도 카테고리인 '레슨 동반 기록'으로 저장된다.
 * 이 카테고리는 저장 형태가 다르다: 필기(레슨 내용 텍스트)와 요약본이
 * `liveLessonDetail` 로 함께 남는다.
 *
 * 검증:
 * 1. 핸드오프(initialClips + initialLiveSession)로 열리면 기록 유형 선택
 *    없이 바로 '레슨 동반 기록' FORM 으로 진입한다.
 * 2. 저장된 레슨은 recordType === 'LIVE_LESSON' 이고 '레슨동반' 태그가 붙는다.
 * 3. liveLessonDetail 에 필기(transcript)와 검토에서 확인된 요약본(summary)이
 *    저장된다. 저장 시점에 AI 요약을 다시 돌리지는 않는다.
 * 4. 저장 후 라이브 세션의 복구용 IDB 데이터가 폐기된다.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { NewLessonForm } from '../components/NewLessonForm';
import { LanguageProvider } from '../components/LanguageContext';
import { ClientProfile, CoachProfile, Lesson } from '../types';
import type { CapturedClip } from '../components/LiveLessonCompanion';
import type { LiveLessonHandoff } from '../services/lessonAudioPipeline';
import {
  collectSessionNotes,
  discardLessonAudioSession,
  generateLessonSummaryFromNotes,
  generateLessonSummaryFromTranscript,
} from '../services/lessonAudioPipeline';

vi.mock('../services/lessonAudioPipeline', () => ({
  collectSessionNotes: vi.fn(async () => [
    {
      index: 0,
      startSec: 0,
      durationSec: 10,
      status: 'done',
      transcript: '어드레스에서 그립 압력을 부드럽게 가져가세요',
      keyPoints: ['그립 압력'],
      drills: ['빈 스윙 10회'],
      metrics: [],
      studentState: '',
    },
    {
      index: 1,
      startSec: 10,
      durationSec: 10,
      status: 'done',
      transcript: '백스윙 템포를 일정하게 유지합니다',
      keyPoints: [],
      drills: [],
      metrics: [],
      studentState: '',
    },
    {
      index: 2,
      startSec: 20,
      durationSec: 10,
      status: 'failed',
      transcript: '',
      keyPoints: [],
      drills: [],
      metrics: [],
      studentState: '',
    },
  ]),
  generateLessonSummaryFromNotes: vi.fn(async () => '## 오늘 레슨 요약본'),
  generateLessonSummaryFromTranscript: vi.fn(async () => '## 재생성된 요약본'),
  parseReviewedTranscript: (text: string) =>
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, i) => ({ startSec: i * 10, text: line })),
  discardLessonAudioSession: vi.fn(async () => {}),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const COACH: CoachProfile = {
  id: 'coach1',
  name: '김코치',
  email: 'coach@test.com',
};

const CLIENT: ClientProfile = {
  id: 'c1',
  name: '박회원',
  phone: '010-1234-5678',
  coachId: 'coach1',
  email: '',
};

const makeClip = (): CapturedClip => ({
  id: 'clip_voice_1',
  kind: 'voice',
  blob: new Blob(['audio-bytes'], { type: 'audio/webm' }),
  durationSec: 1800,
  previewUrl: 'blob:companion-preview',
  capturedAt: Date.now(),
});

const LIVE_SESSION: LiveLessonHandoff = {
  sessionId: 'session_live_1',
  recordedDurationSec: 1800,
  noteCount: 2,
  pendingCount: 0,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const renderHandoffForm = (liveSession = LIVE_SESSION) => {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  const onInitialClipsConsumed = vi.fn();

  const utils = render(
    <LanguageProvider>
      <NewLessonForm
        existingClients={[CLIENT]}
        packages={[]}
        lessons={[]}
        userRole="COACH"
        currentUser={COACH}
        onSave={onSave}
        onCancel={onCancel}
        prefilledClient={CLIENT}
        initialClips={[makeClip()]}
        initialLiveSession={liveSession}
        onInitialClipsConsumed={onInitialClipsConsumed}
      />
    </LanguageProvider>
  );

  return { ...utils, onSave, onCancel, onInitialClipsConsumed };
};

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeAll(() => {
  // jsdom 은 URL.createObjectURL 을 구현하지 않는다 — 클립을 PendingMedia 로
  // 승격하는 경로가 이를 호출하므로 셔밍한다.
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(
      () => `blob:mock-${Math.random().toString(36).slice(2)}`
    ) as typeof URL.createObjectURL;
  }
  if (!URL.revokeObjectURL) {
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
  }
});

describe('레슨 동반(LIVE_LESSON) 기록 카테고리', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('핸드오프로 열리면 유형 선택 없이 바로 레슨 동반 기록 FORM 으로 진입한다', async () => {
    renderHandoffForm();

    // TYPE_SELECT 화면("기록 유형 선택")을 건너뛴다.
    expect(screen.queryByText('기록 유형 선택')).toBeNull();
    // 헤더가 레슨 동반 기록으로 뜬다 (안내 배너에도 같은 문구가 있어 getAllBy).
    expect(screen.getAllByText(/레슨 동반 기록/).length).toBeGreaterThan(0);

    // 클립이 미디어로 승격되어 버킷 소비 콜백이 호출된다.
    const { onInitialClipsConsumed } = renderHandoffForm();
    await waitFor(() => {
      expect(onInitialClipsConsumed).toHaveBeenCalled();
    });
  });

  it('레슨 동반 폼은 일반 레슨 기록 항목(클럽·코치 메모·AI 리포트 토글) 없이 동반 기록 내용만 보여준다', async () => {
    renderHandoffForm();

    await waitFor(() => {
      expect(screen.getAllByText(/레슨 동반 기록/).length).toBeGreaterThan(0);
    });

    // 일반 레슨 기록 폼의 항목들이 없어야 한다.
    expect(screen.queryByText('사용 클럽')).toBeNull();
    expect(screen.queryByText(/코치 메모 \/ 피드백/)).toBeNull();
    expect(screen.queryByText('레슨 요약 리포트')).toBeNull();
    expect(screen.queryByText(/스윙 영상 업로드/)).toBeNull();

    // 동반에서 기록된 내용만: 캡처 미디어 목록 + 필기/요약 자동 저장 안내.
    expect(screen.getByText('캡처된 미디어')).toBeInTheDocument();
    expect(screen.getByText(/필기 노트 · 요약본/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '레슨 동반 기록 저장' })
    ).toBeInTheDocument();
  });

  it('저장 시 recordType LIVE_LESSON + 필기/요약본이 liveLessonDetail 로 저장된다', async () => {
    const { onSave } = renderHandoffForm();

    // 클립 승격이 끝날 때까지 대기
    await waitFor(() => {
      expect(screen.getAllByText(/레슨 동반 기록/).length).toBeGreaterThan(0);
    });

    const saveBtn = screen.getByRole('button', {
      name: /레슨 등록하기|기록 저장하기|저장/i,
    });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });

    const saved: Lesson = onSave.mock.calls[0][0];
    expect(saved.recordType).toBe('LIVE_LESSON');
    expect(saved.tags).toContain('레슨동반');
    expect(saved.clientName).toBe('박회원');

    // 필기(레슨 내용 텍스트) — 완료된 노트만, 시간순으로.
    expect(saved.liveLessonDetail).toBeDefined();
    expect(saved.liveLessonDetail!.recordedDurationSec).toBe(1800);
    expect(saved.liveLessonDetail!.transcript).toEqual([
      { startSec: 0, text: '어드레스에서 그립 압력을 부드럽게 가져가세요' },
      { startSec: 10, text: '백스윙 템포를 일정하게 유지합니다' },
    ]);
    expect(saved.liveLessonDetail!.keyPoints).toContain('그립 압력');
    expect(saved.liveLessonDetail!.drills).toContain('빈 스윙 10회');

    // 요약은 검토 화면에서 끝났다 — 저장은 AI 를 부르지 않는다. 검토에서
    // 요약을 비워 두고 온 핸드오프라면 필기만 남고 요약본은 비어 있다.
    expect(generateLessonSummaryFromNotes).not.toHaveBeenCalled();
    expect(generateLessonSummaryFromTranscript).not.toHaveBeenCalled();
    expect(saved.liveLessonDetail!.summary).toBeUndefined();
    expect(saved.aiAnalysis).toBeUndefined();

    // 세션 노트는 핸드오프 sessionId 로 수거된다. 검토한 필기가 없으면
    // 아직 분석 중인 구간을 잠깐(10초까지) 기다렸다가 그대로 쓴다.
    expect(collectSessionNotes).toHaveBeenCalledWith('session_live_1', {
      waitMs: 10_000,
    });

    // 저장이 끝나면 복구용 IDB 세션은 폐기된다.
    await waitFor(() => {
      expect(discardLessonAudioSession).toHaveBeenCalledWith('session_live_1');
    });
  });

  it('검토 화면에서 확인한 요약이 있으면 저장 때 요약을 다시 만들지 않는다', async () => {
    const { onSave } = renderHandoffForm({
      ...LIVE_SESSION,
      editedTranscript: '어드레스에서 그립 압력을 부드럽게\n백스윙 템포 유지',
      editedSummary: '- 그립 압력 교정\n- 백스윙 템포 일정하게',
    });

    await waitFor(() => {
      expect(screen.getAllByText(/레슨 동반 기록/).length).toBeGreaterThan(0);
    });

    fireEvent.click(
      screen.getByRole('button', { name: /레슨 등록하기|기록 저장하기|저장/i })
    );

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });

    // 코치가 이미 확인·수정한 요약이 그대로 최종 요약본이 된다 —
    // 저장 시점의 요약 호출은 어느 경로로도 없다.
    expect(generateLessonSummaryFromTranscript).not.toHaveBeenCalled();
    expect(generateLessonSummaryFromNotes).not.toHaveBeenCalled();

    const saved: Lesson = onSave.mock.calls[0][0];
    expect(saved.liveLessonDetail!.summary).toBe(
      '- 그립 압력 교정\n- 백스윙 템포 일정하게'
    );
    expect(saved.aiAnalysis).toBe('- 그립 압력 교정\n- 백스윙 템포 일정하게');
    // 필기는 코치 확인본이 그대로 저장된다.
    expect(saved.liveLessonDetail!.transcript).toEqual([
      { startSec: 0, text: '어드레스에서 그립 압력을 부드럽게' },
      { startSec: 10, text: '백스윙 템포 유지' },
    ]);

    // 본문이 이미 손에 있으므로 분석 큐가 비기를 기다리지 않는다 —
    // 저장 버튼을 누른 뒤 대기가 도는 일이 없어야 한다.
    expect(collectSessionNotes).toHaveBeenCalledWith('session_live_1', {
      waitMs: 0,
    });
  });
});
