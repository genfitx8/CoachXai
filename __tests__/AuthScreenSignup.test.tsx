import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthScreen } from '../components/AuthScreen';
import { LanguageProvider } from '../components/LanguageContext';

const mockCoachProfile = { id: 'c1', name: '테스트코치', email: 'coach@test.com', phone: '010-1111-2222' };
const mockClientProfile = { id: 'cl1', name: '테스트학생', email: 'client@test.com', phone: '010-3333-4444' };

const { mockedAuthService } = vi.hoisted(() => ({
  mockedAuthService: {
    loginCoach: vi.fn(),
    loginClient: vi.fn(),
    loginAdmin: vi.fn(),
    loginBranchAdmin: vi.fn(),
    signupCoach: vi.fn(),
    signupClient: vi.fn(),
    findEmail: vi.fn(),
    findPassword: vi.fn(),
  },
}));

vi.mock('../services/authService', () => ({
  authService: mockedAuthService,
}));

const renderAuth = (onLoginSuccess = vi.fn()) =>
  render(
    <LanguageProvider>
      <AuthScreen onLoginSuccess={onLoginSuccess} />
    </LanguageProvider>
  );

describe('AuthScreen signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows a signup button on the login screen', () => {
    renderAuth();
    expect(screen.getByRole('button', { name: '회원가입' })).toBeInTheDocument();
  });

  it('navigates to the signup screen when signup button is clicked', () => {
    renderAuth();
    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));
    expect(screen.getByRole('heading', { name: '회원가입' })).toBeInTheDocument();
  });

  it('returns to login screen when back link is clicked from signup', () => {
    renderAuth();
    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));
    expect(screen.getByRole('heading', { name: '회원가입' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /로그인하기/ }));
    expect(screen.queryByRole('heading', { name: '회원가입' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument();
  });

  it('shows validation error when passwords do not match', async () => {
    renderAuth();
    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    fireEvent.change(screen.getByPlaceholderText('홍길동'), { target: { value: '홍길동' } });
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), { target: { value: '010-1111-2222' } });

    const passwordInputs = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(passwordInputs[0], { target: { value: 'password123' } });
    fireEvent.change(passwordInputs[1], { target: { value: 'different123' } });

    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    expect(await screen.findByText('비밀번호가 일치하지 않습니다.')).toBeInTheDocument();
    expect(mockedAuthService.signupCoach).not.toHaveBeenCalled();
  });

  it('shows validation error when password is too short', async () => {
    renderAuth();
    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    fireEvent.change(screen.getByPlaceholderText('홍길동'), { target: { value: '홍길동' } });
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), { target: { value: '010-1111-2222' } });

    const passwordInputs = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(passwordInputs[0], { target: { value: 'short' } });
    fireEvent.change(passwordInputs[1], { target: { value: 'short' } });

    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('비밀번호는 8자 이상이어야 합니다.');
    });
    expect(mockedAuthService.signupCoach).not.toHaveBeenCalled();
  });

  it('calls signupCoach and triggers onLoginSuccess for coach signup', async () => {
    mockedAuthService.signupCoach.mockResolvedValue(mockCoachProfile);
    const onLoginSuccess = vi.fn();
    renderAuth(onLoginSuccess);

    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    fireEvent.change(screen.getByPlaceholderText('홍길동'), { target: { value: '테스트코치' } });
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), { target: { value: 'coach@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), { target: { value: '010-1111-2222' } });

    const passwordInputs = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(passwordInputs[0], { target: { value: 'password123' } });
    fireEvent.change(passwordInputs[1], { target: { value: 'password123' } });

    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    await waitFor(() => {
      expect(mockedAuthService.signupCoach).toHaveBeenCalledWith(
        '테스트코치',
        'coach@test.com',
        'password123',
        '010-1111-2222'
      );
    });
    expect(onLoginSuccess).toHaveBeenCalledWith('COACH', mockCoachProfile);
  });

  it('calls signupClient and triggers onLoginSuccess for client signup', async () => {
    mockedAuthService.signupClient.mockResolvedValue(mockClientProfile);
    const onLoginSuccess = vi.fn();
    renderAuth(onLoginSuccess);

    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    // Switch to student tab
    fireEvent.click(screen.getByRole('button', { name: '학생 회원가입' }));

    fireEvent.change(screen.getByPlaceholderText('홍길동'), { target: { value: '테스트학생' } });
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), { target: { value: 'client@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), { target: { value: '010-3333-4444' } });

    const passwordInputs = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(passwordInputs[0], { target: { value: 'password123' } });
    fireEvent.change(passwordInputs[1], { target: { value: 'password123' } });

    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    await waitFor(() => {
      expect(mockedAuthService.signupClient).toHaveBeenCalledWith(
        '테스트학생',
        'client@test.com',
        'password123',
        '010-3333-4444'
      );
    });
    expect(onLoginSuccess).toHaveBeenCalledWith('CLIENT', mockClientProfile);
  });

  it('stores only login id when remember id is enabled', async () => {
    mockedAuthService.loginCoach.mockResolvedValue(mockCoachProfile);

    renderAuth();

    fireEvent.change(screen.getByPlaceholderText('email@example.com'), {
      target: { value: 'coach@test.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });

    fireEvent.click(screen.getByRole('button', { name: '아이디 저장' }));
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => {
      expect(mockedAuthService.loginCoach).toHaveBeenCalledWith(
        'coach@test.com',
        'password123'
      );
    });

    const saved = localStorage.getItem('swingnote_saved_login_id');
    expect(saved).not.toBeNull();
    expect(JSON.parse(saved as string)).toEqual({
      email: 'coach@test.com',
      role: 'COACH',
    });
  });

  it('stores email and password when remember password is enabled', async () => {
    mockedAuthService.loginCoach.mockResolvedValue(mockCoachProfile);

    renderAuth();

    fireEvent.change(screen.getByPlaceholderText('email@example.com'), {
      target: { value: 'coach@test.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });

    fireEvent.click(screen.getByRole('button', { name: '비밀번호 저장' }));
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => {
      expect(mockedAuthService.loginCoach).toHaveBeenCalledWith(
        'coach@test.com',
        'password123'
      );
    });

    const savedCredentials = localStorage.getItem('swingnote_saved_credentials');
    expect(savedCredentials).not.toBeNull();
    expect(JSON.parse(savedCredentials as string)).toEqual({
      email: 'coach@test.com',
      password: 'password123',
      role: 'COACH',
    });
  });

  it('shows error message when signup fails with duplicate email', async () => {
    mockedAuthService.signupCoach.mockRejectedValue('이미 사용 중인 이메일입니다.');
    renderAuth();

    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    fireEvent.change(screen.getByPlaceholderText('홍길동'), { target: { value: '홍길동' } });
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), { target: { value: 'dupe@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), { target: { value: '010-1111-2222' } });

    const passwordInputs = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(passwordInputs[0], { target: { value: 'password123' } });
    fireEvent.change(passwordInputs[1], { target: { value: 'password123' } });

    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    expect(await screen.findByText('이미 사용 중인 이메일입니다.')).toBeInTheDocument();
  });
});
