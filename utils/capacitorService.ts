/**
 * capacitorService.ts
 *
 * Central service layer for all Capacitor native-plugin interactions.
 * Every method silently no-ops when running on the web so the same code
 * can be used in both the web and native builds without branching at each
 * call-site.
 */

import { isNative, isAndroid, isIOS } from './platformUtils';
import { createLogger } from './logger';

const log = createLogger('capacitor');

// ─── App theme constants ──────────────────────────────────────────────────────
// Keep in sync with the `theme_color` in public/manifest.json and index.html.
const APP_THEME_COLOR = '#10b981';
const APP_BACKGROUND_COLOR = '#f9fafb';

// ─── Status Bar ───────────────────────────────────────────────────────────────

/**
 * Apply the app status bar style.
 * No-ops on the web or when the plugin is unavailable.
 */
export async function initStatusBar(): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Default });
    // On Android, set a translucent background that blends with the app.
    if (isAndroid()) {
      await StatusBar.setBackgroundColor({ color: APP_THEME_COLOR });
    }
  } catch (e) {
    log.warn('StatusBar init failed:', e);
  }
}

// ─── Splash Screen ────────────────────────────────────────────────────────────

/**
 * Hide the native splash screen after the React tree has mounted.
 */
export async function hideSplashScreen(): Promise<void> {
  if (!isNative()) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 300 });
  } catch (e) {
    log.warn('SplashScreen hide failed:', e);
  }
}

// ─── App Lifecycle (Back Button – Android) ────────────────────────────────────

type BackButtonHandler = () => boolean | void;
let _backButtonHandler: BackButtonHandler | null = null;
let _backButtonListenerRegistered = false;

/**
 * Register a global back-button listener for Android.
 * The provided `handler` is called on every hardware back press.
 * Return `true` (or any truthy value) from the handler to prevent the default
 * behaviour (which closes the WebView / quits the app).
 *
 * Call this once during app startup. Pass a new handler to update the action.
 */
export async function registerBackButtonHandler(
  handler: BackButtonHandler
): Promise<void> {
  if (!isAndroid()) return;
  _backButtonHandler = handler;
  if (_backButtonListenerRegistered) return; // listener already attached
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', ({ canGoBack }) => {
      if (_backButtonHandler) {
        const handled = _backButtonHandler();
        if (handled) return;
      }
      // Default: go back in browser history or exit the app
      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });
    _backButtonListenerRegistered = true;
  } catch (e) {
    log.warn('App back button listener failed:', e);
  }
}

// ─── Push Notifications ───────────────────────────────────────────────────────

export type PushTokenCallback = (token: string) => void;
export type PushNotificationCallback = (notification: {
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
}) => void;

/**
 * Request push notification permission and register the device.
 * Calls `onToken` with the FCM / APNs device token when registration succeeds.
 * Calls `onNotification` whenever a foreground push notification arrives.
 *
 * No-ops on the web (web push is handled by the service worker).
 */
export async function registerPushNotifications(
  onToken: PushTokenCallback,
  onNotification?: PushNotificationCallback
): Promise<void> {
  if (!isNative()) return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Request permission
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') {
      log.warn('Push notification permission denied.');
      return;
    }

    // Register with APNs / FCM
    await PushNotifications.register();

    // Receive the token
    await PushNotifications.addListener('registration', (token) => {
      onToken(token.value);
    });

    // Handle registration errors
    await PushNotifications.addListener('registrationError', (error) => {
      log.error('Push registration error:', error.error);
    });

    // Handle foreground notifications
    if (onNotification) {
      await PushNotifications.addListener(
        'pushNotificationReceived',
        (notification) => {
          onNotification({
            title: notification.title,
            body: notification.body,
            data: notification.data as Record<string, unknown>,
          });
        }
      );
    }
  } catch (e) {
    log.warn('Push notification setup failed:', e);
  }
}

// ─── Haptics ─────────────────────────────────────────────────────────────────

/**
 * Trigger a light haptic impact (e.g. on button press).
 * No-ops on the web.
 */
export async function hapticLight(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch (e) {
    // Silently ignore – haptics are a progressive enhancement
  }
}

/**
 * Trigger a medium haptic impact.
 * No-ops on the web.
 */
export async function hapticMedium(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch (e) {
    // Silently ignore
  }
}

/**
 * Trigger a notification-style haptic feedback (success / warning / error).
 */
export async function hapticNotification(
  type: 'SUCCESS' | 'WARNING' | 'ERROR' = 'SUCCESS'
): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    const typeMap = {
      SUCCESS: NotificationType.Success,
      WARNING: NotificationType.Warning,
      ERROR: NotificationType.Error,
    };
    await Haptics.notification({ type: typeMap[type] });
  } catch (e) {
    // Silently ignore
  }
}

// ─── Keyboard ─────────────────────────────────────────────────────────────────

/**
 * Dismiss the software keyboard programmatically.
 * No-ops on the web.
 */
export async function hideKeyboard(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Keyboard } = await import('@capacitor/keyboard');
    await Keyboard.hide();
  } catch (e) {
    // Silently ignore
  }
}
