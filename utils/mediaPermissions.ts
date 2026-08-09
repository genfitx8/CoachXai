/**
 * mediaPermissions.ts
 *
 * Helpers for requesting camera / microphone access with a friendly
 * fallback flow when the user (or the OS) has already denied the
 * permission. The goal is to make it trivial for non-technical users
 * to jump straight to the settings screen and re-enable access,
 * instead of hitting a dead-end error message.
 */

import { isNative, isIOS, isAndroid, getPlatform } from './platformUtils';
import { createLogger } from './logger';

const log = createLogger('mediaPermissions');

export type MediaKind = 'camera' | 'microphone' | 'both';

export type MediaPermissionErrorKind =
  | 'denied' // User (or OS) has denied permission
  | 'unavailable' // No matching device found
  | 'busy' // Device is in use by another app
  | 'unsupported' // Browser / platform doesn't expose the API
  | 'unknown';

export interface MediaPermissionError {
  kind: MediaPermissionErrorKind;
  requested: MediaKind;
  original: unknown;
}

/**
 * Wraps `navigator.mediaDevices.getUserMedia` and normalises the
 * possible failures into a structured error. Callers can react to
 * `kind === 'denied'` by showing the settings-jump modal.
 */
export async function requestMediaStream(
  constraints: MediaStreamConstraints
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw {
      kind: 'unsupported',
      requested: kindFromConstraints(constraints),
      original: new Error('navigator.mediaDevices.getUserMedia unavailable'),
    } satisfies MediaPermissionError;
  }
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    throw normalizeMediaError(err, constraints);
  }
}

export function normalizeMediaError(
  err: unknown,
  constraints: MediaStreamConstraints
): MediaPermissionError {
  const requested = kindFromConstraints(constraints);
  let kind: MediaPermissionErrorKind = 'unknown';
  if (err instanceof Error) {
    switch (err.name) {
      case 'NotAllowedError':
      case 'SecurityError':
      case 'PermissionDeniedError':
        kind = 'denied';
        break;
      case 'NotFoundError':
      case 'OverconstrainedError':
      case 'DevicesNotFoundError':
        kind = 'unavailable';
        break;
      case 'NotReadableError':
      case 'TrackStartError':
        kind = 'busy';
        break;
      case 'TypeError':
        kind = 'unsupported';
        break;
    }
  }
  return { kind, requested, original: err };
}

export function kindFromConstraints(c: MediaStreamConstraints): MediaKind {
  const wantsVideo = !!c.video;
  const wantsAudio = !!c.audio;
  if (wantsVideo && wantsAudio) return 'both';
  if (wantsVideo) return 'camera';
  return 'microphone';
}

/**
 * Checks whether a `MediaPermissionError`-shaped object is truthy.
 * Handy when awaiting `requestMediaStream` inside a try/catch.
 */
export function isMediaPermissionError(e: unknown): e is MediaPermissionError {
  return (
    !!e &&
    typeof e === 'object' &&
    'kind' in (e as Record<string, unknown>) &&
    'requested' in (e as Record<string, unknown>)
  );
}

/**
 * Best-effort jump to the platform's app / site permissions screen.
 *
 * - On iOS (native Capacitor shell) the special `app-settings:` URL is
 *   handled by WKWebView and pops the user into the app-specific
 *   Settings pane where they can flip Camera / Microphone back on.
 * - On Android and the web there is no cross-platform way to open the
 *   OS settings from JavaScript alone, so the caller should fall back
 *   to showing step-by-step instructions.
 *
 * Returns `true` when the OS should honour the jump, `false` when the
 * caller should show manual instructions instead.
 */
export function openAppSettings(): boolean {
  try {
    if (isNative() && isIOS()) {
      window.location.href = 'app-settings:';
      return true;
    }
  } catch (e) {
    log.warn('openAppSettings failed:', e);
  }
  return false;
}

/**
 * A ~2-second window in which the app can proactively call
 * `openAppSettings()` after the user taps a button. Some WebViews
 * suppress non-user-gesture navigations, so this is exposed as a
 * synchronous call rather than a promise-returning helper.
 */
export function canJumpToAppSettings(): boolean {
  return isNative() && isIOS();
}

export type Language = 'ko' | 'en' | 'ja' | 'th';

interface InstructionCopy {
  title: string;
  intro: string;
  primaryLabel: string;
  primaryHint?: string;
  steps: string[];
  retryLabel: string;
  closeLabel: string;
}

const COPY: Record<Language, Record<MediaKind, InstructionCopy>> = {
  ko: {
    camera: {
      title: '카메라 권한이 필요해요',
      intro: '카메라를 사용할 수 있도록 권한을 켜주세요.',
      primaryLabel: '설정 열기',
      primaryHint: '아래 안내대로 켜주세요.',
      steps: [],
      retryLabel: '다시 시도',
      closeLabel: '닫기',
    },
    microphone: {
      title: '마이크 권한이 필요해요',
      intro: '마이크를 사용할 수 있도록 권한을 켜주세요.',
      primaryLabel: '설정 열기',
      primaryHint: '아래 안내대로 켜주세요.',
      steps: [],
      retryLabel: '다시 시도',
      closeLabel: '닫기',
    },
    both: {
      title: '카메라와 마이크 권한이 필요해요',
      intro: '카메라와 마이크를 사용할 수 있도록 권한을 켜주세요.',
      primaryLabel: '설정 열기',
      primaryHint: '아래 안내대로 켜주세요.',
      steps: [],
      retryLabel: '다시 시도',
      closeLabel: '닫기',
    },
  },
  en: {
    camera: {
      title: 'Camera access needed',
      intro: 'Please enable camera access so this feature can work.',
      primaryLabel: 'Open Settings',
      primaryHint: 'Follow the steps below.',
      steps: [],
      retryLabel: 'Try again',
      closeLabel: 'Close',
    },
    microphone: {
      title: 'Microphone access needed',
      intro: 'Please enable microphone access so this feature can work.',
      primaryLabel: 'Open Settings',
      primaryHint: 'Follow the steps below.',
      steps: [],
      retryLabel: 'Try again',
      closeLabel: 'Close',
    },
    both: {
      title: 'Camera and microphone access needed',
      intro: 'Please enable both camera and microphone access.',
      primaryLabel: 'Open Settings',
      primaryHint: 'Follow the steps below.',
      steps: [],
      retryLabel: 'Try again',
      closeLabel: 'Close',
    },
  },
  ja: {
    camera: {
      title: 'カメラの権限が必要です',
      intro: 'この機能を使うためにカメラのアクセスを許可してください。',
      primaryLabel: '設定を開く',
      primaryHint: '下記の手順で許可してください。',
      steps: [],
      retryLabel: '再試行',
      closeLabel: '閉じる',
    },
    microphone: {
      title: 'マイクの権限が必要です',
      intro: 'この機能を使うためにマイクのアクセスを許可してください。',
      primaryLabel: '設定を開く',
      primaryHint: '下記の手順で許可してください。',
      steps: [],
      retryLabel: '再試行',
      closeLabel: '閉じる',
    },
    both: {
      title: 'カメラとマイクの権限が必要です',
      intro: 'カメラとマイクのアクセスを許可してください。',
      primaryLabel: '設定を開く',
      primaryHint: '下記の手順で許可してください。',
      steps: [],
      retryLabel: '再試行',
      closeLabel: '閉じる',
    },
  },
  th: {
    camera: {
      title: 'ต้องการสิทธิ์กล้อง',
      intro: 'โปรดอนุญาตให้แอปใช้กล้อง',
      primaryLabel: 'เปิดการตั้งค่า',
      primaryHint: 'ทำตามขั้นตอนด้านล่าง',
      steps: [],
      retryLabel: 'ลองใหม่',
      closeLabel: 'ปิด',
    },
    microphone: {
      title: 'ต้องการสิทธิ์ไมโครโฟน',
      intro: 'โปรดอนุญาตให้แอปใช้ไมโครโฟน',
      primaryLabel: 'เปิดการตั้งค่า',
      primaryHint: 'ทำตามขั้นตอนด้านล่าง',
      steps: [],
      retryLabel: 'ลองใหม่',
      closeLabel: 'ปิด',
    },
    both: {
      title: 'ต้องการสิทธิ์กล้องและไมโครโฟน',
      intro: 'โปรดอนุญาตให้แอปใช้กล้องและไมโครโฟน',
      primaryLabel: 'เปิดการตั้งค่า',
      primaryHint: 'ทำตามขั้นตอนด้านล่าง',
      steps: [],
      retryLabel: 'ลองใหม่',
      closeLabel: 'ปิด',
    },
  },
};

/**
 * Step-by-step instructions for turning permissions back on.
 * We separate this from the modal component so the modal itself can
 * stay presentational and easy to reuse.
 */
export function getPermissionSteps(kind: MediaKind, lang: Language): string[] {
  const platform = getPlatform();
  const permName = permNameByLang(kind, lang);

  if (platform === 'ios') {
    switch (lang) {
      case 'en':
        return [
          `Tap "Open Settings" — iOS will jump straight to CoachX AI settings.`,
          `Turn on the ${permName} switch.`,
          `Come back to the app and try again.`,
        ];
      case 'ja':
        return [
          `「設定を開く」をタップすると、CoachX AI の設定画面が開きます。`,
          `${permName} のスイッチをオンにしてください。`,
          `アプリに戻ってもう一度お試しください。`,
        ];
      case 'th':
        return [
          `แตะ "เปิดการตั้งค่า" เพื่อไปยังหน้าตั้งค่าของ CoachX AI`,
          `เปิดสวิตช์ ${permName}`,
          `กลับมาที่แอปแล้วลองใหม่อีกครั้ง`,
        ];
      default:
        return [
          `아래의 "설정 열기"를 누르면 CoachX AI 설정 화면으로 바로 이동해요.`,
          `${permName} 스위치를 켜주세요.`,
          `앱으로 돌아와서 다시 시도해주세요.`,
        ];
    }
  }

  if (platform === 'android') {
    switch (lang) {
      case 'en':
        return [
          `Open the phone's Settings app.`,
          `Tap "Apps" (or "Applications") → CoachX AI.`,
          `Tap "Permissions" and turn on ${permName}.`,
          `Return to the app and try again.`,
        ];
      case 'ja':
        return [
          `端末の「設定」アプリを開いてください。`,
          `「アプリ」→ CoachX AI を選択します。`,
          `「権限」から ${permName} をオンにしてください。`,
          `アプリに戻ってもう一度お試しください。`,
        ];
      case 'th':
        return [
          `เปิดแอป "การตั้งค่า" ของเครื่อง`,
          `แตะ "แอป" → CoachX AI`,
          `เลือก "สิทธิ์" แล้วเปิด ${permName}`,
          `กลับมาที่แอปแล้วลองใหม่อีกครั้ง`,
        ];
      default:
        return [
          `휴대폰의 "설정" 앱을 열어주세요.`,
          `"앱" → CoachX AI 를 선택해주세요.`,
          `"권한" 항목에서 ${permName}을(를) 켜주세요.`,
          `앱으로 돌아와서 다시 시도해주세요.`,
        ];
    }
  }

  // Web fallback — browser-agnostic instructions.
  switch (lang) {
    case 'en':
      return [
        `Look for the lock icon in the browser's address bar and tap it.`,
        `Set ${permName} to "Allow".`,
        `Reload the page and try again.`,
      ];
    case 'ja':
      return [
        `ブラウザのアドレスバーにある鍵アイコンをタップしてください。`,
        `${permName} を「許可」に変更します。`,
        `ページを再読み込みしてもう一度お試しください。`,
      ];
    case 'th':
      return [
        `แตะไอคอนกุญแจในแถบที่อยู่ของเบราว์เซอร์`,
        `ตั้งค่า ${permName} เป็น "อนุญาต"`,
        `รีเฟรชหน้าเว็บแล้วลองใหม่อีกครั้ง`,
      ];
    default:
      return [
        `브라우저 주소창 왼쪽의 자물쇠 아이콘을 눌러주세요.`,
        `${permName} 항목을 "허용"으로 바꿔주세요.`,
        `페이지를 새로고침한 뒤 다시 시도해주세요.`,
      ];
  }
}

function permNameByLang(kind: MediaKind, lang: Language): string {
  const map: Record<Language, Record<MediaKind, string>> = {
    ko: { camera: '카메라', microphone: '마이크', both: '카메라와 마이크' },
    en: { camera: 'Camera', microphone: 'Microphone', both: 'Camera and Microphone' },
    ja: { camera: 'カメラ', microphone: 'マイク', both: 'カメラとマイク' },
    th: { camera: 'กล้อง', microphone: 'ไมโครโฟน', both: 'กล้องและไมโครโฟน' },
  };
  return map[lang][kind];
}

export function getPermissionCopy(kind: MediaKind, lang: Language): InstructionCopy {
  const base = COPY[lang]?.[kind] ?? COPY.ko[kind];
  return { ...base, steps: getPermissionSteps(kind, lang) };
}

// Silence unused-import warnings when the file is used only for its types.
void isAndroid;
