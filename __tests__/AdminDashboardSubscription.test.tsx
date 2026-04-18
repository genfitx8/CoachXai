import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminDashboard } from '../components/AdminDashboard';
import { ClientProfile, CoachProfile } from '../types';

vi.mock('../components/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../components/AdminCourseManager', () => ({
  AdminCourseManager: () => null,
}));

vi.mock('../components/AdminBranchManager', () => ({
  AdminBranchManager: () => null,
}));

vi.mock('../components/AdminBranchStaffManager', () => ({
  AdminBranchStaffManager: () => null,
}));

vi.mock('../components/AdminPromptManager', () => ({
  AdminPromptManager: () => null,
}));

vi.mock('../components/AdminCoachActivity', () => ({
  AdminCoachActivity: () => null,
}));

vi.mock('../services/firebase', () => ({
  firebaseService: {
    getSavedConfig: vi.fn().mockReturnValue(null),
    isInitialized: vi.fn().mockReturnValue(false),
    getHomeworkTemplates: vi.fn().mockResolvedValue([]),
    getNotifications: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../services/storage', () => ({
  storageService: {
    getHomeworkTemplates: vi.fn().mockReturnValue([]),
    getNotifications: vi.fn().mockReturnValue([]),
    saveNotification: vi.fn(),
  },
}));

const FREE_MEMBER: ClientProfile = {
  name: '홍길동',
  phone: '010-1111-2222',
  isSubscribed: false,
  subscriptionPlan: 'FREE',
};

const BASE_PROPS = {
  lessons: [],
  coaches: [] as CoachProfile[],
  coachProfile: null,
  onDeleteClient: vi.fn(),
  onDeleteCoach: vi.fn(),
  onDeleteLesson: vi.fn(),
  onResetSystem: vi.fn(),
  onLogout: vi.fn(),
  onToggleSubscription: vi.fn(),
  onGrantTrial: vi.fn(),
};

describe('AdminDashboard subscription management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps selected member subscription state synced after admin changes plan', async () => {
    const onChangeSubscriptionPlan = vi.fn();
    const { rerender } = render(
      <AdminDashboard
        {...BASE_PROPS}
        clients={[FREE_MEMBER]}
        onChangeSubscriptionPlan={onChangeSubscriptionPlan}
      />
    );

    fireEvent.click(screen.getByText('admin_tab_system'));

    fireEvent.change(screen.getByTestId('admin-subscription-search-input'), {
      target: { value: FREE_MEMBER.name },
    });
    fireEvent.click(await screen.findByText(FREE_MEMBER.name));

    expect(screen.getByText('구독 활성화')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'PRO' } });
    fireEvent.click(screen.getByText('플랜 변경'));

    expect(onChangeSubscriptionPlan).toHaveBeenCalledWith(
      expect.objectContaining({ name: FREE_MEMBER.name, phone: FREE_MEMBER.phone }),
      'PRO'
    );

    rerender(
      <AdminDashboard
        {...BASE_PROPS}
        clients={[
          {
            ...FREE_MEMBER,
            isSubscribed: true,
            subscriptionPlan: 'PRO',
          },
        ]}
        onChangeSubscriptionPlan={onChangeSubscriptionPlan}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('구독 해제')).toBeInTheDocument();
    });
  });
});
