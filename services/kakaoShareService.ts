/**
 * kakaoShareService
 *
 * Wraps the KakaoTalk JavaScript SDK Share API so lesson notes can be
 * sent via KakaoTalk directly from the browser / PWA.
 *
 * Required setup:
 *  1. Add your Kakao JavaScript App Key to .env:
 *       VITE_KAKAO_APP_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *  2. Register the site domain in Kakao Developers console
 *     (https://developers.kakao.com) under [My Application] → [Platform].
 *
 * The Kakao SDK script is loaded dynamically once and cached.
 */

import { Lesson } from '../types';

declare global {
  interface Window {
    Kakao?: {
      isInitialized: () => boolean;
      init: (key: string) => void;
      Share: {
        sendDefault: (options: KakaoFeedTemplate) => void;
      };
    };
  }
}

interface KakaoFeedTemplate {
  objectType: 'feed';
  content: {
    title: string;
    description: string;
    imageUrl?: string;
    link: { mobileWebUrl: string; webUrl: string };
  };
  buttons?: Array<{
    title: string;
    link: { mobileWebUrl: string; webUrl: string };
  }>;
}

const KAKAO_SDK_URL =
  'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';

/**
 * Lazily loads the Kakao JS SDK from CDN.
 * Returns a promise that resolves when the script is ready.
 */
function loadKakaoSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Kakao) {
      resolve();
      return;
    }

    const existing = document.getElementById('kakao-sdk');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error('Kakao SDK 로드 실패'))
      );
      return;
    }

    const script = document.createElement('script');
    script.id = 'kakao-sdk';
    script.src = KAKAO_SDK_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Kakao SDK 로드 실패'));
    document.head.appendChild(script);
  });
}

/**
 * Initialises the Kakao SDK with the app key from environment variables.
 * Returns `false` if the app key is not configured.
 */
async function initKakao(): Promise<boolean> {
  const appKey = import.meta.env.VITE_KAKAO_APP_KEY as string | undefined;
  if (!appKey) {
    return false;
  }

  try {
    await loadKakaoSdk();
  } catch {
    return false;
  }

  if (!window.Kakao) return false;

  if (!window.Kakao.isInitialized()) {
    window.Kakao.init(appKey);
  }

  return true;
}

/**
 * Builds a human-readable description from a lesson record.
 */
function buildLessonDescription(lesson: Lesson): string {
  const parts: string[] = [];

  if (lesson.coachNotes) {
    parts.push(`📝 코치 메모\n${lesson.coachNotes}`);
  }

  if (lesson.aiAnalysis) {
    // Truncate AI analysis to keep the message concise
    const maxLen = 200;
    const trimmed =
      lesson.aiAnalysis.length > maxLen
        ? lesson.aiAnalysis.slice(0, maxLen) + '…'
        : lesson.aiAnalysis;
    parts.push(`🤖 AI 분석\n${trimmed}`);
  }

  if (lesson.tags && lesson.tags.length > 0) {
    parts.push(`🏷️ 태그: ${lesson.tags.join(', ')}`);
  }

  return parts.length > 0
    ? parts.join('\n\n')
    : '레슨 내용을 확인하세요.';
}

/**
 * Shares a lesson note via KakaoTalk Feed template.
 *
 * @returns `'success'` on success, `'no_key'` if `VITE_KAKAO_APP_KEY` is
 *          not set, or `'error'` if the SDK fails to load/share.
 */
export async function sendLessonNoteViaKakao(
  lesson: Lesson
): Promise<'success' | 'no_key' | 'error'> {
  const initialized = await initKakao();
  if (!initialized) {
    return 'no_key';
  }

  if (!window.Kakao?.Share) {
    return 'error';
  }

  const pageUrl = window.location.origin;
  const title = `[스윙노트] ${lesson.clientName}님 레슨 기록 – ${lesson.date}`;
  const description = buildLessonDescription(lesson);

  const feedTemplate: KakaoFeedTemplate = {
    objectType: 'feed',
    content: {
      title,
      description,
      link: {
        mobileWebUrl: pageUrl,
        webUrl: pageUrl,
      },
    },
    buttons: [
      {
        title: '스윙노트 열기',
        link: {
          mobileWebUrl: pageUrl,
          webUrl: pageUrl,
        },
      },
    ],
  };

  if (lesson.thumbnailUrl) {
    feedTemplate.content.imageUrl = lesson.thumbnailUrl;
  }

  try {
    window.Kakao.Share.sendDefault(feedTemplate);
    return 'success';
  } catch {
    return 'error';
  }
}
