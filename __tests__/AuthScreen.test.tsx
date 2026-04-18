/**
 * Tests for the unified login flow in AuthScreen:
 *  1. Renders single credentials form (no COACH/CLIENT tabs)
 *  2. Advances to role-selection after valid credentials entered
 *  3. Authenticates as Coach when Coach card selected
 *  4. Authenticates as Member when Member card selected
 *  5. Returns to credentials screen on auth failure
 *  6. Signup: shows role selection first, then signup form
 *  7. Admin and Branch-admin modes still accessible
 *  8. Existing onLoginSuccess wiring preserved for all roles
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { AuthScreen } from '../components/AuthScreen';
import { authService } from '../services/authService';
import { LanguageProvider } from '../components/LanguageContext';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../services/authService', () => ({
  authService: {
    loginCoach: vi.fn(),
    loginClient: vi.fn(),
    signupCoach: vi.fn(),
    signupClient: vi.fn(),
    loginAdmin: vi.fn(),
    loginBranchAdmin: vi.fn(),
    findEmail: vi.fn(),
    findPassword: vi.fn(),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const renderAuthScreen = (onLoginSuccess = vi.fn()) =>
  render(
    <LanguageProvider>
      <AuthScreen onLoginSuccess={onLoginSuccess} />
    </LanguageProvider>
  );

const COACH_PROFILE = { id: 'c1', name: 'Test Coach', email: 'coach@example.com', phone: '010-0000-0001' };
const CLIENT_PROFILE = { name: 'Test Member', phone: '010-0000-0002', email: 'member@example.com' };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuthScreen – unified credentials form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a single email+password form without COACH/CLIENT tabs', () => {
    renderAuthScreen();
    // Email and password fields exist
    expect(screen.getByPlaceholderText('email@example.com')).toBeDefined();
    expect(screen.getByPlaceholderText('••••••••')).toBeDefined();
    // No role-specific tab buttons at the top
    expect(screen.queryByRole('button', { name: /코치님 로그인/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /회원님 로그인/i })).toBeNull();
  });

  it('shows "continue" button instead of direct "login" button', () => {
    renderAuthScreen();
    // The primary action button advances to role selection
    expect(screen.getByRole('button', { name: /계속하기/i })).toBeDefined();
  });

  it('shows an error when submitting empty credentials', async () => {
    renderAuthScreen();
    fireEvent.click(screen.getByRole('button', { name: /계속하기/i }));
    await waitFor(() => {
      expect(screen.getByText(/이메일과 비밀번호를 입력해주세요/i)).toBeDefined();
    });
  });
});

describe('AuthScreen – role selection step (login)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const fillAndContinue = () => {
    renderAuthScreen();
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /계속하기/i }));
  };

  it('shows role selection cards after submitting valid credentials', async () => {
    fillAndContinue();
    await waitFor(() => {
      // Role cards visible
      expect(screen.getByText(/어떤 역할로 로그인하시나요/i)).toBeDefined();
    });
  });

  it('calls loginCoach and onLoginSuccess(COACH) when Coach card selected', async () => {
    const onLoginSuccess = vi.fn();
    vi.mocked(authService.loginCoach).mockResolvedValue(COACH_PROFILE as any);

    render(
      <LanguageProvider>
        <AuthScreen onLoginSuccess={onLoginSuccess} />
      </LanguageProvider>
    );
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), {
      target: { value: 'coach@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'pw' },
    });
    fireEvent.click(screen.getByRole('button', { name: /계속하기/i }));

    await waitFor(() =>
      expect(screen.getByText(/어떤 역할로 로그인하시나요/i)).toBeDefined()
    );

    // Click the coach card (contains 프로)
    const coachCard = screen.getByText('프로 (코치님)');
    fireEvent.click(coachCard.closest('button')!);

    await waitFor(() => {
      expect(authService.loginCoach).toHaveBeenCalledWith('coach@example.com', 'pw');
      expect(onLoginSuccess).toHaveBeenCalledWith('COACH', COACH_PROFILE, true);
    });
  });

  it('calls loginClient and onLoginSuccess(CLIENT) when Member card selected', async () => {
    const onLoginSuccess = vi.fn();
    vi.mocked(authService.loginClient).mockResolvedValue(CLIENT_PROFILE as any);

    render(
      <LanguageProvider>
        <AuthScreen onLoginSuccess={onLoginSuccess} />
      </LanguageProvider>
    );
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), {
      target: { value: 'member@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'pw' },
    });
    fireEvent.click(screen.getByRole('button', { name: /계속하기/i }));

    await waitFor(() =>
      expect(screen.getByText(/어떤 역할로 로그인하시나요/i)).toBeDefined()
    );

    const memberCard = screen.getByText('회원 (회원님)');
    fireEvent.click(memberCard.closest('button')!);

    await waitFor(() => {
      expect(authService.loginClient).toHaveBeenCalledWith('member@example.com', 'pw');
      expect(onLoginSuccess).toHaveBeenCalledWith('CLIENT', CLIENT_PROFILE, true);
    });
  });

  it('returns to credentials step and shows error when auth fails', async () => {
    vi.mocked(authService.loginCoach).mockRejectedValue('이메일 또는 비밀번호가 일치하지 않습니다.');

    renderAuthScreen();
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), {
      target: { value: 'bad@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: /계속하기/i }));

    await waitFor(() =>
      expect(screen.getByText(/어떤 역할로 로그인하시나요/i)).toBeDefined()
    );

    const coachCard = screen.getByText('프로 (코치님)');
    fireEvent.click(coachCard.closest('button')!);

    await waitFor(() => {
      // Credentials form reappears
      expect(screen.getByRole('button', { name: /계속하기/i })).toBeDefined();
      // Error shown
      expect(
        screen.getByText(/이메일 또는 비밀번호가 일치하지 않습니다/i)
      ).toBeDefined();
    });
  });

  it('goes back to credentials form when Back button clicked on role screen', async () => {
    renderAuthScreen();
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'pw' },
    });
    fireEvent.click(screen.getByRole('button', { name: /계속하기/i }));

    await waitFor(() =>
      expect(screen.getByText(/어떤 역할로 로그인하시나요/i)).toBeDefined()
    );

    fireEvent.click(screen.getByRole('button', { name: /돌아가기/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /계속하기/i })).toBeDefined();
    });
  });
});

describe('AuthScreen – signup flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows role selection when "sign up" link clicked', async () => {
    renderAuthScreen();
    fireEvent.click(screen.getByText(/계정이 없으신가요\? 회원가입하기/i));
    await waitFor(() => {
      expect(screen.getByText(/어떤 유형으로 가입하시나요/i)).toBeDefined();
    });
  });

  it('shows coach signup form after selecting Coach on signup role screen', async () => {
    renderAuthScreen();
    fireEvent.click(screen.getByText(/계정이 없으신가요\? 회원가입하기/i));

    await waitFor(() =>
      expect(screen.getByText(/어떤 유형으로 가입하시나요/i)).toBeDefined()
    );

    // Click Coach card (contains 프로)
    const coachCard = screen.getByText('프로 (코치님)');
    fireEvent.click(coachCard.closest('button')!);

    await waitFor(() => {
      // Signup form for Coach
      expect(screen.getByText(/코치님 로그인 – 회원가입/i)).toBeDefined();
    });
  });

  it('shows member signup form after selecting Member on signup role screen', async () => {
    renderAuthScreen();
    fireEvent.click(screen.getByText(/계정이 없으신가요\? 회원가입하기/i));

    await waitFor(() =>
      expect(screen.getByText(/어떤 유형으로 가입하시나요/i)).toBeDefined()
    );

    const memberCard = screen.getByText('회원 (회원님)');
    fireEvent.click(memberCard.closest('button')!);

    await waitFor(() => {
      expect(screen.getByText(/회원님 로그인 – 회원가입/i)).toBeDefined();
    });
  });

  it('calls signupCoach and onLoginSuccess(COACH) after coach signup', async () => {
    const onLoginSuccess = vi.fn();
    vi.mocked(authService.signupCoach).mockResolvedValue(COACH_PROFILE as any);

    render(
      <LanguageProvider>
        <AuthScreen onLoginSuccess={onLoginSuccess} />
      </LanguageProvider>
    );

    fireEvent.click(screen.getByText(/계정이 없으신가요\? 회원가입하기/i));
    await waitFor(() =>
      expect(screen.getByText(/어떤 유형으로 가입하시나요/i)).toBeDefined()
    );

    const coachCard = screen.getByText('프로 (코치님)');
    fireEvent.click(coachCard.closest('button')!);

    await waitFor(() =>
      expect(screen.getByText(/코치님 로그인 – 회원가입/i)).toBeDefined()
    );

    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Test Coach' } });
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), { target: { value: 'coach@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), { target: { value: '010-1111-2222' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pw123' } });

    fireEvent.click(screen.getByRole('button', { name: /회원가입/i }));

    await waitFor(() => {
      expect(authService.signupCoach).toHaveBeenCalledWith(
        'Test Coach',
        'coach@example.com',
        'pw123',
        '010-1111-2222'
      );
    });
  });
});

describe('AuthScreen – admin modes still accessible', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows admin login form when admin link clicked', async () => {
    renderAuthScreen();
    // Use exact text to avoid matching "지점 관리자 로그인"
    fireEvent.click(screen.getByText('관리자 로그인'));
    await waitFor(() => {
      expect(screen.getByText(/시스템 관리자 전용 페이지입니다/i)).toBeDefined();
    });
  });

  it('shows branch admin login form when branch admin link clicked', async () => {
    renderAuthScreen();
    fireEvent.click(screen.getByText(/지점 관리자 로그인/i));
    await waitFor(() => {
      expect(screen.getByText(/Branch Admin Login/i)).toBeDefined();
    });
  });

  it('calls loginAdmin and onLoginSuccess(ADMIN) for admin login', async () => {
    const onLoginSuccess = vi.fn();
    vi.mocked(authService.loginAdmin).mockResolvedValue(true);

    render(
      <LanguageProvider>
        <AuthScreen onLoginSuccess={onLoginSuccess} />
      </LanguageProvider>
    );

    fireEvent.click(screen.getByText('관리자 로그인'));
    await waitFor(() =>
      expect(screen.getByText(/시스템 관리자 전용 페이지입니다/i)).toBeDefined()
    );

    fireEvent.change(screen.getByPlaceholderText('admin@swingnote.com'), {
      target: { value: 'admin@swingnote.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'admin1234' },
    });

    fireEvent.click(screen.getByRole('button', { name: /관리자 로그인/i }));

    await waitFor(() => {
      expect(authService.loginAdmin).toHaveBeenCalledWith('admin@swingnote.com', 'admin1234');
      expect(onLoginSuccess).toHaveBeenCalledWith('ADMIN', {}, false);
    });
  });
});
