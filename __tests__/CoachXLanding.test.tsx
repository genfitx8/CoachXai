import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CoachXLanding } from '../components/CoachXLanding';

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
});
