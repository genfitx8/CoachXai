import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthScreen } from '../components/AuthScreen';
import { LanguageProvider } from '../components/LanguageContext';

const { authServiceMock } = vi.hoisted(() => ({
  authServiceMock: {
    loginWithGoogle: vi.fn(),
  },
}));

vi.mock('../services/authService', () => ({
  authService: authServiceMock,
}));

describe('AuthScreen Google auth flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authServiceMock.loginWithGoogle.mockResolvedValue({
      email: 'tester@example.com',
    });
  });

  it('uses active login tab role when Google login is clicked', async () => {
    const onLoginSuccess = vi.fn();
    render(
      <LanguageProvider>
        <AuthScreen onLoginSuccess={onLoginSuccess} />
      </LanguageProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: '학생 로그인' }));
    fireEvent.click(screen.getByRole('button', { name: 'Google로 로그인' }));

    await waitFor(() => {
      expect(authServiceMock.loginWithGoogle).toHaveBeenCalledWith('CLIENT');
      expect(onLoginSuccess).toHaveBeenCalledWith(
        'CLIENT',
        { email: 'tester@example.com' },
        true
      );
    });
  });

  it('uses signup role when Google signup is clicked', async () => {
    const onLoginSuccess = vi.fn();
    render(
      <LanguageProvider>
        <AuthScreen onLoginSuccess={onLoginSuccess} />
      </LanguageProvider>
    );

    fireEvent.click(
      screen.getByRole('button', { name: '계정이 없으신가요? 회원가입하기' })
    );
    fireEvent.click(screen.getByRole('button', { name: '회원' }));
    fireEvent.click(screen.getByRole('button', { name: 'Google로 회원가입' }));

    await waitFor(() => {
      expect(authServiceMock.loginWithGoogle).toHaveBeenCalledWith('CLIENT');
      expect(onLoginSuccess).toHaveBeenCalledWith(
        'CLIENT',
        { email: 'tester@example.com' },
        true
      );
    });
  });
});
