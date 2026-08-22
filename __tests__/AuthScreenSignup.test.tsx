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
    requestSignupEmailVerification: vi.fn(),
    confirmSignupEmailVerification: vi.fn(),
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


/**
 * 가입 폼을 채운다. 이메일 인증은 별도 단계이므로 여기서는 건드리지 않는다
 * — 인증 없이 제출했을 때의 동작도 테스트해야 하기 때문이다.
 */
const fillSignupForm = (
  { name, email, phone, password }: { name: string; email: string; phone: string; password: string }
) => {
  fireEvent.change(screen.getByPlaceholderText('홍길동'), { target: { value: name } });
  fireEvent.change(screen.getByPlaceholderText('email@example.com'), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), { target: { value: phone } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: password } });
};

/** 인증번호 받기 → 코드 입력 → 확인까지 통과시킨다. */
const passEmailVerification = async (code = '123456') => {
  fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));
  const codeInput = await screen.findByPlaceholderText('000000');
  fireEvent.change(codeInput, { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: '확인' }));
  await screen.findByText('이메일 인증이 완료되었습니다.');
};

const agreeToRequiredConsent = () => {
  fireEvent.click(screen.getByText('(필수) 개인정보 수집 및 이용에 동의합니다.'));
};

describe('AuthScreen signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockedAuthService.requestSignupEmailVerification.mockResolvedValue({ expiresInMinutes: 10 });
    mockedAuthService.confirmSignupEmailVerification.mockResolvedValue(undefined);
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

  it('shows validation error when password is too short', async () => {
    renderAuth();
    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    fillSignupForm({
      name: '홍길동',
      email: 'test@test.com',
      phone: '010-1111-2222',
      password: 'short',
    });

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

    fillSignupForm({
      name: '테스트코치',
      email: 'coach@test.com',
      phone: '010-1111-2222',
      password: 'password123',
    });
    await passEmailVerification();
    agreeToRequiredConsent();

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

    fillSignupForm({
      name: '테스트학생',
      email: 'client@test.com',
      phone: '010-3333-4444',
      password: 'password123',
    });
    await passEmailVerification();
    agreeToRequiredConsent();

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
    const storeSpy = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(globalThis, 'PasswordCredential', {
      value: class {
        id: string;
        password: string;
        emailAutocomplete: string;
        passwordAutocomplete: string;
        formConnected: boolean;
        constructor(form: HTMLFormElement) {
          const emailInput = form.querySelector('input[type="email"]') as HTMLInputElement;
          const passwordInput = form.querySelector('input[type="password"]') as HTMLInputElement;
          this.id = emailInput?.value ?? '';
          this.password = passwordInput?.value ?? '';
          this.emailAutocomplete = emailInput?.autocomplete ?? '';
          this.passwordAutocomplete = passwordInput?.autocomplete ?? '';
          this.formConnected = form.isConnected;
        }
      },
      configurable: true,
      writable: true,
    });

    Object.defineProperty(navigator, 'credentials', {
      value: { store: storeSpy, get: vi.fn().mockResolvedValue(null) },
      configurable: true,
    });

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

    expect(localStorage.getItem('swingnote_remember_password')).toBe('1');
    const savedLoginId = localStorage.getItem('swingnote_saved_login_id');
    expect(savedLoginId).not.toBeNull();
    expect(JSON.parse(savedLoginId as string)).toEqual({
      email: 'coach@test.com',
      role: 'COACH',
    });
    expect(storeSpy).toHaveBeenCalledTimes(1);
    expect(storeSpy.mock.calls[0][0]).toMatchObject({
      id: 'coach@test.com',
      password: 'password123',
      emailAutocomplete: 'username',
      passwordAutocomplete: 'current-password',
      formConnected: true,
    });
  });

  it('shows error message when signup fails with duplicate email', async () => {
    mockedAuthService.signupCoach.mockRejectedValue('이미 사용 중인 이메일입니다.');
    renderAuth();

    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    fillSignupForm({
      name: '홍길동',
      email: 'dupe@test.com',
      phone: '010-1111-2222',
      password: 'password123',
    });
    await passEmailVerification();
    agreeToRequiredConsent();

    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    expect(await screen.findByText('이미 사용 중인 이메일입니다.')).toBeInTheDocument();
  });
});
