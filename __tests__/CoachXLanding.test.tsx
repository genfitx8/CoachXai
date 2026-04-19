import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const ORIGINAL_USER_AGENT = navigator.userAgent;

afterEach(() => {
  vi.useRealTimers();
  window.sessionStorage.clear();
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: ORIGINAL_USER_AGENT,
  });
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

  it('exposes a real PWA install action when beforeinstallprompt is available', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const installEvent = new Event('beforeinstallprompt');
    Object.assign(installEvent, {
      prompt,
      userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
    });

    render(<CoachXLanding onLogin={() => {}} onSignup={() => {}} />);
    act(() => {
      window.dispatchEvent(installEvent);
    });

    const installButton = await screen.findByRole('button', { name: 'Install App' });
    fireEvent.click(installButton);

    await waitFor(() => {
      expect(prompt).toHaveBeenCalledTimes(1);
    });
  });

  it('shows iOS add-to-home-screen guidance when prompt API is unavailable', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile Safari/604.1',
    });

    render(<CoachXLanding onLogin={() => {}} onSignup={() => {}} />);

    const installButton = await screen.findByRole('button', { name: 'Install App' });
    fireEvent.click(installButton);

    expect(
      screen.getByText('On iPhone/iPad Safari, use Share → Add to Home Screen.')
    ).toBeInTheDocument();
  });
});
