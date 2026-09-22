import type { CapacitorConfig } from '@capacitor/cli';

const allowCleartext =
  process.env['CAPACITOR_ALLOW_CLEARTEXT'] === 'true';

const config: CapacitorConfig = {
  // ⚠️ appId متروك عمداً كما هو (com.realestate.app) — هوية تطبيق/توقيع حية على متاجر
  // التطبيقات، تغييرها يكسر مسار تحديثات المستخدمين الحاليين. راجع تقرير إعادة التسمية.
  appId: 'com.realestate.app',
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
      'realestateworld.world',
      '*.realestateworld.world',
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