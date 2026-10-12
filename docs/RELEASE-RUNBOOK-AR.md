# دليل الإصدار: من الـ commit إلى المستخدم

يغطي الويب (Netlify)، وAndroid (Google Play)، وiOS (TestFlight ثم App Store)، وكيف يُعرف الفشل ويُتراجع عنه.
الـ API له دليله في مستودع HudhudNestApi (`docs/operations/application-rollback-runbook.md`).
تفاصيل نظام فحص التحديث: `docs/app-update-management.md` و`docs/app-release-procedure.md`.

## القاعدة التي تحكم كل شيء

الموافقة على النشر خطوة يدوية يقوم بها شخص: تشغيل workflow، أو الضغط على Publish، أو إرسال البناء في متجر.
لا شيء ينشر للمستخدمين من تلقاء نفسه. وكل خطوة تفشل مغلقة عند غياب متغير أو بناء ليس من الـ commit المقصود.

## 1. الويب

```
PR ← Frontend CI (تدقيق، اختبارات، بناء) ← دمج إلى main
  ← sync-staging ينقل staging إلى الـ commit الناجح ← Netlify يبني Staging (مجاني)
  ← npm run check:live -- https://staging--hudhudnest.netlify.app --expect staging --commit <sha>
  ← Actions ← "Promote to production" (يرفض إن لم يكن Staging على الـ commit نفسه)
  ← Netlify يبني الإنتاج من release (15 رصيدًا) ← Publish deploy يدويًا
  ← npm run check:live -- https://hudhudnest.com --commit <sha>
```

- "Promote to production" يتحقق من نجاح Frontend CI على الـ commit، ومن أنه على main، ولا يرجع للخلف ولا يفرض الدفع،
  ومن أن Staging الحي مبني من الـ commit نفسه. الخيار `skip_staging_check` للطوارئ فقط (Netlify Staging معطل).
- `live-environment-check` يعمل كل 3 ساعات ويفشل إن كان الموقع الحي بناء Staging أو معاينة أو بلا علامة بناء.
- لا تضغط "Start auto publishing" في Netlify أبدًا.

### التراجع (الويب)
Netlify ← Deploys ← اختر آخر deploy سليم ← Publish deploy (مجاني). ثم `npm run check:live` وانتبه للـ commit المطبوع.

## 2. الهاتف: Android وiOS

كل إصدار متجر يبدأ بـ **tag** `v<major>.<minor>.<patch>` على commit موجود في main.

### أ. تجهيز الإصدار
1. `npm run version:set -- 1.2.0` (يكتب Android وiOS معًا ويرفع رقم البناء؛ أو `--build N`). `version:check --strict`
   في CI يفشل إن اختلفت المنصتان.
2. PR ثم دمج إلى main ثم انتظر Frontend CI أخضر.
3. `git tag v1.2.0 <sha-of-main>` ثم `git push origin v1.2.0`.

### ب. Android (GitHub Actions)
الـ tag يشغّل `Frontend CI` كاملًا ثم `android-release` الذي:
- يتحقق أن الـ tag = versionName في المشروعين، وأن الـ commit على main؛
- يفشل إن غاب `GOOGLE_CLIENT_ID` أو `GOOGLE_SERVICES_JSON_BASE64` (إلا مع `ANDROID_PUSH_DISABLED=true`)؛
- يبني الويب إنتاجًا ويتحقق أن `build-info.json` إنتاج ومن الـ commit نفسه؛
- يوقّع AAB ويحفظه في Release باسم `android-latest` (مع الإصدار ورقم البناء في العنوان).
ثم تنزّله وترفعه **يدويًا** إلى Google Play Console ← Internal testing. الرفع الآلي غير مفعّل عمدًا.

### ج. iOS (Codemagic)
الـ tag نفسه يشغّل workflow `ios-release` في Codemagic (إن كان المستودع مربوطًا). ابدأه بعد أن يصبح Frontend CI أخضر.
يتحقق من الـ tag ومن متغيرات المجموعة `frontend_env`، يبني ويوقّع ويرفع إلى TestFlight فقط.
**إرسال البناء إلى App Review** و**النشر النهائي** خطوتان يدويتان منفصلتان في App Store Connect.
رقم البناء يأتي من الـ commit؛ TestFlight يرفض رقمًا مكررًا، فيفشل الرفع بدل أن ينجح بصمت.

### د. الاختبار ثم المتجر
1. ثبّت البناء من Internal testing / TestFlight على جهاز حقيقي، ونفّذ `docs/MOBILE-DEVICE-TEST-CHECKLIST.md`.
2. Google Play: Closed ثم Production من Play Console. التطبيق الشخصي الجديد يحتاج اختبارًا مغلقًا بـ 12 مختبرًا لمدة 14 يومًا
   قبل طلب الإنتاج. iOS: Submit for Review من App Store Connect.
3. **بعد ظهور الإصدار فعلًا في المتجر** فقط: `/admin/app-updates` ← أنشئ صف الإصدار لكل منصة (رابط المتجر الرسمي إلزامي
   للإصدار المفعّل)، راجعه، ثم فعّله.

### أسماء المتغيرات والأسرار (بلا قيم)
| المكان | الاسم | ملاحظة |
|---|---|---|
| GitHub Secrets | `RELEASE_STORE_FILE_BASE64`, `RELEASE_STORE_PASSWORD`, `RELEASE_KEY_ALIAS`, `RELEASE_KEY_PASSWORD` | توقيع Android (موجودة) |
| GitHub Secrets | `GOOGLE_SERVICES_JSON_BASE64` | ملف Firebase لـ Android (Push) |
| GitHub Variables | `GOOGLE_CLIENT_ID` | مطلوب لبناء المتجر |
| GitHub Variables | `APPLE_CLIENT_ID`, `APPLE_REDIRECT_URI` | اختيارية على Android (تحذير فقط) |
| GitHub Variables | `ANDROID_PUSH_DISABLED=true` | تعطيل Push عن قصد |
| Codemagic `frontend_env` | `API_URL`, `GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID`, `APPLE_REDIRECT_URI`, `SITE_URL` (+ `BASE_URL`, `SIGNALR_URL`) | كلها مطلوبة لـ iOS؛ `API_URL` لا يحوي staging |
| Codemagic | تكامل App Store Connect باسم `codemagic_asc_api_key` | يحتاج حساب Apple Developer |
| Netlify | `API_URL` (Staging/Preview يشير إلى staging-api) | موجود |

## 3. كيف يُكتشف فشل التحديث وكيف يُتراجع

| العَرَض | ما يعنيه | الإجراء |
|---|---|---|
| `Frontend CI` أحمر على الـ tag | لم يُبنَ AAB؛ لا شيء وصل أحدًا | أصلح، ثم tag جديد برقم أعلى (لا تُعد استخدام tag) |
| `android-release` يقول tag لا يطابق | نسيان `version:set` | نفّذه وادمج، ثم tag جديد |
| `Promote to production` يقول Staging ليس على الـ commit | Netlify Staging لم ينتهِ بعد | انتظر انتهاء بناء `staging` ثم أعد التشغيل |
| `Live environment check` أحمر | الموقع الحي ليس البناء المقصود | Publish لآخر deploy `Production: release@...` سليم |
| تحديث إلزامي يقفل مستخدمين | رُفع الحد الأدنى قبل ظهور الإصدار في المتجر | `/admin/app-updates` ← عطّل الإصدار أو أنزل `MinimumSupportedVersion`؛ يُرفع القفل عند عودة التطبيق من الخلفية (بعد ساعة كحد أقصى من آخر فحص) أو عند الإقلاع التالي |
| إصدار هاتف معيب وصل للمستخدمين | لا يمكن سحب نسخة مثبتة | أوقف الطرح المرحلي في المتجر، عطّل صف الإصدار، وانشر إصلاحًا برقم أعلى، ولا تَرفع الحد الأدنى إلا بعد ظهور الإصلاح |
| `verify-production-deploy` (الـ API) أحمر | Render لم يصل `live` بالـ commit أو الجاهزية فاشلة | راجع Render، وراجع `application-rollback-runbook.md` في مستودع الـ API |

قاعدة توافق: تغييرات الـ API **إضافية فقط**. حذف حقل أو نقطة أو تغيير معناها لا يحدث إلا بعد رفع
`MinimumSupportedVersion` فوق آخر نسخة تعتمد عليه **وظهور** النسخة الجديدة في المتجر؛ لأن واجهة الهاتف تبقى كما بُنيت حتى يحدّث المستخدم.

## 4. قائمة التحقق قبل أول إصدار إنتاجي للهاتف

- [ ] Actions يعمل على المستودعين (الميزانية) وكل الفحوص خضراء على main.
- [ ] `version:check --strict` ناجح، والـ tag يطابق الإصدار.
- [ ] `GOOGLE_CLIENT_ID` وملف Firebase مضبوطان، و`build-info.json` في الحزمة = production ومن الـ commit.
- [ ] Android OAuth client لـ `com.hudhudnest.app` ببصمة SHA-1 لمفتاح Play ومفتاح الرفع (Google Cloud).
- [ ] تطبيق منشأ في Play Console؛ أول AAB رُفع يدويًا إلى Internal testing وثُبّت على جهاز حقيقي.
- [ ] تسجيل الدخول (بريد، Google) والصور والرسائل والإشعارات واللغات الثلاث واتجاه RTL جُرّبت على الجهاز.
- [ ] الاختبار المغلق (12 مختبرًا × 14 يومًا) انتهى قبل طلب الإنتاج.
- [ ] iOS (عند التسجيل في Apple Developer): أيقونة 1024، Push entitlement، `codemagic_asc_api_key`، `frontend_env`، بناء TestFlight مثبت على جهاز.
- [ ] صف `AppRelease` لكل منصة جاهز كمسودة، برابط المتجر الرسمي، ولم يُفعَّل بعد.
- [ ] بعد ظهور الإصدار في المتجر: فعّل الصف، ثم `GET /api/app-updates/check?platform=Android&currentVersion=<أقدم>` يعطي المتوقع، وافتح نسخة أقدم وتأكد من الحوار.
- [ ] نسخة احتياطية حديثة للـ API (`Database Backup`) وآخر `Production Gate` أخضر، وتمرين تراجع واحد على الأقل أُجري.
