import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ImpactSelectionPage } from '../components/ImpactSelectionPage';
import { LessonUpload } from '../types';

const MOCK_UPLOAD: LessonUpload = {
  id: 'upload-test-1',
  studentId: 'student-1',
  beforeVideoFile: undefined,
  afterVideoFile: undefined,
  beforeVideoUrl: undefined,
  afterVideoUrl: undefined,
  createdAt: Date.now(),
};

describe('ImpactSelectionPage', () => {
  it('renders step header, guidance text and two scrubbers', () => {
    render(
      <ImpactSelectionPage
        lessonUpload={MOCK_UPLOAD}
        onBack={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByTestId('impact-selection-page')).toBeInTheDocument();
    expect(screen.getByText(/Set Impact Point/i)).toBeInTheDocument();
    expect(screen.getByTestId('scrubber-before')).toBeInTheDocument();
    expect(screen.getByTestId('scrubber-after')).toBeInTheDocument();
  });

  it('renders BEFORE and AFTER sliders', () => {
    render(
      <ImpactSelectionPage
        lessonUpload={MOCK_UPLOAD}
        onBack={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByTestId('slider-before')).toBeInTheDocument();
    expect(screen.getByTestId('slider-after')).toBeInTheDocument();
  });

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn();
    render(
      <ImpactSelectionPage
        lessonUpload={MOCK_UPLOAD}
        onBack={onBack}
        onConfirm={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('impact-back-btn'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm with correct lessonId when Confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <ImpactSelectionPage
        lessonUpload={MOCK_UPLOAD}
        onBack={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByTestId('impact-confirm-btn'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const selection = onConfirm.mock.calls[0][0];
    expect(selection.lessonId).toBe('upload-test-1');
    expect(typeof selection.beforeImpactTimeSec).toBe('number');
    expect(typeof selection.afterImpactTimeSec).toBe('number');
  });

  it('updates impact timestamp when slider changes', () => {
    const onConfirm = vi.fn();
    render(
      <ImpactSelectionPage
        lessonUpload={MOCK_UPLOAD}
        onBack={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    const beforeSlider = screen.getByTestId('slider-before');
    fireEvent.change(beforeSlider, { target: { value: '3.5' } });

    fireEvent.click(screen.getByTestId('impact-confirm-btn'));
    const selection = onConfirm.mock.calls[0][0];
    expect(selection.beforeImpactTimeSec).toBeCloseTo(3.5);
  });

  it('renders fine-adjust frame buttons for both scrubbers', () => {
    render(
      <ImpactSelectionPage
        lessonUpload={MOCK_UPLOAD}
        onBack={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByTestId('prev-frame-before')).toBeInTheDocument();
    expect(screen.getByTestId('next-frame-before')).toBeInTheDocument();
    expect(screen.getByTestId('prev-frame-after')).toBeInTheDocument();
    expect(screen.getByTestId('next-frame-after')).toBeInTheDocument();
  });
});
