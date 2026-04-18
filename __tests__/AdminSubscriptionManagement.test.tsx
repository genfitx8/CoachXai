import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdminDashboard } from '../components/AdminDashboard';
import { ClientProfile, CoachProfile, Lesson } from '../types';

vi.mock('../components/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'ko',
    t: (key: string) => key,
  }),
}));

vi.mock('../services/firebase', () => ({
  firebaseService: {
    getSavedConfig: vi.fn().mockReturnValue(null),
    isInitialized: vi.fn().mockReturnValue(false),
    init: vi.fn().mockReturnValue(false),
    getHomeworkTemplates: vi.fn().mockResolvedValue([]),
    getNotifications: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../services/storage', () => ({
  storageService: {
    getHomeworkTemplates: vi.fn().mockReturnValue([]),
    getNotifications: vi.fn().mockReturnValue([]),
    saveHomeworkTemplates: vi.fn(),
    saveNotification: vi.fn(),
    getClients: vi.fn().mockReturnValue([]),
    saveClients: vi.fn(),
    clearAllData: vi.fn(),
  },
}));

const CLIENT: ClientProfile = {
  name: '홍길동',
  phone: '01011112222',
  isSubscribed: false,
};

const COACH: CoachProfile = {
  id: 'coach-1',
  name: '박프로',
  phone: '01099998888',
  email: 'coach@example.com',
  isSubscribed: false,
};

const noop = vi.fn();

const BASE_PROPS = {
  clients: [CLIENT],
  coaches: [COACH],
  lessons: [] as Lesson[],
  coachProfile: null,
  onDeleteClient: noop,
  onDeleteCoach: noop,
  onDeleteLesson: noop,
  onResetSystem: noop,
  onLogout: noop,
  onToggleSubscription: noop,
  onGrantTrial: noop,
  onChangeSubscriptionPlan: noop,
};

describe('AdminDashboard subscription management entrypoint', () => {
  it('opens the subscription manager when clicking 관리 on a member row', async () => {
    render(<AdminDashboard {...BASE_PROPS} />);

    expect(screen.queryByText('회원 구독 플랜')).toBeNull();

    fireEvent.click(
      screen.getByTestId(`manage-subscription-${CLIENT.phone}`)
    );

    expect(await screen.findByText('회원 구독 플랜')).toBeInTheDocument();
    expect(screen.getByText('구독 활성화')).toBeInTheDocument();
  });
});
