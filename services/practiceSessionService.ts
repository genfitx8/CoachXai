import {
  PracticeSession,
  PracticeEvent,
  PracticeSessionSummary,
  PracticeLocationType,
  ShotOutcome,
  GolfClubKind,
} from '../types';
import { storageService } from './storage';
import { createLogger } from '../utils/logger';

const log = createLogger('practiceSession');

const getLocalISODate = (ts: number): string => {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Start a new session for a client. If one is already ACTIVE, that one is
 * returned instead — the "turn on the agent" flow is idempotent, so a
 * student re-entering the screen doesn't accidentally open a duplicate.
 */
export function startPracticeSession(params: {
  clientId: string;
  coachId?: string;
  locationType?: PracticeLocationType;
  goal?: string;
}): PracticeSession {
  const existingId = storageService.getActivePracticeSessionId(params.clientId);
  if (existingId) {
    const existing = storageService.getPracticeSessionById(existingId);
    if (existing && existing.status === 'ACTIVE') return existing;
  }

  const now = Date.now();
  const session: PracticeSession = {
    id: crypto.randomUUID(),
    clientId: params.clientId,
    ...(params.coachId ? { coachId: params.coachId } : {}),
    status: 'ACTIVE',
    startedAt: now,
    sessionDate: getLocalISODate(now),
    ...(params.locationType ? { locationType: params.locationType } : {}),
    ...(params.goal?.trim() ? { goal: params.goal.trim() } : {}),
    events: [],
  };
  storageService.savePracticeSession(session);
  storageService.setActivePracticeSessionId(params.clientId, session.id);
  log.info('practice session started', { id: session.id, clientId: params.clientId });
  return session;
}

/** Append an event to an ACTIVE session. Silently no-ops if the session is missing or ended. */
export function appendPracticeEvent(
  sessionId: string,
  event: PracticeEvent
): PracticeSession | null {
  const session = storageService.getPracticeSessionById(sessionId);
  if (!session) {
    log.warn('appendPracticeEvent: session not found', { sessionId });
    return null;
  }
  if (session.status !== 'ACTIVE') {
    log.warn('appendPracticeEvent: session not active', { sessionId, status: session.status });
    return null;
  }
  const next: PracticeSession = {
    ...session,
    events: [...session.events, event],
  };
  storageService.savePracticeSession(next);
  return next;
}

/** Convenience wrappers so components don't have to build the event union themselves. */
export function logShot(
  sessionId: string,
  club: GolfClubKind,
  outcome: ShotOutcome,
  note?: string
): PracticeSession | null {
  return appendPracticeEvent(sessionId, {
    id: crypto.randomUUID(),
    at: Date.now(),
    type: 'shot',
    club,
    outcome,
    ...(note?.trim() ? { note: note.trim() } : {}),
  });
}

export function logVoiceNote(
  sessionId: string,
  audioRef: string,
  durationSec: number,
  transcript?: string
): PracticeSession | null {
  return appendPracticeEvent(sessionId, {
    id: crypto.randomUUID(),
    at: Date.now(),
    type: 'voice_note',
    audioRef,
    durationSec,
    ...(transcript?.trim() ? { transcript: transcript.trim() } : {}),
  });
}

export function logTextNote(sessionId: string, text: string): PracticeSession | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return appendPracticeEvent(sessionId, {
    id: crypto.randomUUID(),
    at: Date.now(),
    type: 'note',
    text: trimmed,
  });
}

export function logDrill(
  sessionId: string,
  drillLabel: string,
  reps?: number
): PracticeSession | null {
  const trimmed = drillLabel.trim();
  if (!trimmed) return null;
  return appendPracticeEvent(sessionId, {
    id: crypto.randomUUID(),
    at: Date.now(),
    type: 'drill',
    drillLabel: trimmed,
    ...(typeof reps === 'number' && reps > 0 ? { reps } : {}),
  });
}

/** Remove the last event — used by the UI's undo button. */
export function popLastEvent(sessionId: string): PracticeSession | null {
  const session = storageService.getPracticeSessionById(sessionId);
  if (!session || session.status !== 'ACTIVE' || session.events.length === 0) return session;
  const next: PracticeSession = {
    ...session,
    events: session.events.slice(0, -1),
  };
  storageService.savePracticeSession(next);
  return next;
}

/** Cheap client-side rollup — no AI call. */
export function summarizeSession(session: PracticeSession): PracticeSessionSummary {
  const outcomeCounts: Partial<Record<ShotOutcome, number>> = {};
  const clubCounts: Partial<Record<GolfClubKind, number>> = {};
  let shots = 0;
  let voice = 0;
  let notes = 0;
  let drills = 0;

  for (const e of session.events) {
    if (e.type === 'shot') {
      shots++;
      outcomeCounts[e.outcome] = (outcomeCounts[e.outcome] ?? 0) + 1;
      clubCounts[e.club] = (clubCounts[e.club] ?? 0) + 1;
    } else if (e.type === 'voice_note') {
      voice++;
    } else if (e.type === 'note') {
      notes++;
    } else if (e.type === 'drill') {
      drills++;
    }
  }

  const endedAt = session.endedAt ?? Date.now();
  return {
    shotCount: shots,
    voiceNoteCount: voice,
    noteCount: notes,
    drillCount: drills,
    outcomeCounts,
    clubCounts,
    durationSec: Math.max(0, Math.round((endedAt - session.startedAt) / 1000)),
  };
}

export function endPracticeSession(sessionId: string): PracticeSession | null {
  const session = storageService.getPracticeSessionById(sessionId);
  if (!session) return null;
  const endedAt = Date.now();
  const ended: PracticeSession = {
    ...session,
    status: 'ENDED',
    endedAt,
    summary: summarizeSession({ ...session, endedAt }),
  };
  storageService.savePracticeSession(ended);
  storageService.setActivePracticeSessionId(session.clientId, null);
  log.info('practice session ended', { id: sessionId, summary: ended.summary });
  return ended;
}

/** Returns the current ACTIVE session for a client (if any), else null. */
export function getActiveSession(clientId: string): PracticeSession | null {
  const id = storageService.getActivePracticeSessionId(clientId);
  if (!id) return null;
  const session = storageService.getPracticeSessionById(id);
  if (!session || session.status !== 'ACTIVE') {
    if (session && session.status !== 'ACTIVE') {
      storageService.setActivePracticeSessionId(clientId, null);
    }
    return null;
  }
  return session;
}
