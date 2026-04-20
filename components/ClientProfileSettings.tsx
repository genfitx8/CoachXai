
import React, { useState, useMemo, useEffect } from 'react';
import {
  ClientProfile,
  CoachProfile,
  Lesson,
  ClubSpec,
  ClubCategory,
  LessonBodyType,
  LessonStructuralMetricInput,
} from '../types';
import { Button } from './Button';
import { ArrowLeft, Award, Briefcase, Save, CalendarClock, Activity, Plus, Trash2, Smartphone, AlertCircle, ScanLine } from 'lucide-react';
import { CoachSearch, CoachSearchResult } from './CoachSearch';
import { useLanguage } from './LanguageContext';
import { analyzeStructuralFactors, inferSwingTypeFromBodyType } from '../services/bodyAnalysisService';
import { analyzeBodyPhotos } from '../services/geminiService';

interface ClientProfileSettingsProps {
  profile: ClientProfile;
  allLessons?: Lesson[]; // Added for calculation
  onSave: (updatedProfile: ClientProfile) => void;
  onBack: () => void;
  onSearchCoach: (name: string) => Promise<CoachSearchResult[]>;
}

export const ClientProfileSettings: React.FC<ClientProfileSettingsProps> = ({ profile, allLessons = [], onSave, onBack, onSearchCoach }) => {
  const { t } = useLanguage();
  const BODY_TYPES: LessonBodyType[] = [
    '이상체형',
    '삼각체형',
    '역삼각체형',
    '사각체형',
    '모래시계형',
    '마름모꼴체형',
    '둥근체형',
    '튜브체형',
  ];

  const latestLessonBodyAnalysis = useMemo(
    () => allLessons.find((lesson) => lesson.memberBodyAnalysis)?.memberBodyAnalysis,
    [allLessons]
  );

  const CLUB_CATEGORIES: { id: ClubCategory; label: string; icon: string }[] = [
    { id: 'DRIVER', label: t('club_category_driver'), icon: '🏌️' },
    { id: 'WOOD_UTIL', label: t('club_category_wood'), icon: '🌳' },
    { id: 'IRON', label: t('club_category_iron'), icon: '⚙️' },
    { id: 'WEDGE', label: t('club_category_wedge'), icon: '⛳' },
    { id: 'PUTTER', label: t('club_category_putter'), icon: '📍' },
  ];

  const [formData, setFormData] = useState<ClientProfile>({ ...profile });
  const [isSaving, setIsSaving] = useState(false);
  const [frontBodyPhoto, setFrontBodyPhoto] = useState<File | null>(null);
  const [sideBodyPhoto, setSideBodyPhoto] = useState<File | null>(null);
  const [isAnalyzingBodyPhoto, setIsAnalyzingBodyPhoto] = useState(false);
  const [bodyPhotoAnalysisError, setBodyPhotoAnalysisError] = useState<string | null>(null);

  // Experience State
  const [expYears, setExpYears] = useState<string>('');
  const [expMonths, setExpMonths] = useState<string>('');
  const [dDay, setDDay] = useState<number | null>(null);

  // Club Management State
  const [bagSpecs, setBagSpecs] = useState<ClubSpec[]>(profile.detailedBag || []);
  const [addingCategory, setAddingCategory] = useState<ClubCategory | null>(null);
  
  // New Club Form State
  const [newClubBrand, setNewClubBrand] = useState('');
  const [newClubModel, setNewClubModel] = useState('');
  const [newClubSpec1, setNewClubSpec1] = useState('');
  const [newClubSpec2, setNewClubSpec2] = useState('');

  useEffect(() => {
    if (!latestLessonBodyAnalysis || formData.memberBodyAnalysis) return;
    setFormData(prev => ({
      ...prev,
      memberBodyAnalysis: latestLessonBodyAnalysis,
    }));
  }, [latestLessonBodyAnalysis, formData.memberBodyAnalysis]);

  // Initialize Experience from golfStartDate if available
  useEffect(() => {
    if (formData.golfStartDate) {
        const start = new Date(formData.golfStartDate);
        const now = new Date();
        
        let months = (now.getFullYear() - start.getFullYear()) * 12;
        months -= start.getMonth();
        months += now.getMonth();
        
        // Calculate D-Day
        const diffTime = Math.abs(now.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        setDDay(diffDays);

        const years = Math.floor(months / 12);
        const remainingMonths = months % 12;

        setExpYears(years.toString());
        setExpMonths(remainingMonths.toString());
    } else if (formData.golfExperience) {
        // Fallback: try to parse legacy string "X년 Y개월"
        const yMatch = formData.golfExperience.match(/(\d+)년/);
        const mMatch = formData.golfExperience.match(/(\d+)개월/);
        if (yMatch) setExpYears(yMatch[1]);
        if (mMatch) setExpMonths(mMatch[1]);
    }
  }, []);

  // Calculate Statistics from Records
  const stats = useMemo(() => {
    const scores = allLessons
      .filter(l => l.recordType === 'SCORE' && typeof l.score === 'number')
      .map(l => l.score as number);

    if (scores.length === 0) return null;

    const total = scores.reduce((a, b) => a + b, 0);
    const average = total / scores.length;
    const min = Math.min(...scores);
    const calculatedHandicap = Math.max(0, Math.round(average - 72));

    return {
        average: average.toFixed(1),
        handicap: calculatedHandicap,
        best: min,
        count: scores.length
    };
  }, [allLessons]);

  // Auto-update Best Score if calculated from records is better
  useEffect(() => {
      if (stats && stats.best) {
          setFormData(prev => {
              if (!prev.bestScore || stats.best < prev.bestScore) {
                  return { ...prev, bestScore: stats.best };
              }
              return prev;
          });
      }
  }, [stats]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'handicap' || name === 'bestScore' ? (value ? Number(value) : undefined) : value
    }));
  };

  // Update golfStartDate when years/months inputs change
  const handleExperienceChange = (y: string, m: string) => {
      setExpYears(y);
      setExpMonths(m);
      
      const yearsVal = parseInt(y) || 0;
      const monthsVal = parseInt(m) || 0;
      
      if (yearsVal === 0 && monthsVal === 0) {
          setDDay(null);
          return;
      }

      const now = new Date();
      const startDate = new Date(now);
      startDate.setFullYear(now.getFullYear() - yearsVal);
      startDate.setMonth(now.getMonth() - monthsVal);
      
      const diffTime = Math.abs(now.getTime() - startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      setDDay(diffDays);

      setFormData(prev => ({
          ...prev,
          golfStartDate: startDate.toISOString().split('T')[0],
          golfExperience: `${yearsVal}년 ${monthsVal}개월` // Legacy support
      }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    // Attach detailedBag to formData
    const finalBodyAnalysis = formData.memberBodyAnalysis
      ? {
          ...formData.memberBodyAnalysis,
          swingType: inferSwingTypeFromBodyType(formData.memberBodyAnalysis.bodyType),
          structuralFactors: analyzeStructuralFactors(formData.memberBodyAnalysis.structuralInput),
          coachComment: formData.memberBodyAnalysis.coachComment?.trim() || undefined,
        }
      : undefined;
    const finalData = { ...formData, detailedBag: bagSpecs, memberBodyAnalysis: finalBodyAnalysis };

    // Simulate save delay
    setTimeout(() => {
        onSave(finalData);
        setIsSaving(false);
    }, 500);
  };

  // Coach Assignment Handlers
  // designatedCoach는 App.tsx에서 coachId 기반으로 자동 설정됨
  const handleCoachAssign = (coach: { id: string; name: string }) => {
      setFormData(prev => ({
          ...prev,
          coachId: coach.id
          // designatedCoach는 저장 시 자동으로 설정됨
      }));
  };

  const handleCoachRemove = () => {
      if (confirm(t('confirm_remove_coach'))) {
          setFormData(prev => ({
              ...prev,
              coachId: undefined
              // designatedCoach도 함께 제거됨
          }));
      }
  };

  // Club Management Functions
  const startAddClub = (category: ClubCategory) => {
      setAddingCategory(category);
      setNewClubBrand('');
      setNewClubModel('');
      setNewClubSpec1('');
      setNewClubSpec2('');
  };

  const cancelAddClub = () => {
      setAddingCategory(null);
  };

  const saveNewClub = () => {
      if (!addingCategory || !newClubBrand.trim()) return;

      const newClub: ClubSpec = {
          id: crypto.randomUUID(),
          category: addingCategory,
          brand: newClubBrand.trim(),
          model: newClubModel.trim(),
          spec1: newClubSpec1.trim(),
          spec2: newClubSpec2.trim()
      };

      setBagSpecs(prev => [...prev, newClub]);
      setAddingCategory(null);
  };

  const removeClub = (id: string) => {
      if (!confirm(t('confirm_delete_club'))) return;
      setBagSpecs(prev => prev.filter(c => c.id !== id));
  };

  const getSpecLabels = (category: ClubCategory) => {
      switch (category) {
          case 'DRIVER': return { s1: t('driver_spec1'), s2: t('driver_spec2') };
          case 'WOOD_UTIL': return { s1: t('wood_spec1'), s2: t('wood_spec2') };
          case 'IRON': return { s1: t('iron_spec1'), s2: t('iron_spec2') };
          case 'WEDGE': return { s1: t('wedge_spec1'), s2: t('wedge_spec2') };
          case 'PUTTER': return { s1: t('putter_spec1'), s2: t('putter_spec2') };
          default: return { s1: t('spec1_generic'), s2: t('spec2_generic') };
      }
  };

  const handleToggleBodyAnalysis = () => {
    setFormData(prev => {
      if (prev.memberBodyAnalysis) {
        return { ...prev, memberBodyAnalysis: undefined };
      }
      if (latestLessonBodyAnalysis) {
        return {
          ...prev,
          memberBodyAnalysis: latestLessonBodyAnalysis,
        };
      }
      const structuralInput: LessonStructuralMetricInput = {};
      const bodyType: LessonBodyType = '사각체형';
      return {
        ...prev,
        memberBodyAnalysis: {
          bodyType,
          swingType: inferSwingTypeFromBodyType(bodyType),
          structuralInput,
          structuralFactors: analyzeStructuralFactors(structuralInput),
        },
      };
    });
  };

  const handleBodyTypeChange = (nextBodyType: LessonBodyType) => {
    setFormData(prev => {
      const current = prev.memberBodyAnalysis;
      if (!current) return prev;
      return {
        ...prev,
        memberBodyAnalysis: {
          ...current,
          bodyType: nextBodyType,
          swingType: inferSwingTypeFromBodyType(nextBodyType),
          structuralFactors: analyzeStructuralFactors(current.structuralInput),
        },
      };
    });
  };

  const handleBodyMetricChange = (
    key: keyof LessonStructuralMetricInput,
    rawValue: string
  ) => {
    setFormData(prev => {
      const current = prev.memberBodyAnalysis;
      if (!current) return prev;
      const parsedValue = rawValue.trim() === '' ? undefined : Number(rawValue);
      if (parsedValue !== undefined && !Number.isFinite(parsedValue)) return prev;
      const structuralInput: LessonStructuralMetricInput = {
        ...current.structuralInput,
        [key]: parsedValue,
      };
      return {
        ...prev,
        memberBodyAnalysis: {
          ...current,
          structuralInput,
          structuralFactors: analyzeStructuralFactors(structuralInput),
        },
      };
    });
  };

  const handleBodyCommentChange = (comment: string) => {
    setFormData(prev => {
      const current = prev.memberBodyAnalysis;
      if (!current) return prev;
      return {
        ...prev,
        memberBodyAnalysis: {
          ...current,
          coachComment: comment,
        },
      };
    });
  };

  const handleBodyPhotoChange = (type: 'front' | 'side', files: FileList | null) => {
    const file = files?.[0] || null;
    if (type === 'front') {
      setFrontBodyPhoto(file);
      return;
    }
    setSideBodyPhoto(file);
  };

  const handleAutoBodyPhotoAnalysis = async () => {
    if (!frontBodyPhoto || !sideBodyPhoto) {
      setBodyPhotoAnalysisError('정면/측면 전신 사진을 모두 선택해 주세요.');
      return;
    }

    setBodyPhotoAnalysisError(null);
    setIsAnalyzingBodyPhoto(true);
    try {
      const result = await analyzeBodyPhotos({
        frontImage: {
          data: frontBodyPhoto,
          mimeType: frontBodyPhoto.type || 'image/jpeg',
        },
        sideImage: {
          data: sideBodyPhoto,
          mimeType: sideBodyPhoto.type || 'image/jpeg',
        },
      });

      setFormData(prev => {
        const structuralInput: LessonStructuralMetricInput = {
          ...result.structuralInput,
        };
        return {
          ...prev,
          memberBodyAnalysis: {
            bodyType: result.bodyType,
            swingType: inferSwingTypeFromBodyType(result.bodyType),
            structuralInput,
            structuralFactors: analyzeStructuralFactors(structuralInput),
            coachComment: result.coachComment,
          },
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '신체 사진 자동 분석에 실패했습니다.';
      setBodyPhotoAnalysisError(message);
    } finally {
      setIsAnalyzingBodyPhoto(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="pl-0">
          <ArrowLeft className="w-5 h-5 mr-1" /> {t('back')}
        </Button>
        <h2 className="text-lg font-bold text-gray-900">{t('my_profile_title')}</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Golf Profile Section */}
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-600" /> {t('golf_profile_section')}
            </h3>

            {/* Auto Calculation Badge */}
            {stats && (
                <div className="mb-4 bg-indigo-50 border border-indigo-100 p-3 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div>
                        <div className="text-xs font-bold text-indigo-800 mb-0.5 flex items-center gap-1">
                            <Activity className="w-3 h-3" /> {t('stats_based_analysis').replace('{n}', String(stats.count))}
                        </div>
                        <div className="text-xs text-indigo-600">
                            평균 스코어: <strong>{stats.average}</strong> / 추정 핸디캡: <strong>{stats.handicap}</strong>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                {/* Golf Experience */}
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 flex items-center justify-between">
                        <span className="flex items-center gap-1"><CalendarClock className="w-3 h-3" /> {t('golf_experience_label')}</span>
                        {dDay !== null && (
                            <span className="text-emerald-600 font-extrabold text-xs bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                D+{dDay.toLocaleString()}일
                            </span>
                        )}
                    </label>
                    <div className="flex gap-3">
                        <div className="flex-1 relative">
                            <input
                                type="number"
                                value={expYears}
                                onChange={(e) => handleExperienceChange(e.target.value, expMonths)}
                                placeholder="0"
                                min="0"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-700 focus:border-emerald-700 outline-none text-right pr-8"
                            />
                            <span className="absolute right-3 top-2.5 text-gray-400 text-sm">{t('exp_years_unit')}</span>
                        </div>
                        <div className="flex-1 relative">
                             <input
                                type="number"
                                value={expMonths}
                                onChange={(e) => handleExperienceChange(expYears, e.target.value)}
                                placeholder="0"
                                min="0"
                                max="11"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-700 focus:border-emerald-700 outline-none text-right pr-8"
                            />
                            <span className="absolute right-3 top-2.5 text-gray-400 text-sm">{t('exp_months_unit')}</span>
                        </div>
                    </div>
                </div>
                
                <div className="w-full">
                    <label className="block text-xs font-bold text-gray-500 mb-1">{t('handicap_label')}</label>
                    <input
                        type="number"
                        name="handicap"
                        value={formData.handicap || ''}
                        onChange={handleChange}
                        placeholder="예: 18"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-700 focus:border-emerald-700 outline-none transition-all"
                    />
                </div>

                <div className="w-full">
                    <label className="block text-xs font-bold text-gray-500 mb-1 flex items-center justify-between">
                        <span>{t('best_score_label')}</span>
                        {stats && stats.best < (formData.bestScore || 999) && (
                            <span className="text-[10px] text-indigo-600 font-normal">
                                *기록 기준 최저타: {stats.best} (자동 반영됨)
                            </span>
                        )}
                    </label>
                    <input
                        type="number"
                        name="bestScore"
                        value={formData.bestScore || ''}
                        onChange={handleChange}
                        placeholder="예: 85"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-700 focus:border-emerald-700 outline-none transition-all font-bold text-gray-900"
                    />
                </div>
                
                {/* Designated Coach Section (New Component Integration) */}
                <div className="mt-4">
                    <CoachSearch 
                        onAssign={handleCoachAssign}
                        onRemove={handleCoachRemove}
                        assignedCoachName={formData.designatedCoach || (formData.coachId ? '코치 지정됨' : undefined)}
                        onSearch={onSearchCoach}
                    />
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-100 space-y-4">
                <div
                  onClick={handleToggleBodyAnalysis}
                  className={`rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3 p-3 ${
                    formData.memberBodyAnalysis
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <ScanLine className={`w-5 h-5 ${formData.memberBodyAnalysis ? 'text-emerald-700' : 'text-gray-400'}`} />
                  <div>
                    <h4 className="font-bold text-sm text-gray-900">{t('profile_body_analysis_title')}</h4>
                    <p className="text-xs text-gray-500">{t('profile_body_analysis_desc')}</p>
                  </div>
                  {formData.memberBodyAnalysis && (
                    <span className="ml-auto text-xs font-bold text-emerald-700">ON</span>
                  )}
                </div>

                {formData.memberBodyAnalysis && (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 space-y-2">
                      <p className="text-xs font-bold text-emerald-800">정면/측면 사진 자동 분석</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="text-xs text-gray-700 space-y-1 block">
                          <span className="font-semibold">정면 전신</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => handleBodyPhotoChange('front', e.target.files)}
                            className="block w-full text-xs"
                          />
                        </label>
                        <label className="text-xs text-gray-700 space-y-1 block">
                          <span className="font-semibold">측면 전신</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => handleBodyPhotoChange('side', e.target.files)}
                            className="block w-full text-xs"
                          />
                        </label>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleAutoBodyPhotoAnalysis}
                        disabled={isAnalyzingBodyPhoto}
                        className="w-full justify-center"
                      >
                        {isAnalyzingBodyPhoto ? '자동 분석 중...' : '사진으로 자동 분석'}
                      </Button>
                      {bodyPhotoAnalysisError && (
                        <p className="text-xs text-red-600">{bodyPhotoAnalysisError}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1">{t('profile_body_type_label')}</label>
                      <select
                        value={formData.memberBodyAnalysis.bodyType}
                        onChange={(e) => handleBodyTypeChange(e.target.value as LessonBodyType)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-700 outline-none"
                      >
                        {BODY_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        {t('profile_recommended_swing_type')} <span className="font-bold text-emerald-700">{formData.memberBodyAnalysis.swingType}</span>
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        value={formData.memberBodyAnalysis.structuralInput.frontAxisTiltDeg ?? ''}
                        onChange={(e) => handleBodyMetricChange('frontAxisTiltDeg', e.target.value)}
                        type="number"
                        step="0.1"
                        placeholder={t('profile_body_front_axis_placeholder')}
                        className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-700 outline-none"
                      />
                      <input
                        value={formData.memberBodyAnalysis.structuralInput.headTiltDeg ?? ''}
                        onChange={(e) => handleBodyMetricChange('headTiltDeg', e.target.value)}
                        type="number"
                        step="0.1"
                        placeholder={t('profile_body_head_placeholder')}
                        className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-700 outline-none"
                      />
                      <input
                        value={formData.memberBodyAnalysis.structuralInput.shoulderTiltDeg ?? ''}
                        onChange={(e) => handleBodyMetricChange('shoulderTiltDeg', e.target.value)}
                        type="number"
                        step="0.1"
                        placeholder={t('profile_body_shoulder_placeholder')}
                        className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-700 outline-none"
                      />
                      <input
                        value={formData.memberBodyAnalysis.structuralInput.pelvisTiltDeg ?? ''}
                        onChange={(e) => handleBodyMetricChange('pelvisTiltDeg', e.target.value)}
                        type="number"
                        step="0.1"
                        placeholder={t('profile_body_pelvis_placeholder')}
                        className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-700 outline-none"
                      />
                      <input
                        value={formData.memberBodyAnalysis.structuralInput.kneeTiltDeg ?? ''}
                        onChange={(e) => handleBodyMetricChange('kneeTiltDeg', e.target.value)}
                        type="number"
                        step="0.1"
                        placeholder={t('profile_body_knee_placeholder')}
                        className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-700 outline-none sm:col-span-2"
                      />
                    </div>

                    <textarea
                      value={formData.memberBodyAnalysis.coachComment || ''}
                      onChange={(e) => handleBodyCommentChange(e.target.value)}
                      rows={2}
                      placeholder={t('profile_body_comment_placeholder')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-700 outline-none resize-none"
                    />
                  </div>
                )}
            </div>

            {/* Club Composition Section */}
            <div className="mt-8 pt-6 border-t border-gray-100">
                <label className="block text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-emerald-600" /> {t('club_bag_section')}
                </label>

                <div className="space-y-4">
                    {CLUB_CATEGORIES.map(category => {
                        const clubs = bagSpecs.filter(c => c.category === category.id);
                        const isAdding = addingCategory === category.id;
                        const labels = getSpecLabels(category.id);

                        return (
                            <div key={category.id} className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                                <div className="bg-gray-100 px-4 py-3 flex justify-between items-center">
                                    <h4 className="font-bold text-gray-700 text-sm flex items-center gap-2">
                                        <span>{category.icon}</span> {category.label}
                                    </h4>
                                    <button 
                                        type="button" 
                                        onClick={() => startAddClub(category.id)}
                                        className="text-emerald-600 hover:text-emerald-800 p-1 bg-white rounded-full shadow-sm hover:shadow transition-all"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                                
                                <div className="p-4 space-y-3">
                                    {clubs.length === 0 && !isAdding && (
                                        <p className="text-xs text-gray-400 text-center italic py-2">{t('no_clubs_registered')}</p>
                                    )}

                                    {/* Existing Clubs List */}
                                    {clubs.map(club => (
                                        <div key={club.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex justify-between items-start">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-bold text-gray-900 text-sm">{club.brand}</span>
                                                    <span className="text-gray-600 text-sm">{club.model}</span>
                                                </div>
                                                <div className="flex gap-3 text-xs text-gray-500">
                                                    {(club.spec1 || club.spec2) ? (
                                                        <>
                                                            {club.spec1 && <span className="bg-gray-100 px-1.5 py-0.5 rounded">{club.spec1}</span>}
                                                            {club.spec2 && <span className="bg-gray-100 px-1.5 py-0.5 rounded">{club.spec2}</span>}
                                                        </>
                                                    ) : (
                                                        <span className="opacity-50">상세 스펙 없음</span>
                                                    )}
                                                </div>
                                            </div>
                                            <button 
                                                type="button" 
                                                onClick={() => removeClub(club.id)}
                                                className="text-gray-300 hover:text-red-500 p-1"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}

                                    {/* Add New Club Form */}
                                    {isAdding && (
                                        <div className="bg-white p-4 rounded-lg border-2 border-emerald-100 shadow-sm animate-fade-in space-y-3">
                                            <div className="grid grid-cols-2 gap-2">
                                                <input 
                                                    type="text" 
                                                    placeholder={t('club_brand_placeholder')} 
                                                    value={newClubBrand} 
                                                    onChange={(e) => setNewClubBrand(e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-emerald-700 outline-none"
                                                    autoFocus
                                                />
                                                <input 
                                                    type="text" 
                                                    placeholder={t('club_model_placeholder')} 
                                                    value={newClubModel} 
                                                    onChange={(e) => setNewClubModel(e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-emerald-700 outline-none"
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <input 
                                                    type="text" 
                                                    placeholder={labels.s1} 
                                                    value={newClubSpec1} 
                                                    onChange={(e) => setNewClubSpec1(e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-emerald-700 outline-none"
                                                />
                                                <input 
                                                    type="text" 
                                                    placeholder={labels.s2} 
                                                    value={newClubSpec2} 
                                                    onChange={(e) => setNewClubSpec2(e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-emerald-700 outline-none"
                                                />
                                            </div>
                                            <div className="flex gap-2 justify-end pt-1">
                                                <button 
                                                    type="button" 
                                                    onClick={cancelAddClub}
                                                    className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded"
                                                >
                                                    {t('cancel')}
                                                </button>
                                                <button 
                                                    type="button" 
                                                    onClick={saveNewClub}
                                                    className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded"
                                                >
                                                    {t('save')}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

             <div className="mt-4">
                <label className="block text-xs font-bold text-gray-500 mb-1">{t('bio_label')}</label>
                <textarea
                    name="memo"
                    value={formData.memo || ''}
                    onChange={handleChange}
                    placeholder="올해 목표: 깨백하기, 드라이버 비거리 200m 만들기 등"
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-700 focus:border-emerald-700 outline-none transition-all"
                />
            </div>
        </div>

        {/* Account Settings */}
        <div className="pt-6 border-t border-gray-100">
            <label className="block text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-emerald-600" /> {t('phone')}
            </label>
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                 <label className="block text-xs font-bold text-gray-500 mb-1">{t('phone')}</label>
                 <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-700 focus:border-emerald-700 outline-none"
                 />
                 <p className="text-[10px] text-gray-500 mt-2 flex items-start gap-1">
                    <AlertCircle className="w-3 h-3 text-emerald-600 flex-shrink-0 mt-0.5" /> 
                    <span>전화번호는 로그인 아이디로 사용되므로, 변경 시 로그인 정보가 바뀝니다.</span>
                 </p>
            </div>
        </div>

        <div className="pt-4">
            <Button type="submit" className="w-full py-3 text-lg" icon={<Save className="w-5 h-5" />} isLoading={isSaving}>
                {t('save')}
            </Button>
        </div>
      </form>
    </div>
  );
};
