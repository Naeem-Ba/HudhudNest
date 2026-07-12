# استكشاف أعطال iOS

## `ios/` غير موجود

نفّذ على macOS:

```bash
npm install
npm run ios:setup
```

## `pod: command not found`

ثبّت CocoaPods ثم أعد السكربت.

## `No such module Capacitor`

```bash
npx cap sync ios
cd ios/App && pod install --repo-update
```

ثم افتح `App.xcworkspace` وليس `App.xcodeproj`.

## خطأ Signing

اختر Team، تحقق من Bundle Identifier، وأعد إنشاء Provisioning Profile تلقائياً من Xcode.

## شاشة بيضاء

تحقق من نجاح `npm run build:prod` ومن تطابق `webDir` مع مخرجات Angular، ثم `npx cap copy ios` وافحص Safari Web Inspector وXcode Console.

## API لا يعمل

تحقق من HTTPS وشهادة الخادم وCORS. لا تستخدم `NSAllowsArbitraryLoads` كحل عام؛ أصلح TLS أو أضف استثناءً ضيقاً ومؤقتاً فقط عند ضرورة موثقة.

## Safe Area لا تعمل

تحقق من وجود `viewport-fit=cover` ومن CSS `env(safe-area-inset-*)` ومن اختبار جهاز حقيقي، لا DevTools فقط.
