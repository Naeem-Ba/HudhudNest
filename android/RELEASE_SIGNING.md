# توقيع إصدار Android — BLK-04

هذا الملف موثَّق (مُتتبَّع في git)؛ ملف الأسرار نفسه ليس كذلك.

## ما تم إنشاؤه (2026-08-31)

- `android/keystore/aqar-tech-release.keystore` — مفتاح توقيع إنتاج حقيقي
  (PKCS12, RSA 2048, صلاحية 10000 يوم)، أُنشئ عبر:
  ```
  keytool -genkeypair -v -keystore keystore/aqar-tech-release.keystore \
    -alias aqar-tech -keyalg RSA -keysize 2048 -validity 10000
  ```
- `android/keystore/release-signing.local.properties` — كلمتا المرور +
  المسار + الاسم المستعار (alias). **كلاهما غير متتبَّع في git**
  (`android/.gitignore`: `*.jks`, `*.keystore`, `keystore/`,
  `*.local.properties`).

## ⚠️ هذا المفتاح لا يمكن استبداله

فقدان `aqar-tech-release.keystore` أو كلمة مروره يعني عدم القدرة على نشر أي
تحديث مستقبلي لهذا التطبيق بنفس الهوية على Google Play. **يجب:**

1. نسخ الملفين الآن إلى مكان آمن خارج هذا القرص (مدير كلمات مرور + نسخة
   احتياطية مشفّرة منفصلة).
2. عدم مشاركتهما عبر البريد/الدردشة بنص صريح.
3. رفع محتوى `release-signing.local.properties` إلى GitHub Secrets للمستودع
   (وليس الملف نفسه) تحت الأسماء:
   - `RELEASE_STORE_PASSWORD`
   - `RELEASE_KEY_ALIAS`
   - `RELEASE_KEY_PASSWORD`
   - `RELEASE_STORE_FILE_BASE64` (محتوى `.keystore` مُرمّز Base64، يُفكّ في
     خطوة CI قبل البناء — انظر `.github/workflows/frontend-ci.yml`)

## كيف يقرأ Gradle هذه القيم

`android/app/build.gradle` يحاول أولًا الملف المحلي
`keystore/release-signing.local.properties`، وإن لم يجده يقرأ متغيرات
البيئة `RELEASE_STORE_FILE` / `RELEASE_STORE_PASSWORD` / `RELEASE_KEY_ALIAS`
/ `RELEASE_KEY_PASSWORD` (توفّرها خطوة CI من GitHub Secrets). إن لم يوجد أي
من المصدرين، يُبنى `release` بلا توقيع كما كان الحال قبل هذا الإصلاح — لا
فشل غامض.

## بصمة SHA-1 (لاستخدامها في Google OAuth Client من نوع Android)

```
keytool -list -v -keystore keystore/aqar-tech-release.keystore -storepass <كلمة المرور من الملف المحلي>
```

القيمة المستخرَجة بتاريخ 2026-08-31 (Certificate fingerprint SHA1) استُخدمت
مباشرة لإنشاء Android OAuth Client في مشروع `aqar-tech-507216` — انظر تقرير
الحلول، بند BUG-17.

## حادثة تسريب عبر أرشيف مشارك، وتدوير كلمة المرور (2026-09-18)

`release-signing.local.properties` لم يُرفع لـ git إطلاقاً (تأكد بفحص كامل
تاريخ الـ repo) — لكن أرشيفاً (zip) لهذا المستودع/المجلد تمت مشاركته خارج
هذا القرص، ونسخ الأرشيف العادي لا يحترم `.gitignore` فينسخ الملف كما هو من
القرص. اعتُبرت كلمة المرور القديمة مكشوفة وتم تدويرها فوراً، مع الإبقاء على
نفس المفتاح (نفس alias `aqar-tech`، نفس بصمة الشهادة SHA-256 قبل وبعد
التدوير — تم التحقق صريحاً):

```
keytool -storepasswd -keystore keystore/aqar-tech-release.keystore \
  -storepass <القديمة> -new <الجديدة>
```

**ملاحظة مهمة اكتُشفت أثناء التدوير:** `keytool -keypasswd` غير مدعوم على
keystore من نوع PKCS12 (النوع الافتراضي منذ JDK 9+، وهذا ما استُخدم هنا) —
يفشل بـ `UnsupportedOperationException`. هذا متوقَّع وليس خطأ: في PKCS12 لا
يوجد "كلمة مرور مفتاح" منفصلة عن "كلمة مرور المتجر" أصلاً؛ تغيير
`storePassword` عبر `-storepasswd` يكفي وحده ويُحدِّث النفاذ لكل المُدخلات
(الشهادة والمفتاح الخاص) معاً. لذلك `storePassword` و`keyPassword` في
`release-signing.local.properties` يجب أن يبقيا **متطابقين دائماً** لهذا
النوع من الملفات — لا تحاول تدويرهما بقيمتين مختلفتين لاحقاً بدون تحويل نوع
المتجر أولاً (`-importkeystore -deststoretype JKS`، وهو تغيير أكبر لم يُنفَّذ
هنا).

**ما تم تحديثه بعد التدوير:**
- `release-signing.local.properties` المحلي — كلمتا المرور الجديدتان (متطابقتان).
- GitHub Secrets على `Naeem-Ba/HudhudNest`: `RELEASE_STORE_PASSWORD`
  و`RELEASE_KEY_PASSWORD` (بالقيمة الجديدة نفسها).

**ما لم يُغيَّر / لا يزال ناقصاً من إعداد BLK-04 الأصلي:** لم يكن أي من
الأسرار الأربعة المذكورة في القسم أعلاه مضبوطاً على GitHub قبل هذه الحادثة
(`gh secret list` أعاد قائمة فارغة) — أي أن مهمة `android-release` في CI
كانت تبني AAB **بلا توقيع** طوال الوقت منذ BLK-04 (بتصميم الـ workflow نفسه،
الذي يتخطى خطوات التوقيع بأمان إن غاب `RELEASE_STORE_PASSWORD`). `RELEASE_KEY_ALIAS` و`RELEASE_STORE_FILE_BASE64` كانا غير مضبوطين حينها، وقد رُفعا لاحقًا (2026-09-19) — انظر القسم التالي.

**نسخة احتياطية إضافية موصى بها:** بما أن هذا "المفتاح لا يمكن استبداله"
(انظر أعلاه)، احفظ نسخة عن `aqar-tech-release.keystore` بكلمة المرور
*الجديدة* في مدير كلمات مرور/تخزين مشفّر خارج هذا القرص فوراً، وتوقف عن
استخدام أي نسخة/أرشيف قديم يحتوي كلمة المرور المكشوفة.

## مهمة CI: Android — Build Signed Release AAB (2026-09-19)

المهمة `android-release` في `.github/workflows/frontend-ci.yml` تعمل على الدفعات إلى `main`
وعلى `workflow_dispatch` (للتحقق على فرع قبل الدمج: `gh workflow run frontend-ci.yml --ref <branch>`).

**الأسرار الأربعة المطلوبة** (كلها مضبوطة الآن على `Naeem-Ba/HudhudNest`): `RELEASE_STORE_PASSWORD`،
`RELEASE_KEY_PASSWORD`، `RELEASE_KEY_ALIAS` (= `aqar-tech`)، `RELEASE_STORE_FILE_BASE64`. خطوة
`Validate signing secrets` تتخطى المهمة إن غابت كلها، وتفشل بأسماء الناقص إن غاب بعضها. رفعها (PowerShell،
بمسار كامل لأن .NET يحلّ المسارات النسبية من `C:Users<user>`):

```powershell
gh secret set RELEASE_KEY_ALIAS --repo Naeem-Ba/HudhudNest --body "aqar-tech"
[Convert]::ToBase64String([IO.File]::ReadAllBytes("<المسار الكامل>androidkeystoreaqar-tech-release.keystore")) | gh secret set RELEASE_STORE_FILE_BASE64 --repo Naeem-Ba/HudhudNest
```

**أعطال أُصلحت (PR #70/#71)** — للرجوع إن تكرر أي منها:
- `exit code 126 / ./gradlew: Permission denied`: `android/gradlew` كان بوضع git `100644`. الآن `100755`
  (`git update-index --chmod=+x android/gradlew`)، و`.gitattributes` يثبّت `gradlew` على LF.
- `Keystore file .../android/app/keystore/... not found`: `RELEASE_STORE_FILE` كان يُحلّ بـ `file()` (نسبةً إلى
  `android/app`)؛ صار `rootProject.file()` (نسبةً إلى `android/`) كفرع الملف المحلي.
- `setup-java@v4` و`upload-artifact@v4` على Node 20 (تُزال من الـ runners في 2026-09-23): صارا
  `setup-java@v5.7.0` و`upload-artifact@v6.0.0` (مثبَّتان بـ SHA).
- `ubuntu-latest` ينتقل إلى 26.04 (2026-10-19): `build` و`android-release` مثبَّتان على `ubuntu-26.04` بعد
  اختبار ناجح.

**تسليم الـ AAB (2026-10-07):** يُنشر الـ AAB كملف في Release واحد (`android-latest`، pre-release) يُحذف ويُعاد
إنشاؤه عند كل بناء، وهو القناة الأساسية. رفعه كـ Actions artifact ما زال يجري كنسخة احتياطية بـ
`continue-on-error`، لأن حصة تخزين Actions artifacts مشتركة بين مستودعات الحساب وامتلأت ثلاث مرات في
2026-10-03..07 ("Artifact storage quota has been hit") فكان البناء الناجح يُعلَّم فاشلًا بلا ملف.

**التحقق:** AAB الناتج في CI مُوقَّع بشهادة `CN=aqar-tech`؛ بصمة SHA-256 مطابقة لبصمة الـ keystore المحلي
(`7D:30:B4:CB:E7:24:2F:C5:CC:50:2A:FA:B5:87:C7:67:38:3B:3D:0D:4E:D8:7A:6F:B4:F4:8E:2B:9C:64:F7:50`)،
وSHA-1 `66:14:AC:70:8C:6B:07:AA:DF:CF:1C:E4:8E:8B:B5:E5:DA:2C:E2:2E`. (الطريقة:
`jarsigner -verify -certs app-release.aab` و`keytool -printcert -jarfile app-release.aab`.)

**احتفظ دائمًا** بنسخة من `aqar-tech-release.keystore` و`release-signing.local.properties` في مدير كلمات مرور
خارج هذا القرص؛ المفتاح لا يُستبدل.
