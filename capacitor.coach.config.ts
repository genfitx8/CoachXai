import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.coachxai.coach',
  appName: 'CoachX AI Coach',
  webDir: 'dist-coach',
  server: {
    // Load the web UI from the deployed Vercel site instead of the bundled
    // dist-coach assets. Every web release goes live on the native shell
    // instantly — no new APK / TestFlight build needed for content changes.
    //
    // Trade-offs:
    //   - Requires the phone to be online at app open (no offline mode).
    //   - Firebase auth callbacks and OAuth must be configured for this host.
    //   - Native plugins (Camera, Push, etc.) still work.
    //
    // Swap this to your actual production domain if you use a custom domain.
    // ?variant=coach tells the shared web deploy this shell is the coach
    // app, so utils/appVariant.ts locks the login/UI to coach-only.
    url: 'https://coach-xai.vercel.app/?variant=coach',
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#f9fafb',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'DEFAULT',
      overlaysWebView: false,
    },
  },
  ios: {
    path: 'native/coach/ios',
    contentInset: 'automatic',
    backgroundColor: '#f9fafb',
  },
  android: {
    path: 'native/coach/android',
    backgroundColor: '#f9fafb',
    allowMixedContent: false,
    // targetSdk is 35, so Android 15 draws this activity edge-to-edge and
    // ignores the legacy opt-outs — including the StatusBar plugin's
    // `overlaysWebView: false` above, which only sets deprecated
    // systemUiVisibility flags. The WebView then spans the whole display and
    // the app paints under the status bar and under the navigation / gesture
    // bar.
    //
    // CSS cannot recover this on Android: the WebView only reports a display
    // cutout through `env(safe-area-inset-*)`, never the system bars, so
    // every safe-area rule in index.css resolves to 0px there. "auto" makes
    // Capacitor apply the real window insets as WebView margins on Android
    // 15+ (and leaves older versions untouched), which is what actually keeps
    // the header and the bottom tab bar clear of the phone's buttons.
    //
    // Capacitor 8 will default to "auto"; setting it explicitly also pins the
    // behaviour across that upgrade.
    adjustMarginsForEdgeToEdge: 'auto',
  },
};

export default config;
