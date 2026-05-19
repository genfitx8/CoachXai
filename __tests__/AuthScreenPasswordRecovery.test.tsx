import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthScreen } from '../components/AuthScreen';
import { LanguageProvider } from '../components/LanguageContext';

const { mockedAuthService } = vi.hoisted(() => ({
  mockedAuthService: {
    loginCoach: vi.fn(),
    loginClient: vi.fn(),
    loginAdmin: vi.fn(),
    loginBranchAdmin: vi.fn(),
    findEmail: vi.fn(),
    findPassword: vi.fn(),
    getAutoLoginPref: vi.fn().mockReturnValue(false),
  },
}));

vi.mock('../services/authService', () => ({
  authService: mockedAuthService,
}));

describe('AuthScreen password recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows generic success message and never renders returned password', async () => {
    mockedAuthService.findPassword.mockResolvedValue(undefined);

    render(
      <LanguageProvider>
        <AuthScreen onLoginSuccess={vi.fn()} />
      </LanguageProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: '아이디/비밀번호 찾기' }));
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 찾기' }));
    fireEvent.change(screen.getByPlaceholderText('이메일 주소'), {
      target: { value: 'coach@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), {
      target: { value: '010-1111-2222' },
    });
    fireEvent.click(screen.getByRole('button', { name: '찾기' }));

    await waitFor(() => {
      expect(mockedAuthService.findPassword).toHaveBeenCalledWith(
        'coach@example.com',
        '010-1111-2222',
        'COACH'
      );
    });
    expect(
      screen.getByText('등록된 이메일로 비밀번호 안내 메일을 발송했습니다.')
    ).toBeInTheDocument();
    expect(screen.queryByText('plain-password-1234')).not.toBeInTheDocument();
  });

  it('still shows the same generic message when password recovery fails', async () => {
    mockedAuthService.findPassword.mockRejectedValue(new Error('smtp error'));

    render(
      <LanguageProvider>
        <AuthScreen onLoginSuccess={vi.fn()} />
      </LanguageProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: '아이디/비밀번호 찾기' }));
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 찾기' }));
    fireEvent.change(screen.getByPlaceholderText('이메일 주소'), {
      target: { value: 'unknown@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), {
      target: { value: '010-9999-9999' },
    });
    fireEvent.click(screen.getByRole('button', { name: '찾기' }));

    expect(
      await screen.findByText('등록된 이메일로 비밀번호 안내 메일을 발송했습니다.')
    ).toBeInTheDocument();
  });
});
