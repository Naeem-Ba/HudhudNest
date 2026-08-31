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
