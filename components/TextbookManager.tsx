import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Plus, Users, Trophy, ChevronRight, Star,
  Download, Search, BarChart3, CheckCircle, Clock, Circle,
  UserPlus, X, RefreshCw,
} from 'lucide-react';
import type { Textbook, StudentTextbookProgress } from '../types/textbook';
import type { ClientProfile, CoachProfile } from '../types';
import type { ChapterLessonRecord } from '../types/textbook';
import {
  listTextbooks, getTextbookProgress, assignTextbook,
  seedOfficialTextbook, createLessonRecord,
} from '../services/textbookService';
import { TextbookViewer } from './TextbookViewer';

interface TextbookManagerProps {
  coachProfile: CoachProfile;
  clients: ClientProfile[];
  lessons: { id: string; title: string; date: string; clientName?: string }[];
  onBack: () => void;
}

type ManagerView = 'list' | 'viewer' | 'progress' | 'assign';

export const TextbookManager: React.FC<TextbookManagerProps> = ({
  coachProfile,
  clients,
  lessons,
  onBack,
}) => {
  const [view, setView] = useState<ManagerView>('list');
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [selectedTextbook, setSelectedTextbook] = useState<Textbook | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientProfile | null>(null);
  const [progressData, setProgressData] = useState<StudentTextbookProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Assign modal state
  const [assignTextbookId, setAssignTextbookId] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);

  const myClients = clients.filter((c) => c.coachId === coachProfile.id);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const list = await listTextbooks();
      setTextbooks(list);
    } catch (e) {
      console.error('[TextbookManager] load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSeedOfficial() {
    if (textbooks.some((t) => t.isOfficial)) {
      alert('공식 교재가 이미 등록되어 있습니다.');
      return;
    }
    setSeeding(true);
    try {
      const result = await seedOfficialTextbook();
      alert(`JB Golf Academy 공식 교재가 등록되었습니다. (${result.chaptersSeeded}개 챕터)`);
      await load();
    } catch (e) {
      console.error('[TextbookManager] seed error:', e);
      alert('공식 교재 등록에 실패했습니다.');
    } finally {
      setSeeding(false);
    }
  }

  async function handleAssign() {
    if (!assignTextbookId || selectedStudentIds.length === 0) return;
    setAssigning(true);
    try {
      await assignTextbook(assignTextbookId, selectedStudentIds);
      alert(`${selectedStudentIds.length}명에게 교재가 배정되었습니다.`);
      setView('list');
      setSelectedStudentIds([]);
    } catch (e) {
      console.error('[TextbookManager] assign error:', e);
      alert('배정에 실패했습니다.');
    } finally {
      setAssigning(false);
    }
  }

  async function openProgress(tb: Textbook) {
    setSelectedTextbook(tb);
    try {
      const data = await getTextbookProgress(tb.id);
      setProgressData(data);
    } catch (e) {
      console.error('[TextbookManager] progress error:', e);
    }
    setView('progress');
  }

  function openViewer(tb: Textbook, client?: ClientProfile) {
    setSelectedTextbook(tb);
    setSelectedClient(client ?? null);
    setView('viewer');
  }

  async function handleCreateLessonRecord(data: Omit<ChapterLessonRecord, 'id' | 'coachId' | 'createdAt' | 'updatedAt'>) {
    await createLessonRecord(data);
  }

  const filteredTextbooks = textbooks.filter(
    (t) =>
      !searchQuery ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const levelLabel: Record<string, string> = {
    beginner: '입문',
    intermediate: '중급',
    advanced: '고급',
    pro: '선수',
  };

  // ── Assign view ──────────────────────────────────────────────────────────
  if (view === 'assign') {
    return (
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView('list')}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
            취소
          </button>
          <h2 className="text-xl font-bold text-slate-100">교재 배정</h2>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">교재 선택</label>
            <select
              value={assignTextbookId}
              onChange={(e) => setAssignTextbookId(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="">— 교재를 선택하세요 —</option>
              {textbooks.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              학생 선택 ({selectedStudentIds.length}명 선택됨)
            </label>
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {myClients.map((client) => {
                const selected = selectedStudentIds.includes(client.id);
                return (
                  <button
                    key={client.id}
                    onClick={() => {
                      setSelectedStudentIds((prev) =>
                        selected ? prev.filter((id) => id !== client.id) : [...prev, client.id]
                      );
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all text-sm ${
                      selected
                        ? 'border-indigo-500/60 bg-indigo-600/10 text-indigo-200'
                        : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                      selected ? 'border-indigo-400 bg-indigo-600' : 'border-slate-600'
                    }`}>
                      {selected && <CheckCircle className="w-3 h-3 text-white" />}
                    </div>
                    <span className="font-medium">{client.name}</span>
                    <span className="text-slate-500 text-xs ml-auto">{client.phone}</span>
                  </button>
                );
              })}
              {myClients.length === 0 && (
                <p className="text-slate-500 text-sm text-center py-4">등록된 학생이 없습니다.</p>
              )}
            </div>
          </div>

          <button
            onClick={handleAssign}
            disabled={!assignTextbookId || selectedStudentIds.length === 0 || assigning}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-sm transition-colors"
          >
            {assigning ? '배정 중...' : `${selectedStudentIds.length}명에게 교재 배정`}
          </button>
        </div>
      </div>
    );
  }

  // ── Progress view ─────────────────────────────────────────────────────────
  if (view === 'progress' && selectedTextbook) {
    return (
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView('list')}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            목록으로
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-100">학생 진도 현황</h2>
            <p className="text-xs text-slate-400">{selectedTextbook.title}</p>
          </div>
        </div>

        {progressData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-slate-900/70 border border-slate-800 rounded-2xl gap-3">
            <Users className="w-8 h-8 text-slate-600" />
            <p className="text-slate-400 text-sm">아직 배정된 학생이 없습니다.</p>
            <button
              onClick={() => { setAssignTextbookId(selectedTextbook.id); setView('assign'); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              학생 배정
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {progressData.map((prog) => {
              const client = myClients.find((c) => c.id === prog.studentId);
              const passedCount = Object.values(prog.chapterProgress).filter((p) => p.status === 'passed').length;
              const totalChapters = selectedTextbook.chaptersCount;
              const pct = totalChapters > 0 ? Math.round((passedCount / totalChapters) * 100) : 0;

              return (
                <div
                  key={prog.id}
                  className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-100">{client?.name ?? prog.studentId}</span>
                      {client?.phone && <span className="text-slate-500 text-xs ml-2">{client.phone}</span>}
                    </div>
                    <span className="text-sm font-bold text-indigo-300">{pct}%</span>
                  </div>
                  <div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 mt-1">
                      <span>{passedCount}/{totalChapters} 챕터 통과</span>
                      {prog.completedAt && (
                        <span className="text-emerald-400">완료 ✓</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => openViewer(selectedTextbook, client)}
                    className="w-full py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-slate-100 text-xs font-medium transition-all flex items-center justify-center gap-1.5"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    교재로 레슨 기록 작성
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Viewer ────────────────────────────────────────────────────────────────
  if (view === 'viewer' && selectedTextbook) {
    const clientLessons = selectedClient
      ? lessons.filter((l) => l.clientName === selectedClient.name)
      : lessons;

    return (
      <div className="space-y-4">
        <TextbookViewer
          textbookId={selectedTextbook.id}
          studentId={selectedClient?.id ?? coachProfile.id}
          studentName={selectedClient?.name ?? coachProfile.name}
          coachMode={true}
          existingLessons={clientLessons}
          onClose={() => setView(selectedClient ? 'progress' : 'list')}
          onCreateLessonRecord={handleCreateLessonRecord}
        />
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors px-3 py-2 rounded-xl hover:bg-slate-800 border border-transparent hover:border-slate-700"
        >
          <X className="w-4 h-4" />
          대시보드로
        </button>
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-indigo-400" />
          교육 교재
        </h2>
      </div>

      {/* Actions row */}
      <div className="flex flex-wrap gap-2">
        {!textbooks.some((t) => t.isOfficial) && (
          <button
            onClick={handleSeedOfficial}
            disabled={seeding}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-600/20 border border-amber-500/40 hover:bg-amber-600/30 text-amber-300 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {seeding ? '등록 중...' : 'JB Golf 공식 교재 불러오기'}
          </button>
        )}
        {textbooks.some((t) => t.isOfficial) && (
          <button
            onClick={handleSeedOfficial}
            disabled={seeding}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-400 rounded-xl text-xs font-medium transition-all disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {seeding ? '...' : '공식 교재 갱신'}
          </button>
        )}
        <button
          onClick={() => setView('assign')}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600/20 border border-indigo-500/40 hover:bg-indigo-600/30 text-indigo-300 rounded-xl text-sm font-semibold transition-all"
        >
          <UserPlus className="w-4 h-4" />
          학생에게 배정
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="교재 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-slate-900/70 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-indigo-500 placeholder-slate-600"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500 text-sm">
          교재 목록 불러오는 중...
        </div>
      ) : filteredTextbooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 bg-slate-900/50 border border-slate-800 rounded-2xl">
          <BookOpen className="w-10 h-10 text-slate-700" />
          <div className="text-center">
            <p className="text-slate-400 font-medium">등록된 교재가 없습니다</p>
            <p className="text-slate-600 text-xs mt-1">JB Golf 공식 교재를 불러오거나 새 교재를 만드세요</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTextbooks.map((tb) => (
            <div
              key={tb.id}
              className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4"
            >
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-xl ${tb.isOfficial ? 'bg-amber-500/10' : 'bg-indigo-500/10'}`}>
                  {tb.isOfficial
                    ? <Star className="w-5 h-5 text-amber-400" />
                    : <BookOpen className="w-5 h-5 text-indigo-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-slate-100 text-sm leading-snug">{tb.title}</h3>
                    {tb.isOfficial && (
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-2 py-0.5">
                        공식
                      </span>
                    )}
                  </div>
                  {tb.description && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{tb.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3 h-3" />
                      {tb.chaptersCount}개 챕터
                    </span>
                    <span className="bg-slate-800 rounded-full px-2 py-0.5">
                      {levelLabel[tb.targetLevel] ?? tb.targetLevel}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => openViewer(tb)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 rounded-xl text-xs font-semibold transition-all"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  교재 열기
                </button>
                <button
                  onClick={() => openProgress(tb)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  학생 진도
                </button>
                <button
                  onClick={() => { setAssignTextbookId(tb.id); setView('assign'); }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  배정
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// needed for the JSX in TextbookManager
function Layers({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  );
}
