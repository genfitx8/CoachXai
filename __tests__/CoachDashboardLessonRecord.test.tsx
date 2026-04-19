import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    {
      id: 'l2',
      clientName: '이회원',
      clientPhone: '010-1111-0002',
      coachId: 'coach1',
      createdBy: 'COACH',
      date: '2024-01-10',
      title: '아이언 스윙',
      videoUrl: '',
      mediaType: 'video',
      coachNotes: '',
      tags: [],
      createdAt: Date.now() - 2000,
      lessonPackageId: 'pkg1',
      sessionNumber: 1,
    },
  ];

  const clients = [
    { id: 'c1', name: '김회원', phone: '010-1111-0001', coachId: 'coach1', email: '' },
    { id: 'c2', name: '이회원', phone: '010-1111-0002', coachId: 'coach1', email: '' },
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

vi.mock('../components/CoachReservationNotificationModal', () => ({
  CoachReservationNotificationModal: () => null,
}));

const renderCoachApp = async () => {
  const utils = render(<App />);
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /레슨.*시작|start_lesson/i })).toBeInTheDocument();
  });
  return utils;
};

describe('Coach dashboard – focused lesson-record MVP home', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps Start Lesson as the primary visible CTA', async () => {
    await renderCoachApp();
    expect(screen.getByRole('button', { name: /레슨.*시작|start_lesson/i })).toBeInTheDocument();
  });

  it('shows Students and CoachX AI entries on the simplified home', async () => {
    await renderCoachApp();
    expect(screen.getByRole('button', { name: /students/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ask coachx ai/i })).toBeInTheDocument();
  });

  it('does not render the recent lessons section on home', async () => {
    await renderCoachApp();
    expect(screen.queryByText(/최근 레슨 기록/i)).toBeNull();
    expect(screen.queryByText(/오늘의 레슨 기록/i)).toBeNull();
  });

  it('hides reservation and bay reservation buttons from the home surface', async () => {
    await renderCoachApp();
    expect(screen.queryByRole('button', { name: /예약 관리|reservation_management/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^타석 예약$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /나의 타석 예약/i })).toBeNull();
  });

  it('navigates to lesson list from Lesson Records button', async () => {
    await renderCoachApp();

    fireEvent.click(screen.getByRole('button', { name: /lesson records/i }));

    await waitFor(() => {
      expect(screen.getByText(/레슨 미디어 표시/i)).toBeInTheDocument();
    });
  });

  it('hides package/training management actions in Students screen', async () => {
    await renderCoachApp();

    fireEvent.click(screen.getByRole('button', { name: /students/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /coach_client_title|회원 관리/i })).toBeInTheDocument();
    });

    expect(screen.queryByText(/coach_client_package_manage|패키지/i)).toBeNull();
    expect(screen.queryByText(/coach_client_training_create|훈련|트레이닝/i)).toBeNull();
  });
});
