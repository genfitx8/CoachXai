import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import App from '../App';

vi.mock('../services/firebase', () => ({
  firebaseService: {
    getSavedConfig: vi.fn().mockReturnValue(null),
    init: vi.fn().mockReturnValue(false),
    isInitialized: vi.fn().mockReturnValue(false),
    getLessons: vi.fn().mockResolvedValue([]),
    getClients: vi.fn().mockResolvedValue([]),
    getCoaches: vi.fn().mockResolvedValue([]),
    onAuthStateChanged: vi.fn().mockImplementation((_cb: (u: null) => void) => () => {}),
  },
}));

vi.mock('../services/storage', () => {
  const today = new Date().toISOString().slice(0, 10);
  const lessons = [
    {
      id: 'l1',
      clientName: '김회원',
      clientPhone: '010-1111-0001',
      coachId: 'coach1',
      createdBy: 'COACH',
      date: today,
      title: '드라이버 자세',
      videoUrl: '',
      mediaType: 'video',
      coachNotes: '',
      tags: [],
      createdAt: Date.now() - 1000,
    },
  ];
  const clients = [
    { id: 'c1', name: '김회원', phone: '010-1111-0001', coachId: 'coach1', email: '' },
  ];

  return {
    storageService: {
      getLessons: vi.fn().mockReturnValue(lessons),
      getClients: vi.fn().mockReturnValue(clients),
      getCoaches: vi.fn().mockReturnValue([]),
      getLessonPackages: vi.fn().mockReturnValue([]),
      getTrainingPrograms: vi.fn().mockReturnValue([]),
      saveLessons: vi.fn(),
      saveClients: vi.fn(),
      saveCoaches: vi.fn(),
    },
  };
});

vi.mock('../services/authService', () => ({
  authService: {
    restoreSession: vi.fn().mockReturnValue({ role: 'COACH' }),
    getCoachProfile: vi.fn().mockReturnValue({
      id: 'coach1',
      name: '테스트코치',
      email: 'coach@test.com',
      phone: '010-0000-0000',
      branchId: 'branch1',
    }),
    logout: vi.fn(),
  },
}));

vi.mock('../services/coachNotificationService', () => ({
  getUnreadReservationNotificationsForCoach: vi.fn().mockResolvedValue([]),
  markNotificationsAsRead: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/realtime', () => ({
  realtimeSubscribe: vi.fn().mockReturnValue(() => {}),
  realtimeUnsubscribe: vi.fn(),
  realtimeConnect: vi.fn(),
}));

vi.mock('../components/CalendarView', () => ({
  default: () => <div data-testid="calendar-view" />,
}));

vi.mock('../components/CoachReservationNotificationModal', () => ({
  CoachReservationNotificationModal: () => null,
}));

const renderCoachApp = async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByTestId('start-lesson-btn')).toBeInTheDocument();
  });
};

describe('Coach dashboard – lesson-first MVP home', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows exactly three main home buttons with required labels', async () => {
    await renderCoachApp();

    const startButton = screen.getByTestId('start-lesson-btn');
    const coachxButton = screen.getByTestId('coachx-entry-btn');
    const studentsButton = screen.getByTestId('students-entry-btn');

    expect(startButton).toBeInTheDocument();
    expect(coachxButton).toBeInTheDocument();
    expect(studentsButton).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lesson start' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'coachx ai' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Student' })).toBeInTheDocument();
    expect(studentsButton.compareDocumentPosition(coachxButton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    [startButton, coachxButton, studentsButton].forEach((button) => {
      expect(button.className).toContain('rounded-2xl');
      expect(button.className).toContain('border');
    });
    expect(screen.queryByTestId('lesson-records-entry-btn')).toBeNull();
    expect(screen.queryByTestId('coachx-attention-card')).toBeNull();
  });

  it('hides lesson upload entry from coach home', async () => {
    await renderCoachApp();

    expect(screen.queryByTestId('lesson-upload-entry-btn')).toBeNull();
    expect(screen.queryByRole('button', { name: '자동 영상 편집' })).toBeNull();
  });

  it('does not show separate album entry on coach home', async () => {
    await renderCoachApp();

    expect(screen.queryByTestId('album-entry-btn')).toBeNull();
    expect(screen.queryByRole('button', { name: '영상 앨범' })).toBeNull();
  });

  it('hides non-core surfaces from the coach home', async () => {
    await renderCoachApp();

    expect(screen.queryByText(/최근 레슨 기록/i)).toBeNull();
    expect(screen.queryByText(/예약 및 회원 관리/i)).toBeNull();
    expect(screen.getByRole('button', { name: /예약 관리/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /타석 예약/i })).toBeNull();
  });

  it('keeps calendar hidden on the simplified coach home', async () => {
    await renderCoachApp();
    expect(screen.queryByTestId('calendar-view')).toBeNull();
  });

  it('does not show direct member registration button in Student category', async () => {
    await renderCoachApp();
    fireEvent.click(screen.getByTestId('students-entry-btn'));
    expect(screen.queryByTestId('coach-client-add-btn')).toBeNull();
  });

  it('does not show training program creation button in Student category', async () => {
    await renderCoachApp();
    fireEvent.click(screen.getByTestId('students-entry-btn'));
    expect(screen.queryByRole('button', { name: /훈련 프로그램 생성|create training program/i })).toBeNull();
  });

  it('opens diagnosis program member-selection mode from diagnosis entry', async () => {
    await renderCoachApp();
    fireEvent.click(screen.getByTestId('diagnosis-program-entry-btn'));

    await waitFor(() => {
      expect(screen.getByText('정밀진단 프로그램')).toBeInTheDocument();
    });
    expect(screen.queryByText('회원 관리')).toBeNull();
    expect(screen.getByRole('button', { name: /훈련 프로그램 생성|create training program/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /레슨 기록|lessons/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /레슨 패키지 관리|lesson package management/i })).toBeNull();
  });

  it('returns to diagnosis member-selection when pressing back from training program in diagnosis flow', async () => {
    await renderCoachApp();
    fireEvent.click(screen.getByTestId('diagnosis-program-entry-btn'));

    await waitFor(() => {
      expect(screen.getByText('정밀진단 프로그램')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /훈련 프로그램 생성|create training program/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '뒤로가기' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '뒤로가기' }));

    await waitFor(() => {
      expect(screen.getByText('정밀진단 프로그램')).toBeInTheDocument();
    });
    expect(screen.queryByText('회원 관리')).toBeNull();
  });

  it('moves direct member registration entry into Lesson start flow', async () => {
    await renderCoachApp();

    fireEvent.click(screen.getByTestId('start-lesson-btn'));

    const lessonRecordStartBtn = screen.getByRole('button', { name: /레슨 기록 시작/i });
    const directRegisterBtn = screen.getByTestId('lesson-start-direct-register-btn');
    const buttonGroup = lessonRecordStartBtn.parentElement;
    expect(buttonGroup).not.toBeNull();
    const buttonsInOrder = Array.from(buttonGroup!.querySelectorAll('button'));
    expect(buttonsInOrder.indexOf(directRegisterBtn)).toBeGreaterThan(
      buttonsInOrder.indexOf(lessonRecordStartBtn)
    );
    expect(directRegisterBtn).toBeInTheDocument();

    fireEvent.click(directRegisterBtn);
    await waitFor(() => {
      expect(screen.getByTestId('coach-client-add-modal')).toBeInTheDocument();
    });
  });
});
