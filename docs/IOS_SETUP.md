# إعداد منصة iOS

## المتطلبات

- جهاز macOS حديث.
- Xcode مثبت ومفتوح مرة واحدة لقبول الرخصة وتنزيل المكونات.
- Command Line Tools: `xcode-select --install`.
- CocoaPods: `sudo gem install cocoapods` أو عبر Homebrew.
- Node وnpm متوافقان مع Angular 20.
- حساب Apple Developer للبناء على جهاز فعلي أو النشر.

## الإعداد الآلي

من جذر المشروع:

```bash
npm run ios:check
npm run ios:setup
```

ينفذ السكربت:

1. يتحقق من macOS وXcode وCocoaPods.
2. يثبت الاعتماديات.
3. يبني Angular بوضع الإنتاج.
4. ينفذ `npx cap add ios` إذا لم يوجد مجلد `ios/`.
5. ينفذ `npx cap sync ios`.
6. يضبط الاسم الظاهر وإدارة Status Bar.
7. ينسخ `PrivacyInfo.xcprivacy`.
8. يعيد المزامنة.

ثم افتح المشروع:

```bash
npm run ios:open
```

داخل Xcode افتح Target `App` ثم `Signing & Capabilities` واختر Team الصحيح. لا تغيّر Bundle Identifier بعد إصدار التطبيق: المعرّف النهائي بقرار المالك (2026-10-08) هو `com.hudhudnest.app`، ويجب تسجيله في Apple Developer (Identifiers) وإنشاء التطبيق به في App Store Connect قبل أول نشر. توفّره عند Apple UNCONFIRMED حتى يُسجَّل.
