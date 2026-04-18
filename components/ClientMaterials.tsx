import React, { useState } from 'react';
import { ArrowLeft, BookOpen, ChevronRight, X } from 'lucide-react';
import { CoachMaterial, CoachMaterialType } from '../types';
import { Button } from './Button';

interface ClientMaterialsProps {
  clientId: string;
  materials: CoachMaterial[];
  onBack: () => void;
}

const MATERIAL_TYPE_LABELS: Record<CoachMaterialType, string> = {
  LESSON_GUIDE: '레슨 가이드',
  DRILL_SHEET: '드릴 시트',
  SWING_TIPS: '스윙 팁',
  COURSE_STRATEGY: '코스 전략',
  CUSTOM: '커스텀 교재',
};

const TYPE_COLORS: Record<CoachMaterialType, string> = {
  LESSON_GUIDE: 'bg-purple-100 text-purple-700',
  DRILL_SHEET: 'bg-blue-100 text-blue-700',
  SWING_TIPS: 'bg-emerald-100 text-emerald-700',
  COURSE_STRATEGY: 'bg-amber-100 text-amber-700',
  CUSTOM: 'bg-gray-100 text-gray-700',
};

export const ClientMaterials: React.FC<ClientMaterialsProps> = ({
  clientId,
  materials,
  onBack,
}) => {
  const [selectedMaterial, setSelectedMaterial] = useState<CoachMaterial | null>(null);

  // Only show published materials for this client
  const myMaterials = materials
    .filter((m) => m.clientId === clientId && m.status === 'published')
    .sort((a, b) => b.createdAt - a.createdAt);

  if (selectedMaterial) {
    return (
      <div className="space-y-4 animate-fade-in pb-12">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => setSelectedMaterial(null)}
            className="pl-0"
            aria-label="목록으로 돌아가기"
          >
            <ArrowLeft className="w-5 h-5 mr-1" /> 목록으로
          </Button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-3">
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                TYPE_COLORS[selectedMaterial.type]
              }`}
            >
              {MATERIAL_TYPE_LABELS[selectedMaterial.type]}
            </span>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">
            {selectedMaterial.title}
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            {new Date(selectedMaterial.createdAt).toLocaleDateString('ko-KR')}
          </p>
          {selectedMaterial.goal && (
            <div className="bg-purple-50 rounded-xl p-3 mb-4 text-sm text-purple-700">
              <span className="font-semibold">목표: </span>
              {selectedMaterial.goal}
            </div>
          )}
          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-sans">
            {selectedMaterial.content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={onBack} className="pl-0">
          <ArrowLeft className="w-5 h-5 mr-1" /> 돌아가기
        </Button>
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-purple-600" />
          코치 교재
        </h2>
      </div>

      {myMaterials.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">교재가 없습니다</h3>
          <p className="text-sm text-gray-500">
            코치가 교재를 작성하면 여기에 표시됩니다.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {myMaterials.map((m) => (
            <div
              key={m.id}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedMaterial(m)}
            >
              <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-5 h-5 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      TYPE_COLORS[m.type]
                    }`}
                  >
                    {MATERIAL_TYPE_LABELS[m.type]}
                  </span>
                </div>
                <p className="text-sm font-semibold text-gray-800 truncate">
                  {m.title}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(m.createdAt).toLocaleDateString('ko-KR')}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
