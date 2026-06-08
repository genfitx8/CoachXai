import React, { useMemo, useState } from 'react';
import { DiagnosisFactorKey, DiagnosisInput, DiagnosisProgram, GolferProfile, TrackmanData } from '../../types/diagnosis';
import { PostureAnalysisResult } from '../../types/postureAnalysis';
import { DiagnosisHero } from './DiagnosisHero';
import { Button } from '../Button';
import { clampDiagnosisScore, getAgeFromBirthDate } from '../../utils/diagnosis';
import { useLanguage } from '../LanguageContext';
import { ChevronDown, ChevronUp, Plus, Trash2, Monitor } from 'lucide-react';
import { PostureAnalysisDashboard } from '../posture/PostureAnalysisDashboard';
import { ScreenCaptureDialog } from './ScreenCaptureDialog';

interface DiagnosisProgramSectionProps {
  program: DiagnosisProgram;
  onBack: () => void;
  onCreateResult: (input: DiagnosisInput) => void;
  onViewResult: () => void;
  canViewResult: boolean;
  initialMemberName?: string;
  initialGolferProfile?: Partial<GolferProfile>;
}

const DEFAULT_GOLFER_PROFILE: GolferProfile = {
  name: '',
  gender: '',
  age: null,
  contact: '',
  heightCm: null,
  weightKg: null,
  yearsOfExperience: null,
  handicap: null,
  averageScore: null,
  bestScore: null,
  dominantHand: '',
  roundFrequency: '',
  practiceFrequency: '',
  injuryHistory: '',
  injuryMemo: '',
  currentPainAreas: '',
  otherSportsExperience: '',
  flexibilitySelfAssessment: null,
  driverModel: '',
  ironModel: '',
  shaftFlex: '',
  ballBrand: '',
  diagnosisGoals: [],
  primaryConcern: '',
  targetHandicap: null,
  trackmanData: [],
};

const parseNullableNumber = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const buildInitialFactorScores = (program: DiagnosisProgram): Record<DiagnosisFactorKey, number> =>
  program.factors.reduce(
    (acc, factor) => ({
      ...acc,
      [factor.key]: factor.key === 'body' ? 0 : factor.score,
    }),
    {} as Record<DiagnosisFactorKey, number>
  );

export const DiagnosisProgramSection: React.FC<DiagnosisProgramSectionProps> = ({
  program,
  onBack,
  onCreateResult,
  onViewResult,
  canViewResult,
  initialMemberName,
  initialGolferProfile,
}) => {
  const { t } = useLanguage();
  const [golferProfile, setGolferProfile] = useState<GolferProfile>(() => ({
    ...DEFAULT_GOLFER_PROFILE,
    ...initialGolferProfile,
    age: initialGolferProfile?.age ?? getAgeFromBirthDate(initialGolferProfile?.birthDate),
    diagnosisGoals: initialGolferProfile?.diagnosisGoals ?? DEFAULT_GOLFER_PROFILE.diagnosisGoals,
    name: initialGolferProfile?.name ?? initialMemberName ?? '',
  }));
  const [factorScores, setFactorScores] = useState<Record<DiagnosisFactorKey, number>>(() => buildInitialFactorScores(program));
  const [bodyScoreInput, setBodyScoreInput] = useState<number | ''>('');
  const [courseMentalNote, setCourseMentalNote] = useState('');
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: true,
    history: true,
    physical: true,
    equipment: true,
    goals: true,
  });
  const [postureAnalysisResult, setPostureAnalysisResult] = useState<PostureAnalysisResult | null>(null);
  const [showPostureAnalysis, setShowPostureAnalysis] = useState(false);
  const [showScreenCapture, setShowScreenCapture] = useState(false);
  const [selectedClubForCapture, setSelectedClubForCapture] = useState<string>('');
  const [selectedClub, setSelectedClub] = useState('');

  const memberName = golferProfile.name;

  const diagnosisGoalOptions = [
    { key: 'score-improvement', label: t('diagnosis_golfer_goal_score_improvement') },
    { key: 'distance', label: t('diagnosis_golfer_goal_distance') },
    { key: 'accuracy', label: t('diagnosis_golfer_goal_accuracy') },
    { key: 'consistency', label: t('diagnosis_golfer_goal_consistency') },
    { key: 'injury-prevention', label: t('diagnosis_golfer_goal_injury_prevention') },
    { key: 'mental', label: t('diagnosis_golfer_goal_mental') },
  ];

  const requiredMissingFields = useMemo(() => {
    const missing: string[] = [];
    if (!golferProfile.name.trim()) missing.push(t('diagnosis_golfer_name'));
    if (!golferProfile.gender) missing.push(t('diagnosis_golfer_gender'));
    if (golferProfile.age === null) missing.push(t('diagnosis_golfer_age'));
    if (golferProfile.heightCm === null) missing.push(t('diagnosis_golfer_height_cm'));
    if (golferProfile.yearsOfExperience === null) missing.push(t('diagnosis_golfer_years_of_experience'));
    if (golferProfile.averageScore === null) missing.push(t('diagnosis_golfer_average_score'));
    if (!golferProfile.dominantHand) missing.push(t('diagnosis_golfer_dominant_hand'));
    if (golferProfile.diagnosisGoals.length < 1) missing.push(t('diagnosis_golfer_diagnosis_goals'));
    return missing;
  }, [golferProfile, t]);

  const scoreEntries = useMemo(
    () => program.factors.map((factor) => ({ key: factor.key, label: factor.label, score: factorScores[factor.key] ?? 0 })),
    [factorScores, program.factors]
  );

  const handleScoreChange = (key: DiagnosisFactorKey, value: string) => {
    const parsed = Number(value);
    const normalizedScore = Number.isNaN(parsed) ? 0 : parsed;
    setFactorScores((prev) => ({ ...prev, [key]: clampDiagnosisScore(normalizedScore) }));
  };

  const handleCreateResult = () => {
    onCreateResult({
      memberName,
      golferProfile: {
        ...golferProfile,
        name: memberName,
      },
      factorScores,
    });
  };

  const currentStep = program.steps[activeStepIndex];
  const isFirstStep = activeStepIndex === 0;
  const isFinalStep = activeStepIndex === program.steps.length - 1;
  const isProfileComplete = requiredMissingFields.length === 0;

  const toggleGoal = (goal: string) => {
    setGolferProfile((prev) => ({
      ...prev,
      diagnosisGoals: prev.diagnosisGoals.includes(goal)
        ? prev.diagnosisGoals.filter((item) => item !== goal)
        : [...prev.diagnosisGoals, goal],
    }));
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handlePostureAnalysisComplete = (result: PostureAnalysisResult) => {
    setPostureAnalysisResult(result);
    setShowPostureAnalysis(false);
    // Automatically set body score based on posture analysis overall score
    const bodyScore = clampDiagnosisScore(Math.round(result.balance.overallScore));
    setBodyScoreInput(bodyScore);
    setFactorScores((prev) => ({ ...prev, body: bodyScore }));
  };

  const handleBodyScoreChange = (value: string) => {
    if (!value.trim()) {
      setBodyScoreInput('');
      setFactorScores((prev) => ({ ...prev, body: 0 }));
      return;
    }

    const parsed = Number(value);
    const normalizedScore = clampDiagnosisScore(Number.isNaN(parsed) ? 0 : parsed);
    setBodyScoreInput(normalizedScore);
    setFactorScores((prev) => ({ ...prev, body: normalizedScore }));
  };

  const handleStartPostureAnalysis = () => {
    setShowPostureAnalysis(true);
  };

  const handleCancelPostureAnalysis = () => {
    setShowPostureAnalysis(false);
  };

  const clubOptions = [
    { value: 'driver', label: t('equipment_club_driver') || '드라이버' },
    { value: '3-wood', label: t('equipment_club_3wood') || '3번 우드' },
    { value: '5-wood', label: t('equipment_club_5wood') || '5번 우드' },
    { value: 'hybrid', label: t('equipment_club_hybrid') || '하이브리드' },
    { value: '3-iron', label: t('equipment_club_3iron') || '3번 아이언' },
    { value: '4-iron', label: t('equipment_club_4iron') || '4번 아이언' },
    { value: '5-iron', label: t('equipment_club_5iron') || '5번 아이언' },
    { value: '6-iron', label: t('equipment_club_6iron') || '6번 아이언' },
    { value: '7-iron', label: t('equipment_club_7iron') || '7번 아이언' },
    { value: '8-iron', label: t('equipment_club_8iron') || '8번 아이언' },
    { value: '9-iron', label: t('equipment_club_9iron') || '9번 아이언' },
    { value: 'pw', label: t('equipment_club_pw') || 'PW' },
    { value: 'sw', label: t('equipment_club_sw') || 'SW' },
  ];

  const handleAddTrackmanData = (clubType: string) => {
    if (!clubType.trim()) return;
    setSelectedClubForCapture(clubType);
    setShowScreenCapture(true);
  };

  const handleScreenCapture = (imageDataUrl: string) => {
    const newTrackmanData: TrackmanData = {
      clubType: selectedClubForCapture,
      capturedImageUrl: imageDataUrl,
    };

    setGolferProfile((prev) => ({
      ...prev,
      trackmanData: [...(prev.trackmanData || []), newTrackmanData],
    }));

    setShowScreenCapture(false);
    setSelectedClubForCapture('');
  };

  const handleRemoveTrackmanData = (index: number) => {
    setGolferProfile((prev) => ({
      ...prev,
      trackmanData: (prev.trackmanData || []).filter((_, i) => i !== index),
    }));
  };

  const renderStepInput = () => {
    if (!currentStep) return null;

    if (currentStep.id === 'golfer-profile') {
      return (
        <div className="space-y-5">
          <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
            <button
              type="button"
              onClick={() => toggleSection('basic')}
              className="w-full flex items-center justify-between text-left hover:opacity-80 transition-opacity"
            >
              <h4 className="text-sm font-semibold text-violet-300">{t('diagnosis_golfer_section_basic')}</h4>
              {expandedSections.basic ? (
                <ChevronUp className="w-4 h-4 text-violet-300" />
              ) : (
                <ChevronDown className="w-4 h-4 text-violet-300" />
              )}
            </button>
            {expandedSections.basic && (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-slate-300">{t('diagnosis_golfer_name')}</span>
                <input
                  value={memberName}
                  onChange={(event) => setGolferProfile((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder={t('diagnosis_golfer_name_placeholder')}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  data-testid="diagnosis-member-name-input"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">{t('diagnosis_golfer_gender')}</span>
                <select
                  value={golferProfile.gender}
                  onChange={(event) =>
                    setGolferProfile((prev) => ({ ...prev, gender: event.target.value as GolferProfile['gender'] }))
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  data-testid="diagnosis-golfer-gender-select"
                >
                  <option value="">{t('diagnosis_golfer_select_placeholder')}</option>
                  <option value="male">{t('diagnosis_golfer_gender_male')}</option>
                  <option value="female">{t('diagnosis_golfer_gender_female')}</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">{t('diagnosis_golfer_age')}</span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={golferProfile.age ?? ''}
                  onChange={(event) => setGolferProfile((prev) => ({ ...prev, age: parseNullableNumber(event.target.value) }))}
                  placeholder={t('diagnosis_golfer_age_placeholder')}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  data-testid="diagnosis-golfer-age-input"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">{t('diagnosis_golfer_contact')}</span>
                <input
                  type="tel"
                  value={golferProfile.contact}
                  onChange={(event) => setGolferProfile((prev) => ({ ...prev, contact: event.target.value }))}
                  placeholder="010-0000-0000"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  data-testid="diagnosis-golfer-contact-input"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">{t('diagnosis_golfer_height_cm')}</span>
                <input
                  type="number"
                  min={0}
                  value={golferProfile.heightCm ?? ''}
                  onChange={(event) => setGolferProfile((prev) => ({ ...prev, heightCm: parseNullableNumber(event.target.value) }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  data-testid="diagnosis-golfer-height-input"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">{t('diagnosis_golfer_weight_kg')}</span>
                <input
                  type="number"
                  min={0}
                  value={golferProfile.weightKg ?? ''}
                  onChange={(event) => setGolferProfile((prev) => ({ ...prev, weightKg: parseNullableNumber(event.target.value) }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  data-testid="diagnosis-golfer-weight-input"
                />
              </label>
            </div>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
            <button
              type="button"
              onClick={() => toggleSection('history')}
              className="w-full flex items-center justify-between text-left hover:opacity-80 transition-opacity"
            >
              <h4 className="text-sm font-semibold text-violet-300">{t('diagnosis_golfer_section_history')}</h4>
              {expandedSections.history ? (
                <ChevronUp className="w-4 h-4 text-violet-300" />
              ) : (
                <ChevronDown className="w-4 h-4 text-violet-300" />
              )}
            </button>
            {expandedSections.history && (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-slate-300">{t('diagnosis_golfer_years_of_experience')}</span>
                <input
                  type="number"
                  min={0}
                  value={golferProfile.yearsOfExperience ?? ''}
                  onChange={(event) => setGolferProfile((prev) => ({ ...prev, yearsOfExperience: parseNullableNumber(event.target.value) }))}
                  placeholder="0"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  data-testid="diagnosis-golfer-years-of-experience-input"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">{t('diagnosis_golfer_average_score')}</span>
                <input
                  type="number"
                  min={0}
                  value={golferProfile.averageScore ?? ''}
                  onChange={(event) => setGolferProfile((prev) => ({ ...prev, averageScore: parseNullableNumber(event.target.value) }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  data-testid="diagnosis-golfer-average-score-input"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">{t('diagnosis_golfer_best_score')}</span>
                <input
                  type="number"
                  min={0}
                  value={golferProfile.bestScore ?? ''}
                  onChange={(event) => setGolferProfile((prev) => ({ ...prev, bestScore: parseNullableNumber(event.target.value) }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  data-testid="diagnosis-golfer-best-score-input"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">{t('diagnosis_golfer_dominant_hand')}</span>
                <select
                  value={golferProfile.dominantHand}
                  onChange={(event) =>
                    setGolferProfile((prev) => ({ ...prev, dominantHand: event.target.value as GolferProfile['dominantHand'] }))
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  data-testid="diagnosis-golfer-dominant-hand-select"
                >
                  <option value="">{t('diagnosis_golfer_select_placeholder')}</option>
                  <option value="right">{t('diagnosis_golfer_hand_right')}</option>
                  <option value="left">{t('diagnosis_golfer_hand_left')}</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">{t('diagnosis_golfer_round_frequency')}</span>
                <input
                  value={golferProfile.roundFrequency}
                  onChange={(event) => setGolferProfile((prev) => ({ ...prev, roundFrequency: event.target.value }))}
                  placeholder={t('diagnosis_golfer_round_frequency_placeholder')}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  data-testid="diagnosis-golfer-round-frequency-input"
                />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-slate-300">{t('diagnosis_golfer_practice_frequency')}</span>
                <input
                  value={golferProfile.practiceFrequency}
                  onChange={(event) => setGolferProfile((prev) => ({ ...prev, practiceFrequency: event.target.value }))}
                  placeholder={t('diagnosis_golfer_practice_frequency_placeholder')}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  data-testid="diagnosis-golfer-practice-frequency-input"
                />
              </label>
            </div>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
            <button
              type="button"
              onClick={() => toggleSection('physical')}
              className="w-full flex items-center justify-between text-left hover:opacity-80 transition-opacity"
            >
              <h4 className="text-sm font-semibold text-violet-300">{t('diagnosis_golfer_section_physical')}</h4>
              {expandedSections.physical ? (
                <ChevronUp className="w-4 h-4 text-violet-300" />
              ) : (
                <ChevronDown className="w-4 h-4 text-violet-300" />
              )}
            </button>
            {expandedSections.physical && (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-slate-300">{t('diagnosis_golfer_injury_history')}</span>
                <input
                  value={golferProfile.injuryHistory}
                  onChange={(event) => setGolferProfile((prev) => ({ ...prev, injuryHistory: event.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  data-testid="diagnosis-golfer-injury-history-input"
                />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-slate-300">{t('diagnosis_golfer_injury_memo')}</span>
                <textarea
                  rows={3}
                  value={golferProfile.injuryMemo}
                  onChange={(event) => setGolferProfile((prev) => ({ ...prev, injuryMemo: event.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  data-testid="diagnosis-golfer-injury-memo-input"
                />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-slate-300">{t('diagnosis_golfer_current_pain_areas')}</span>
                <input
                  value={golferProfile.currentPainAreas}
                  onChange={(event) => setGolferProfile((prev) => ({ ...prev, currentPainAreas: event.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  data-testid="diagnosis-golfer-current-pain-areas-input"
                />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-slate-300">{t('diagnosis_golfer_other_sports_experience')}</span>
                <textarea
                  rows={3}
                  value={golferProfile.otherSportsExperience}
                  onChange={(event) => setGolferProfile((prev) => ({ ...prev, otherSportsExperience: event.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  data-testid="diagnosis-golfer-other-sports-input"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">{t('diagnosis_golfer_flexibility_self_assessment')}</span>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={golferProfile.flexibilitySelfAssessment ?? ''}
                  onChange={(event) => setGolferProfile((prev) => ({ ...prev, flexibilitySelfAssessment: parseNullableNumber(event.target.value) }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  data-testid="diagnosis-golfer-flexibility-input"
                />
              </label>
            </div>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
            <button
              type="button"
              onClick={() => toggleSection('equipment')}
              className="w-full flex items-center justify-between text-left hover:opacity-80 transition-opacity"
            >
              <h4 className="text-sm font-semibold text-violet-300">{t('diagnosis_golfer_section_equipment')}</h4>
              {expandedSections.equipment ? (
                <ChevronUp className="w-4 h-4 text-violet-300" />
              ) : (
                <ChevronDown className="w-4 h-4 text-violet-300" />
              )}
            </button>
            {expandedSections.equipment && (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-slate-300">{t('diagnosis_golfer_driver_model')}</span>
                <input
                  value={golferProfile.driverModel}
                  onChange={(event) => setGolferProfile((prev) => ({ ...prev, driverModel: event.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  data-testid="diagnosis-golfer-driver-model-input"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">{t('diagnosis_golfer_iron_model')}</span>
                <input
                  value={golferProfile.ironModel}
                  onChange={(event) => setGolferProfile((prev) => ({ ...prev, ironModel: event.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  data-testid="diagnosis-golfer-iron-model-input"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">{t('diagnosis_golfer_shaft_flex')}</span>
                <input
                  value={golferProfile.shaftFlex}
                  onChange={(event) => setGolferProfile((prev) => ({ ...prev, shaftFlex: event.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  data-testid="diagnosis-golfer-shaft-flex-input"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">{t('diagnosis_golfer_ball_brand')}</span>
                <input
                  value={golferProfile.ballBrand}
                  onChange={(event) => setGolferProfile((prev) => ({ ...prev, ballBrand: event.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  data-testid="diagnosis-golfer-ball-brand-input"
                />
              </label>
            </div>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
            <button
              type="button"
              onClick={() => toggleSection('goals')}
              className="w-full flex items-center justify-between text-left hover:opacity-80 transition-opacity"
            >
              <h4 className="text-sm font-semibold text-violet-300">{t('diagnosis_golfer_section_goals')}</h4>
              {expandedSections.goals ? (
                <ChevronUp className="w-4 h-4 text-violet-300" />
              ) : (
                <ChevronDown className="w-4 h-4 text-violet-300" />
              )}
            </button>
            {expandedSections.goals && (
            <>
            <div className="space-y-2">
              <p className="text-sm text-slate-300">{t('diagnosis_golfer_diagnosis_goals')}</p>
              <div className="grid gap-2 md:grid-cols-2">
                {diagnosisGoalOptions.map((option) => {
                  const checked = golferProfile.diagnosisGoals.includes(option.key);
                  return (
                    <label key={option.key} className="flex items-center gap-2 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleGoal(option.key)}
                        data-testid={`diagnosis-golfer-goal-${option.key}`}
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <label className="space-y-2">
              <span className="text-sm text-slate-300">{t('diagnosis_golfer_primary_concern')}</span>
              <textarea
                rows={3}
                value={golferProfile.primaryConcern}
                onChange={(event) => setGolferProfile((prev) => ({ ...prev, primaryConcern: event.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                data-testid="diagnosis-golfer-primary-concern-input"
              />
            </label>
            <label className="space-y-2 md:max-w-sm">
              <span className="text-sm text-slate-300">{t('diagnosis_golfer_target_handicap')}</span>
              <input
                type="number"
                min={0}
                value={golferProfile.targetHandicap ?? ''}
                onChange={(event) => setGolferProfile((prev) => ({ ...prev, targetHandicap: parseNullableNumber(event.target.value) }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                data-testid="diagnosis-golfer-target-handicap-input"
              />
            </label>
            </>
            )}
          </div>

          {requiredMissingFields.length > 0 && (
            <p className="text-xs text-amber-300" data-testid="diagnosis-golfer-required-hint">
              {t('diagnosis_golfer_required_help')}: {requiredMissingFields.join(', ')}
            </p>
          )}
        </div>
      );
    }

    if (currentStep.id === 'body-diagnosis' || currentStep.id === 'equipment-diagnosis' || currentStep.id === 'skill-diagnosis') {
      const stepFactorMap: Record<'body-diagnosis' | 'equipment-diagnosis' | 'skill-diagnosis', DiagnosisFactorKey> = {
        'body-diagnosis': 'body',
        'equipment-diagnosis': 'equipment',
        'skill-diagnosis': 'skill',
      };
      const factorKey = stepFactorMap[currentStep.id];
      const factor = program.factors.find((item) => item.key === factorKey);
      if (!factor) return null;

      // Special handling for body-diagnosis to integrate posture analysis
      if (currentStep.id === 'body-diagnosis') {
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
              <h4 className="text-sm font-semibold text-violet-300 mb-3">신체 체형 진단 (스켈레톤 분석)</h4>
              <p className="text-xs text-slate-400 mb-4">
                스켈레톤 분석을 통해 신체 정렬과 체형 밸런스를 자동으로 측정하거나, 수동으로 점수를 입력할 수 있습니다.
              </p>

              {postureAnalysisResult && (
                <div className="mb-4 p-3 bg-emerald-900/30 border border-emerald-700/50 rounded-lg">
                  <p className="text-sm text-emerald-300 font-medium mb-2">✓ 스켈레톤 분석 완료</p>
                  <div className="text-xs text-slate-300 space-y-1">
                    <p>• 전체 밸런스 점수: {Math.round(postureAnalysisResult.balance.overallScore)}점</p>
                    <p>• 어깨 정렬: {Math.round(postureAnalysisResult.balance.shoulderAlignment)}점</p>
                    <p>• 골반 정렬: {Math.round(postureAnalysisResult.balance.hipAlignment)}점</p>
                    <p>• 척추 각도: {postureAnalysisResult.balance.spineAngle.toFixed(1)}°</p>
                  </div>
                </div>
              )}

              <Button
                onClick={handleStartPostureAnalysis}
                variant="outline"
                className="w-full mb-3"
                data-testid="start-posture-analysis-btn"
              >
                {postureAnalysisResult ? '스켈레톤 분석 다시 하기' : '스켈레톤 분석 시작하기'}
              </Button>
            </div>

            <label className="block space-y-2 rounded-xl border border-slate-700 bg-slate-900 p-3">
              <span className="text-sm text-slate-300">{factor.label} 점수</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={bodyScoreInput}
                onChange={(event) => handleBodyScoreChange(event.target.value)}
                placeholder="스켈레톤 분석 후 자동 입력"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                data-testid={`diagnosis-score-input-${factorKey}`}
              />
              <p className="text-xs text-slate-400">
                {postureAnalysisResult
                  ? '스켈레톤 분석 결과로 자동 설정되었습니다. 필요시 수동으로 조정 가능합니다.'
                  : '점수는 0~100 범위로 자동 보정됩니다.'}
              </p>
            </label>
          </div>
        );
      }

      // Special handling for equipment-diagnosis to integrate club selection and screen capture
      if (currentStep.id === 'equipment-diagnosis') {
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
              <h4 className="text-sm font-semibold text-violet-300 mb-3">
                {t('equipment_diagnosis_title') || '장비 진단 (트랙맨 데이터)'}
              </h4>
              <p className="text-xs text-slate-400 mb-4">
                {t('equipment_diagnosis_desc') || '클럽을 선택하고 트랙맨 화면을 캡처하여 데이터를 수집합니다.'}
              </p>

              <div className="space-y-3 mb-4">
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">
                    {t('equipment_select_club') || '클럽 선택'}
                  </span>
                  <div className="flex gap-2">
                    <select
                      value={selectedClub}
                      onChange={(e) => setSelectedClub(e.target.value)}
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                      data-testid="equipment-club-select"
                    >
                      <option value="">{t('equipment_select_club_placeholder') || '클럽을 선택하세요'}</option>
                      {clubOptions.map((club) => (
                        <option key={club.value} value={club.value}>
                          {club.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      onClick={() => handleAddTrackmanData(selectedClub)}
                      disabled={!selectedClub}
                      className="flex items-center gap-2 whitespace-nowrap"
                      data-testid="add-trackman-data-btn"
                    >
                      <Monitor className="w-4 h-4" />
                      {t('equipment_capture_screen') || '화면 캡처'}
                    </Button>
                  </div>
                </label>
              </div>

              {(golferProfile.trackmanData && golferProfile.trackmanData.length > 0) && (
                <div className="space-y-2">
                  <h5 className="text-xs font-medium text-slate-300">
                    {t('equipment_captured_data') || '캡처된 데이터'}
                  </h5>
                  {golferProfile.trackmanData.map((data, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 bg-slate-950 border border-slate-700 rounded-lg"
                    >
                      {data.capturedImageUrl && (
                        <img
                          src={data.capturedImageUrl}
                          alt={`Trackman ${data.clubType}`}
                          className="w-24 h-16 object-cover rounded border border-slate-600"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200">
                          {clubOptions.find((c) => c.value === data.clubType)?.label || data.clubType}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {t('equipment_data_captured') || '트랙맨 데이터 캡처 완료'}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveTrackmanData(index)}
                        className="text-red-400 hover:text-red-300 p-1"
                        data-testid={`remove-trackman-data-${index}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label className="block space-y-2 rounded-xl border border-slate-700 bg-slate-900 p-3">
              <span className="text-sm text-slate-300">{factor.label} 점수</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={factorScores[factorKey] ?? 0}
                onChange={(event) => handleScoreChange(factorKey, event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                data-testid={`diagnosis-score-input-${factorKey}`}
              />
              <p className="text-xs text-slate-400">
                {t('equipment_score_help') || '점수는 0~100 범위로 자동 보정됩니다. 트랙맨 데이터를 참고하여 입력하세요.'}
              </p>
            </label>
          </div>
        );
      }

      // For skill-diagnosis, use the original simple input
      return (
        <label className="block space-y-2 rounded-xl border border-slate-700 bg-slate-900 p-3">
          <span className="text-sm text-slate-300">{factor.label} 점수</span>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={factorScores[factorKey] ?? 0}
            onChange={(event) => handleScoreChange(factorKey, event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
            data-testid={`diagnosis-score-input-${factorKey}`}
          />
          <p className="text-xs text-slate-400">점수는 0~100 범위로 자동 보정됩니다.</p>
        </label>
      );
    }

    if (currentStep.id === 'course-mental') {
      return (
        <label className="block space-y-2">
          <span className="text-sm text-slate-300">코스메니지먼트 & 멘탈 진단 메모</span>
          <textarea
            value={courseMentalNote}
            onChange={(event) => setCourseMentalNote(event.target.value)}
            placeholder="코스 운영 판단, 루틴, 멘탈 상태를 입력하세요."
            rows={5}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
            data-testid="diagnosis-course-mental-input"
          />
        </label>
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-300">입력된 진단 항목을 확인한 뒤 통합 리포트를 생성하세요.</p>
        <ul className="space-y-2 text-sm text-slate-300">
          <li>{t('diagnosis_golfer_name')}: {memberName || '-'}</li>
          <li>{t('diagnosis_golfer_contact')}: {golferProfile.contact || '-'}</li>
          <li>{t('diagnosis_golfer_best_score')}: {golferProfile.bestScore ?? '-'}</li>
          <li>{t('diagnosis_golfer_years_of_experience')}: {golferProfile.yearsOfExperience !== null ? `${golferProfile.yearsOfExperience}년` : '-'}</li>
          {scoreEntries.map((entry) => (
            <li key={entry.key}>
              {entry.label}: {entry.score}점
            </li>
          ))}
          <li>코스메니지먼트 & 멘탈 메모: {courseMentalNote.trim() || '-'}</li>
        </ul>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="diagnosis-program-section">
      {showPostureAnalysis ? (
        <PostureAnalysisDashboard
          memberName={memberName || '회원'}
          onBack={handleCancelPostureAnalysis}
          onComplete={handlePostureAnalysisComplete}
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold text-slate-100">coachxai 정밀진단 프로그램</h1>
            <Button variant="ghost" onClick={onBack}>
              대시보드로 돌아가기
            </Button>
          </div>

          <DiagnosisHero title={program.title} subtitle={program.subtitle} description={program.description} />

          <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
            <h3 className="text-lg font-semibold text-slate-100">진단 입력</h3>
            <div className="mt-4 space-y-4" data-testid="diagnosis-step-panel">
              <div>
                <nav aria-label="진단 진행 상태">
                  <ol className="flex flex-wrap gap-2 text-xs font-semibold text-slate-300">
                    {program.steps.map((step, index) => (
                      <li
                        key={step.id}
                        aria-current={index === activeStepIndex ? 'step' : undefined}
                        className={`rounded-full border px-2 py-1 ${
                          index === activeStepIndex
                            ? 'border-violet-500 bg-violet-500/20 text-violet-200'
                            : 'border-slate-700 bg-slate-900 text-slate-400'
                        }`}
                      >
                        {index + 1}
                      </li>
                    ))}
                  </ol>
                </nav>
                <p className="mt-2 text-sm font-semibold text-violet-300">프로세스 {activeStepIndex + 1} / {program.steps.length}</p>
                <p className="mt-1 font-medium text-slate-100">{currentStep?.title}</p>
                <p className="mt-1 text-sm text-slate-300">{currentStep?.description}</p>
              </div>
              {renderStepInput()}
              {!isFinalStep && (
                <p id="diagnosis-generate-hint" className="text-xs text-slate-400">
                  진단 결과 생성은 마지막 프로세스에서 가능합니다.
                </p>
              )}
              {isFinalStep && !isProfileComplete && (
                <p id="diagnosis-generate-required-hint" className="text-xs text-amber-300" data-testid="diagnosis-generate-required-hint">
                  {t('diagnosis_golfer_required_help')}: {requiredMissingFields.join(', ')}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setActiveStepIndex((prev) => Math.max(prev - 1, 0))}
                  disabled={isFirstStep}
                  data-testid="diagnosis-prev-step-btn"
                >
                  이전 프로세스
                </Button>
                {!isFinalStep && (
                  <Button
                    onClick={() => setActiveStepIndex((prev) => Math.min(prev + 1, program.steps.length - 1))}
                    data-testid="diagnosis-next-step-btn"
                  >
                    다음 프로세스
                  </Button>
                )}
              </div>
            </div>
          </section>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              onClick={handleCreateResult}
              data-testid="diagnosis-view-result-btn"
              disabled={!isFinalStep || !isProfileComplete}
              aria-describedby={
                !isFinalStep
                  ? 'diagnosis-generate-hint'
                  : !isProfileComplete
                    ? 'diagnosis-generate-required-hint'
                    : undefined
              }
            >
              진단 결과 생성
            </Button>
            <Button variant="ghost" onClick={onViewResult} disabled={!canViewResult} data-testid="diagnosis-view-latest-result-btn">
              최근 결과 보기
            </Button>
          </div>
        </>
      )}

      {showScreenCapture && (
        <ScreenCaptureDialog
          onCapture={handleScreenCapture}
          onClose={() => setShowScreenCapture(false)}
        />
      )}
    </div>
  );
};
