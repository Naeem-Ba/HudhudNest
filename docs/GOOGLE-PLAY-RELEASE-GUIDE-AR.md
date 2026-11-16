# دليل النشر على Google Play: من الـ tag في GitHub إلى الإصدار المنشور

آخر تحديث: 2026-11-07. الحزمة: `com.hudhudnest.app`. الإصدار الحالي في الكود: `1.1.1` (versionCode `4`).

هذا الدليل **يكمّل** `docs/RELEASE-RUNBOOK-AR.md` ولا يستبدله: ذاك يشرح الصورة الكاملة (ويب + Android + iOS)،
وهذا يدخل في تفاصيل Android فقط، خطوة بخطوة، حتى يظهر الإصدار في متجر Google Play.
أمثلة الأرقام (`1.2.0` وversionCode `5`) توضيحية؛ استبدلها بإصدارك.

## حدود هذا الدليل (اقرأها أولًا)

- **ما فحصته فعلًا:** الكود، وworkflow الـ CI، وأدوات الإصدار، والأدلة القائمة في المستودع، وصفحات Google العامة (روابطها في آخر الملف).
- **ما لم أفحصه ولا أستطيع فحصه:** حسابك في Play Console، وGitHub Secrets، وإعدادات Google Cloud/Firebase. كل ما يخصها مكتوب كـ«تحقّق بنفسك».
- واجهة Play Console تتغير أسماء قوائمها ومواضع أزرارها من حين لآخر. اتبع **اسم الخيار** لا موضعه. العلامة ⚠ تعني: لم أتحقق منه، أو أنه قابل للتغير.

---

## 0. الملخص بصفحة واحدة

```
[أنت]    version:set → PR → Frontend CI أخضر → دمج إلى main
[أنت]    git tag v1.2.0 <sha-main> → git push origin v1.2.0
[آلي]    Frontend CI (build) → android-release → AAB موقّع في Release "android-latest"
[أنت]    تنزيل الـ AAB + التحقق منه (SHA + التوقيع + versionCode)        ← خطوة الحماية
[أنت]    Play Console → Internal testing → رفع الـ AAB → اختبار على جهاز حقيقي
[أنت]    Closed testing (12 مختبرًا × 14 يومًا إن كان حسابك شخصيًا جديدًا) → طلب الإنتاج
[أنت]    Production → Create new release → نسبة طرح مرحلي → Send for review
[Google] مراجعة → نشر
[أنت]    بعد ظهوره في المتجر: deep-links.config.json (published:true) + /admin/app-updates + اختبار الدخول بـ Google
```

ما هو آلي: بناء الـ AAB وتوقيعه. ما هو يدوي عمدًا: **كل شيء يصل إلى Play** (رفع، ترقية بين المسارات، نشر). لا توجد بيانات اعتماد نشر في CI، وهذا قرار مقصود في الأدلة القائمة.

| أريد أن… | اذهب إلى |
|---|---|
| أول مرة على Play (حساب، تطبيق، إعلانات المحتوى) | [القسم 2](#2-الإعداد-لمرة-واحدة-قبل-أول-إصدار) |
| أصدر نسخة جديدة اليوم | [الأقسام 3 → 7](#3-تجهيز-الإصدار-في-git) |
| الإصدار معيب بعد النشر | [القسم 9](#9-التراجع-والإصلاح-العاجل) |
| أعرف ما يمكن أن يُرفض أو يكسر | [القسم 10](#10-تقييم-نقدي-نقاط-ضعف-المسار-الحالي-ومخاطر-الرفض) |

---

## 1. مفاهيم لا تكمل بدونها

| المفهوم | المعنى في هذا المشروع |
|---|---|
| **tag `vX.Y.Z`** | وسم Git على commit موجود في `main`. دفعه إلى GitHub هو الذي **يشغّل** بناء المتجر. الشرط: يطابق `versionName` في Android وiOS معًا (`tools/app-version.mjs verify-tag`). |
| **`android-latest`** | اسم Release واحد (pre-release) **يُحذف ويُعاد إنشاؤه عند كل بناء ناجح**. ليس سجلًا دائمًا لإصدار بعينه. انظر الخطر في القسم 10. |
| **AAB** | الصيغة التي يقبلها Play. (الـ APK في `android-latest` للتنزيل المباشر فقط ولا يُرفع إلى Play.) |
| **مفتاح الرفع (upload key)** | `aqar-tech-release.keystore`. يوقّع الـ AAB الذي ترفعه. بصمته SHA-256 تبدأ بـ `7D:30:B4:CB…` وتنتهي بـ `…F4:8E:2B:9C:64:F7:50` (موثّقة في `android/RELEASE_SIGNING.md`). |
| **مفتاح توقيع Play (app signing key)** | مفتاح تملكه Google، ويوقّع النسخة التي يثبّتها المستخدم من المتجر. بصمته تبدأ بـ `B4:94:0D:22…` (مضافة في `deep-links.config.json`). **مختلفة عن مفتاح الرفع** وهذا مصدر أخطاء شائعة (القسم 8). |
| **versionCode** | رقم صحيح يجب أن يزيد في **كل** رفع إلى Play، عبر كل المسارات، ولا يُعاد استخدامه أبدًا حتى لو حُذف الإصدار. حاليًا `4`. |
| **المسارات** | Internal testing (حتى 100 مختبر، الأسرع) ← Closed testing (قوائم مختبرين) ← Open testing (اختياري) ← Production. |

---

## 2. الإعداد لمرة واحدة (قبل أول إصدار)

الأدلة القائمة تشير إلى أن التطبيق أُنشئ في Play Console مسبقًا (بصمة مفتاح توقيع Play مضافة في 2026-10-15). **ابدأ بالجدول التالي وتحقق من كل سطر**، ولا تعد ما أنجزته.

### 2.1 فحص الحالة

| # | البند | كيف تتحقق | إن كان ناقصًا |
|---|---|---|---|
| 1 | حساب Play Developer مدفوع ومفعّل، ونوعه معروف (شخصي أم منظمة) | Play Console ← Settings ← Developer account ← Account details | يحدد القسم 5 (شرط الاختبار المغلق) |
| 2 | تطبيق باسم الحزمة `com.hudhudnest.app` | الصفحة الرئيسية للتطبيق في Console | لا يمكن تغيير اسم الحزمة بعد الإنشاء. كان المعرّف القديم `com.realestate.app` (انظر `docs/DEEP-LINKS.md` §2.1) ولا يصلح |
| 3 | **Play App Signing** مفعّل | Test and release ← Setup ← App signing | هو الافتراضي للتطبيقات الجديدة بصيغة AAB |
| 4 | أسرار GitHub الأربعة للتوقيع | Settings ← Secrets and variables ← Actions: `RELEASE_STORE_FILE_BASE64`, `RELEASE_STORE_PASSWORD`, `RELEASE_KEY_ALIAS`, `RELEASE_KEY_PASSWORD` | `android/RELEASE_SIGNING.md`. إن غابت كلها يتخطى CI البناء بصمت (يطبع notice فقط) |
| 5 | `GOOGLE_SERVICES_JSON_BASE64` (Secret) و`GOOGLE_CLIENT_ID` (Variable) | نفس الصفحة | أو `ANDROID_PUSH_DISABLED=true` عن قصد. بدونها يفشل `android-release` مغلقًا |
| 6 | عميل OAuth من نوع Android ببصمة **SHA-1 لمفتاح توقيع Play** | Google Cloud ← APIs & Services ← Credentials | القسم 8.3. هذا ما يجعل «الدخول بـ Google» يعمل على نسخة المتجر |
| 7 | صفحات الخصوصية وحذف الحساب تعمل علنًا بلا تسجيل دخول | افتح `https://hudhudnest.com/privacy-policy` و`https://hudhudnest.com/account-deletion` من متصفح خارجي | المساران موجودان في `app.routes.ts`. تأكد أنهما يفتحان على الإنتاج فعلًا |
| 8 | تحقق هوية المطوّر (Android developer verification) | Play Console ← إشعارات التسجيل/التحقق ⚠ | القسم 10 البند 9 |

### 2.2 إعلانات «محتوى التطبيق» (App content)

مسار القائمة: Policy and programs ← **App content** (⚠ قد يظهر باسم Policy status أو Monitor and improve). كلها تُكمل مرة واحدة ثم تُراجع عند تغيّر التطبيق. لا تُنشر نسخة Production ما دام أحدها ناقصًا.

| الإعلان | ما يخص هذا التطبيق (تقدير من الكود، راجعه) |
|---|---|
| **Privacy policy** | `https://hudhudnest.com/privacy-policy` (صفحة HTML عادية، ليست PDF). |
| **App access** | معظم الميزات خلف تسجيل الدخول. أنشئ **حساب مراجعة عاديًا** وأعطِ Google بياناته. لا تعطها حساب مشرف (admin) أبدًا. |
| **Ads** | الإجابة الصادقة تعتمد على قرارك: الحزمة تحتوي SDK الإعلانات (`@capacitor-community/admob`) حتى لو الإعلانات معطلة (`docs/MONETIZATION.md`). إن كان التطبيق **قد** يعرض إعلانات في هذا الإصدار فأجب Yes. راجع القسم 10 البند 5. |
| **Advertising ID** | الـ SDK يدمج صلاحية `AD_ID` تلقائيًا. تحقق من الـ manifest المدمج (القسم 4.3) وصرّح بالاستخدام وفقًا له. |
| **Data safety** | البيانات المحتملة من الكود: الموقع (تقريبي/دقيق: `ACCESS_FINE/COARSE_LOCATION`)، الاسم والبريد وربما الهاتف، الصور المرفوعة، الرسائل داخل التطبيق، معرّفات المستخدم، رمز FCM للإشعارات (معرّف جهاز). النقل مشفّر (HTTPS، `usesCleartextTraffic=false`). حذف الحساب: ضع رابط `/account-deletion`. **أي بيان لا يطابق سلوك التطبيق الفعلي يُعرّض الحساب للإنذار أو الإزالة.** راجعه مع `docs/legal/LEGAL-REVIEW-REQUIRED.md`. |
| **Content rating** | استبيان IARC. أجب من سلوك التطبيق الفعلي (محتوى يكتبه المستخدمون، رسائل بين مستخدمين). |
| **Target audience** | بالغون فقط. لا تختر فئات الأطفال (تُدخل سياسة العائلات). |
| **Financial features / Payments** | راجع القسم 10 البند 2 قبل الإجابة. |
| **Government / News / Health / COVID** | لا ينطبق (تحقق من الخيارات). |

### 2.3 صفحة المتجر (Store listing)

اللغات المنسجمة مع التطبيق: العربية والإنجليزية والألمانية. المطلوب: اسم (30 حرفًا)، وصف قصير (80)، وصف كامل (4000)، أيقونة 512×512 (موجود `android/app/src/main/ic_launcher-playstore.png` للمقاس)، صورة Feature graphic 1024×500، لقطتان على الأقل للهاتف. الأطوال حدود Google المعروفة ⚠ تحقق منها في النموذج.

---

## 3. تجهيز الإصدار في Git

```bash
git switch main && git pull origin main
npm run version:check            # يعرض الحالي: Android 1.1.1 (code 4); iOS ...
```

1. **اعرف أعلى versionCode في Play** قبل أن ترفع الرقم: Console ← Test and release ← **App bundle explorer** (أو أي مسار فيه إصدار سابق). إن كان في Play رقم أكبر من `4` (من رفع سابق) فاستخدم `--build` أكبر منه، وإلا رفض Play الرفع بخطأ «Version code already used».
2. أنشئ فرعًا واكتب الإصدار على المنصتين معًا:
   ```bash
   git switch -c chore/release-1.2.0
   npm run version:set -- 1.2.0              # versionCode = الحالي + 1
   # أو بتحديد الرقم:   npm run version:set -- 1.2.0 --build 7
   npm run version:check -- --strict         # يجب أن ينجح
   npm run test:tools                         # نفس ما يفحصه CI
   git diff --stat                            # يجب أن ترى build.gradle وproject.pbxproj فقط
   ```
3. ملاحظات الإصدار (ستحتاجها في القسم 6): اكتبها الآن بالعربية والإنجليزية والألمانية، **بحد أقصى 500 حرف للغة** (⚠ حد Play الحالي).
4. التزم وادفع وافتح PR:
   ```bash
   # لا تستخدم commit -am: يضم أي تعديل محلي غير مرتبط (حدث فعلًا في PR #242 حيث تسرّب منفذ API محلي)
   git add android/app/build.gradle ios/App/App.xcodeproj/project.pbxproj
   git status --short                          # لا شيء غير هذين الملفين في الـ staged
   git commit -m "chore(release): 1.2.0 (build 5)"
   git push -u origin chore/release-1.2.0
   ```
5. انتظر **Frontend CI أخضر** على الـ PR، ثم ادمجه إلى `main`.

**نجاح هذه المرحلة:** `main` يحتوي commit الدمج، وCI عليه أخضر. **إن فشل `version:check --strict`:** المنصتان غير متطابقتين، اترك `version:set` يكتبهما ولا تعدّل أحدهما يدويًا.

---

## 4. إنشاء الـ tag وما يحدث بعده

### 4.1 إنشاء الـ tag

```bash
git switch main && git pull origin main
git log -1 --oneline                      # هذا هو commit الإصدار. دوّن الـ sha
# تأكد في GitHub ← Actions أن Frontend CI على هذا الـ sha أخضر

git tag v1.2.0 <sha-of-main>              # الأسلوب المتّبع في المستودع (tag خفيف)
git push origin v1.2.0
```

- الاسم **حرفيًا** `v` + `major.minor.patch`. غير ذلك لا يطابق `tags: ['v*']` أو يفشل `verify-tag`.
- يجب أن يكون الـ commit على `main` (يتحقق CI عبر `compare/main...<sha>`): الحالة `identical` أو `behind` فقط.
- **لا تحرّك tag موجودًا ولا تعد استخدامه.** إن أخطأت، أصلح وأنشئ tag جديدًا برقم أعلى (`v1.2.1`). هذه قاعدة `RELEASE-RUNBOOK-AR.md`.
- بديل واجهة الويب: GitHub ← Releases ← Draft a new release ← اختر «Create new tag». يعمل، لكنه ينشئ Release عامًّا إضافيًا غير لازم. الأوامر أوضح وقابلة للتدقيق.

### 4.2 ما يعمل تلقائيًا

افتح GitHub ← Actions ← تشغيل **Frontend CI** على الـ tag:

| الوظيفة | ما تفعله | زمن تقريبي |
|---|---|---|
| `build` | تدقيق + اختبارات + بناء Angular إنتاجي على commit الـ tag | حتى 20 دقيقة (حد المهلة) |
| `android-release` | تحقق الهوية (tag = الإصدار = main) ← فحص إعدادات المتجر ← بناء الويب وفحص `build-info.json` ← `cap sync` ← فك keystore ← `gradlew bundleRelease` ← نشر الـ AAB في `android-latest` ← بناء APK وإرفاقه | حتى 20 دقيقة |
| `ios-build` | **لا يعمل على الـ tag** (شرطه `ref_type != 'tag'`) | — |
| Codemagic `ios-release` | إن كان المستودع مربوطًا بـ Codemagic يبدأ على الـ tag نفسه. فشله (لغياب حساب Apple مثلًا) لا يؤثر على Android | — |

**علامات النجاح:** الوظيفتان خضراوان، وفي GitHub ← Releases يظهر **«Android signed AAB 1.2.0 (5) - <sha7>»** (pre-release) وفي ملاحظاته: `SHA-256: …` ورابط التشغيل.

**إن فشل شيء:**

| الرسالة | السبب | الحل |
|---|---|---|
| `Tag … does not match` / `verify-tag` | نسيت `version:set` أو الـ tag لا يطابق | `version:set` ثم PR ثم tag جديد |
| `not on main (compare status: …)` | الـ tag على commit خارج main | اوسم commit مدموجًا في main |
| `Incomplete release signing configuration. Missing …` | سر ناقص | ارفع الأسرار (القسم 2.1 #4) ثم tag جديد |
| `Store build configuration is incomplete` | غاب `GOOGLE_CLIENT_ID` أو `GOOGLE_SERVICES_JSON_BASE64` | اضبطهما أو `ANDROID_PUSH_DISABLED=true` عن قصد |
| `Bundle: … apiUrl points at Staging` | بناء الويب ليس إنتاجًا | راجع متغيرات البناء. **لا تنشر أبدًا** |
| `Keystore … could not be opened or alias not found` | كلمة المرور/alias/Base64 خاطئة | راجع الأسرار |
| الوظيفة حمراء لكن الـ AAB منشور في Release | فشل خطوة APK اللاحقة (مقصود: لا تمنع تسليم الـ AAB) | يمكن المتابعة بالـ AAB، وأصلح APK لاحقًا |
| «Artifact storage quota» | حصة Actions (نسخة احتياطية فقط) | تجاهلها، المرجع هو Release |

### 4.3 تنزيل الـ AAB والتحقق منه (لا تتخطَّ هذه الخطوة)

السبب: `android-latest` **يُستبدل عند أي بناء لاحق** (tag آخر، أو تشغيل يدوي `workflow_dispatch` على فرع). ملف «الأحدث» قد لا يكون ملف الـ tag الذي تقصده.

```bash
REPO=Naeem-Ba/HudhudNest
mkdir -p ~/release-1.2.0 && cd ~/release-1.2.0

# 1) من أي commit بُني؟ يجب أن يساوي sha الـ tag بالضبط
gh release view android-latest --repo $REPO --json name,targetCommitish,body
git rev-parse v1.2.0                                # قارن (مع targetCommitish)

# 2) نزّل الملف
gh release download android-latest --repo $REPO --pattern '*.aab' --dir .

# 3) SHA-256 يطابق ما في ملاحظات الـ Release
sha256sum app-release.aab                           # Windows: Get-FileHash .\app-release.aab -Algorithm SHA256

# 4) الإصدار داخل الملف (bundletool من github.com/google/bundletool/releases)
java -jar bundletool.jar dump manifest --bundle=app-release.aab --xpath /manifest/@android:versionCode   # 5
java -jar bundletool.jar dump manifest --bundle=app-release.aab --xpath /manifest/@android:versionName   # 1.2.0
java -jar bundletool.jar dump manifest --bundle=app-release.aab | grep -E 'package=|uses-permission'

# 5) التوقيع بمفتاح الرفع الصحيح
keytool -printcert -jarfile app-release.aab         # SHA-256 يجب أن يطابق 7D:30:B4:CB:…:64:F7:50
```

**اعتمد الملف فقط إذا:** (أ) targetCommitish = sha الـ tag، (ب) الـ SHA-256 متطابق، (ج) `versionName`/`versionCode` كما أردت و`package=com.hudhudnest.app`، (د) البصمة هي بصمة مفتاح الرفع.
إن اختلف شيء فلا ترفع. أعد تشغيل بناء الـ tag أو أنشئ tag جديدًا.

الخطوة (4) تكشف أيضًا الصلاحيات المدمجة فعليًا (`AD_ID`، `READ_MEDIA_*`، `POST_NOTIFICATIONS`…) وهي مرجعك الصادق لإعلان Data safety.

---

## 5. رفع الإصدار إلى Play: المسارات بالترتيب

الترتيب الموصى به لأول إصدار: **Internal → Closed → Production**. الترقية بين المسارات تعيد استخدام الحزمة نفسها (versionCode نفسه) فلا إعادة رفع.

> **شرط الاختبار المغلق (مؤكد من صفحة Google الرسمية، مع تحقق أخير في حسابك):**
> الحسابات الشخصية المنشأة بعد 2023-11-13 يجب أن تجري اختبارًا مغلقًا بـ **12 مختبرًا على الأقل، مسجَّلين بشكل متواصل 14 يومًا**، قبل طلب الوصول إلى Production. حسابات المنظمات لا يشملها الشرط. الدعوة وحدها لا تكفي؛ يجب أن يقبل المختبر ويبقى مشتركًا. هذه 14 يومًا من الانتظار، فابدأ مبكرًا. لا تشترِ «مختبرين» من أطراف خارجية: يخالف روح السياسة ويضر الحساب.

### 5.1 Internal testing (الاختبار على جهازك)

1. Play Console ← اختر **HudhudNest** ← **Test and release** ← **Testing** ← **Internal testing**.
2. تبويب **Testers**: أنشئ قائمة بريد (Create email list) وأضف حسابات Google للمختبرين. انسخ **رابط الانضمام (opt-in URL)**.
3. تبويب **Releases** ← **Create new release**.
4. **App bundles** ← ارفع `app-release.aab` (سحب وإفلات). انتظر انتهاء المعالجة.
   - تحذيرات مثل «لا يوجد ملف deobfuscation / رموز تصحيح native» **غير مانعة** (`minifyEnabled false`).
   - خطأ «Version code already used»: ارجع للقسم 3 وارفع الرقم (لا حل غير ذلك).
   - خطأ «target API level»: غير متوقع، الإعداد الحالي `targetSdk 36` وهو ما تشترطه Google للتطبيقات الجديدة والتحديثات منذ 2026-08-31.
5. **Release name:** يُملأ تلقائيًا (مثل `5 (1.2.0)`). يمكنك تركه.
6. **Release notes:** الصيغة المطلوبة (وسوم اللغات):
   ```
   <ar>
   • تحسينات في البحث وإصلاحات عامة.
   </ar>
   <en-US>
   • Search improvements and general fixes.
   </en-US>
   <de-DE>
   • Verbesserungen bei der Suche und allgemeine Fehlerbehebungen.
   </de-DE>
   ```
   اكتب لكل لغة مضافة في صفحة المتجر (⚠ رموز اللغات تظهر لك مسبقة في الحقل).
7. **Next** ← راجع الأخطاء والتحذيرات ← **Save** ← **Publish/Start rollout to Internal testing**.
8. على الهاتف: افتح رابط الانضمام بنفس حساب Google، ثبّت من Play، ونفّذ `docs/MOBILE-DEVICE-TEST-CHECKLIST.md`. **اختبر خصوصًا:** الدخول بالبريد، والدخول بـ Google، واستلام إشعار، وفتح رابط `https://hudhudnest.com/properties/<id>` من واتساب.

**نجاح:** يظهر الإصدار «Available to internal testers» والتثبيت من Play يعمل. الإتاحة عادة خلال دقائق (⚠).

### 5.2 Closed testing

1. **Test and release ← Testing ← Closed testing** ← أنشئ مسارًا (Create track) أو استخدم الافتراضي.
2. **Testers:** قائمة بريد فيها **12 حسابًا على الأقل** (إن كان الشرط ينطبق عليك).
3. **Create new release** ← إما **Add from library** (الحزمة نفسها المرفوعة سابقًا) أو ارفعها ← ملاحظات ← Next ← Save ← Start rollout.
4. اترك المختبرين على النسخة 14 يومًا متصلة، وراقب **Android vitals** و**Pre-launch report** (⚠ التقرير قد يعطل لأن التطبيق يحتاج تسجيل دخول: أضف بيانات الدخول في App access).
5. بعد اكتمال الشرط يظهر في **Dashboard** زر **Apply for production** (⚠ الاسم). املأ الاستبيان عن الاختبار (ما اختبرتم، الملاحظات، ما غيّرتموه). قرار Google لا يكون فوريًا، وقد يُرفض الطلب فيُعاد الاختبار.

### 5.3 Production: «Create new release» والنشر

1. **Test and release ← Production**.
2. تبويب **Countries/regions** ← **Add countries/regions**: اختر أسواقك. توفر Google Play لمستخدمين داخل بلد بعينه (مثل سوريا) ليس مضمونًا من جهتي ولم أتحقق منه. اختبره ميدانيًا (انظر `docs/ANDROID-DIRECT-DOWNLOAD-AR.md` قسم المخاطر).
3. تبويب **Releases ← Create new release**.
4. **App bundles:** اختر **Add from library** (الحزمة التي اختبرتها) بدل رفع جديد. هذا يضمن أن ما يصل للجمهور هو ما اختبرته نفسه.
5. **Release notes** بالصيغة نفسها (5.1 خطوة 6).
6. **Next** ← صفحة المراجعة: لا يجب أن يبقى «Errors». التحذيرات اقرأها واحدة واحدة.
7. **نسبة الطرح المرحلي (Staged rollout):** ابدأ بـ **10–20%** ثم ارفع. ستجد الخيار في صفحة المراجعة أو بعد الحفظ (⚠ الموضع يتغير). لا تبدأ بـ 100% لأول نسخة إنتاجية.
8. **Managed publishing (موصى به لأول نشر):** Publishing overview ← تفعيل Managed publishing، فتتحكم بلحظة الظهور بعد قبول Google. بدونه يُنشر الإصدار تلقائيًا فور قبوله، دون أن تختار اللحظة.
9. **Start rollout to Production** ثم **Publishing overview** ← **Send changes for review** إن طلب.
10. انتظر المراجعة (من ساعات إلى عدة أيام، والحسابات والتطبيقات الجديدة أبطأ ⚠). تصلك النتيجة بالبريد وفي Console.

### 5.4 رفع نسبة الطرح أو إيقافه

Production ← **Releases** ← **Manage rollout** ← **Update rollout** (ارفع النسبة) أو **Halt rollout** (إيقاف). راقب قبل كل رفع: Android vitals (انهيارات/ANR) ومراجعات المستخدمين، لمدة يوم على الأقل بين الخطوات.

---

## 6. التحقق بعد الظهور في المتجر

الرابط: `https://play.google.com/store/apps/details?id=com.hudhudnest.app`

1. ثبّت من المتجر (لا من APK) على جهاز **نظيف** لم يثبّت عليه الـ APK المباشر من قبل (التوقيعان مختلفان وسيرفض التحديث فوقه).
2. جرّب: بريد، Google، إشعار، رابط عميق، الصور، العربية RTL، الإنجليزية، الألمانية.
3. على Android بتوصيل adb:
   ```bash
   adb shell pm verify-app-links --re-verify com.hudhudnest.app
   adb shell pm get-app-links com.hudhudnest.app      # المتوقع: hudhudnest.com: verified
   ```

---

## 7. ما يُحدَّث في المشروع بعد النشر (بهذا الترتيب)

لا تفعل أيًّا منها قبل أن يصبح الإصدار **متاحًا فعلًا** للمستخدمين.

1. **`deep-links.config.json`** ← `stores.android.published` إلى `true` (ويبقى `appStoreId` فارغًا لـ iOS). PR ثم دمج ثم نشر الموقع (مسار `main → release → Publish`، `RELEASE-RUNBOOK-AR.md` §1). بعدها تظهر على `/download` أزرار Google Play. تحقق: `npm run verify:deep-links`.
2. **`/admin/app-updates`:** أنشئ صف إصدار Android: `Version` = الإصدار المنشور، رابط المتجر = رابط Play أعلاه، `MinimumSupportedVersion` **بلا تغيير** في الإصدار العادي. أنشئه معطّلًا، راجعه، ثم فعّله.
   - **انتبه للطرح المرحلي:** إن فعّلت الصف وأنت عند 20% فكل المستخدمين سيُدعَون إلى تحديث لا يرونه بعد في المتجر. **فعّل الصف عند وصول الطرح إلى 100%** (أو قبله مع وعي بالأثر).
   - لا ترفع `MinimumSupportedVersion` إلا لكسر توافق حقيقي، وبعد اكتمال الطرح (`docs/app-release-procedure.md`).
3. اختبر: `GET /api/app-updates/check?platform=Android&currentVersion=<أقدم>` ثم افتح نسخة أقدم وتأكد من الحوار.
4. **قرار الـ APK المباشر:** بعد النشر على Play، قرّر هل تُبقي بطاقة التنزيل المباشر. التوقيعان مختلفان، وهذا يربك المستخدم (تفاصيل في `ANDROID-DIRECT-DOWNLOAD-AR.md`). إبقاؤه له مبرر فقط إن كان Play غير متاح لجمهور مهم.

---

## 8. أخطاء شائعة تخص هذا المشروع

### 8.1 «Version code already used»
الرقم تكرر. ارفع بـ `version:set -- X.Y.Z --build N`، ثم PR ثم tag جديد. لا يمكن تجاوزها بغير ذلك.

### 8.2 الرابط العميق لا يفتح التطبيق المثبّت من Play
`assetlinks.json` يجب أن يحتوي بصمة **مفتاح توقيع Play** (`B4:94:0D:22…`) لا بصمة الرفع وحدها. موجودة في `deep-links.config.json`، ويصل التغيير للموقع الحي بنشر الإنتاج. فحصها: `npm run verify:deep-links`.

### 8.3 «الدخول بـ Google» يفشل على نسخة Play فقط
نسخة Play موقّعة بمفتاح Google، بينما عميل OAuth الحالي مبني على بصمة مفتاح الرفع (SHA-1 `66:14:AC:…`). الحل: Play Console ← Test and release ← Setup ← **App signing** ← انسخ **SHA-1** لـ «App signing key certificate» ← Google Cloud ← Credentials ← أنشئ **عميل OAuth ثانيًا من نوع Android** لنفس الحزمة بهذه البصمة (أو أضفها حسب ما تسمح به الواجهة). **اختبره على Internal testing قبل Production**، لأنه لا يظهر في أي بناء محلي ولا أي اختبار آلي.

### 8.4 الإشعارات لا تصل
تحقق من `GOOGLE_SERVICES_JSON_BASE64` (الملف يطابق تطبيق Firebase لـ `com.hudhudnest.app`) ومن صلاحية الإشعارات على Android 13+ (`POST_NOTIFICATIONS` تظهر في manifest المدمج؟ راجع خطوة 4.3).

---

## 9. التراجع والإصلاح العاجل

لا يمكن سحب نسخة ثُبّتت بالفعل. ما تملكه:

| الحالة | الإجراء |
|---|---|
| الطرح المرحلي جارٍ وظهر خلل | Production ← **Halt rollout** فورًا. ثم عطّل صف `/admin/app-updates` |
| انتهى الطرح والخلل خطير | انشر إصلاحًا **برقم أعلى**: `version:set` ← PR ← tag جديد (`v1.2.1`) ← القسم 4 ثم 5. أسرع مسار: Internal (اختبار دقائق) ثم Production مباشرة إن كان مسموحًا لك |
| الخلل في الخادم لا الواجهة | عالجه في الـ API (إضافات متوافقة فقط) ولا تطلب إصدارًا جديدًا |
| تحديث إلزامي يقفل المستخدمين | `/admin/app-updates` ← عطّل الصف أو أنزل `MinimumSupportedVersion` |
| لا تفعل | إلغاء نشر التطبيق كله (Unpublish): يخفيه عن الجميع، ولا يزيله عمن ثبّته. ولا تحذف tag وتعيد دفعه |

---

## 10. تقييم نقدي: نقاط ضعف المسار الحالي ومخاطر الرفض

مرتبة حسب الخطر. «الحالة» تفصل المؤكد عن المقدَّر.

| # | الخطر | الدليل | الحالة | الإصلاح المقترح |
|---|---|---|---|---|
| 1 | **ملف خاطئ يصل إلى Play**: `android-latest` يُحذف ويُعاد إنشاؤه عند كل بناء، بما فيها التشغيل اليدوي على أي فرع (`gh release delete android-latest --cleanup-tag` في الـ workflow) | الكود في `frontend-ci.yml` | مؤكد من القراءة | التحقق في 4.3 يكفيك الآن. إصلاح دائم (يحتاج موافقتك): رفع الـ AAB أيضًا إلى Release باسم الـ tag (`v1.2.0`) فيصبح لكل إصدار سجلّ ثابت |
| 2 | **رفض أو إنذار بسبب سياسة الدفع**: `/checkout/:kind` يسجل رسم «تمديد/تمييز» إعلان عبر حوالة بنكية. تشترط Google نظام Play Billing للسلع والخدمات الرقمية المباعة داخل التطبيق، مع استثناءات (سلع مادية، خدمات تُستهلك خارج التطبيق…) | `checkout.page.ts`، `SUBSCRIPTION-PAGE-REPORT-AR.md` | **غير محسوم**: هل رسم تمييز إعلان عقاري «ميزة رقمية» أم «خدمة»؟ لم أجد حكمًا قاطعًا ولم أتحقق من نص السياسة الحالي | قرار مالك قبل الإنتاج: (أ) إخفاء `/checkout` و`/pricing` داخل التطبيق الأصلي (`isNativeApp()` موجود) وإبقاؤه في الويب، أو (ب) استشارة سياسة Payments في Console، أو (ج) Play Billing. الخيار (أ) أرخص وأسرع، لكنه يغيّر تجربة المستخدم |
| 3 | **Data safety لا يطابق الواقع** (موقع، صور، رسائل، معرّفات، AD_ID) | الصلاحيات في `AndroidManifest.xml`، والإضافات في `package.json` | مقدَّر | استخرج manifest المدمج (4.3) واملأ النموذج منه، لا من الذاكرة |
| 4 | **صلاحيات تخزين قديمة** `READ/WRITE_EXTERNAL_STORAGE` مع `targetSdk 36` قد تثير أسئلة وتوسّع بيان الخصوصية بلا فائدة | `AndroidManifest.xml` | مقدَّر. لم أتحقق هل يحتاجها أي إضافة | اختبر الإزالة (رفع الصور، الطباعة، المشاركة) على جهاز حقيقي قبل إزالتها |
| 5 | **إعلانات**: SDK إعلانات داخل الحزمة ومعرّف AdMob **تجريبي** (`ca-app-pub-3940256099942544~…`) | `strings.xml`, `docs/MONETIZATION.md` | مؤكد | إن بقيت الإعلانات مغلقة في هذا الإصدار فصرّح بذلك بدقة في Ads declaration. لا تضع معرّفًا حقيقيًا قبل موافقة حساب AdMob. أي تفعيل لاحق يستلزم تحديث البيانات في Console |
| 6 | **12 مختبرًا × 14 يومًا** تؤخر النشر أسبوعين على الأقل إن كان الحساب شخصيًا جديدًا | صفحة Google | مؤكد للشرط، غير معروف ينطبق عليك أم لا | ابدأ الاختبار المغلق الآن بالتوازي مع بقية العمل |
| 7 | **الدخول بـ Google على نسخة Play** يحتاج بصمة مفتاح Play (8.3) ولا يظهر في أي اختبار آلي | `RELEASE_SIGNING.md` يذكر عميل المفتاح الحالي فقط | مقدَّر بقوة، غير مختبر | اختبره على Internal قبل Production |
| 8 | **تضارب نافذة التحديث مع الطرح المرحلي** (القسم 7) | `docs/app-release-procedure.md` | مؤكد منطقيًا | فعّل صف الإصدار عند 100% |
| 9 | **تحقق هوية المطوّر**: أعلنت Google اشتراط التسجيل/التحقق للتطبيقات على الأجهزة المعتمدة، بدءًا من 2026-09-30 في أربع دول (البرازيل وإندونيسيا وسنغافورة وتايلاند) وتوسّع عالمي في 2027 وفق تقارير حزيران 2026 | تقارير صحفية (روابطها أدناه) لا صفحة Google نفسها | ⚠ غير محسوم من مصدر أولي | تأكد في Console من اكتمال التسجيل. هذا يمس أيضًا مسار الـ APK المباشر |
| 10 | **16 KB page size** (ملفات native لا تدعمها تُرفض عند الرفع للتطبيقات المستهدفة Android 15+) | تقارير ثانوية عن موعد 2025-11-01 وتمديدات | ⚠ غير محسوم؛ التطبيق لا يحوي كود native خاصًا، لكن مكتبات (AdMob وغيرها) قد تحمل `.so` | سيُبلغ Play Console عند الرفع. إن ظهر خطأ فحدّث الإضافة المسؤولة |
| 11 | **`minifyEnabled false`**: لا تعتيم ولا ملف mapping | `android/app/build.gradle` | مؤكد | ليس مانعًا لـ Play. تفعيله قرار أمني/حجم منفصل ويحتاج اختبارًا واسعًا (Capacitor وWebView حساسان للقواعد) |

---

## 11. أتمتة الرفع مستقبلًا (اختياري، ليس الآن)

قرار الرفع اليدوي في المستودع مقصود، ولا أنصح بتغييره قبل **ثلاثة إصدارات يدوية ناجحة**. إن أردت لاحقًا:

- **ما يمكن أتمتته بأمان:** رفع الـ AAB إلى **Internal testing كمسودة** (draft) عبر Play Developer API (حساب خدمة Service Account + سر `PLAY_SERVICE_ACCOUNT_JSON` في GitHub، وصلاحية «Release to testing tracks» فقط). الأدوات الشائعة: `fastlane supply` أو إجراء GitHub مخصص لهذا.
- **ما أنصح ألا يُؤتمت:** الترقية إلى Production. بقاء الإنسان في القرار الأخير هو آخر حاجز ضد إصدار معيب.
- **الثمن:** سر جديد حساس (مفتاح حساب الخدمة) وسطح هجوم جديد في CI. اقتصر على صلاحية أدنى ودوّر المفتاح.

---

## 12. قائمة تحقق قبل ضغط «Start rollout to Production»

- [ ] `version:check --strict` ناجح؛ الـ tag يطابق الإصدار؛ Frontend CI أخضر على الـ tag.
- [ ] الـ AAB تحقق منه (القسم 4.3): commit وSHA-256 وversionCode وبصمة الرفع.
- [ ] أُختبر عبر Internal testing على جهاز حقيقي (دخول بريد، دخول Google، إشعار، رابط عميق، RTL).
- [ ] جميع إعلانات App content مكتملة ومتطابقة مع الـ manifest المدمج.
- [ ] قرار سياسة الدفع (القسم 10 بند 2) محسوم.
- [ ] شرط الاختبار المغلق مستوفى (أو غير منطبق على حسابك).
- [ ] ملاحظات الإصدار بالعربية والإنجليزية والألمانية.
- [ ] طرح مرحلي 10–20%، وManaged publishing مفعّل لأول نشر.
- [ ] صف `/admin/app-updates` جاهز **معطّلًا** وبرابط Play، ولن يُفعّل قبل 100%.
- [ ] `stores.android.published` سيتحول إلى `true` فقط بعد الظهور الفعلي.

---

## المصادر

- [Google Play: اختبار مغلق للحسابات الشخصية (الصفحة الرسمية)](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Google Play: متطلبات target API level](https://developer.android.com/google/play/requirements/target-sdk)
- [Android: جدول التحقق من هوية المطوّر (تقارير)](https://www.androidauthority.com/android-sideloading-changes-timeline-3679204/)
- [16 KB page size: ملخص ثانوي](https://median.co/blog/how-to-prepare-android-apps-google-play-16-kb-page-size-requirement)
- داخل المستودع: `docs/RELEASE-RUNBOOK-AR.md`، `docs/app-release-procedure.md`، `android/RELEASE_SIGNING.md`، `docs/DEEP-LINKS.md`، `docs/ANDROID-DIRECT-DOWNLOAD-AR.md`، `docs/MOBILE-DEVICE-TEST-CHECKLIST.md`، `.github/workflows/frontend-ci.yml`.
