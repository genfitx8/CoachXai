import React, { useState } from 'react';
import { QuickLogEntry, QuickLogMood, PracticeArea } from '../types';
import { ChevronLeft, CheckCircle, Smile, Frown, Meh, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useLanguage } from './LanguageContext';

interface QuickGolfLogProps {
  clientId: string;
  coachId?: string;
  onSave: (entry: QuickLogEntry) => Promise<void>;
  onBack: () => void;
}

const MOOD_OPTIONS: { value: QuickLogMood; label: string; emoji: string; color: string }[] = [
  { value: 'GREAT', label: '최고', emoji: '😄', color: 'bg-emerald-100 border-emerald-400 text-emerald-700' },
  { value: 'GOOD', label: '좋음', emoji: '😊', color: 'bg-green-100 border-green-400 text-green-700' },
  { value: 'OKAY', label: '보통', emoji: '😐', color: 'bg-gray-100 border-gray-400 text-gray-700' },
  { value: 'BAD', label: '나쁨', emoji: '😕', color: 'bg-orange-100 border-orange-400 text-orange-700' },
  { value: 'TERRIBLE', label: '최악', emoji: '😞', color: 'bg-red-100 border-red-400 text-red-700' },
];

const AREA_OPTIONS: { value: PracticeArea; label: string }[] = [
  { value: 'DRIVER', label: '드라이버' },
  { value: 'IRON', label: '아이언' },
  { value: 'SHORT_GAME', label: '숏게임' },
  { value: 'PUTTING', label: '퍼팅' },
  { value: 'ROUND', label: '라운드' },
  { value: 'OTHER', label: '기타' },
];

const getLocalISODate = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const QuickGolfLog: React.FC<QuickGolfLogProps> = ({ clientId, coachId, onSave, onBack }) => {
  const { t } = useLanguage();
  const [mood, setMood] = useState<QuickLogMood>('OKAY');
  const [goodPoint, setGoodPoint] = useState('');
  const [problemPoint, setProblemPoint] = useState('');
  const [notes, setNotes] = useState('');
  const [practiceArea, setPracticeArea] = useState<PracticeArea | ''>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goodPoint.trim() || !problemPoint.trim()) return;

    setIsSaving(true);
    try {
      const now = Date.now();
      const entry: QuickLogEntry = {
        id: crypto.randomUUID(),
        clientId,
        ...(coachId ? { coachId } : {}),
        createdAt: now,
        updatedAt: now,
        logDate: getLocalISODate(),
        mood,
        goodPoint: goodPoint.trim(),
        problemPoint: problemPoint.trim(),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(practiceArea ? { practiceArea } : {}),
      };
      await onSave(entry);
      setSaved(true);
      setTimeout(() => {
        onBack();
      }, 1200);
    } catch (err) {
      console.error('Failed to save quick log:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 animate-fade-in">
        <div className="bg-emerald-100 p-5 rounded-full">
          <CheckCircle className="w-12 h-12 text-emerald-700" />
        </div>
        <p className="text-gray-800 font-bold text-lg">기록 완료! 🏌️</p>
        <p className="text-gray-500 text-sm">오늘의 기록이 저장되었습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
          aria-label="뒤로"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="w-1 h-6 bg-gradient-to-b from-emerald-700 to-teal-600 rounded-full" />
        <h2 className="text-xl font-black text-gray-900">오늘의 빠른 기록</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Mood */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm font-bold text-gray-700 mb-3">오늘 샷감은 어땠나요?</p>
          <div className="flex gap-2 justify-between">
            {MOOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMood(opt.value)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all ${
                  mood === opt.value
                    ? opt.color + ' scale-105 shadow-md'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                }`}
              >
                <span className="text-2xl">{opt.emoji}</span>
                <span className="text-[10px] font-bold">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Good Point */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <label className="flex items-center gap-2 text-sm font-bold text-emerald-700 mb-2">
            <ThumbsUp className="w-4 h-4" />
            오늘 잘된 점 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={goodPoint}
            onChange={(e) => setGoodPoint(e.target.value)}
            placeholder="예: 50m 웨지 컨트롤이 좋았다"
            className="w-full text-sm p-3 border border-gray-200 rounded-xl focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 outline-none transition-all"
            maxLength={100}
            required
          />
        </div>

        {/* Problem Point */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <label className="flex items-center gap-2 text-sm font-bold text-orange-600 mb-2">
            <ThumbsDown className="w-4 h-4" />
            개선이 필요한 점 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={problemPoint}
            onChange={(e) => setProblemPoint(e.target.value)}
            placeholder="예: 드라이버 슬라이스가 심했다"
            className="w-full text-sm p-3 border border-gray-200 rounded-xl focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 outline-none transition-all"
            maxLength={100}
            required
          />
        </div>

        {/* Practice Area */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm font-bold text-gray-700 mb-3">오늘 주로 연습한 영역 (선택)</p>
          <div className="flex flex-wrap gap-2">
            {AREA_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPracticeArea(practiceArea === opt.value ? '' : opt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                  practiceArea === opt.value
                    ? 'bg-emerald-700 border-emerald-700 text-white shadow-md'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-emerald-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <label className="text-sm font-bold text-gray-700 mb-2 block">추가 메모 (선택)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="오늘 기억하고 싶은 것을 자유롭게 적어주세요"
            rows={3}
            className="w-full text-sm p-3 border border-gray-200 rounded-xl focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 outline-none transition-all resize-none"
            maxLength={300}
          />
          <p className="text-[10px] text-gray-400 text-right mt-1">{notes.length}/300</p>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSaving || !goodPoint.trim() || !problemPoint.trim()}
          className="w-full bg-gradient-to-r from-emerald-700 to-teal-600 hover:from-emerald-800 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl px-8 py-4 shadow-lg font-black text-base transition-all transform hover:scale-[1.02] active:scale-[0.98]"
        >
          {isSaving ? '저장 중...' : '기록 저장하기 ✓'}
        </button>
      </form>
    </div>
  );
};
