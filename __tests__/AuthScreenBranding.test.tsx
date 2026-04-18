import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
