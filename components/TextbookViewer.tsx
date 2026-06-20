import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, ChevronLeft, ChevronRight, CheckCircle,
  Clock, Trophy, FileText, Layers, X, ClipboardList,
} from 'lucide-react';
import type { Textbook, TextbookChapter, StudentTextbookProgress, ChapterProgressItem, QuizAnswer, ChapterLessonRecord } from '../types/textbook';
import { getTextbook, getTextbookProgress, submitQuizAttempt, listLessonRecords } from '../services/textbookService';
import { QuizPlayer } from './QuizPlayer';
import { ChapterLessonRecordForm } from './ChapterLessonRecordForm';

interface TextbookViewerProps {
  textbookId: string;
  studentId: string;
  studentName: string;
  coachMode?: boolean;
  existingLessons?: { id: string; title: string; date: string }[];
  onClose: () => void;
  onCreateLessonRecord?: (data: Omit<ChapterLessonRecord, 'id' | 'coachId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
}

type ChapterView = 'content' | 'quiz' | 'lesson-record';

export const TextbookViewer: React.FC<TextbookViewerProps> = ({
  textbookId,
  studentId,
  studentName,
  coachMode = false,
  existingLessons = [],
  onClose,
  onCreateLessonRecord,
}) => {
  const [textbook, setTextbook] = useState<(Textbook & { chapters: TextbookChapter[] }) | null>(null);
  const [progress, setProgress] = useState<StudentTextbookProgress | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<TextbookChapter | null>(null);
  const [chapterView, setChapterView] = useState<ChapterView>('content');
  const [loading, setLoading] = useState(true);
  const [lessonRecords, setLessonRecords] = useState<ChapterLessonRecord[]>([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [tb, progressList] = await Promise.all([
        getTextbook(textbookId),
        getTextbookProgress(textbookId),
      ]);
      setTextbook(tb);
      const myProgress = progressList.find((p) => p.studentId === studentId) ?? null;
      setProgress(myProgress);
      if (tb.chapters.length > 0 && !selectedChapter) {
        setSelectedChapter(tb.chapters[0]);
      }
    } catch (e) {
      console.error('[TextbookViewer] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [textbookId, studentId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (selectedChapter) {
      listLessonRecords({ chapterId: selectedChapter.id, studentId }).then(setLessonRecords).catch(() => {});
    }
  }, [selectedChapter, studentId]);

  function getChapterProgress(chapterId: string): ChapterProgressItem | null {
    return progress?.chapterProgress?.[chapterId] ?? null;
  }

  function getStatusIcon(chapterId: string) {
    const p = getChapterProgress(chapterId);
    if (p?.status === 'passed') return <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />;
    if (p?.status === 'in_progress') return <Clock className="w-4 h-4 text-yellow-400 shrink-0" />;
    return <div className="w-4 h-4 rounded-full border border-slate-600 shrink-0" />;
  }

  async function handleQuizSubmit(answers: QuizAnswer[], score: number, passed: boolean) {
    if (!selectedChapter || !textbook) return;
    await submitQuizAttempt({
      chapterId: selectedChapter.id,
      textbookId: textbook.id,
      answers,
      score,
      passed,
    });
    await loadData();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-400 text-sm">교재 불러오는 중...</div>
      </div>
    );
  }

  if (!textbook) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <BookOpen className="w-8 h-8 text-slate-600" />
        <p className="text-slate-400 text-sm">교재를 불러올 수 없습니다.</p>
        <button onClick={onClose} className="text-indigo-400 text-sm hover:underline">돌아가기</button>
      </div>
    );
  }

  const chapters = textbook.chapters ?? [];
  const currentIndex = selectedChapter ? chapters.findIndex((c) => c.id === selectedChapter.id) : 0;
  const chapterProgress = selectedChapter ? getChapterProgress(selectedChapter.id) : null;
  const isPassed = chapterProgress?.status === 'passed';

  // Group chapters by part
  const parts: { partNumber: number; partTitle: string; chapters: TextbookChapter[] }[] = [];
  for (const ch of chapters) {
    const existing = parts.find((p) => p.partNumber === ch.partNumber);
    if (existing) {
      existing.chapters.push(ch);
    } else {
      parts.push({ partNumber: ch.partNumber, partTitle: ch.partTitle, chapters: [ch] });
    }
  }

  const passedCount = progress ? Object.values(progress.chapterProgress).filter((p) => p.status === 'passed').length : 0;
  const overallProgress = chapters.length > 0 ? Math.round((passedCount / chapters.length) * 100) : 0;

  return (
    <div className="flex flex-col md:flex-row gap-4 min-h-[600px]">
      {/* Sidebar — chapter list */}
      <div className="w-full md:w-72 shrink-0 bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-4">
        {/* Textbook header */}
        <div>
          <button onClick={onClose} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 mb-3 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" />
            목록으로
          </button>
          <h2 className="text-sm font-bold text-slate-100 leading-snug">{textbook.title}</h2>
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
            <div className="text-xs text-slate-500">{passedCount}/{chapters.length} 챕터 통과</div>
          </div>
        </div>

        {/* Chapter tree */}
        <div className="space-y-3 overflow-y-auto max-h-[500px] pr-1">
          {parts.map((part) => (
            <div key={part.partNumber}>
              <div className="text-[10px] uppercase tracking-widest text-indigo-400/70 font-bold px-1 mb-1.5">
                PART {part.partNumber}. {part.partTitle}
              </div>
              <div className="space-y-1">
                {part.chapters.map((ch) => {
                  const isSelected = selectedChapter?.id === ch.id;
                  return (
                    <button
                      key={ch.id}
                      onClick={() => { setSelectedChapter(ch); setChapterView('content'); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-medium transition-all ${
                        isSelected
                          ? 'bg-indigo-600/20 border border-indigo-500/40 text-indigo-200'
                          : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      {getStatusIcon(ch.id)}
                      <span className="truncate">{ch.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 min-w-0 space-y-4">
        {selectedChapter ? (
          <>
            {/* Chapter header */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-indigo-400/80 font-semibold uppercase tracking-wider mb-1">
                    PART {selectedChapter.partNumber}
                  </div>
                  <h3 className="text-lg font-bold text-slate-100 leading-snug">{selectedChapter.title}</h3>
                </div>
                {isPassed && (
                  <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-1.5 shrink-0">
                    <Trophy className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-300">통과</span>
                  </div>
                )}
              </div>

              {/* Tab nav */}
              <div className="flex gap-1 mt-4">
                {[
                  { key: 'content', label: '학습', icon: <BookOpen className="w-3.5 h-3.5" /> },
                  ...(selectedChapter.quiz ? [{ key: 'quiz', label: '시험', icon: <Trophy className="w-3.5 h-3.5" /> }] : []),
                  ...(coachMode ? [{ key: 'lesson-record', label: '레슨 기록', icon: <ClipboardList className="w-3.5 h-3.5" /> }] : []),
                ].map(({ key, label, icon }) => (
                  <button
                    key={key}
                    onClick={() => setChapterView(key as ChapterView)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      chapterView === key
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            {chapterView === 'content' && (
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-5">
                {/* Markdown-rendered content */}
                <div
                  className="prose prose-invert prose-sm max-w-none prose-headings:text-slate-100 prose-p:text-slate-300 prose-li:text-slate-300 prose-strong:text-slate-100 prose-blockquote:border-indigo-500 prose-blockquote:text-slate-400"
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(selectedChapter.content ?? ''),
                  }}
                />

                {/* Key points checklist */}
                {(selectedChapter.keyPoints ?? []).length > 0 && (
                  <div className="border-t border-slate-800 pt-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-400" />
                      <h4 className="text-sm font-bold text-slate-200">핵심 포인트</h4>
                    </div>
                    <ul className="space-y-2">
                      {(selectedChapter.keyPoints ?? []).map((point, i) => (
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
                      onClick={() => { setSelectedChapter(chapters[currentIndex - 1]); setChapterView('content'); }}
                      className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      이전 챕터
                    </button>
                  ) : <div />}
                  {selectedChapter.quiz && !isPassed && (
                    <button
                      onClick={() => setChapterView('quiz')}
                      className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition-colors"
                    >
                      <Trophy className="w-4 h-4" />
                      시험 보기
                    </button>
                  )}
                  {currentIndex < chapters.length - 1 && (
                    <button
                      onClick={() => { setSelectedChapter(chapters[currentIndex + 1]); setChapterView('content'); }}
                      className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      다음 챕터
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {chapterView === 'quiz' && selectedChapter.quiz && (
              <QuizPlayer
                quiz={selectedChapter.quiz}
                chapterId={selectedChapter.id}
                textbookId={textbook.id}
                onSubmit={handleQuizSubmit}
                onClose={() => setChapterView('content')}
                previousBestScore={chapterProgress?.bestScore ?? 0}
                previousAttempts={chapterProgress?.attempts ?? 0}
              />
            )}

            {chapterView === 'lesson-record' && coachMode && (
              <div className="space-y-4">
                <ChapterLessonRecordForm
                  chapter={selectedChapter}
                  studentId={studentId}
                  studentName={studentName}
                  existingRecord={lessonRecords[0]}
                  existingLessons={existingLessons}
                  onSave={async (data) => {
                    if (onCreateLessonRecord) await onCreateLessonRecord(data);
                    const updated = await listLessonRecords({ chapterId: selectedChapter.id, studentId });
                    setLessonRecords(updated);
                  }}
                  onClose={() => setChapterView('content')}
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
              <p className="text-slate-400 text-sm">챕터를 선택하세요</p>
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
