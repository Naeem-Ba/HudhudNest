import type { CapacitorConfig } from '@capacitor/cli';

const allowCleartext =
  process.env['CAPACITOR_ALLOW_CLEARTEXT'] === 'true';

const config: CapacitorConfig = {
  appId: 'com.realestate.app',
  appName: 'Real Estate World',
  webDir: 'dist/Wohnungsmieten/browser',

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
  },
};

export default config;