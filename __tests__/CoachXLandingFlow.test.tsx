import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../App';

vi.mock('../services/firebase', () => ({
  firebaseService: {
    getSavedConfig: vi.fn().mockReturnValue(null),
    init: vi.fn().mockReturnValue(false),
    isInitialized: vi.fn().mockReturnValue(false),
    getLessons: vi.fn().mockResolvedValue([]),
    getClients: vi.fn().mockResolvedValue([]),
    getCoaches: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../services/storage', () => ({
  storageService: {
    getLessons: vi.fn().mockReturnValue([]),
    getClients: vi.fn().mockReturnValue([]),
    getCoaches: vi.fn().mockReturnValue([]),
    getLessonPackages: vi.fn().mockReturnValue([]),
    getTrainingPrograms: vi.fn().mockReturnValue([]),
    saveClients: vi.fn(),
  },
}));

vi.mock('../services/authService', () => ({
  authService: {
    restoreSession: vi.fn().mockReturnValue(null),
    getCoachProfile: vi.fn().mockReturnValue(null),
    logout: vi.fn(),
    saveSession: vi.fn(),
    loginCoach: vi.fn(),
    signupCoach: vi.fn(),
    loginClient: vi.fn(),
    signupClient: vi.fn(),
    loginAdmin: vi.fn(),
    loginBranchAdmin: vi.fn(),
    findEmail: vi.fn(),
    findPassword: vi.fn(),
    getAutoLoginPref: vi.fn().mockReturnValue(false),
  },
}));

vi.mock('../services/coachNotificationService', () => ({
  getUnreadReservationNotificationsForCoach: vi.fn().mockResolvedValue([]),
  markNotificationsAsRead: vi.fn().mockResolvedValue(undefined),
}));

describe('CoachX landing auth entry flow', () => {
  it('shows landing first and opens login mode', async () => {
    render(<App />);

    expect(await screen.findByText('Hello, coach.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('email@example.com')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Name')).not.toBeInTheDocument();
    });
  });

  it('opens signup mode from landing', async () => {
    render(<App />);

    expect(await screen.findByText('Hello, coach.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    expect(await screen.findByPlaceholderText('Name')).toBeInTheDocument();
  });
});
