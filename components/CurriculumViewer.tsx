import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, ChevronLeft, ChevronRight, CheckCircle,
  Clock, FileText, X, ClipboardList,
} from 'lucide-react';
import type {
  Curriculum, CurriculumPart, StudentCurriculumProgress,
  PartProgressItem, PartLessonRecord, PartStatus,
} from '../types/curriculum';
import { getCurriculum, getCurriculumProgress, setPartStatus, listPartLessonRecords } from '../services/curriculumService';
import { PartLessonRecordForm } from './PartLessonRecordForm';

interface CurriculumViewerProps {
  curriculumId: string;
  studentId: string;
  studentName: string;
  coachMode?: boolean;
  existingLessons?: { id: string; title: string; date: string }[];
  onClose: () => void;
  onCreateLessonRecord?: (data: Omit<PartLessonRecord, 'id' | 'coachId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
}

type PartView = 'content' | 'lesson-record';

export const CurriculumViewer: React.FC<CurriculumViewerProps> = ({
  curriculumId,
  studentId,
  studentName,
  coachMode = false,
  existingLessons = [],
  onClose,
  onCreateLessonRecord,
}) => {
  const [curriculum, setCurriculum] = useState<(Curriculum & { parts: CurriculumPart[] }) | null>(null);
  const [progress, setProgress] = useState<StudentCurriculumProgress | null>(null);
  const [selectedPart, setSelectedPart] = useState<CurriculumPart | null>(null);
  const [partView, setPartView] = useState<PartView>('content');
  const [loading, setLoading] = useState(true);
  const [lessonRecords, setLessonRecords] = useState<PartLessonRecord[]>([]);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [cur, progressList] = await Promise.all([
        getCurriculum(curriculumId),
        getCurriculumProgress(curriculumId),
      ]);
      setCurriculum(cur);
      const myProgress = progressList.find((p) => p.studentId === studentId) ?? null;
      setProgress(myProgress);
      setSelectedPart((prev) => prev ?? (cur.parts.length > 0 ? cur.parts[0] : null));
    } catch (e) {
      console.error('[CurriculumViewer] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [curriculumId, studentId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (selectedPart) {
      listPartLessonRecords({ partId: selectedPart.id, studentId }).then(setLessonRecords).catch(() => {});
    }
  }, [selectedPart, studentId]);

  function getPartProgress(partKey: string): PartProgressItem | null {
    return progress?.partProgress?.[partKey] ?? null;
  }

  function getStatusIcon(partKey: string) {
    const p = getPartProgress(partKey);
    if (p?.status === 'completed') return <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />;
    if (p?.status === 'in_progress') return <Clock className="w-4 h-4 text-yellow-400 shrink-0" />;
    return <div className="w-4 h-4 rounded-full border border-slate-600 shrink-0" />;
  }

  async function handleSetStatus(status: PartStatus) {
    if (!selectedPart) return;
    setUpdatingStatus(true);
    try {
      await setPartStatus(curriculumId, studentId, selectedPart.partKey, status);
      await loadData();
    } catch (e) {
      console.error('[CurriculumViewer] set status error:', e);
      alert(`상태 변경에 실패했습니다.\n(${e instanceof Error ? e.message : '알 수 없는 오류'})`);
    } finally {
      setUpdatingStatus(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-400 text-sm">커리큘럼 불러오는 중...</div>
      </div>
    );
  }

  if (!curriculum) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <BookOpen className="w-8 h-8 text-slate-600" />
        <p className="text-slate-400 text-sm">커리큘럼을 불러올 수 없습니다.</p>
        <button onClick={onClose} className="text-indigo-400 text-sm hover:underline">돌아가기</button>
      </div>
    );
  }

  const parts = curriculum.parts ?? [];
  const currentIndex = selectedPart ? parts.findIndex((p) => p.id === selectedPart.id) : 0;
  const partProgress = selectedPart ? getPartProgress(selectedPart.partKey) : null;
  const isCompleted = partProgress?.status === 'completed';

  const completedCount = progress ? Object.values(progress.partProgress).filter((p) => p.status === 'completed').length : 0;
  const overallProgress = parts.length > 0 ? Math.round((completedCount / parts.length) * 100) : 0;

  return (
    <div className="flex flex-col md:flex-row gap-4 min-h-[600px]">
      {/* Sidebar — part list */}
      <div className="w-full md:w-72 shrink-0 bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-4">
        {/* Curriculum header */}
        <div>
          <button onClick={onClose} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 mb-3 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" />
            목록으로
          </button>
          <h2 className="text-sm font-bold text-slate-100 leading-snug">{curriculum.title}</h2>
          <div className="mt-2 space-y-1">
            <div className="flex justify-between text-xs text-slate-500">
              <span>전체 진도</span>
              <span className="text-indigo-300 font-semibold">{overallProgress}%</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
            <div className="text-xs text-slate-500">{completedCount}/{parts.length} 파트 완료</div>
          </div>
        </div>

        {/* Part list */}
        <div className="space-y-1 overflow-y-auto max-h-[500px] pr-1">
          {parts.map((part) => {
            const isSelected = selectedPart?.id === part.id;
            return (
              <button
                key={part.id}
                onClick={() => { setSelectedPart(part); setPartView('content'); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-indigo-600/20 border border-indigo-500/40 text-indigo-200'
                    : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {getStatusIcon(part.partKey)}
                <span className="truncate">{part.order}. {part.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 min-w-0 space-y-4">
        {selectedPart ? (
          <>
            {/* Part header */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-indigo-400/80 font-semibold uppercase tracking-wider mb-1">
                    PART {selectedPart.order}
                  </div>
                  <h3 className="text-lg font-bold text-slate-100 leading-snug">{selectedPart.title}</h3>
                </div>
                {isCompleted && (
                  <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-1.5 shrink-0">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-300">완료</span>
                  </div>
                )}
              </div>

              {/* Tab nav */}
              <div className="flex items-center justify-between mt-4 gap-2 flex-wrap">
                <div className="flex gap-1">
                  {[
                    { key: 'content', label: '학습', icon: <BookOpen className="w-3.5 h-3.5" /> },
                    ...(coachMode ? [{ key: 'lesson-record', label: '레슨 기록', icon: <ClipboardList className="w-3.5 h-3.5" /> }] : []),
                  ].map(({ key, label, icon }) => (
                    <button
                      key={key}
                      onClick={() => setPartView(key as PartView)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        partView === key
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>

                {coachMode && (
                  <button
                    onClick={() => handleSetStatus(isCompleted ? 'in_progress' : 'completed')}
                    disabled={updatingStatus}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${
                      isCompleted
                        ? 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700'
                        : 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30'
                    }`}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    {isCompleted ? '완료 취소' : '완료 처리'}
                  </button>
                )}
              </div>
            </div>

            {/* Content */}
            {partView === 'content' && (
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-5">
                {/* Markdown-rendered content */}
                <div
                  className="prose prose-invert prose-sm max-w-none prose-headings:text-slate-100 prose-p:text-slate-300 prose-li:text-slate-300 prose-strong:text-slate-100 prose-blockquote:border-indigo-500 prose-blockquote:text-slate-400"
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(selectedPart.content ?? ''),
                  }}
                />

                {/* Key points checklist */}
                {(selectedPart.keyPoints ?? []).length > 0 && (
                  <div className="border-t border-slate-800 pt-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-indigo-400" />
                      <h4 className="text-sm font-bold text-slate-200">핵심 포인트</h4>
                    </div>
                    <ul className="space-y-2">
                      {(selectedPart.keyPoints ?? []).map((point, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-slate-300">
                          <span className="mt-0.5 w-5 h-5 rounded-full bg-indigo-600/20 text-indigo-300 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {i + 1}
                          </span>
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Nav buttons */}
                <div className="border-t border-slate-800 pt-4 flex justify-between">
                  {currentIndex > 0 ? (
                    <button
                      onClick={() => { setSelectedPart(parts[currentIndex - 1]); setPartView('content'); }}
                      className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      이전 파트
                    </button>
                  ) : <div />}
                  {currentIndex < parts.length - 1 && (
                    <button
                      onClick={() => { setSelectedPart(parts[currentIndex + 1]); setPartView('content'); }}
                      className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      다음 파트
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {partView === 'lesson-record' && coachMode && (
              <div className="space-y-4">
                <PartLessonRecordForm
                  part={selectedPart}
                  studentId={studentId}
                  studentName={studentName}
                  existingRecord={lessonRecords[0]}
                  existingLessons={existingLessons}
                  onSave={async (data) => {
                    if (onCreateLessonRecord) await onCreateLessonRecord(data);
                    const updated = await listPartLessonRecords({ partId: selectedPart.id, studentId });
                    setLessonRecords(updated);
                    await loadData();
                  }}
                  onClose={() => setPartView('content')}
                />

                {lessonRecords.length > 1 && (
                  <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
                    <h4 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-500" />
                      이전 레슨 기록 ({lessonRecords.length - 1}개)
                    </h4>
                    {lessonRecords.slice(1).map((record) => (
                      <div key={record.id} className="bg-slate-800/50 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">{record.lessonDate}</span>
                          <span className="text-xs text-emerald-400">
                            {record.checklist.filter((c) => c.checked).length}/{record.checklist.length} 체크
                          </span>
                        </div>
                        {record.textMemo && (
                          <p className="text-xs text-slate-300 line-clamp-2">{record.textMemo}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center py-20 bg-slate-900/70 border border-slate-800 rounded-2xl">
            <div className="text-center space-y-2">
              <BookOpen className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-slate-400 text-sm">파트를 선택하세요</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Simple markdown renderer for the content
function renderMarkdown(text: string): string {
  return text
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-bold text-slate-100 mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-slate-100 mt-5 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-slate-100 mt-6 mb-3">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-100 font-semibold">$1</strong>')
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-indigo-500 pl-4 py-1 my-3 text-slate-400 italic bg-indigo-950/30 rounded-r-lg">$1</blockquote>')
    .replace(/^- \[ \] (.+)$/gm, '<li class="flex items-start gap-2 text-slate-300 my-1"><span class="mt-1 w-4 h-4 border border-slate-600 rounded flex-shrink-0 inline-block"></span><span>$1</span></li>')
    .replace(/^- (.+)$/gm, '<li class="text-slate-300 my-0.5 pl-4 list-disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="text-slate-300 my-0.5 pl-4 list-decimal">$1</li>')
    .replace(/\n\n/g, '</p><p class="text-slate-300 my-2">')
    .replace(/\n/g, '<br />');
}
