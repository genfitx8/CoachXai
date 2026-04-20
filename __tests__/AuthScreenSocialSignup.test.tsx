import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthScreen } from '../components/AuthScreen';
import { LanguageProvider } from '../components/LanguageContext';
import { authService } from '../services/authService';

describe('AuthScreen social signup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('supports coach social signup with Google', async () => {
    vi.useFakeTimers();
    const onLoginSuccess = vi.fn();
    const profile = {
      id: 'coach-social-1',
      name: '홍길동',
      phone: '010-1111-2222',
      email: 'google_test@social.coachx.ai',
      socialProvider: 'GOOGLE' as const,
      socialId: 'google-test',
      subscriptionPlan: 'FREE' as const,
      isSubscribed: false,
    };

    vi.spyOn(authService, 'signupCoachWithSocial').mockResolvedValue(profile);

    render(
      <LanguageProvider>
        <AuthScreen onLoginSuccess={onLoginSuccess} initialMode="SIGNUP" />
      </LanguageProvider>
    );

    fireEvent.change(screen.getByPlaceholderText('Name'), {
      target: { value: '홍길동' },
    });
    fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), {
      target: { value: '010-1111-2222' },
    });
    fireEvent.change(screen.getByPlaceholderText('provider user id'), {
      target: { value: 'google-test' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Google로 가입' }));

    await waitFor(() => {
      expect(authService.signupCoachWithSocial).toHaveBeenCalledWith(
        '홍길동',
        '010-1111-2222',
        'GOOGLE',
        'google-test'
      );
    });

    await vi.runAllTimersAsync();

    await waitFor(() => {
      expect(onLoginSuccess).toHaveBeenCalledWith('COACH', profile, true);
    });
  });
});
