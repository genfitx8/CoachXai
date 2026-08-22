import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthScreen } from '../components/AuthScreen';
import { LanguageProvider } from '../components/LanguageContext';

const mockCoachProfile = {
  id: 'c1',
  name: '테스트코치',
  email: 'coach@test.com',
  phone: '010-1111-2222',
};

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
    requestSignupEmailVerification: vi.fn(),
    confirmSignupEmailVerification: vi.fn(),
  },
}));

vi.mock('../services/authService', () => ({
  authService: mockedAuthService,
}));

const renderSignup = (onLoginSuccess = vi.fn()) => {
  render(
    <LanguageProvider>
      <AuthScreen onLoginSuccess={onLoginSuccess} />
    </LanguageProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: '회원가입' }));
};

const fillSignupForm = ({
  name = '테스트코치',
  email = 'coach@test.com',
  phone = '010-1111-2222',
  password = 'password123',
}: Partial<{ name: string; email: string; phone: string; password: string }> = {}) => {
  fireEvent.change(screen.getByPlaceholderText('홍길동'), { target: { value: name } });
  fireEvent.change(screen.getByPlaceholderText('email@example.com'), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), { target: { value: phone } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: password } });
};

const agreeToRequiredConsent = () => {
  fireEvent.click(screen.getByText('(필수) 개인정보 수집 및 이용에 동의합니다.'));
};

describe('AuthScreen signup email verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockedAuthService.requestSignupEmailVerification.mockResolvedValue({ expiresInMinutes: 10 });
    mockedAuthService.confirmSignupEmailVerification.mockResolvedValue(undefined);
    mockedAuthService.signupCoach.mockResolvedValue(mockCoachProfile);
  });

  it('does not ask for a code until one has been sent', () => {
    renderSignup();
    expect(screen.queryByPlaceholderText('000000')).not.toBeInTheDocument();
  });

  it('requires an email address before sending a code', async () => {
    renderSignup();

    fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이메일을 먼저 입력해주세요.');
    expect(mockedAuthService.requestSignupEmailVerification).not.toHaveBeenCalled();
  });

  it('sends the code for the active role and reveals the code field', async () => {
    renderSignup();
    fillSignupForm({ email: 'coach@test.com' });

    fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));

    await waitFor(() => {
      expect(mockedAuthService.requestSignupEmailVerification).toHaveBeenCalledWith(
        'COACH',
        'coach@test.com'
      );
    });
    expect(await screen.findByPlaceholderText('000000')).toBeInTheDocument();
    expect(
      await screen.findByText('인증번호를 보냈습니다. 10분 안에 입력해주세요.')
    ).toBeInTheDocument();
  });

  it('surfaces the server message when sending the code fails', async () => {
    mockedAuthService.requestSignupEmailVerification.mockRejectedValue(
      '이미 사용 중인 이메일입니다.'
    );
    renderSignup();
    fillSignupForm();

    fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));

    expect(await screen.findByText('이미 사용 중인 이메일입니다.')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('000000')).not.toBeInTheDocument();
  });

  it('surfaces the server message when the code does not match', async () => {
    mockedAuthService.confirmSignupEmailVerification.mockRejectedValue(
      '인증번호가 일치하지 않습니다. (남은 시도 4회)'
    );
    renderSignup();
    fillSignupForm();

    fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));
    fireEvent.change(await screen.findByPlaceholderText('000000'), {
      target: { value: '000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: '확인' }));

    expect(
      await screen.findByText('인증번호가 일치하지 않습니다. (남은 시도 4회)')
    ).toBeInTheDocument();
  });

  it('blocks signup until the email is verified', async () => {
    renderSignup();
    fillSignupForm();
    agreeToRequiredConsent();

    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이메일 인증을 완료해주세요.');
    expect(mockedAuthService.signupCoach).not.toHaveBeenCalled();
  });

  it('completes signup once the code is confirmed', async () => {
    const onLoginSuccess = vi.fn();
    renderSignup(onLoginSuccess);
    fillSignupForm();

    fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));
    fireEvent.change(await screen.findByPlaceholderText('000000'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: '확인' }));

    await waitFor(() => {
      expect(mockedAuthService.confirmSignupEmailVerification).toHaveBeenCalledWith(
        'COACH',
        'coach@test.com',
        '123456'
      );
    });
    expect(await screen.findByText('이메일 인증이 완료되었습니다.')).toBeInTheDocument();

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

  // 인증을 끝낸 뒤 주소를 고치면, 확인된 적 없는 주소로 가입이 통과해버린다.
  // 인증 상태는 "그때 확인한 그 주소"에만 붙어 있어야 한다.
  it('invalidates the verification when the email is edited afterwards', async () => {
    renderSignup();
    fillSignupForm();

    fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));
    fireEvent.change(await screen.findByPlaceholderText('000000'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    await screen.findByText('이메일 인증이 완료되었습니다.');

    fireEvent.change(screen.getByPlaceholderText('email@example.com'), {
      target: { value: 'other@test.com' },
    });
    agreeToRequiredConsent();
    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이메일 인증을 완료해주세요.');
    expect(mockedAuthService.signupCoach).not.toHaveBeenCalled();
  });

  // 인증은 서버에서 coach/client 각각 따로 발급된다.
  it('invalidates the verification when the role tab changes', async () => {
    renderSignup();
    fillSignupForm();

    fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));
    fireEvent.change(await screen.findByPlaceholderText('000000'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    await screen.findByText('이메일 인증이 완료되었습니다.');

    fireEvent.click(screen.getByRole('button', { name: '학생 회원가입' }));

    expect(screen.queryByPlaceholderText('000000')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '인증번호 받기' })).toBeInTheDocument();
  });
});
