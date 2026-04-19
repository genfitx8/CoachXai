import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

  it('shows CoachX-branded loading shell during app boot', async () => {
    render(<App />);
    expect(screen.getByText('CoachX AI')).toBeInTheDocument();
    expect(screen.getByText('Preparing your coaching space...')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('start-lesson-btn')).toBeInTheDocument();
    });
  });

  it('shows only the two primary coach home actions: Start Lesson and CoachX AI', async () => {
    await renderCoachApp();

    expect(screen.getByTestId('start-lesson-btn')).toBeInTheDocument();
    expect(screen.getByTestId('coachx-entry-btn')).toBeInTheDocument();
  });

  it('hides non-core surfaces from the coach home', async () => {
    await renderCoachApp();

    expect(screen.queryByTestId('students-entry-btn')).toBeNull();
    expect(screen.queryByTestId('lesson-records-entry-btn')).toBeNull();
    expect(screen.queryByTestId('coachx-attention-card')).toBeNull();
    expect(screen.queryByText(/최근 레슨 기록/i)).toBeNull();
    expect(screen.queryByText(/예약 및 회원 관리/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /예약 관리|reservation_management/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /타석 예약/i })).toBeNull();
  });

  it('keeps removed home shortcuts hidden', async () => {
    await renderCoachApp();
    expect(screen.queryByTestId('lesson-records-entry-btn')).toBeNull();
  });

  it('keeps calendar hidden on the simplified coach home', async () => {
    await renderCoachApp();
    expect(screen.queryByTestId('calendar-view')).toBeNull();
  });
});
