/**
 * Regression tests for two chrome bugs that shared one root cause.
 *
 * 1. `bg-base` (and `bg-raised` / `bg-overlay` / `bg-inset`, plus their /NN
 *    opacity variants) is written all over the markup, but the semantic
 *    backgrounds are nested under a `bg` key in tailwind.config.js — Tailwind
 *    only ever emitted `bg-bg-base`. The short class produced nothing, so
 *    every surface using it stayed transparent: the full-screen lesson detail
 *    let the screen underneath show through and its header text collided with
 *    the header behind it. index.css now defines the short spelling.
 *
 * 2. The coach bottom nav stays mounted on the 동반 tab at the same z-index as
 *    the LiveLessonCompanion overlay, so it painted over the overlay's own
 *    "레슨 종료" CTA. The overlay root now reserves the nav's height.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { LiveLessonCompanion } from '../components/LiveLessonCompanion';

// The permission modal nested in the companion reads the language context.
vi.mock('../components/LanguageContext', () => ({
  useLanguage: () => ({ language: 'ko', t: (key: string) => key }),
}));

const css = readFileSync(path.join(__dirname, '..', 'index.css'), 'utf8');

describe('semantic background utilities', () => {
  it.each(['bg-base', 'bg-raised', 'bg-overlay', 'bg-inset'])(
    'defines .%s so the class is not a no-op',
    (cls) => {
      expect(css).toMatch(new RegExp(`\\.${cls}\\s*\\{[^}]*background-color`));
    },
  );

  it('defines every translucent bg-base/bg-overlay variant the markup uses', () => {
    // Keep this list in sync with the markup: a variant without a rule is an
    // invisible surface, which is exactly the bug this guards against.
    for (const variant of ['95', '90', '85', '80', '60']) {
      expect(css).toMatch(
        new RegExp(`\\.bg-base\\\\/${variant}\\s*\\{[^}]*background-color`),
      );
    }
    for (const variant of ['80', '50']) {
      expect(css).toMatch(
        new RegExp(`\\.bg-overlay\\\\/${variant}\\s*\\{[^}]*background-color`),
      );
    }
  });

  it('reserves the coach nav height plus the device safe area', () => {
    expect(css).toMatch(
      /\.coach-nav-clearance\s*\{[^}]*padding-bottom:\s*calc\(var\(--coach-nav-height\)\s*\+\s*env\(safe-area-inset-bottom/,
    );
  });
});

describe('LiveLessonCompanion', () => {
  it('keeps its finish CTA clear of the fixed coach bottom nav', () => {
    render(
      <LiveLessonCompanion
        studentName="한윤슬"
        lessonDate="2026-08-16"
        onFinish={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const cta = screen.getByRole('button', { name: /레슨 종료/ });
    expect(cta).toBeInTheDocument();

    const root = cta.closest('.fixed.inset-0');
    expect(root).not.toBeNull();
    expect(root!.className).toContain('coach-nav-clearance');
    // The overlay must also be opaque — it covers the coach's tab screen.
    expect(root!.className).toContain('bg-base');
  });
});
