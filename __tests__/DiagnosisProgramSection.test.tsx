import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { DiagnosisProgramSection } from '../components/diagnosis/DiagnosisProgramSection';
import { DIAGNOSIS_FACTORS, DIAGNOSIS_PROCESS } from '../constants/diagnosis';
import { LanguageProvider } from '../components/LanguageContext';
import { analyzeEquipmentPhoto } from '../services/geminiService';

vi.mock('../services/geminiService', async () => {
  const actual = await vi.importActual<typeof import('../services/geminiService')>('../services/geminiService');
  return {
    ...actual,
    analyzeEquipmentPhoto: vi.fn(),
  };
});

vi.mock('../components/posture/PostureAnalysisDashboard', () => ({
  PostureAnalysisDashboard: ({ onComplete }: { onComplete?: (result: any) => void }) => (
    <div data-testid="mock-posture-analysis-dashboard">
      <button
        type="button"
        data-testid="mock-posture-analysis-complete-btn"
        onClick={() =>
          onComplete?.({
            id: 'posture-test',
            frontCapture: {},
            sideCapture: {},
            frontSkeleton: [],
            sideSkeleton: [],
            balance: {
              overallScore: 88.4,
              shoulderAlignment: 91.2,
              hipAlignment: 85.8,
              spineAngle: 3.4,
            },
            problemAreas: [],
            recommendations: [],
            createdAt: new Date().toISOString(),
          })
        }
      >
        posture complete
      </button>
    </div>
  ),
}));

const mockAnalyzeEquipmentPhoto = vi.mocked(analyzeEquipmentPhoto);

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
  beforeEach(() => {
    mockAnalyzeEquipmentPhoto.mockReset();
  });

  it('prefills golfer profile from initial props', () => {
    renderSection({
      initialMemberName: '기존이름',
      initialGolferProfile: {
        name: '김회원',
        contact: '010-1234-5678',
        bestScore: 79,
        yearsOfExperience: 5,
      },
    });

    expect(screen.getByTestId('diagnosis-member-name-input')).toHaveValue('김회원');
    expect(screen.getByTestId('diagnosis-golfer-contact-input')).toHaveValue('010-1234-5678');
    expect(screen.getByTestId('diagnosis-golfer-best-score-input')).toHaveValue(79);
    expect(screen.getByTestId('diagnosis-golfer-years-of-experience-input')).toHaveValue(5);
  });

  it('allows moving to the next step even when golfer profile required fields are blank', () => {
    renderSection();

    const nextButton = screen.getByTestId('diagnosis-next-step-btn');
    expect(nextButton).not.toBeDisabled();
    expect(screen.getByTestId('diagnosis-golfer-required-hint')).toBeInTheDocument();

    fireEvent.click(nextButton);

    expect(screen.getByText('신체 체형 진단')).toBeInTheDocument();
  });

  it('keeps final result creation disabled until golfer profile required fields are filled', () => {
    renderSection();

    for (let index = 0; index < DIAGNOSIS_PROCESS.length - 1; index += 1) {
      const nextButton = screen.queryByTestId('diagnosis-next-step-btn');
      if (!nextButton) break;
      fireEvent.click(nextButton);
    }

    expect(screen.getByTestId('diagnosis-view-result-btn')).toBeDisabled();
    expect(screen.getByTestId('diagnosis-generate-required-hint')).toBeInTheDocument();
  });

  it('auto fills the body score after skeleton analysis completes', () => {
    renderSection();

    fireEvent.change(screen.getByTestId('diagnosis-member-name-input'), { target: { value: '홍길동' } });
    fireEvent.change(screen.getByTestId('diagnosis-golfer-gender-select'), { target: { value: 'male' } });
    fireEvent.change(screen.getByTestId('diagnosis-golfer-age-input'), { target: { value: '33' } });
    fireEvent.change(screen.getByTestId('diagnosis-golfer-height-input'), { target: { value: '176' } });
    fireEvent.change(screen.getByTestId('diagnosis-golfer-years-of-experience-input'), { target: { value: '3' } });
    fireEvent.change(screen.getByTestId('diagnosis-golfer-average-score-input'), { target: { value: '90' } });
    fireEvent.change(screen.getByTestId('diagnosis-golfer-dominant-hand-select'), { target: { value: 'right' } });
    fireEvent.click(screen.getByTestId('diagnosis-golfer-goal-score-improvement'));
    fireEvent.click(screen.getByTestId('diagnosis-next-step-btn'));

    expect((screen.getByTestId('diagnosis-score-input-body') as HTMLInputElement).value).toBe('');

    fireEvent.click(screen.getByTestId('start-posture-analysis-btn'));
    fireEvent.click(screen.getByTestId('mock-posture-analysis-complete-btn'));

    expect(screen.getByTestId('diagnosis-score-input-body')).toHaveValue(88);
    expect(screen.getByText('스켈레톤 분석 결과로 자동 설정되었습니다. 필요시 수동으로 조정 가능합니다.')).toBeInTheDocument();
  });

  it('auto fills equipment fields after equipment photo analysis completes', async () => {
    mockAnalyzeEquipmentPhoto.mockResolvedValue({
      driverModel: 'TaylorMade Qi10',
      ironModel: 'Mizuno JPX 923',
      shaftFlex: 'S',
      ballBrand: 'Titleist Pro V1',
      summary: '장비 사진을 분석해 입력값을 자동 반영했습니다.',
    });

    renderSection();

    const file = new File(['equipment'], 'equipment.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('diagnosis-equipment-photo-input'), {
      target: { files: [file] },
    });

    await waitFor(() => expect(mockAnalyzeEquipmentPhoto).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId('diagnosis-golfer-driver-model-input')).toHaveValue('TaylorMade Qi10');
    expect(screen.getByTestId('diagnosis-golfer-iron-model-input')).toHaveValue('Mizuno JPX 923');
    expect(screen.getByTestId('diagnosis-golfer-shaft-flex-input')).toHaveValue('S');
    expect(screen.getByTestId('diagnosis-golfer-ball-brand-input')).toHaveValue('Titleist Pro V1');
    expect(screen.getByText('장비 사진을 분석해 입력값을 자동 반영했습니다.')).toBeInTheDocument();
  });
});
