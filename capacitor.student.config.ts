import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.coachxai.student',
  appName: 'CoachX AI',
  webDir: 'dist-student',
  server: {
    // Android WebView origin is https://localhost — must be allowed by the
    // backend's APP_ALLOWED_ORIGINS list.
    androidScheme: 'https',
    // Uncomment for live-reload against a running dev server:
    // url: 'http://YOUR_DEV_IP:3000',
    // cleartext: true,
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
    path: 'native/student/ios',
    contentInset: 'automatic',
    backgroundColor: '#f9fafb',
  },
  android: {
    path: 'native/student/android',
    backgroundColor: '#f9fafb',
    allowMixedContent: false,
  },
};

export default config;
