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

    // hudhudnest.com أُضيف كنطاق ثانٍ (2026-09-23) دون إزالة realestateworld.world:
    // إزالته الآن تكسر أي نسخة تطبيق مثبَّتة لدى المستخدمين لم تُحدَّث بعد وما
    // زالت تُعيد التوجيه إلى النطاق القديم بعد مصادقة Apple/Google. يُزال بعد
    // التأكد أن كل الإصدارات المنشورة على المتاجر تستخدم hudhudnest.com فقط.
    allowNavigation: [
      'realestateworld.world',
      '*.realestateworld.world',
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