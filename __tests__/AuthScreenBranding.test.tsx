import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthScreen } from '../components/AuthScreen';
import { LanguageProvider } from '../components/LanguageContext';

describe('AuthScreen branding copy', () => {
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
});
