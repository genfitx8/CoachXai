import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Plus, Users, ChevronRight, Layers,
  Search, BarChart3, CheckCircle, UserPlus, X, Trash2,
} from 'lucide-react';
import type { Curriculum, StudentCurriculumProgress, PartLessonRecord } from '../types/curriculum';
import type { ClientProfile, CoachProfile } from '../types';
import {
  listCurriculums, getCurriculumProgress, assignCurriculum,
  createCurriculum, deleteCurriculum, createPartLessonRecord,
} from '../services/curriculumService';
import { CurriculumViewer } from './CurriculumViewer';

interface CurriculumManagerProps {
  coachProfile: CoachProfile;
  clients: ClientProfile[];
  lessons: { id: string; title: string; date: string; clientName?: string }[];
  onBack: () => void;
}

type ManagerView = 'list' | 'create' | 'viewer' | 'progress' | 'assign';

const PART_COUNT = 5;

function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : '알 수 없는 오류';
}

export const CurriculumManager: React.FC<CurriculumManagerProps> = ({
  coachProfile,
  clients,
  lessons,
  onBack,
}) => {
  const [view, setView] = useState<ManagerView>('list');
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [selectedCurriculum, setSelectedCurriculum] = useState<Curriculum | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientProfile | null>(null);
  const [progressData, setProgressData] = useState<StudentCurriculumProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // Assign modal state
  const [assignCurriculumId, setAssignCurriculumId] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);

  const myClients = clients.filter((c) => c.coachId === coachProfile.id);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const list = await listCurriculums();
      setCurriculums(list);
    } catch (e) {
      console.error('[CurriculumManager] load error:', e);
      setLoadError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await createCurriculum({ title: newTitle.trim(), description: newDescription.trim() || undefined });
      setNewTitle('');
      setNewDescription('');
      setView('list');
      await load();
    } catch (e) {
      console.error('[CurriculumManager] create error:', e);
      alert(`커리큘럼 생성에 실패했습니다.\n(${errMsg(e)})`);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(curriculumId: string) {
    if (!confirm('이 커리큘럼을 삭제하시겠습니까? 배정된 학생의 진도 기록도 함께 삭제됩니다.')) return;
    try {
      await deleteCurriculum(curriculumId);
      await load();
    } catch (e) {
      console.error('[CurriculumManager] delete error:', e);
      alert(`삭제에 실패했습니다.\n(${errMsg(e)})`);
    }
  }

  async function handleAssign() {
    if (!assignCurriculumId || selectedStudentIds.length === 0) return;
    setAssigning(true);
    try {
      await assignCurriculum(assignCurriculumId, selectedStudentIds);
      alert(`${selectedStudentIds.length}명에게 커리큘럼이 배정되었습니다.`);
      setView('list');
      setSelectedStudentIds([]);
    } catch (e) {
      console.error('[CurriculumManager] assign error:', e);
      alert(`배정에 실패했습니다.\n(${errMsg(e)})`);
    } finally {
      setAssigning(false);
    }
  }

  async function openProgress(cur: Curriculum) {
    setSelectedCurriculum(cur);
    try {
      const data = await getCurriculumProgress(cur.id);
      setProgressData(data);
    } catch (e) {
      console.error('[CurriculumManager] progress error:', e);
    }
    setView('progress');
  }

  function openViewer(cur: Curriculum, client?: ClientProfile) {
    setSelectedCurriculum(cur);
    setSelectedClient(client ?? null);
    setView('viewer');
  }

  async function handleCreateLessonRecord(data: Omit<PartLessonRecord, 'id' | 'coachId' | 'createdAt' | 'updatedAt'>) {
    await createPartLessonRecord(data);
  }

  const filteredCurriculums = curriculums.filter(
    (c) =>
      !searchQuery ||
      c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ── Create view ──────────────────────────────────────────────────────────
  if (view === 'create') {
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
          <h2 className="text-xl font-bold text-slate-100">새 커리큘럼 만들기</h2>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">커리큘럼 이름</label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="예: 2026 시즌 기초 트레이닝"
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-indigo-500 placeholder-slate-600"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">설명 (선택)</label>
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={3}
              placeholder="이 커리큘럼의 목표나 대상 학생을 적어주세요"
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-indigo-500 resize-none placeholder-slate-600"
            />
          </div>

          <div className="border-t border-slate-800 pt-4 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">자동 생성되는 5개 파트</p>
            <div className="flex flex-wrap gap-2">
              {['신체', '스윙 기술', '장비', '코스매니지먼트', '멘탈'].map((label, i) => (
                <span key={label} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-300">
                  <span className="text-indigo-400 font-bold">{i + 1}</span>
                  {label}
                </span>
              ))}
            </div>
            <p className="text-xs text-slate-500">생성 후 각 파트의 내용을 자유롭게 수정할 수 있습니다.</p>
          </div>

          <button
            onClick={handleCreate}
            disabled={!newTitle.trim() || creating}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-sm transition-colors"
          >
            {creating ? '생성 중...' : '커리큘럼 만들기'}
          </button>
        </div>
      </div>
    );
  }

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
          <h2 className="text-xl font-bold text-slate-100">커리큘럼 배정</h2>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">커리큘럼 선택</label>
            <select
              value={assignCurriculumId}
              onChange={(e) => setAssignCurriculumId(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="">— 커리큘럼을 선택하세요 —</option>
              {curriculums.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
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
            disabled={!assignCurriculumId || selectedStudentIds.length === 0 || assigning}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-sm transition-colors"
          >
            {assigning ? '배정 중...' : `${selectedStudentIds.length}명에게 커리큘럼 배정`}
          </button>
        </div>
      </div>
    );
  }

  // ── Progress view ─────────────────────────────────────────────────────────
  if (view === 'progress' && selectedCurriculum) {
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
            <p className="text-xs text-slate-400">{selectedCurriculum.title}</p>
          </div>
        </div>

        {progressData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-slate-900/70 border border-slate-800 rounded-2xl gap-3">
            <Users className="w-8 h-8 text-slate-600" />
            <p className="text-slate-400 text-sm">아직 배정된 학생이 없습니다.</p>
            <button
              onClick={() => { setAssignCurriculumId(selectedCurriculum.id); setView('assign'); }}
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
              const completedCount = Object.values(prog.partProgress).filter((p) => p.status === 'completed').length;
              const pct = PART_COUNT > 0 ? Math.round((completedCount / PART_COUNT) * 100) : 0;

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
                      <span>{completedCount}/{PART_COUNT} 파트 완료</span>
                      {prog.completedAt && (
                        <span className="text-emerald-400">전체 완료 ✓</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => openViewer(selectedCurriculum, client)}
                    className="w-full py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-slate-100 text-xs font-medium transition-all flex items-center justify-center gap-1.5"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    커리큘럼으로 레슨 기록 작성
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
  if (view === 'viewer' && selectedCurriculum) {
    const clientLessons = selectedClient
      ? lessons.filter((l) => l.clientName === selectedClient.name)
      : lessons;

    return (
      <div className="space-y-4">
        <CurriculumViewer
          curriculumId={selectedCurriculum.id}
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
          교육 커리큘럼
        </h2>
      </div>

      {loadError && (
        <div className="flex items-center justify-between gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
          <span>커리큘럼 목록을 불러오지 못했습니다. ({loadError})</span>
          <button
            onClick={() => load()}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-xs font-semibold transition-colors"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* Actions row */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setView('create')}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600/20 border border-indigo-500/40 hover:bg-indigo-600/30 text-indigo-300 rounded-xl text-sm font-semibold transition-all"
        >
          <Plus className="w-4 h-4" />
          새 커리큘럼 만들기
        </button>
        <button
          onClick={() => setView('assign')}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-semibold transition-all"
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
          placeholder="커리큘럼 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-slate-900/70 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-indigo-500 placeholder-slate-600"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500 text-sm">
          커리큘럼 목록 불러오는 중...
        </div>
      ) : filteredCurriculums.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 bg-slate-900/50 border border-slate-800 rounded-2xl">
          <BookOpen className="w-10 h-10 text-slate-700" />
          <div className="text-center">
            <p className="text-slate-400 font-medium">등록된 커리큘럼이 없습니다</p>
            <p className="text-slate-600 text-xs mt-1">새 커리큘럼을 만들어 학생에게 배정하세요</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCurriculums.map((cur) => (
            <div
              key={cur.id}
              className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4"
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10">
                  <BookOpen className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-100 text-sm leading-snug">{cur.title}</h3>
                  {cur.description && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{cur.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3 h-3" />
                      {PART_COUNT}개 파트
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(cur.id)}
                  className="p-2 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors shrink-0"
                  title="삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => openViewer(cur)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 rounded-xl text-xs font-semibold transition-all"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  커리큘럼 열기
                </button>
                <button
                  onClick={() => openProgress(cur)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  학생 진도
                </button>
                <button
                  onClick={() => { setAssignCurriculumId(cur.id); setView('assign'); }}
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
