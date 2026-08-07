/**
 * FCM (Firebase Cloud Messaging) send helpers.
 *
 * Firebase Admin credentials come from one of, in order:
 *   1. FIREBASE_SERVICE_ACCOUNT_JSON  — the full service-account JSON (recommended for Render/Vercel)
 *   2. GOOGLE_APPLICATION_CREDENTIALS — path to a service-account JSON file (local dev)
 *
 * Without either, all send helpers become no-ops so the rest of the server
 * keeps running and unit tests don't crash. isFcmReady() lets callers surface
 * a 503 for the push endpoints when the env is misconfigured.
 */

import admin from 'firebase-admin';
import pool from './db';

let initialized = false;

function tryInit(): void {
  if (initialized) return;
  if (admin.apps.length > 0) {
    initialized = true;
    return;
  }
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  try {
    if (json) {
      const parsed = JSON.parse(json);
      admin.initializeApp({
        credential: admin.credential.cert(parsed),
      });
      initialized = true;
      return;
    }
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      initialized = true;
      return;
    }
    console.warn(
      '[fcm] no FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS — push disabled'
    );
  } catch (err) {
    console.error('[fcm] Firebase Admin init failed:', err);
  }
}

tryInit();

export function isFcmReady(): boolean {
  tryInit();
  return initialized;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

async function getTokensForUser(
  userId: string,
  userRole: 'coach' | 'client'
): Promise<string[]> {
  const result = await pool.query<{ token: string }>(
    `SELECT token FROM device_tokens WHERE user_id = $1 AND user_role = $2`,
    [userId, userRole]
  );
  return result.rows.map((r) => r.token);
}

/**
 * Removes tokens that FCM rejected as unregistered / invalid so we stop
 * spraying dead devices on every send.
 */
async function pruneInvalidTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await pool.query(`DELETE FROM device_tokens WHERE token = ANY($1)`, [tokens]);
}

function buildMessage(token: string, payload: PushPayload): admin.messaging.Message {
  return {
    token,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: payload.data ?? {},
    android: {
      priority: 'high',
      notification: {
        channelId: 'default',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          contentAvailable: true,
        },
      },
    },
  };
}

export interface SendResult {
  requested: number;
  delivered: number;
  failed: number;
  invalidTokens: string[];
}

async function sendToTokens(
  tokens: string[],
  payload: PushPayload
): Promise<SendResult> {
  if (!isFcmReady() || tokens.length === 0) {
    return { requested: tokens.length, delivered: 0, failed: 0, invalidTokens: [] };
  }
  const messaging = admin.messaging();
  const invalidTokens: string[] = [];
  let delivered = 0;
  let failed = 0;

  // sendEach handles up to 500 messages per call.
  const CHUNK = 500;
  for (let i = 0; i < tokens.length; i += CHUNK) {
    const slice = tokens.slice(i, i + CHUNK);
    const messages = slice.map((t) => buildMessage(t, payload));
    const resp = await messaging.sendEach(messages);
    resp.responses.forEach((r, idx) => {
      if (r.success) {
        delivered += 1;
      } else {
        failed += 1;
        const code = r.error?.code ?? '';
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/invalid-argument'
        ) {
          invalidTokens.push(slice[idx]);
        }
      }
    });
  }

  await pruneInvalidTokens(invalidTokens);
  return { requested: tokens.length, delivered, failed, invalidTokens };
}

export async function sendToUser(
  userId: string,
  userRole: 'coach' | 'client',
  payload: PushPayload
): Promise<SendResult> {
  const tokens = await getTokensForUser(userId, userRole);
  return sendToTokens(tokens, payload);
}

export async function sendToUsers(
  users: Array<{ userId: string; userRole: 'coach' | 'client' }>,
  payload: PushPayload
): Promise<SendResult> {
  if (users.length === 0) {
    return { requested: 0, delivered: 0, failed: 0, invalidTokens: [] };
  }
  const rows = await pool.query<{ token: string }>(
    `SELECT DISTINCT token FROM device_tokens
      WHERE (user_id, user_role) IN (${users
        .map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`)
        .join(',')})`,
    users.flatMap((u) => [u.userId, u.userRole])
  );
  return sendToTokens(
    rows.rows.map((r) => r.token),
    payload
  );
}
