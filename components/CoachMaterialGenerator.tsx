import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Sparkles,
  Save,
  Trash2,
  BookOpen,
  Target,
  X,
  ChevronDown,
  ChevronUp,
  Globe,
  FileText,
} from 'lucide-react';
import { ClientProfile, Lesson, CoachMaterial, CoachMaterialType } from '../types';
import { Button } from './Button';
import { generateCoachMaterial } from '../services/geminiService';

interface CoachMaterialGeneratorProps {
  client: ClientProfile;
  lessons: Lesson[];
  coachId: string;
  materials: CoachMaterial[];
  onBack: () => void;
  onSaveMaterial: (material: CoachMaterial) => void;
  onDeleteMaterial: (materialId: string) => void;
}

const MATERIAL_TYPE_OPTIONS: { value: CoachMaterialType; label: string; desc: string }[] = [
  { value: 'LESSON_GUIDE', label: '레슨 가이드', desc: '레슨 흐름과 핵심 포인트 정리' },
  { value: 'DRILL_SHEET', label: '드릴 시트', desc: '구체적인 연습 드릴과 방법 정리' },
  { value: 'SWING_TIPS', label: '스윙 팁', desc: '스윙 교정 및 개선 포인트 모음' },
  { value: 'COURSE_STRATEGY', label: '코스 전략', desc: '라운드 전략 및 코스 운영법' },
  { value: 'CUSTOM', label: '커스텀 교재', desc: '자유롭게 작성하는 맞춤 교재' },
];

export const CoachMaterialGenerator: React.FC<CoachMaterialGeneratorProps> = ({
  client,
  lessons,
  coachId,
  materials,
  onBack,
  onSaveMaterial,
  onDeleteMaterial,
}) => {
  const clientId = `${client.name}_${client.phone}`;

  // ── Config form state ──────────────────────────────────────────────────────
  const [materialType, setMaterialType] = useState<CoachMaterialType>('LESSON_GUIDE');
  const [goal, setGoal] = useState('');
  const [formError, setFormError] = useState('');

  // ── Generation state ───────────────────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [editedContent, setEditedContent] = useState('');

  // ── Saved materials list ───────────────────────────────────────────────────
  const [expandedMaterialId, setExpandedMaterialId] = useState<string | null>(null);

  // Client's lessons (sorted newest first), limited to recent 8
  const clientLessons = useMemo(
    () =>
      lessons
        .filter(
          (l) => l.clientName === client.name && l.clientPhone === client.phone
        )
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 8),
    [lessons, client]
  );

  // Materials for this client (sorted newest first)
  const clientMaterials = useMemo(
    () =>
      materials
        .filter((m) => m.clientId === clientId)
        .sort((a, b) => b.createdAt - a.createdAt),
    [materials, clientId]
  );

  const selectedTypeLabel =
    MATERIAL_TYPE_OPTIONS.find((o) => o.value === materialType)?.label ?? '';

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!goal.trim()) {
      setFormError('목표 또는 요청 내용을 입력해주세요.');
      return;
    }
    setFormError('');
    setIsGenerating(true);
    setGeneratedContent('');
    setEditedContent('');

    try {
      const content = await generateCoachMaterial(
        client,
        clientLessons,
        materialType,
        goal
      );
      setGeneratedContent(content);
      setEditedContent(content);
    } catch (err) {
      console.error('Material generation error:', err);
      setFormError('교재 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = (status: 'draft' | 'published') => {
    if (!editedContent.trim()) return;

    // Extract a meaningful title from the first non-empty heading or line
    const titleLine = editedContent
      .split('\n')
      .map((line) => line.replace(/^#+\s*/, '').trim())
      .find((line) => line.length > 0);
    const title = titleLine || `${selectedTypeLabel} - ${client.name}`;

    const now = Date.now();
    const material: CoachMaterial = {
      id: `cm_${coachId}_${clientId}_${now}`,
      coachId,
      clientId,
      clientName: client.name,
      clientPhone: client.phone,
      title,
      type: materialType,
      content: editedContent,
      goal,
      status,
      lessonIds: clientLessons.map((l) => l.id),
      createdAt: now,
      updatedAt: now,
    };

    onSaveMaterial(material);
    setGeneratedContent('');
    setEditedContent('');
    setGoal('');
  };

  const handleDeleteMaterial = (materialId: string) => {
    if (confirm('이 교재를 삭제하시겠습니까?')) {
      onDeleteMaterial(materialId);
      if (expandedMaterialId === materialId) setExpandedMaterialId(null);
    }
  };

  const handleToggleStatus = (material: CoachMaterial) => {
    const newStatus = material.status === 'draft' ? 'published' : 'draft';
    onSaveMaterial({ ...material, status: newStatus, updatedAt: Date.now() });
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          onClick={onBack}
          className="pl-0"
          aria-label="뒤로가기"
        >
          <ArrowLeft className="w-5 h-5 mr-1" /> 돌아가기
        </Button>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-purple-600" />
            교재 생성
          </h2>
          <p className="text-sm text-gray-500">{client.name} 회원</p>
        </div>
      </div>

      {/* Lesson context info */}
      <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-sm text-purple-700">
        {clientLessons.length > 0 ? (
          <span>
            <span className="font-bold">{clientLessons.length}개</span> 레슨 기록을 기반으로 교재를 생성합니다.
          </span>
        ) : (
          <span className="text-orange-600">
            레슨 기록이 없습니다. 기본 템플릿으로 생성됩니다.
          </span>
        )}
      </div>

      {/* Config Form */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <Target className="w-4 h-4 text-purple-600" />
          교재 설정
        </h3>

        {/* Material Type */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">
            교재 유형
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {MATERIAL_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMaterialType(opt.value)}
                className={`text-left px-4 py-3 rounded-xl border-2 transition-all ${
                  materialType === opt.value
                    ? 'border-purple-500 bg-purple-50 text-purple-800'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-purple-300'
                }`}
              >
                <div className="font-semibold text-sm">{opt.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Goal */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">
            목표 / 요청 <span className="text-red-500">*</span>
          </label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={3}
            placeholder="예) 드라이버 슬라이스 교정 위주로, 숏게임 50m 이내 거리 감각 향상 등"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none resize-none text-sm"
          />
        </div>

        {formError && (
          <p className="text-red-500 text-sm flex items-center gap-1">
            <X className="w-4 h-4" /> {formError}
          </p>
        )}

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full bg-purple-600 hover:bg-purple-700 py-3 text-base justify-center"
          icon={<Sparkles className="w-5 h-5" />}
        >
          {isGenerating ? '교재 생성 중...' : '교재 생성하기'}
        </Button>
      </div>

      {/* Generated Content Editor */}
      {(generatedContent || isGenerating) && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <FileText className="w-4 h-4 text-purple-600" />
            생성된 교재 내용
            <span className="ml-auto text-xs font-normal text-gray-400">
              내용을 자유롭게 편집하세요
            </span>
          </h3>

          {isGenerating ? (
            <div className="flex items-center justify-center py-12 gap-3 text-purple-600">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600" />
              <span className="text-sm font-medium">AI가 교재를 작성하고 있습니다...</span>
            </div>
          ) : (
            <>
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                rows={20}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none resize-y text-sm font-mono"
              />
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => handleSave('draft')}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 justify-center"
                  icon={<Save className="w-4 h-4" />}
                >
                  초안으로 저장
                </Button>
                <Button
                  onClick={() => handleSave('published')}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 justify-center"
                  icon={<Globe className="w-4 h-4" />}
                >
                  저장하기 (회원 공개)
                </Button>
              </div>
              <p className="text-xs text-gray-400">
                * 회원 공개로 저장하면 해당 회원이 앱에서 교재를 확인할 수 있습니다.
              </p>
            </>
          )}
        </div>
      )}

      {/* Saved Materials List */}
      {clientMaterials.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-purple-600" />
            저장된 교재
            <span className="ml-auto text-xs font-normal text-gray-400">
              {clientMaterials.length}개
            </span>
          </h3>

          {clientMaterials.map((m) => (
            <div
              key={m.id}
              className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
            >
              <div
                className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() =>
                  setExpandedMaterialId(
                    expandedMaterialId === m.id ? null : m.id
                  )
                }
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        m.status === 'published'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {m.status === 'published' ? '공개' : '초안'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {MATERIAL_TYPE_OPTIONS.find((o) => o.value === m.type)?.label}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {m.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(m.createdAt).toLocaleDateString('ko-KR')}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleStatus(m);
                    }}
                    className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                      m.status === 'published'
                        ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                    }`}
                    title={m.status === 'published' ? '초안으로 변경' : '회원 공개'}
                  >
                    {m.status === 'published' ? '비공개' : '공개'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteMaterial(m.id);
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    aria-label="삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {expandedMaterialId === m.id ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              </div>

              {expandedMaterialId === m.id && (
                <div className="border-t border-gray-100 p-4 bg-gray-50">
                  <div className="text-xs text-gray-500 mb-2">
                    목표: {m.goal}
                  </div>
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
                    {m.content}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
