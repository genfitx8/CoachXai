import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.swingnote.app',
  appName: '스윙노트',
  webDir: 'dist',
  // Allow the native shell to load from a live dev server during development.
  // Remove or comment out the `server` block for production builds.
  server: {
    // androidScheme: 'https',
    // Uncomment and set a real URL during live-reload development:
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
      // Style.Default = dark text/icons on a light background (iOS & Android).
      // Change to Style.Light for white text/icons on a dark background.
      style: 'DEFAULT',
      overlaysWebView: false,
    },
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#f9fafb',
    // Allow camera/microphone/photo library usage descriptions in Info.plist
    // Add NSCameraUsageDescription, NSMicrophoneUsageDescription,
    // NSPhotoLibraryUsageDescription to ios/App/App/Info.plist
  },
  android: {
    backgroundColor: '#f9fafb',
    // Enable mixed content (required if loading some http assets during dev)
    allowMixedContent: false,
  },
};

export default config;
