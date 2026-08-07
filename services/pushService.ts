/**
 * Push-notification bootstrap for the Capacitor native shells.
 *
 * Called from App.tsx after login. Web builds are a no-op: registration only
 * runs when we're inside the native Capacitor runtime.
 *
 * Flow:
 *   1. Ask the user for permission (iOS prompts, Android 13+ prompts).
 *   2. Register with APNs/FCM.
 *   3. When the native layer hands us an FCM token, POST it to the server
 *      so future sends can target this device.
 *   4. Foreground-received notifications surface via a small in-app callback
 *      so we don't rely on the OS shade while the app is open.
 *
 * The whole thing is wrapped in try/catch: push registration failing must
 * never break the app boot.
 */

import { Capacitor } from '@capacitor/core';
import { resolveApiBaseUrl } from './apiBase';
import { APP_VARIANT } from '../utils/appVariant';
import { createLogger } from '../utils/logger';

const log = createLogger('push');
const TOKEN_KEY = 'swingnote_api_token';
const REGISTERED_TOKEN_KEY = 'coachxai_last_push_token';

type ForegroundHandler = (payload: {
  title: string;
  body: string;
  data: Record<string, string>;
}) => void;

let foregroundHandler: ForegroundHandler | null = null;
let initialized = false;

export function setForegroundNotificationHandler(handler: ForegroundHandler | null): void {
  foregroundHandler = handler;
}

function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

async function postToken(token: string): Promise<void> {
  const jwt = localStorage.getItem(TOKEN_KEY);
  if (!jwt) {
    log.warn('no JWT — skipping token upload (will retry after login)');
    return;
  }
  const base = resolveApiBaseUrl();
  const platform = Capacitor.getPlatform() as 'ios' | 'android';
  const appVariant = APP_VARIANT ?? 'student';
  const res = await fetch(`${base}/api/push/register-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ token, platform, appVariant }),
  });
  if (!res.ok) {
    throw new Error(`register-token failed: HTTP ${res.status}`);
  }
  localStorage.setItem(REGISTERED_TOKEN_KEY, token);
}

/**
 * Initialize native push. Safe to call multiple times — the second call is
 * a no-op. Call this after a successful login so we have a JWT to attach.
 */
export async function initializePush(): Promise<void> {
  if (initialized) return;
  if (!isNativePlatform()) {
    log.info('web platform — push disabled');
    return;
  }
  initialized = true;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    const perm = await PushNotifications.checkPermissions();
    let granted = perm.receive === 'granted';
    if (!granted && perm.receive === 'prompt') {
      const req = await PushNotifications.requestPermissions();
      granted = req.receive === 'granted';
    }
    if (!granted) {
      log.warn('push permission not granted');
      return;
    }

    PushNotifications.addListener('registration', (token) => {
      log.info('got push token');
      postToken(token.value).catch((err) => log.error('token upload failed', err));
    });

    PushNotifications.addListener('registrationError', (err) => {
      log.error('registration error', err);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      // Fires while the app is in the foreground. iOS otherwise silently
      // drops the OS banner in that state.
      const payload = {
        title: notification.title ?? '',
        body: notification.body ?? '',
        data: (notification.data as Record<string, string>) ?? {},
      };
      foregroundHandler?.(payload);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      // Fires when the user taps a notification (from tray or foreground).
      const deepLink = (action.notification.data as Record<string, string>)?.deepLink;
      if (deepLink && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('coachxai:push-deep-link', { detail: deepLink }));
      }
    });

    await PushNotifications.register();
  } catch (err) {
    log.error('initializePush failed', err);
  }
}

/**
 * Clear the device token from the server (called on explicit logout so the
 * device stops receiving pushes for the previous user).
 */
export async function unregisterCurrentDevice(): Promise<void> {
  const token = localStorage.getItem(REGISTERED_TOKEN_KEY);
  if (!token) return;
  const jwt = localStorage.getItem(TOKEN_KEY);
  if (!jwt) return;
  const base = resolveApiBaseUrl();
  try {
    await fetch(`${base}/api/push/tokens/${encodeURIComponent(token)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${jwt}` },
    });
  } catch (err) {
    log.error('unregisterCurrentDevice failed', err);
  } finally {
    localStorage.removeItem(REGISTERED_TOKEN_KEY);
  }
}
