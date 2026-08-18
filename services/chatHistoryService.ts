/**
 * Student AI chat history persistence.
 *
 * The student chat used to keep its whole transcript in React state only, so
 * anything that unmounted the component — switching to another tab, the OS
 * evicting the WebView while the app sat in the background, a PWA reload —
 * wiped the conversation and dropped the user back on the greeting.
 *
 * This module mirrors the self-healing policy of `utils/safeStorage`: every
 * read tolerates a missing / poisoned / half-written entry and quietly falls
 * back to "no history" instead of throwing during render.
 *
 * History is scoped per client id so two students sharing a device never see
 * each other's conversation.
 */
import type { ChatAttachment, CoachXChatMessage } from './coachXService';
import { createLogger } from '../utils/logger';

const log = createLogger('chatHistory');

const KEY_PREFIX = 'coachx_student_chat_v1_';

/**
 * Newest N messages kept on disk. Long enough that a student never sees a
 * session truncated in practice, small enough to stay far below the ~5MB
 * localStorage budget shared with the rest of the app.
 */
export const MAX_PERSISTED_MESSAGES = 200;

/** Defensive cap on a single message so one runaway reply can't fill the quota. */
const MAX_CONTENT_CHARS = 20000;

interface PersistedChat {
  /** Schema marker — bump when the message shape changes. */
  v: number;
  updatedAt: number;
  messages: CoachXChatMessage[];
}

/**
 * Deliberately still 1 even though messages may now carry `attachments`.
 *
 * The reader below drops the whole transcript on a version mismatch, so
 * bumping this would silently wipe every student's conversation on the deploy
 * that shipped chat uploads. `attachments` is purely additive and optional:
 * a new build reads an old transcript fine, and an older build reading a new
 * one just ignores the field. Bump only for a change old readers would
 * misinterpret.
 */
const SCHEMA_VERSION = 1;

/** Newest N attachments kept per message — a defensive cap, not a UI limit. */
const MAX_ATTACHMENTS_PER_MESSAGE = 10;

function sanitizeAttachments(value: unknown): ChatAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value.flatMap((entry): ChatAttachment[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const a = entry as Partial<ChatAttachment>;
    if (typeof a.id !== 'string' || !a.id) return [];
    if (typeof a.url !== 'string' || !a.url) return [];
    if (a.type !== 'video' && a.type !== 'image' && a.type !== 'audio') return [];
    return [{
      id: a.id,
      url: a.url,
      type: a.type,
      name: typeof a.name === 'string' ? a.name : '',
      size: typeof a.size === 'number' ? a.size : 0,
      mimeType: typeof a.mimeType === 'string' ? a.mimeType : '',
      ...(a.destination === 'practice' || a.destination === 'reservation' || a.destination === 'none'
        ? { destination: a.destination }
        : {}),
    }];
  });
  return cleaned.length > 0 ? cleaned.slice(0, MAX_ATTACHMENTS_PER_MESSAGE) : undefined;
}

const inBrowser = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export function chatHistoryKey(clientId: string): string {
  return `${KEY_PREFIX}${clientId}`;
}

function isChatMessage(value: unknown): value is CoachXChatMessage {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Partial<CoachXChatMessage>;
  if (m.role !== 'user' && m.role !== 'assistant') return false;
  if (typeof m.content !== 'string') return false;
  // A file sent with no caption is a real turn, so an empty body is only
  // meaningless when the message carries nothing else either.
  return m.content.length > 0 || sanitizeAttachments(m.attachments) !== undefined;
}

function tryRemove(key: string): void {
  if (!inBrowser()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable — non-fatal.
  }
}

/**
 * Read the stored transcript for a client. Returns `[]` when there is nothing
 * usable to restore; never throws, so it is safe to call from a `useState`
 * initializer.
 */
export function loadChatHistory(clientId: string): CoachXChatMessage[] {
  if (!inBrowser() || !clientId) return [];
  const key = chatHistoryKey(clientId);

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return [];
  }
  if (raw === null || raw === '' || raw === 'undefined' || raw === 'null') {
    if (raw !== null) tryRemove(key);
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedChat> | null;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.messages)) {
      tryRemove(key);
      return [];
    }
    if (parsed.v !== SCHEMA_VERSION) {
      // Written by an older/newer build — drop rather than guess at the shape.
      tryRemove(key);
      return [];
    }

    const messages = parsed.messages
      .filter(isChatMessage)
      .map(m => {
        const attachments = sanitizeAttachments(m.attachments);
        return {
          role: m.role,
          content: m.content,
          timestamp: typeof m.timestamp === 'number' ? m.timestamp : 0,
          ...(attachments ? { attachments } : {}),
        };
      })
      .slice(-MAX_PERSISTED_MESSAGES);

    return messages;
  } catch (err) {
    log.warn(`Removing corrupt chat history "${key}":`, err);
    tryRemove(key);
    return [];
  }
}

/**
 * Persist the transcript for a client, keeping only the newest
 * `MAX_PERSISTED_MESSAGES` entries. Quota failures retry once with a halved
 * transcript before giving up — losing older turns beats losing the write.
 */
export function saveChatHistory(clientId: string, messages: CoachXChatMessage[]): void {
  if (!inBrowser() || !clientId) return;
  if (!Array.isArray(messages) || messages.length === 0) {
    clearChatHistory(clientId);
    return;
  }

  const key = chatHistoryKey(clientId);
  const trimmed = messages
    .filter(isChatMessage)
    .slice(-MAX_PERSISTED_MESSAGES)
    .map(m => {
      const attachments = sanitizeAttachments(m.attachments);
      return {
        role: m.role,
        content: m.content.length > MAX_CONTENT_CHARS
          ? m.content.slice(0, MAX_CONTENT_CHARS)
          : m.content,
        timestamp: typeof m.timestamp === 'number' ? m.timestamp : Date.now(),
        ...(attachments ? { attachments } : {}),
      };
    });

  if (trimmed.length === 0) {
    clearChatHistory(clientId);
    return;
  }

  const write = (entries: CoachXChatMessage[]): boolean => {
    const payload: PersistedChat = {
      v: SCHEMA_VERSION,
      updatedAt: Date.now(),
      messages: entries,
    };
    try {
      window.localStorage.setItem(key, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  };

  if (write(trimmed)) return;

  // Most likely a quota error — retry with the freshest half of the thread.
  const halved = trimmed.slice(-Math.max(1, Math.floor(trimmed.length / 2)));
  if (write(halved)) {
    log.warn(`Chat history for "${key}" truncated to fit storage quota.`);
    return;
  }
  log.warn(`Unable to persist chat history for "${key}".`);
}

/** Forget a client's transcript — used by the "new conversation" action. */
export function clearChatHistory(clientId: string): void {
  if (!clientId) return;
  tryRemove(chatHistoryKey(clientId));
}
