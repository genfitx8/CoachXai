import { Capacitor } from '@capacitor/core';

/**
 * Returns true when running inside a native Capacitor shell (iOS or Android).
 * Falls back to false for the regular browser/PWA build.
 */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Returns true when running inside a Capacitor native iOS shell.
 * Returns false for the web/PWA build, including Safari on iOS.
 * For generic iOS browser detection use navigator.userAgent instead.
 */
export function isIOS(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

/**
 * Returns true when running inside a Capacitor native Android shell.
 * Returns false for the web/PWA build, including Chrome on Android.
 * For generic Android browser detection use navigator.userAgent instead.
 */
export function isAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/**
 * Returns the current platform string: 'ios' | 'android' | 'web'.
 */
export function getPlatform(): 'ios' | 'android' | 'web' {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
}

/**
 * Returns true when the app is running inside a WebView (native build).
 * Alias for isNative().
 */
export function isWebView(): boolean {
  return Capacitor.isNativePlatform();
}
