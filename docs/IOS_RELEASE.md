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

## بند متابعة مفتوح — أيقونة iOS (منذ دمج PR #35، 2026-09-02)

`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` هي حاليًا **شعار
Capacitor الافتراضي** (رمز X أزرق من قالب `cap add ios`)، وليست شعار التطبيق الحقيقي
(المنزل/المفتاح الذهبي في `resources/icon.png`، المستخدم فعلاً في أيقونات Android).
السبب: `resources/icon.png` نفسه 500×500 فقط — أقل من 1024×1024 التي يتطلبها App Store
لأيقونة العرض، فلم يُستبدَل الشعار الافتراضي تلقائيًا وقت توليد مشروع Xcode.

**قبل أول Archive/TestFlight حقيقي، يلزم أحد الخيارين:**
1. الحصول على مصدر حقيقي لشعار "Real Estate World" بدقة ≥ 1024×1024 (تصدير من ملف
   التصميم الأصلي، لا رفع دقة الصورة الحالية)، ثم توليد `AppIcon.appiconset` منه واستبدال
   `AppIcon-512@2x.png`.
2. أو قرار مقصود بقبول تكبير (upscale) `resources/icon.png` الحالي إلى 1024×1024 كحل
   مؤقت — مع العلم أن جودته لن تكون مثالية لصفحة App Store.

هذا لا يمنع بناء iOS غير الموقَّع في CI (‏`ios-build` في `frontend-ci.yml` ينجح بصرف النظر
عن محتوى الأيقونة)، لكنه يمنع اعتبار التطبيق جاهزًا للنشر بصريًا.
