import React, { useState, useEffect } from 'react';
import { Save, X, Link2, Plus, Trash2, CheckSquare, Square } from 'lucide-react';
import type { ChapterLessonRecord, ChapterChecklistItem } from '../types/textbook';
import type { TextbookChapter } from '../types/textbook';

interface ChapterLessonRecordFormProps {
  chapter: TextbookChapter;
  studentId: string;
  studentName: string;
  existingRecord?: ChapterLessonRecord;
  existingLessons?: { id: string; title: string; date: string }[];
  onSave: (data: Omit<ChapterLessonRecord, 'id' | 'coachId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onClose: () => void;
}

export const ChapterLessonRecordForm: React.FC<ChapterLessonRecordFormProps> = ({
  chapter,
  studentId,
  studentName,
  existingRecord,
  existingLessons = [],
  onSave,
  onClose,
}) => {
  const [lessonDate, setLessonDate] = useState(
    existingRecord?.lessonDate ?? new Date().toISOString().slice(0, 10)
  );
  const [textMemo, setTextMemo] = useState(existingRecord?.textMemo ?? '');
  const [checklist, setChecklist] = useState<ChapterChecklistItem[]>(
    existingRecord?.checklist ??
    (chapter.keyPoints ?? []).map((text) => ({ text, checked: false }))
  );
  const [linkedLessonId, setLinkedLessonId] = useState(existingRecord?.linkedLessonId ?? '');
  const [coachFeedback, setCoachFeedback] = useState(existingRecord?.coachFeedback ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!existingRecord && chapter.keyPoints?.length) {
      setChecklist(chapter.keyPoints.map((text) => ({ text, checked: false })));
    }
  }, [chapter.keyPoints, existingRecord]);

  function toggleCheck(index: number) {
    setChecklist((prev) =>
      prev.map((item, i) => i === index ? { ...item, checked: !item.checked } : item)
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        chapterId: chapter.id,
        textbookId: chapter.textbookId,
        studentId,
        studentName,
        lessonDate,
        textMemo,
        mediaFiles: existingRecord?.mediaFiles ?? [],
        checklist,
        linkedLessonId: linkedLessonId || undefined,
        coachFeedback: coachFeedback || undefined,
      });
      onClose();
    } catch (e) {
      console.error('[ChapterLessonRecordForm] save error:', e);
    } finally {
      setSaving(false);
    }
  }

  const checkedCount = checklist.filter((c) => c.checked).length;

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
        <div>
          <h3 className="text-base font-bold text-slate-100">레슨 기록</h3>
          <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[240px]">{chapter.title}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
        {/* Date */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">레슨 날짜</label>
          <input
            type="date"
            value={lessonDate}
            onChange={(e) => setLessonDate(e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Text Memo */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">코치 메모</label>
          <textarea
            value={textMemo}
            onChange={(e) => setTextMemo(e.target.value)}
            placeholder="오늘 레슨에서 집중한 내용, 학생의 반응, 다음 레슨 포인트..."
            rows={5}
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-indigo-500 resize-none placeholder-slate-600"
          />
        </div>

        {/* Checklist */}
        {checklist.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">핵심 포인트 체크</label>
              <span className="text-xs text-indigo-300 font-medium">
                {checkedCount}/{checklist.length} 완료
              </span>
            </div>
            <div className="space-y-2">
              {checklist.map((item, i) => (
                <button
                  key={i}
                  onClick={() => toggleCheck(i)}
                  className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                    item.checked
                      ? 'border-emerald-700/50 bg-emerald-900/10 text-emerald-300'
                      : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {item.checked
                    ? <CheckSquare className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                    : <Square className="w-4 h-4 shrink-0 text-slate-500 mt-0.5" />
                  }
                  <span className="text-sm">{item.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Link existing lesson */}
        {existingLessons.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" />
              기존 레슨 기록 연결
            </label>
            <select
              value={linkedLessonId}
              onChange={(e) => setLinkedLessonId(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="">— 연결 안 함 —</option>
              {existingLessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.date} · {l.title}
                </option>
              ))}
            </select>
            {linkedLessonId && (
              <button
                onClick={() => setLinkedLessonId('')}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                연결 해제
              </button>
            )}
          </div>
        )}

        {/* Coach Feedback */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">학생에게 남기는 피드백</label>
          <textarea
            value={coachFeedback}
            onChange={(e) => setCoachFeedback(e.target.value)}
            placeholder="학생이 볼 수 있는 피드백과 다음 훈련 과제..."
            rows={3}
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-indigo-500 resize-none placeholder-slate-600"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-800 flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors text-sm font-medium"
        >
          취소
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-sm transition-colors flex items-center justify-center gap-1.5"
        >
          <Save className="w-4 h-4" />
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  );
};
