import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  Play,
  Square,
  Mic,
  Undo2,
  MessageSquarePlus,
  Circle,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
} from 'lucide-react';
import {
  PracticeSession,
  PracticeEvent,
  PracticeLocationType,
  GolfClubKind,
  ShotOutcome,
} from '../types';
import {
  startPracticeSession,
  endPracticeSession,
  logShot,
  logVoiceNote,
  logTextNote,
  popLastEvent,
  getActiveSession,
  summarizeSession,
} from '../services/practiceSessionService';
import {
  isMediaPermissionError,
  requestMediaStream,
} from '../utils/mediaPermissions';
import { PermissionDeniedModal } from './PermissionDeniedModal';

interface PracticeSessionScreenProps {
  clientId: string;
  coachId?: string;
  onBack: () => void;
}

const LOCATION_OPTIONS: { value: PracticeLocationType; label: string }[] = [
  { value: 'SCREEN', label: '스크린골프' },
  { value: 'RANGE', label: '연습장' },
  { value: 'COURSE', label: '필드' },
  { value: 'HOME', label: '집/기타' },
];

const CLUB_OPTIONS: { value: GolfClubKind; label: string }[] = [
  { value: 'DRIVER', label: '드라이버' },
  { value: 'WOOD', label: '우드' },
  { value: 'HYBRID', label: '유틸' },
  { value: 'LONG_IRON', label: '롱아이언' },
  { value: 'MID_IRON', label: '미들' },
  { value: 'SHORT_IRON', label: '숏' },
  { value: 'WEDGE', label: '웨지' },
  { value: 'PUTTER', label: '퍼터' },
];

const OUTCOME_OPTIONS: {
  value: ShotOutcome;
  label: string;
  tone: 'good' | 'bad';
  icon: React.ReactNode;
}[] = [
  { value: 'GREAT', label: '최고', tone: 'good', icon: <Sparkles className="w-4 h-4" /> },
  { value: 'GOOD', label: '좋음', tone: 'good', icon: <ThumbsUp className="w-4 h-4" /> },
  { value: 'MISS_LEFT', label: '좌 미스', tone: 'bad', icon: <ThumbsDown className="w-4 h-4" /> },
  { value: 'MISS_RIGHT', label: '우 미스', tone: 'bad', icon: <ThumbsDown className="w-4 h-4" /> },
  { value: 'FAT', label: '뒷땅', tone: 'bad', icon: <ThumbsDown className="w-4 h-4" /> },
  { value: 'THIN', label: '탑볼', tone: 'bad', icon: <ThumbsDown className="w-4 h-4" /> },
];

const formatDuration = (sec: number): string => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const formatEventTime = (at: number): string => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * Practice Session Screen — the "turn on the CoachX agent while I practice"
 * surface. Student picks a location and (optional) goal, then hits Start.
 * While active, one-tap shot logging + a voice-memo recorder + free-text
 * notes stream into the same PracticeSession. Ending the session freezes
 * an event summary that other features (weekly insight, training program)
 * can consume later.
 */
export const PracticeSessionScreen: React.FC<PracticeSessionScreenProps> = ({
  clientId,
  coachId,
  onBack,
}) => {
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [goalDraft, setGoalDraft] = useState('');
  const [locationDraft, setLocationDraft] = useState<PracticeLocationType>('SCREEN');
  const [selectedClub, setSelectedClub] = useState<GolfClubKind>('DRIVER');
  const [textNote, setTextNote] = useState('');
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const [permissionModalOpen, setPermissionModalOpen] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // On mount: resume an active session if one exists for this client.
  useEffect(() => {
    const active = getActiveSession(clientId);
    if (active) setSession(active);
  }, [clientId]);

  // 1-second tick so the "elapsed" clock updates without hammering renders.
  useEffect(() => {
    if (!session || session.status !== 'ACTIVE') return;
    const iv = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, [session]);

  // Cleanup any dangling recorder on unmount so we don't leak the mic.
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const elapsedSec = useMemo(() => {
    if (!session) return 0;
    const end = session.endedAt ?? nowTick;
    return Math.max(0, Math.round((end - session.startedAt) / 1000));
  }, [session, nowTick]);

  const summary = useMemo(
    () => (session ? summarizeSession(session) : null),
    [session]
  );

  const handleStart = () => {
    const started = startPracticeSession({
      clientId,
      coachId,
      locationType: locationDraft,
      goal: goalDraft,
    });
    setSession(started);
  };

  const handleEnd = () => {
    if (!session) return;
    // Ensure a live recording is flushed before we freeze the session.
    if (isRecording) stopRecording();
    const ended = endPracticeSession(session.id);
    if (ended) setSession(ended);
  };

  const handleLogShot = (outcome: ShotOutcome) => {
    if (!session) return;
    const next = logShot(session.id, selectedClub, outcome);
    if (next) setSession(next);
  };

  const handleAddNote = () => {
    if (!session || !textNote.trim()) return;
    const next = logTextNote(session.id, textNote);
    if (next) {
      setSession(next);
      setTextNote('');
    }
  };

  const handleUndo = () => {
    if (!session) return;
    const next = popLastEvent(session.id);
    if (next) setSession(next);
  };

  const startRecording = async () => {
    if (!session) return;
    try {
      const stream = await requestMediaStream({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const startedAt = recordingStartedAt ?? Date.now();
        const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const next = logVoiceNote(session.id, url, durationSec);
        if (next) setSession(next);
        // Release the mic — a session may capture many memos so we re-request each time.
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
      };
      mediaRecorderRef.current = recorder;
      setRecordingStartedAt(Date.now());
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      if (isMediaPermissionError(err) && err.kind === 'denied') {
        setPermissionModalOpen(true);
      } else {
        console.error('mic unavailable', err);
        alert('마이크를 사용할 수 없습니다. 다른 앱이 사용 중이거나 장치를 찾지 못했어요.');
      }
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    setIsRecording(false);
    setRecordingStartedAt(null);
  };

  // ── Render: pre-session (no session yet) ───────────────────────────────────
  if (!session) {
    return (
      <div className="space-y-5 animate-fade-in pb-8 text-gray-900">
        <PermissionDeniedModal
          open={permissionModalOpen}
          kind="microphone"
          onClose={() => setPermissionModalOpen(false)}
          onRetry={() => setPermissionModalOpen(false)}
        />
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="뒤로"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="w-1 h-6 bg-gradient-to-b from-emerald-700 to-teal-600 rounded-full" />
          <h2 className="text-xl font-black text-gray-900">연습 세션 시작</h2>
        </div>

        <div className="bg-gradient-to-br from-emerald-700 via-teal-700 to-cyan-800 rounded-2xl p-6 text-white shadow-xl">
          <p className="text-sm text-emerald-100 mb-1">CoachX 에이전트</p>
          <h3 className="text-lg font-black mb-2">연습 중 데이터 자동 수집</h3>
          <p className="text-emerald-100 text-sm leading-relaxed">
            에이전트를 켜두면 클럽별 샷 결과, 음성 메모, 텍스트 메모가 세션에
            차곡차곡 쌓입니다.
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">어디서 연습하세요?</p>
            <div className="flex flex-wrap gap-2">
              {LOCATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setLocationDraft(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                    locationDraft === opt.value
                      ? 'bg-emerald-700 border-emerald-700 text-white shadow-md'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-emerald-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-bold text-gray-700 mb-2 block">
              오늘의 목표 (선택)
            </label>
            <input
              type="text"
              value={goalDraft}
              onChange={(e) => setGoalDraft(e.target.value)}
              placeholder="예: 드라이버 슬라이스 줄이기"
              maxLength={100}
              className="w-full text-sm p-3 border border-gray-200 rounded-xl focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 outline-none transition-all"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleStart}
          className="w-full bg-gradient-to-r from-emerald-700 to-teal-600 hover:from-emerald-800 hover:to-teal-700 text-white rounded-2xl px-8 py-4 shadow-lg font-black text-base transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <Play className="w-5 h-5" />
          연습 시작 · 에이전트 켜기
        </button>
      </div>
    );
  }

  // ── Render: session ended → summary ────────────────────────────────────────
  if (session.status === 'ENDED' && summary) {
    return (
      <div className="space-y-5 animate-fade-in pb-8 text-gray-900">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="뒤로"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="w-1 h-6 bg-gradient-to-b from-emerald-700 to-teal-600 rounded-full" />
          <h2 className="text-xl font-black text-gray-900">연습 세션 요약</h2>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-emerald-800">
          <p className="text-sm font-bold">세션이 저장되었어요 ✓</p>
          <p className="text-xs mt-1 text-emerald-700">
            총 {formatDuration(summary.durationSec)} 동안 {summary.shotCount}개의 샷,
            음성 메모 {summary.voiceNoteCount}개, 메모 {summary.noteCount}개가 기록됐어요.
          </p>
        </div>

        <SummaryBlock summary={summary} />

        <button
          type="button"
          onClick={() => {
            setSession(null);
            setGoalDraft('');
          }}
          className="w-full bg-gradient-to-r from-emerald-700 to-teal-600 text-white rounded-2xl px-8 py-4 shadow-lg font-black text-base transition-all"
        >
          새 세션 시작
        </button>
      </div>
    );
  }

  // ── Render: active session ─────────────────────────────────────────────────
  const events = [...session.events].reverse(); // newest first for display

  return (
    <div className="space-y-4 animate-fade-in pb-24 text-gray-900">
      <PermissionDeniedModal
        open={permissionModalOpen}
        kind="microphone"
        onClose={() => setPermissionModalOpen(false)}
        onRetry={() => {
          setPermissionModalOpen(false);
          void startRecording();
        }}
      />

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="뒤로"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="w-1 h-6 bg-gradient-to-b from-emerald-700 to-teal-600 rounded-full" />
        <h2 className="text-xl font-black text-gray-900">연습 중</h2>
      </div>

      {/* Live status card */}
      <div className="bg-gradient-to-br from-emerald-700 via-teal-700 to-cyan-800 rounded-2xl p-5 text-white shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-emerald-100 text-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-300 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400" />
              </span>
              에이전트 기록 중
            </div>
            {session.goal && (
              <p className="text-sm font-bold mt-1">🎯 {session.goal}</p>
            )}
          </div>
          <div className="text-2xl font-mono font-black tabular-nums">
            {formatDuration(elapsedSec)}
          </div>
        </div>
        <div className="mt-3 flex gap-3 text-xs text-emerald-100">
          <span>샷 {summary?.shotCount ?? 0}</span>
          <span>음성 {summary?.voiceNoteCount ?? 0}</span>
          <span>메모 {summary?.noteCount ?? 0}</span>
        </div>
      </div>

      {/* Club picker */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <p className="text-xs font-bold text-gray-500 mb-2">지금 치는 클럽</p>
        <div className="flex flex-wrap gap-2">
          {CLUB_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelectedClub(opt.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                selectedClub === opt.value
                  ? 'bg-emerald-700 border-emerald-700 text-white shadow-md'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-emerald-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 1-tap outcome grid */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-gray-500">1탭 샷 기록</p>
          <button
            type="button"
            onClick={handleUndo}
            disabled={session.events.length === 0}
            className="text-xs font-bold text-gray-500 hover:text-gray-800 disabled:opacity-40 flex items-center gap-1"
          >
            <Undo2 className="w-3.5 h-3.5" />
            방금 취소
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {OUTCOME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleLogShot(opt.value)}
              className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border-2 transition-all active:scale-95 ${
                opt.tone === 'good'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'
              }`}
            >
              {opt.icon}
              <span className="text-xs font-black">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Voice + text note row */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 font-bold text-sm transition-all ${
            isRecording
              ? 'bg-red-500 text-white shadow-md animate-pulse'
              : 'bg-slate-800 text-white hover:bg-slate-900'
          }`}
        >
          {isRecording ? (
            <>
              <Square className="w-4 h-4" />
              녹음 중지 · 세션에 저장
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              음성 메모 녹음
            </>
          )}
        </button>

        <div className="flex gap-2">
          <input
            type="text"
            value={textNote}
            onChange={(e) => setTextNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddNote();
              }
            }}
            placeholder="빠른 메모 입력…"
            maxLength={200}
            className="flex-1 text-sm p-3 border border-gray-200 rounded-xl focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 outline-none"
          />
          <button
            type="button"
            onClick={handleAddNote}
            disabled={!textNote.trim()}
            className="px-3 rounded-xl bg-emerald-700 text-white disabled:opacity-40 hover:bg-emerald-800 transition-colors"
            aria-label="메모 저장"
          >
            <MessageSquarePlus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Event timeline */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <p className="text-xs font-bold text-gray-500 mb-2">
          이번 세션 기록 ({session.events.length})
        </p>
        {events.length === 0 ? (
          <div className="text-center text-xs text-gray-400 py-6">
            아직 기록된 이벤트가 없어요. 위 버튼으로 첫 샷을 남겨보세요.
          </div>
        ) : (
          <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-2 text-xs">
                <span className="text-gray-400 font-mono min-w-[36px]">
                  {formatEventTime(e.at)}
                </span>
                <EventLabel event={e} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* End session pinned at bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white to-white/80 pt-3 pb-4 px-4 border-t border-gray-100">
        <div className="max-w-md mx-auto">
          <button
            type="button"
            onClick={handleEnd}
            className="w-full bg-slate-900 hover:bg-black text-white rounded-2xl px-6 py-3.5 shadow-lg font-black text-sm flex items-center justify-center gap-2"
          >
            <Square className="w-4 h-4" />
            연습 종료 · 세션 저장
          </button>
        </div>
      </div>
    </div>
  );
};

const EventLabel: React.FC<{ event: PracticeEvent }> = ({ event }) => {
  if (event.type === 'shot') {
    const outcome = OUTCOME_OPTIONS.find((o) => o.value === event.outcome);
    const club = CLUB_OPTIONS.find((c) => c.value === event.club);
    return (
      <span className="text-gray-700">
        <span className="font-bold">{club?.label ?? event.club}</span>
        <span className="mx-1 text-gray-400">·</span>
        <span
          className={
            outcome?.tone === 'good' ? 'text-emerald-700 font-bold' : 'text-orange-700 font-bold'
          }
        >
          {outcome?.label ?? event.outcome}
        </span>
        {event.note && <span className="text-gray-500"> — {event.note}</span>}
      </span>
    );
  }
  if (event.type === 'voice_note') {
    return (
      <span className="text-slate-700 flex items-center gap-1">
        <Mic className="w-3 h-3" /> 음성 메모 ({event.durationSec}s)
      </span>
    );
  }
  if (event.type === 'note') {
    return <span className="text-gray-700">📝 {event.text}</span>;
  }
  return (
    <span className="text-gray-700">
      🏋️ {event.drillLabel}
      {event.reps ? ` · ${event.reps}회` : ''}
    </span>
  );
};

const SummaryBlock: React.FC<{
  summary: ReturnType<typeof summarizeSession>;
}> = ({ summary }) => {
  const outcomeEntries = Object.entries(summary.outcomeCounts) as [ShotOutcome, number][];
  const clubEntries = Object.entries(summary.clubCounts) as [GolfClubKind, number][];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: '샷', value: summary.shotCount },
          { label: '음성', value: summary.voiceNoteCount },
          { label: '메모', value: summary.noteCount },
          { label: '드릴', value: summary.drillCount },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white rounded-xl p-3 text-center border border-gray-100 shadow-sm"
          >
            <div className="text-lg font-black text-gray-900">{s.value}</div>
            <div className="text-[10px] text-gray-500 font-bold uppercase">{s.label}</div>
          </div>
        ))}
      </div>

      {clubEntries.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs font-bold text-gray-500 mb-2">클럽별 샷</p>
          <div className="flex flex-wrap gap-2">
            {clubEntries.map(([club, count]) => (
              <span
                key={club}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold"
              >
                <Circle className="w-2 h-2 fill-emerald-500 text-emerald-500" />
                {CLUB_OPTIONS.find((c) => c.value === club)?.label ?? club} · {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {outcomeEntries.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs font-bold text-gray-500 mb-2">결과 분포</p>
          <div className="flex flex-wrap gap-2">
            {outcomeEntries.map(([outcome, count]) => {
              const opt = OUTCOME_OPTIONS.find((o) => o.value === outcome);
              const tone = opt?.tone ?? 'good';
              return (
                <span
                  key={outcome}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border font-bold ${
                    tone === 'good'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      : 'bg-orange-50 text-orange-700 border-orange-100'
                  }`}
                >
                  {opt?.label ?? outcome} · {count}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
