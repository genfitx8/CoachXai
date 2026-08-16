/**
 * Regression test for the student app's unresponsive hamburger button.
 *
 * NotificationToast is permanently mounted by ClientApp and only fades in and
 * out via opacity. Its outer wrapper is `fixed top-20 z-[50]` with
 * `pointer-events-none`, but the card inside used to keep `pointer-events-auto`
 * at all times — so an invisible 80px-tall band across the top of the screen
 * kept swallowing taps. On 360–375px phones (and on any device whose safe-area
 * inset nudges the header down) that band sits exactly over the hamburger
 * button, which is why the menu never opened.
 *
 * The hidden toast must therefore be inert: no pointer events, and
 * `visibility: hidden` so it drops out of hit-testing entirely.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationToast } from '../components/NotificationToast';

const cardOf = (container: HTMLElement) => {
  const wrapper = container.firstElementChild as HTMLElement;
  return { wrapper, card: wrapper.firstElementChild as HTMLElement };
};

describe('NotificationToast — hit-testing while hidden', () => {
  it('is fully inert when not visible', () => {
    const { container } = render(
      <NotificationToast title="알림" message="내용" visible={false} onClose={() => {}} />
    );
    const { wrapper, card } = cardOf(container);

    // The wrapper never takes pointer events…
    expect(wrapper.className).toContain('pointer-events-none');
    // …and while hidden it is also removed from hit-testing outright.
    expect(wrapper.className).toContain('invisible');
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');

    // The card must not re-enable pointer events behind an opacity-0 wrapper.
    expect(card.className).toContain('pointer-events-none');
    expect(card.className).not.toContain('pointer-events-auto');
  });

  it('becomes visible and interactive once shown', () => {
    const onClose = vi.fn();
    const { container } = render(
      <NotificationToast title="알림" message="내용" visible onClose={onClose} />
    );
    const { wrapper, card } = cardOf(container);

    expect(wrapper.className).toContain('opacity-100');
    expect(wrapper.className).not.toContain('invisible');
    expect(wrapper).toHaveAttribute('aria-hidden', 'false');
    expect(card.className).toContain('pointer-events-auto');
    expect(screen.getByText('알림')).toBeInTheDocument();
  });
});
