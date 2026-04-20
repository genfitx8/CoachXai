import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthScreen } from '../components/AuthScreen';
import { LanguageProvider } from '../components/LanguageContext';
import { AUTH_USER_TYPE_STORAGE_KEY } from '../constants/auth';

describe('AuthScreen branding copy', () => {
  beforeEach(() => {
    localStorage.removeItem(AUTH_USER_TYPE_STORAGE_KEY);
  });

  it('shows the AI coach agent mission statement for coaches and students', () => {
    render(
      <LanguageProvider>
        <AuthScreen onLoginSuccess={vi.fn()} />
      </LanguageProvider>
    );

    expect(
      screen.getByText('세상의 모든 코치와 학생을 위한 AI 코치 에이전트 서비스')
    ).toBeInTheDocument();
  });

  it.each([
    ['English', 'AI coach agent service for every coach and student worldwide'],
    ['日本語', '世界中のすべてのコーチと学生のためのAIコーチエージェントサービス'],
    ['ภาษาไทย', 'บริการเอเจนต์โค้ช AI สำหรับโค้ชและนักเรียนทุกคนทั่วโลก'],
  ])('renders mission statement in %s', (languageLabel, expectedText) => {
    render(
      <LanguageProvider>
        <AuthScreen onLoginSuccess={vi.fn()} />
      </LanguageProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: '한국어' }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(languageLabel) }));

    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });

  it('stores selected login type when member tab is chosen', () => {
    render(
      <LanguageProvider>
        <AuthScreen onLoginSuccess={vi.fn()} />
      </LanguageProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: '학생 로그인' }));

    expect(localStorage.getItem(AUTH_USER_TYPE_STORAGE_KEY)).toBe('CLIENT');
  });

  it('uses saved login type as default selected tab', () => {
    localStorage.setItem(AUTH_USER_TYPE_STORAGE_KEY, 'CLIENT');

    render(
      <LanguageProvider>
        <AuthScreen onLoginSuccess={vi.fn()} />
      </LanguageProvider>
    );

    const coachTab = screen.getByRole('button', { name: '코치님 로그인' });
    const clientTab = screen.getByRole('button', { name: '학생 로그인' });

    expect(clientTab).toHaveAttribute('aria-pressed', 'true');
    expect(coachTab).toHaveAttribute('aria-pressed', 'false');
  });
});
