# روابط التطبيق الأصلية (Deep Links) — Android App Links و iOS Universal Links

عند الضغط على رابط مثل `https://hudhudnest.com/properties/<id>` (مثلًا من رسالة واتساب مُشارَكة) يفتح **التطبيق المثبّت** على الصفحة نفسها بدل المتصفح. إن لم يكن التطبيق مثبّتًا يفتح الموقع كالمعتاد.

## كيف يعمل (ثلاث طبقات)

| الطبقة | من يقرّر | الملفات |
|---|---|---|
| 1. هل يستلم التطبيق الرابط؟ | نظام التشغيل، بعد التحقق من ملف تملكه على الموقع | Android: `intent-filter` + `/.well-known/assetlinks.json` · iOS: entitlement + `/.well-known/apple-app-site-association` |
| 2. هل الرابط مسموح فتحه؟ | التطبيق (`resolveDeepLink`) | `src/app/core/deep-links/deep-link-routes.ts` |
| 3. التنقّل | `DeepLinkService` عبر `Router` (يعالج الإقلاع البارد `getLaunchUrl` والتشغيل الحاضر `appUrlOpen`) | `src/app/core/deep-links/deep-link.service.ts` |

مصدر الحقيقة الوحيد: **`deep-links.config.json`** (النطاق، المسارات، حزمة Android وبصمتها، معرّف iOS وTeam ID). كل ملف آخر مشتق منه أو مفحوص مقابله باختبار يفشل عند أي انحراف: `npm run test:tools`.

## الملفات

| الملف | الغرض |
|---|---|
| `deep-links.config.json` | المصدر الوحيد للإعدادات |
| `android/app/src/main/AndroidManifest.xml` | `intent-filter` مع `android:autoVerify="true"` لكل المسارات المسموحة |
| `ios/App/App/App.entitlements` | `applinks:hudhudnest.com` (Associated Domains) |
| `ios/App/App.xcodeproj/project.pbxproj` | ربط `CODE_SIGN_ENTITLEMENTS` في Debug وRelease |
| `tools/generate-deep-links.mjs` | يولّد `public/.well-known/assetlinks.json` و`apple-app-site-association` عند كل بناء (مُتجاهَلان في git) |
| `tools/lib/deep-links.mjs` + `.test.mjs` | منطق التوليد + حراس الانحراف (15 اختبارًا) |
| `tools/verify-deep-links.mjs` | يفحص الموقع **المنشور** (GET فقط): الحالة 200، بلا إعادة توجيه، `application/json`، المحتوى |
| `netlify.toml` | ترويسات `Content-Type: application/json` للملفين |

## المسارات المفتوحة في التطبيق

`/` (يفتح الرئيسية)، `/properties`، `/short-stay`، `/investments`، `/users`، `/wohnungen` (روابط قديمة)، `/kontakt`، `/valuation`، `/pricing`.

**لا تُفتح أبدًا:** `/auth/*` (روابط تأكيد البريد وإعادة كلمة المرور تبقى في المتصفح)، `/admin/*`، `/checkout/*`، `/profile`، `/messages`، `/favorites`، `/my-listings`، `/property-form`، و`/properties/edit/*`. الاختبارات تتحقق من ذلك.

## ما يجب عليك فعله (لا يمكن اشتقاقه من الكود)

### 1) iOS — مطلوب كي تعمل الروابط على iPhone
1. خذ **Team ID** من https://developer.apple.com/account ← Membership details (10 أحرف/أرقام).
2. اضبطه في Netlify: `Site configuration ← Environment variables ← APPLE_TEAM_ID` (لسياق Production)، **أو** ضعه في `ios.teamId` داخل `deep-links.config.json` (قيمة عامة غير سرية).
3. فعّل **Associated Domains** للمعرّف `com.realestate.app`: Certificates, Identifiers & Profiles ← Identifiers ← `com.realestate.app` ← Capabilities ← Associated Domains ← Save. ثم أعد توليد ملف التوفير (Provisioning Profile) — التوقيع التلقائي في Xcode/Codemagic يفعل ذلك عند البناء التالي.
4. أعد نشر الموقع (يُنشأ `apple-app-site-association` عند البناء). **حتى تُضبط الخطوة 2 لا يُنشأ الملف عمدًا**: ملف بمعرّف خاطئ أسوأ من لا ملف.

### 2) Android — بصمة الشهادة
- بصمة **مفتاح الرفع** (`aqar-tech`) مضافة سلفًا (موثّقة في `android/RELEASE_SIGNING.md`) وتكفي للبناءات الموقّعة من CI والتثبيت المباشر.
- إن كان التطبيق على Google Play مع **Play App Signing** (الافتراضي)، فالتطبيق المُوزَّع يُوقَّع بشهادة مختلفة. انسخ بصمة SHA-256 من Play Console ← Setup ← App signing ← "App signing key certificate" وأضفها في Netlify: `ANDROID_SHA256_CERT_FINGERPRINTS=<البصمة>` (تُدمج مع الموجودة؛ يمكن فصل عدة بصمات بفاصلة). بدونها لن يتحقق الرابط للمستخدمين القادمين من المتجر.

### 3) بعد النشر
```bash
npm run verify:deep-links            # يفحص https://hudhudnest.com
npm run verify:deep-links -- https://example.netlify.app
```
ثم اختبر على جهاز حقيقي (لا يغني عنه أي محاكي مضمّن في المتصفح):

**Android**
```bash
adb shell pm verify-app-links --re-verify com.realestate.app
adb shell pm get-app-links com.realestate.app          # المتوقع: hudhudnest.com: verified
adb shell am start -a android.intent.action.VIEW -d "https://hudhudnest.com/properties/<id>"
```
**iOS**: أرسل الرابط لنفسك في Notes أو Messages واضغط عليه (كتابة الرابط في شريط عنوان Safari لا تفتح التطبيق بتصميم iOS). يمكن أيضًا: `xcrun simctl openurl booted "https://hudhudnest.com/properties/<id>"`. يخزّن iOS ملف الربط عبر CDN خاص بـ Apple؛ للتحقق: `curl https://app-site-association.cdn-apple.com/a/v1/hudhudnest.com`.

## إضافة مسار جديد قابل للفتح
1. أضفه في `deep-links.config.json` (`paths.prefixes`).
2. أضفه في `DEEP_LINK_PATH_PREFIXES` داخل `deep-link-routes.ts`.
3. أضف `<data android:pathPrefix="…"/>` في `AndroidManifest.xml`.
4. `npm run test:tools` يفشل إن نسيت واحدة من الثلاث؛ وملف iOS يتولّد تلقائيًا.

## ملاحظات
- النطاق الأساسي فقط (`hudhudnest.com`)؛ `www` يحوَّل إليه بـ 301 وApple/Android لا يتبعان إعادة التوجيه عند جلب الملفين. روابط المشاركة تُبنى على النطاق الأساسي.
- بناءات Staging ومعاينات Netlify لا تفتح التطبيق (نطاقها مختلف عمدًا).
- أي تغيير في `AndroidManifest.xml` أو `.entitlements` يحتاج بناء تطبيق جديد (`npx cap sync` ثم بناء) — لا يكفي نشر الموقع.
