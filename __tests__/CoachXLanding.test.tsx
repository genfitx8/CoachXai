import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CoachXLanding } from '../components/CoachXLanding';

class MockSpeechSynthesisUtterance {
  text: string;
  lang = '';
  rate = 1;
  pitch = 1;
  volume = 1;

  constructor(text: string) {
    this.text = text;
  }
}

afterEach(() => {
  vi.useRealTimers();
  window.sessionStorage.clear();
});

describe('CoachXLanding', () => {
  it('renders premium landing essentials and auth actions', () => {
    const onLogin = vi.fn();
    const onSignup = vi.fn();

    render(<CoachXLanding onLogin={onLogin} onSignup={onSignup} />);

    expect(screen.getByText('CoachX AI')).toBeInTheDocument();
    expect(screen.getByText('Hello, coach.')).toBeInTheDocument();
    expect(screen.getByTestId('coachx-ai-orb')).toHaveClass('animate-coachx-orb-drift');

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(onSignup).toHaveBeenCalledTimes(1);
  });

  it('attempts a single voice greeting on first landing entry when speech is available', () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const speak = vi.fn();

    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { cancel, speak },
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: MockSpeechSynthesisUtterance,
    });

    const { unmount } = render(<CoachXLanding onLogin={() => {}} onSignup={() => {}} />);
    vi.runAllTimers();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);

    const utterance = speak.mock.calls[0]?.[0] as MockSpeechSynthesisUtterance;
    expect(utterance.text).toBe('Hello, coach.');
    expect(utterance.lang).toBe('en-US');

    unmount();
    render(<CoachXLanding onLogin={() => {}} onSignup={() => {}} />);
    vi.runAllTimers();

    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('fails gracefully when speech synthesis is unavailable', () => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: undefined,
    });

    expect(() => {
      render(<CoachXLanding onLogin={() => {}} onSignup={() => {}} />);
    }).not.toThrow();
  });
});
