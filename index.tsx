import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import {
  initStatusBar,
  hideSplashScreen,
  registerBackButtonHandler,
} from './utils/capacitorService';
import { isNative } from './utils/platformUtils';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ─── Capacitor native initialization ─────────────────────────────────────────
// These calls no-op on the web, so this block is safe for all platforms.
(async () => {
  await initStatusBar();

  // Register the Android hardware back button.
  // The handler below uses default behaviour (history-back or app exit).
  // Override the handler when deeper navigation state management is needed,
  // e.g. to close a modal before navigating back.
  await registerBackButtonHandler(() => {
    // Return false to keep the default history-back / exit behaviour.
    return false;
  });

  // Hide the splash screen after the React tree is mounted and ready.
  await hideSplashScreen();
})();

// ─── Service worker (PWA / web-only) ─────────────────────────────────────────
// Skip service worker registration when running inside a native Capacitor shell
// because push and offline are handled by native plugins there.
if (!isNative() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[SW] Registered:', registration.scope);
      })
      .catch((err) => {
        console.error('Service worker registration failed:', err);
      });
  });
}
