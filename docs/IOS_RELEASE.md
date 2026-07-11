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
