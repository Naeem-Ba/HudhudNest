import type { CapacitorConfig } from '@capacitor/cli';

const allowCleartext =
  process.env['CAPACITOR_ALLOW_CLEARTEXT'] === 'true';

const config: CapacitorConfig = {
  appId: 'com.hudhudnest.app',
  appName: 'HudhudNest',
  webDir: 'dist/HudhudNest/browser',

  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',

    // يجب أن يبقى false في الإنتاج.
    // فعّله مؤقتاً فقط أثناء التطوير عبر متغير البيئة:
    // CAPACITOR_ALLOW_CLEARTEXT=true
    cleartext: allowCleartext,

    allowNavigation: [
      'hudhudnest.com',
      '*.hudhudnest.com',
    ],
  },

  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scrollEnabled: true,
  },

  plugins: {
    SystemBars: {
      insetsHandling: 'css',
    },
    // The app already shows incoming notifications itself while it is open (SignalR toast), so the
    // OS must not show a second one for the same event. Background delivery is unaffected.
    FirebaseMessaging: {
      presentationOptions: [],
    },
  },
};

export default config;