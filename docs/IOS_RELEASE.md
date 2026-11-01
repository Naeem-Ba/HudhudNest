# بوابة إصدار iOS

لا يبدأ النشر قبل نجاح:

- `npm run ios:check`.
- Angular production build.
- `npx cap sync ios` دون أخطاء.
- Xcode Build على جهاز فعلي.
- Xcode Archive وValidate App.
- قائمة اختبار iOS الأساسية.
- مراجعة Privacy Manifest وبيانات App Store Privacy.
- تأكيد أن جميع الاتصالات HTTPS.
- تأكيد عدم وجود Secrets داخل `src/environments` أو المشروع الأصلي.
- App Icons وLaunch Screen النهائية.
- رقم Version وBuild Number جديدان.

## App Store Connect

أنشئ App Record بمعرف Bundle نفسه، ثم حمّل Archive عبر Organizer. أدخل سياسة الخصوصية، التصنيف العمري، لقطات الشاشة، بيانات الدعم، ووصف استخدام البيانات بما يطابق السلوك الفعلي. ملف Privacy Manifest الفارغ في هذه الحزمة نقطة بداية فقط؛ يجب تحديثه إذا أضيف SDK يجمع بيانات أو يستخدم Required Reason APIs.

## جاهزية iPhone: ما أُنجز في الكود وما يبقى على المالك (QA المرحلة 15، P15-D09)

**أُنجز في المستودع (يفحصه `npm run ios:check` وفي CI `npm run test:tools`):**

- `App.entitlements`: `aps-environment` (الإشعارات) و`com.apple.developer.applesignin` (الدخول بحساب Apple، مطلوب بقاعدة Apple 4.8 لأن التطبيق يقدّم Google) مع النطاق المرتبط.
- `Info.plist`: `UIBackgroundModes = remote-notification`، `UIRequiredDeviceCapabilities = arm64` (كانت armv7 ولا تطابق أي جهاز)، و`CFBundleLocalizations` (en/ar/de).
- نصوص نوافذ الأذونات (الموقع، الكاميرا، الصور، التتبع) بالعربية والألمانية والإنجليزية في `*.lproj/InfoPlist.strings`.
- `AppDelegate.swift` يمرّر رمز APNs وفشل التسجيل والإشعار الوارد إلى إضافة Firebase. بدونها لا يُنتَج رمز إشعار أبدًا.
- `PrivacyInfo.xcprivacy` أصبح ضمن حزمة التطبيق (كان الملف موجودًا ولا يُحزَم لأنه غير مضاف إلى مرحلة Resources).
- خطوة `ios-release` في `codemagic.yaml` تكتب `GoogleService-Info.plist` من سرّ وتتحقق أنه لهذا التطبيق وتضيفه إلى المشروع، وتفشل مغلقة إن غاب (نظير `google-services.json` في Android).
- طلب إذن الإشعارات لم يعد عند الدخول: زر في صفحة الإشعارات.

**لم يُجرَّب هنا:** لا Mac ولا Xcode ولا جهاز. ما سبق فحصٌ ثابت للملفات واتساقها، لا بناء ولا استقبال إشعار فعلي.

**خطواتك (لا يمكن فعلها من الكود):**

1. اشتراك Apple Developer (مؤجَّل لتقليل الكلفة)، ثم نسخ **Team ID** إلى `APPLE_TEAM_ID` في Netlify (أو `ios.teamId` في `deep-links.config.json`)، فيتولّد `apple-app-site-association` تلقائيًا.
2. في بوابة Apple، على معرّف التطبيق `com.hudhudnest.app` فعّل القدرات: **Push Notifications** و**Sign in with Apple** و**Associated Domains**.
3. في Firebase أضف تطبيق iOS بالمعرّف نفسه، ثم حمّل `GoogleService-Info.plist` وخزّن **Base64** له في مجموعة `frontend_env` في Codemagic باسم `GOOGLE_SERVICE_INFO_PLIST_BASE64`.
4. أنشئ مفتاح **APNs** (‎.p8) في بوابة Apple وارفعه إلى Firebase (Project settings > Cloud Messaging > Apple app configuration).
5. مفتاح App Store Connect API في Codemagic (باسم `codemagic_asc_api_key`).
6. أيقونة 1024×1024 من ملف التصميم الأصلي (انظر البند المفتوح أدناه).
7. App Store Connect: إجابات «خصوصية التطبيق» تطابق السلوك الفعلي (بريد، هاتف، اسم، صور الإعلانات، موقع تقريبي/دقيق عند الاستخدام، رمز الجهاز للإشعارات).
8. اختبار على iPhone حقيقي بقائمة `docs/MOBILE-DEVICE-TEST-CHECKLIST.md` (الجلسة، الإشعارات، الأذونات).

**عند تفعيل الإعلانات على iOS لاحقًا:** `NSUserTrackingUsageDescription` موجود الآن لكن لا شيء يستدعي نافذة ATT ولا `NSPrivacyTracking` مفعّل (والإعلانات معطّلة). غيّرهما معًا: `NSPrivacyTracking` و`NSPrivacyTrackingDomains` وإجابات الخصوصية ورسالة ATT في AdMob (انظر `docs/MONETIZATION.md`). يعرض `ios:check` تنبيهًا بهذا إلى أن يُحسم.

## بند متابعة مفتوح — أيقونة iOS (منذ دمج PR #35، 2026-09-02)

`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` هي حاليًا **شعار
Capacitor الافتراضي** (رمز X أزرق من قالب `cap add ios`)، وليست شعار التطبيق الحقيقي
(المنزل/المفتاح الذهبي في `resources/icon.png`، المستخدم فعلاً في أيقونات Android).
السبب: `resources/icon.png` نفسه 500×500 فقط — أقل من 1024×1024 التي يتطلبها App Store
لأيقونة العرض، فلم يُستبدَل الشعار الافتراضي تلقائيًا وقت توليد مشروع Xcode.

**قبل أول Archive/TestFlight حقيقي، يلزم أحد الخيارين:**
1. الحصول على مصدر حقيقي لشعار "HudhudNest" بدقة ≥ 1024×1024 (تصدير من ملف
   التصميم الأصلي، لا رفع دقة الصورة الحالية)، ثم توليد `AppIcon.appiconset` منه واستبدال
   `AppIcon-512@2x.png`.
2. أو قرار مقصود بقبول تكبير (upscale) `resources/icon.png` الحالي إلى 1024×1024 كحل
   مؤقت — مع العلم أن جودته لن تكون مثالية لصفحة App Store.

هذا لا يمنع بناء iOS غير الموقَّع في CI (‏`ios-build` في `frontend-ci.yml` ينجح بصرف النظر
عن محتوى الأيقونة)، لكنه يمنع اعتبار التطبيق جاهزًا للنشر بصريًا.
