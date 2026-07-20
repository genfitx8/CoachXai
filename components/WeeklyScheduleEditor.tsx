import React, { useMemo, useState } from 'react';
import {
  Sparkles,
  Trash2,
  Plus,
  X,
  Clock,
  Target,
  AlertTriangle,
  Save,
} from 'lucide-react';
import type {
  ScheduleSession,
  TrainingCategory,
  TrainingDiagnosis,
  WeeklySchedule,
} from '../types';
import { recomputeScheduleAllocations } from '../services/geminiService';
import { Button } from './Button';

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

const HOUR_SLOTS: string[] = Array.from({ length: 14 }, (_, i) => {
  const hour = 8 + i;
  return `${String(hour).padStart(2, '0')}:00`;
});

const CATEGORY_META: Record<
  TrainingCategory,
  { label: string; short: string; bg: string; text: string; border: string; group: 'SHORT' | 'LONG' | 'REST' }
> = {
  SHORT_GAME:   { label: '숏게임',      short: '숏게임',      bg: 'bg-emerald-100',  text: 'text-emerald-800',  border: 'border-emerald-300',  group: 'SHORT' },
  PUTTING:      { label: '퍼팅',        short: '퍼팅',        bg: 'bg-teal-100',     text: 'text-teal-800',     border: 'border-teal-300',     group: 'SHORT' },
  CONTROL_SHOT: { label: '컨트롤 샷',   short: '컨트롤',      bg: 'bg-cyan-100',     text: 'text-cyan-800',     border: 'border-cyan-300',     group: 'SHORT' },
  SWING:        { label: '스윙',        short: '스윙',        bg: 'bg-indigo-100',   text: 'text-indigo-800',   border: 'border-indigo-300',   group: 'LONG' },
  TARGETING:    { label: '타겟팅',      short: '타겟팅',      bg: 'bg-violet-100',   text: 'text-violet-800',   border: 'border-violet-300',   group: 'LONG' },
  BALL_FLIGHT:  { label: '구질 구현',   short: '구질',        bg: 'bg-fuchsia-100',  text: 'text-fuchsia-800',  border: 'border-fuchsia-300',  group: 'LONG' },
  REST:         { label: '휴식',        short: '휴식',        bg: 'bg-gray-100',     text: 'text-gray-500',     border: 'border-gray-200',     group: 'REST' },
};

const CATEGORY_ORDER: TrainingCategory[] = [
  'SHORT_GAME',
  'PUTTING',
  'CONTROL_SHOT',
  'SWING',
  'TARGETING',
  'BALL_FLIGHT',
  'REST',
];

interface WeeklyScheduleEditorProps {
  schedule: WeeklySchedule;
  diagnosis?: TrainingDiagnosis;
  isReadOnly?: boolean;
  isGenerating?: boolean;
  onChange: (schedule: WeeklySchedule) => void;
  onRegenerate?: () => void;
  onSave?: () => void;
  saveLabel?: string;
}

interface EditingState {
  session?: ScheduleSession;
  dayOfWeek: number;
  startTime: string;
}

const timeToMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

const findSessionAt = (
  sessions: ScheduleSession[],
  day: number,
  hourSlot: string,
): ScheduleSession | undefined => {
  const slot = timeToMinutes(hourSlot);
  return sessions.find((s) => {
    if (s.dayOfWeek !== day) return false;
    const start = timeToMinutes(s.startTime);
    const end = start + s.durationMinutes;
    return slot >= start && slot < end;
  });
};

const isSessionStart = (session: ScheduleSession, hourSlot: string): boolean =>
  session.startTime === hourSlot;

export const WeeklyScheduleEditor: React.FC<WeeklyScheduleEditorProps> = ({
  schedule,
  diagnosis,
  isReadOnly = false,
  isGenerating = false,
  onChange,
  onRegenerate,
  onSave,
  saveLabel,
}) => {
  const [editing, setEditing] = useState<EditingState | null>(null);

  const shortLongSummary = useMemo(() => {
    let shortM = 0;
    let longM = 0;
    for (const a of schedule.allocations) {
      if (CATEGORY_META[a.category].group === 'SHORT') shortM += a.minutes;
      else if (CATEGORY_META[a.category].group === 'LONG') longM += a.minutes;
    }
    const total = shortM + longM || 1;
    return {
      shortMinutes: shortM,
      longMinutes: longM,
      shortPct: Math.round((shortM / total) * 100),
      longPct: Math.round((longM / total) * 100),
    };
  }, [schedule.allocations]);

  const updateSchedule = (sessions: ScheduleSession[]) => {
    onChange(recomputeScheduleAllocations({ ...schedule, sessions }));
  };

  const handleCellClick = (day: number, hourSlot: string) => {
    if (isReadOnly) return;
    const existing = findSessionAt(schedule.sessions, day, hourSlot);
    setEditing({
      session: existing,
      dayOfWeek: day,
      startTime: existing ? existing.startTime : hourSlot,
    });
  };

  const handleSaveEdit = (draft: ScheduleSession) => {
    const others = editing?.session
      ? schedule.sessions.filter((s) => s.id !== editing.session!.id)
      : schedule.sessions;
    updateSchedule([...others, draft]);
    setEditing(null);
  };

  const handleDeleteEdit = () => {
    if (!editing?.session) return;
    updateSchedule(schedule.sessions.filter((s) => s.id !== editing.session!.id));
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      {/* Diagnosis card */}
      {diagnosis && (diagnosis.summary || diagnosis.weakAreas.length > 0) && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="font-bold text-sm text-gray-800">데이터 진단</h3>
          </div>
          {diagnosis.summary && (
            <p className="text-sm text-gray-700 leading-relaxed mb-3">{diagnosis.summary}</p>
          )}
          {diagnosis.weakAreas.length > 0 && (
            <div className="space-y-1.5">
              {diagnosis.weakAreas.map((w, i) => {
                const meta = CATEGORY_META[w.category];
                return (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${meta.bg} ${meta.text}`}
                    >
                      {meta.label}
                    </span>
                    <span className="text-gray-600">{w.reason}</span>
                    <span className="ml-auto text-red-500 font-bold">
                      {Math.round(w.severity * 100)}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {diagnosis.strengths.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs font-bold text-emerald-700 mb-1">유지할 강점</p>
              <ul className="text-xs text-gray-600 list-disc list-inside space-y-0.5">
                {diagnosis.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Ratio summary */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm text-gray-800 flex items-center gap-2">
            <Target className="w-4 h-4 text-indigo-500" />
            훈련 비율
          </h3>
          <span className="text-xs text-gray-500">
            총 {Math.floor(schedule.totalMinutes / 60)}시간 {schedule.totalMinutes % 60}분
          </span>
        </div>
        <div className="flex h-4 rounded-full overflow-hidden bg-gray-100 mb-2">
          <div
            className="bg-emerald-500 flex items-center justify-center text-[10px] font-bold text-white"
            style={{ width: `${shortLongSummary.shortPct}%` }}
            title={`숏게임 ${shortLongSummary.shortPct}%`}
          >
            {shortLongSummary.shortPct >= 15 ? `숏 ${shortLongSummary.shortPct}%` : ''}
          </div>
          <div
            className="bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white"
            style={{ width: `${shortLongSummary.longPct}%` }}
            title={`롱게임 ${shortLongSummary.longPct}%`}
          >
            {shortLongSummary.longPct >= 15 ? `롱 ${shortLongSummary.longPct}%` : ''}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {schedule.allocations
            .filter((a) => a.minutes > 0)
            .map((a) => {
              const meta = CATEGORY_META[a.category];
              return (
                <span
                  key={a.category}
                  className={`text-[11px] px-2 py-0.5 rounded-full ${meta.bg} ${meta.text} font-medium`}
                >
                  {meta.label} {Math.round(a.ratio * 100)}%
                  <span className="opacity-70 ml-1">({a.minutes}분)</span>
                </span>
              );
            })}
        </div>
        {schedule.overview && (
          <p className="text-xs text-gray-500 mt-3 leading-relaxed">{schedule.overview}</p>
        )}
      </div>

      {/* Weekly grid */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="font-bold text-sm text-gray-800">주간 스케줄</h3>
          {!isReadOnly && onRegenerate && (
            <button
              onClick={onRegenerate}
              disabled={isGenerating}
              className="text-xs px-2.5 py-1 rounded-lg bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" />
              {isGenerating ? '생성 중...' : 'AI 재생성'}
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="w-14 py-1.5 text-gray-500 font-medium border-b border-gray-200 sticky left-0 bg-gray-50 z-10">
                  시간
                </th>
                {DAY_LABELS.map((d, i) => (
                  <th
                    key={d}
                    className={`py-1.5 font-bold border-b border-gray-200 min-w-[68px] ${
                      i === 6 ? 'text-red-500' : i === 5 ? 'text-blue-500' : 'text-gray-700'
                    }`}
                  >
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HOUR_SLOTS.map((slot) => (
                <tr key={slot}>
                  <td className="w-14 py-1 px-1 text-gray-400 text-[10px] text-center border-b border-gray-100 sticky left-0 bg-white z-10">
                    {slot}
                  </td>
                  {DAY_LABELS.map((_, day) => {
                    const session = findSessionAt(schedule.sessions, day, slot);
                    const isStart = session ? isSessionStart(session, slot) : false;
                    const meta = session ? CATEGORY_META[session.category] : null;
                    const cellClass = session
                      ? `${meta!.bg} ${meta!.text} ${meta!.border} border-l-2`
                      : 'hover:bg-gray-50';
                    return (
                      <td
                        key={day}
                        className={`border-b border-gray-100 p-0 align-top ${
                          isReadOnly ? '' : 'cursor-pointer'
                        }`}
                        onClick={() => handleCellClick(day, slot)}
                      >
                        <div className={`min-h-[36px] px-1.5 py-1 text-[11px] leading-tight ${cellClass}`}>
                          {session && isStart && (
                            <div className="font-bold truncate">{session.label}</div>
                          )}
                          {session && isStart && session.durationMinutes >= 60 && (
                            <div className="text-[9px] opacity-75">
                              {session.durationMinutes}분
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!isReadOnly && (
          <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-500 bg-gray-50">
            셀을 클릭해 훈련을 추가·수정하세요.
          </div>
        )}
      </div>

      {/* Save button */}
      {onSave && !isReadOnly && (
        <Button onClick={onSave} className="w-full bg-emerald-800 hover:bg-emerald-900">
          <Save className="w-4 h-4 mr-2" />
          {saveLabel ?? '스케줄 저장'}
        </Button>
      )}

      {/* Edit modal */}
      {editing && (
        <SessionEditModal
          initial={editing.session}
          defaultDay={editing.dayOfWeek}
          defaultStart={editing.startTime}
          onCancel={() => setEditing(null)}
          onDelete={editing.session ? handleDeleteEdit : undefined}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
};

// ── Edit Modal ────────────────────────────────────────────────────────────────

interface SessionEditModalProps {
  initial?: ScheduleSession;
  defaultDay: number;
  defaultStart: string;
  onCancel: () => void;
  onDelete?: () => void;
  onSave: (session: ScheduleSession) => void;
}

const SessionEditModal: React.FC<SessionEditModalProps> = ({
  initial,
  defaultDay,
  defaultStart,
  onCancel,
  onDelete,
  onSave,
}) => {
  const [dayOfWeek, setDayOfWeek] = useState(initial?.dayOfWeek ?? defaultDay);
  const [startTime, setStartTime] = useState(initial?.startTime ?? defaultStart);
  const [durationMinutes, setDurationMinutes] = useState(initial?.durationMinutes ?? 60);
  const [category, setCategory] = useState<TrainingCategory>(initial?.category ?? 'SHORT_GAME');
  const [label, setLabel] = useState(initial?.label ?? CATEGORY_META[initial?.category ?? 'SHORT_GAME'].label);
  const [note, setNote] = useState(initial?.note ?? '');

  const handleCategoryChange = (c: TrainingCategory) => {
    setCategory(c);
    // Auto-fill label if user hasn't customised it away from the default
    const wasDefault = Object.values(CATEGORY_META).some((m) => m.label === label);
    if (wasDefault || !label) setLabel(CATEGORY_META[c].label);
  };

  const handleSubmit = () => {
    onSave({
      id: initial?.id ?? `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      dayOfWeek,
      startTime,
      durationMinutes,
      category,
      label: label.trim() || CATEGORY_META[category].label,
      note: note.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-2">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h4 className="font-bold text-sm text-gray-800">
            {initial ? '훈련 세션 수정' : '훈련 세션 추가'}
          </h4>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600" aria-label="닫기">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">요일</label>
            <div className="flex gap-1">
              {DAY_LABELS.map((d, i) => (
                <button
                  key={d}
                  onClick={() => setDayOfWeek(i)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border transition ${
                    dayOfWeek === i
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-slate-400'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">시작 시간</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                step={1800}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">
                <Clock className="w-3 h-3 inline mr-1" />
                시간 (분)
              </label>
              <div className="flex flex-wrap gap-1">
                {[30, 60, 90, 120].map((m) => (
                  <button
                    key={m}
                    onClick={() => setDurationMinutes(m)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border ${
                      durationMinutes === m
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-slate-400'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">카테고리</label>
            <div className="grid grid-cols-2 gap-1.5">
              {CATEGORY_ORDER.map((c) => {
                const meta = CATEGORY_META[c];
                const active = category === c;
                return (
                  <button
                    key={c}
                    onClick={() => handleCategoryChange(c)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition text-left ${
                      active
                        ? `${meta.bg} ${meta.text} ${meta.border}`
                        : 'bg-white text-gray-600 border-gray-200 hover:border-slate-400'
                    }`}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">셀 표시 이름</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={20}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="예: 숏게임 컨트롤"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">코치 메모 (옵션)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={300}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              placeholder="구체적 드릴/포커스를 적어주세요"
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2">
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-2 rounded-lg text-red-500 hover:bg-red-50"
              aria-label="삭제"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onCancel}
            className="ml-auto px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            className="px-3 py-2 rounded-lg text-sm font-bold bg-slate-800 text-white hover:bg-slate-900 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            {initial ? '적용' : '추가'}
          </button>
        </div>
      </div>
    </div>
  );
};
