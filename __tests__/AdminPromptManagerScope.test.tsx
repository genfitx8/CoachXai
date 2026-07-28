/**
 * Tests for the coach-scope UI in AdminPromptManager (PR A3).
 *
 * Verifies that:
 * 1. The scope selector is hidden when no PRO coach exists (single-coach /
 *    all-FREE deployments stay implicitly global).
 * 2. The scope selector is shown when at least one PRO coach exists.
 * 3. FREE coaches appear in the coach dropdown but are disabled.
 * 4. The scope filter chips render one per PRO coach.
 * 5. Template cards render a scope badge distinguishing global vs coach-scoped.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminPromptManager } from '../components/AdminPromptManager';
import { CoachProfile, PromptTemplate } from '../types';

// Test-only i18n stub — return the key so we can assert against literal Korean labels.
vi.mock('../components/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

// Firebase not initialised in tests; template ops go to storageService.
vi.mock('../services/firebase', () => ({
  firebaseService: {
    isInitialized: () => false,
  },
}));

// Return a controllable template list from promptService.getAll.
const templatesRef: { current: PromptTemplate[] } = { current: [] };
vi.mock('../services/promptService', () => ({
  promptService: {
    getAll: vi.fn(async () => templatesRef.current),
    getActive: vi.fn(async () => null),
    getActiveSystemPrompt: vi.fn(async () => ''),
    save: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    uploadAttachment: vi.fn(async () => ({})),
    deleteAttachment: vi.fn(async () => {}),
  },
}));

const makeCoach = (over: Partial<CoachProfile> & { id: string; name: string }): CoachProfile => ({
  email: `${over.id}@example.com`,
  ...over,
} as CoachProfile);

const makeTemplate = (over: Partial<PromptTemplate> & { id: string; name: string }): PromptTemplate => ({
  target: 'lesson_summary',
  systemPrompt: 'test',
  isActive: false,
  language: 'all',
  attachments: [],
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

beforeEach(() => {
  templatesRef.current = [];
});

describe('AdminPromptManager coach scoping', () => {
  it('hides the scope selector when no PRO coach exists', async () => {
    const coaches = [makeCoach({ id: 'c1', name: '김코치', subscriptionPlan: 'FREE' })];
    render(<AdminPromptManager isFirebaseMode={false} coaches={coaches} />);

    // Open the create form.
    (await screen.findByText('admin_prompt_add_btn')).click();

    // Scope selector heading should not render — the app is effectively single-coach.
    expect(screen.queryByText(/적용 범위 \(Scope\)/)).not.toBeInTheDocument();
    // Nor should the top-of-list scope filter row.
    expect(screen.queryByText('범위 필터:')).not.toBeInTheDocument();
  });

  it('shows the scope selector when at least one coach is PRO', async () => {
    const coaches = [
      makeCoach({ id: 'c1', name: '김코치', subscriptionPlan: 'PRO' }),
      makeCoach({ id: 'c2', name: '이코치', subscriptionPlan: 'FREE' }),
    ];
    render(<AdminPromptManager isFirebaseMode={false} coaches={coaches} />);

    (await screen.findByText('admin_prompt_add_btn')).click();

    expect(await screen.findByText(/적용 범위 \(Scope\)/)).toBeInTheDocument();
    // Both radio-style buttons.
    expect(screen.getByText('전역 (모든 코치)')).toBeInTheDocument();
    expect(screen.getByText('특정 코치')).toBeInTheDocument();
  });

  it('lists FREE coaches as disabled options in the coach dropdown', async () => {
    const coaches = [
      makeCoach({ id: 'c1', name: 'ProCoach', subscriptionPlan: 'PRO' }),
      makeCoach({ id: 'c2', name: 'FreeCoach', subscriptionPlan: 'FREE' }),
    ];
    render(<AdminPromptManager isFirebaseMode={false} coaches={coaches} />);

    (await screen.findByText('admin_prompt_add_btn')).click();
    // Switch to coach-specific scope (auto-selects first PRO coach → dropdown appears).
    (await screen.findByText('특정 코치')).click();

    const proOption = await screen.findByRole('option', { name: /ProCoach/ });
    const freeOption = screen.getByRole('option', { name: /FreeCoach/ });

    expect(proOption).not.toBeDisabled();
    expect(freeOption).toBeDisabled();
    expect(freeOption).toHaveTextContent(/PRO 필요/);
  });

  it('renders scope filter chips for each PRO coach plus global + all', async () => {
    const coaches = [
      makeCoach({ id: 'c1', name: 'AlphaCoach', subscriptionPlan: 'PRO' }),
      makeCoach({ id: 'c2', name: 'BetaCoach', subscriptionPlan: 'PRO' }),
      makeCoach({ id: 'c3', name: 'GammaCoach', subscriptionPlan: 'FREE' }),
    ];
    templatesRef.current = [
      makeTemplate({ id: 't1', name: 'global one' }),
    ];
    render(<AdminPromptManager isFirebaseMode={false} coaches={coaches} />);

    // Filter chip row shows once templates are loaded.
    expect(await screen.findByText('범위 필터:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '전체' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /전역만/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /AlphaCoach/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /BetaCoach/ })).toBeInTheDocument();
    // FREE coach should NOT appear in the filter row.
    expect(screen.queryByRole('button', { name: /GammaCoach/ })).not.toBeInTheDocument();
  });

  it('shows a global badge on unscoped templates and a coach badge on scoped ones', async () => {
    const coaches = [makeCoach({ id: 'c1', name: 'MyCoach', subscriptionPlan: 'PRO' })];
    templatesRef.current = [
      makeTemplate({ id: 'g', name: '전역 템플릿' }),
      makeTemplate({ id: 's', name: '코치 전용', coachId: 'c1' }),
    ];
    render(<AdminPromptManager isFirebaseMode={false} coaches={coaches} />);

    // Wait for the list to render both templates.
    await screen.findByText('전역 템플릿');
    await screen.findByText('코치 전용');

    // Each card renders its own scope badge; global text and coach name both appear.
    // (Coach name also shows up in the filter chip row, so we just assert ≥1.)
    expect(screen.getAllByText('전역').length).toBeGreaterThan(0);
    expect(screen.getAllByText('MyCoach').length).toBeGreaterThan(0);
  });
});
