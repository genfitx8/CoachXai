import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

afterEach(() => {
  vi.useRealTimers();
  window.sessionStorage.clear();
});

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: '(display-mode: standalone)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
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

  it('shows a branded install CTA when beforeinstallprompt is available and triggers the real prompt', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' });
    const installEvent = new Event('beforeinstallprompt') as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
    };

    Object.defineProperty(installEvent, 'preventDefault', {
      configurable: true,
      value: vi.fn(),
    });
    installEvent.prompt = prompt;
    installEvent.userChoice = userChoice;

    render(<CoachXLanding onLogin={() => {}} onSignup={() => {}} />);
    await act(async () => {
      window.dispatchEvent(installEvent);
    });

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Install CoachX' }));
      await userChoice;
    });

    await waitFor(() => {
      expect(prompt).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Install dismissed/)).toBeInTheDocument();
    });
  });

  it('shows fallback install guidance when install prompt is unsupported', () => {
    render(<CoachXLanding onLogin={() => {}} onSignup={() => {}} />);

    expect(screen.getByRole('button', { name: 'Install CoachX' })).toBeInTheDocument();
    expect(
      screen.getByText(/Install prompt is unavailable here/)
    ).toBeInTheDocument();
  });

  it('keeps install CTA visible and shows guidance message when no prompt event exists', async () => {
    render(<CoachXLanding onLogin={() => {}} onSignup={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Install CoachX' }));

    await waitFor(() => {
      expect(
        screen.getByText(/Install is not available in this browser/)
      ).toBeInTheDocument();
    });
  });

  it('does not show install CTA when app is already installed', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: true,
        media: '(display-mode: standalone)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        onchange: null,
        dispatchEvent: vi.fn(),
      })),
    });

    render(<CoachXLanding onLogin={() => {}} onSignup={() => {}} />);

    expect(screen.queryByRole('button', { name: 'Install CoachX' })).not.toBeInTheDocument();
    expect(screen.queryByText('CoachX App')).not.toBeInTheDocument();
  });
});
