/**
 * Tests for VideoTrimmer.
 *
 * Regression: when the <video> already had its metadata (cached blob: URL),
 * 'loadedmetadata' never fired again, so duration/endTime stayed 0 and
 * "자르기 적용" asked ffmpeg for a zero-length cut — the reported trim failure.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { VideoTrimmer } from '../components/VideoTrimmer';

/** Pretend the media element has already loaded metadata for `duration` seconds. */
function stubMediaElement(duration: number, readyState: number) {
  const durationSpy = vi
    .spyOn(HTMLMediaElement.prototype, 'duration', 'get')
    .mockReturnValue(duration);
  const readyStateSpy = vi
    .spyOn(HTMLMediaElement.prototype, 'readyState', 'get')
    .mockReturnValue(readyState);
  return () => {
    durationSpy.mockRestore();
    readyStateSpy.mockRestore();
  };
}

describe('VideoTrimmer', () => {
  let restore: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('reads the duration from an already-loaded video instead of waiting for loadedmetadata', () => {
    restore = stubMediaElement(12, 4 /* HAVE_ENOUGH_DATA */);
    const onTrim = vi.fn();

    render(<VideoTrimmer videoUrl="blob:swing" onTrim={onTrim} onCancel={vi.fn()} />);

    expect(screen.getByText('전체 길이: 0:12.00')).toBeTruthy();

    const apply = screen.getByRole('button', { name: /자르기 적용/ }) as HTMLButtonElement;
    expect(apply.disabled).toBe(false);

    fireEvent.click(apply);
    expect(onTrim).toHaveBeenCalledWith(0, 12);
  });

  it('blocks applying until the duration is known', () => {
    restore = stubMediaElement(0, 0 /* HAVE_NOTHING */);
    const onTrim = vi.fn();

    render(<VideoTrimmer videoUrl="blob:swing" onTrim={onTrim} onCancel={vi.fn()} />);

    const apply = screen.getByRole('button', { name: /자르기 적용/ }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);

    fireEvent.click(apply);
    expect(onTrim).not.toHaveBeenCalled();
    expect(screen.getByText(/영상 정보를 불러오는 중입니다/)).toBeTruthy();
  });

  it('blocks applying when the selected range is too short', () => {
    restore = stubMediaElement(12, 4);
    const onTrim = vi.fn();

    render(<VideoTrimmer videoUrl="blob:swing" onTrim={onTrim} onCancel={vi.fn()} />);

    // Drag the end handle back onto the start handle.
    const endSlider = screen.getByLabelText(/종료 시간/) as HTMLInputElement;
    fireEvent.change(endSlider, { target: { value: '0' } });

    const apply = screen.getByRole('button', { name: /자르기 적용/ }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.click(apply);
    expect(onTrim).not.toHaveBeenCalled();
  });

  it('keeps start before end when the handles cross', () => {
    restore = stubMediaElement(12, 4);
    const onTrim = vi.fn();

    render(<VideoTrimmer videoUrl="blob:swing" onTrim={onTrim} onCancel={vi.fn()} />);

    const startSlider = screen.getByLabelText(/시작 시간/) as HTMLInputElement;
    fireEvent.change(startSlider, { target: { value: '5' } });

    const endSlider = screen.getByLabelText(/종료 시간/) as HTMLInputElement;
    fireEvent.change(endSlider, { target: { value: '3' } });

    fireEvent.click(screen.getByRole('button', { name: /자르기 적용/ }));
    // End dragged below start pulls start down with it; the range stays valid.
    expect(onTrim).not.toHaveBeenCalledWith(5, 3);
  });
});
