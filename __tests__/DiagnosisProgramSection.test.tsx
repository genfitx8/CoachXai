import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { DiagnosisProgramSection } from '../components/diagnosis/DiagnosisProgramSection';
import { DIAGNOSIS_FACTORS, DIAGNOSIS_PROCESS } from '../constants/diagnosis';
import { LanguageProvider } from '../components/LanguageContext';

const renderSection = (props?: Partial<React.ComponentProps<typeof DiagnosisProgramSection>>) => {
  const onCreateResult = vi.fn();

  render(
    <LanguageProvider>
      <DiagnosisProgramSection
        program={{
          title: 'test program',
          subtitle: 'test subtitle',
          description: 'test description',
          factors: DIAGNOSIS_FACTORS,
          steps: DIAGNOSIS_PROCESS,
        }}
        onBack={vi.fn()}
        onCreateResult={onCreateResult}
        onViewResult={vi.fn()}
        canViewResult={false}
        {...props}
      />
    </LanguageProvider>
  );

  return { onCreateResult };
};

describe('DiagnosisProgramSection golfer profile', () => {
  it('prefills golfer profile from initial props', () => {
    renderSection({
      initialMemberName: '기존이름',
      initialGolferProfile: {
        name: '김회원',
        contact: '010-1234-5678',
        handicap: 14,
        bestScore: 79,
        golfStartDate: '2020-02-20',
      },
    });

    expect(screen.getByTestId('diagnosis-member-name-input')).toHaveValue('김회원');
    expect(screen.getByTestId('diagnosis-golfer-contact-input')).toHaveValue('010-1234-5678');
    expect(screen.getByTestId('diagnosis-golfer-handicap-input')).toHaveValue(14);
    expect(screen.getByTestId('diagnosis-golfer-best-score-input')).toHaveValue(79);
    expect(screen.getByTestId('diagnosis-golfer-golf-start-date-input')).toHaveValue('2020-02-20');
  });

  it('keeps next step disabled until required golfer profile fields are filled', () => {
    renderSection();

    const nextButton = screen.getByTestId('diagnosis-next-step-btn');
    expect(nextButton).toBeDisabled();

    fireEvent.change(screen.getByTestId('diagnosis-member-name-input'), { target: { value: '홍길동' } });
    fireEvent.change(screen.getByTestId('diagnosis-golfer-gender-select'), { target: { value: 'male' } });
    fireEvent.change(screen.getByTestId('diagnosis-golfer-birth-date-input'), { target: { value: '1993-07-01' } });
    fireEvent.change(screen.getByTestId('diagnosis-golfer-golf-start-date-input'), { target: { value: '2019-04-01' } });
    fireEvent.change(screen.getByTestId('diagnosis-golfer-average-score-input'), { target: { value: '90' } });
    fireEvent.change(screen.getByTestId('diagnosis-golfer-dominant-hand-select'), { target: { value: 'right' } });
    fireEvent.click(screen.getByTestId('diagnosis-golfer-goal-score-improvement'));

    expect(nextButton).not.toBeDisabled();
  });
});
