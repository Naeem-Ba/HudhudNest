# التنزيل المباشر لتطبيق Android (APK) من صفحة `/download`

آخر تحديث: 2026-10-16. الصفحة: `https://hudhudnest.com/download`، والعنوان الثابت للملف: `https://hudhudnest.com/download/android`.

## كيف يعمل (مختصر)
1. وسم `vX.Y.Z` على commit في main ← وظيفة `android-release` في Frontend CI تبني AAB (لـ Play) **وAPK موقّعًا بنفس مفتاح الإصدار**.
2. بعد نشر الـ AAB، تفحص الوظيفة الـ APK بالأدوات الحقيقية (`apksigner` و`aapt2` و`sha256`) وتكتب **مسودة بيان** `android-release.draft.json` (`approved: false`)، وتُرفق APK ومسودة البيان وملف `.sha256` بالـ Release الخاص `android-latest` (يحتاج دخول GitHub).
3. أنت ترفع الـ APK إلى **مستودع الإصدارات العام** `Naeem-Ba/HudhudNest-Releases` (يدويًا، دقيقتان).
4. تعتمد البيان في PR: تنسخ المسودة إلى `downloads/android-release.json` وتضع `"approved": true`. هذا الملف هو **المصدر الوحيد** لرقم الإصدار والحجم وSHA-256 وبصمة التوقيع والتاريخ.
5. بعد دمج PR ونشر الموقع (main ← release ← Publish في Netlify) تظهر بطاقة «تنزيل مباشر» في `/download`، ويحوّل `/download/android` (302) إلى ملف الإصدار.

لا شيء يظهر للجمهور قبل الخطوة 4، ولا يمكن للبيان أن يشير إلى مضيف آخر: العنوان الوحيد المسموح هو `https://github.com/Naeem-Ba/HudhudNest-Releases/releases/download/v<الإصدار>/HudhudNest-<الإصدار>.apk` (تفرضه `tools/lib/android-release.mjs` وتختبره `android-release.test.mjs`).

## إعداد لمرة واحدة: مستودع الإصدارات العام
1. GitHub ← New repository ← الاسم **`HudhudNest-Releases`** ← **Public** ← أضف README قصيرًا (مثلًا: «ملفات التثبيت الرسمية لتطبيق HudhudNest؛ التحقق: SHA-256 في https://hudhudnest.com/download»). بلا كود مصدري.
2. Settings ← General ← إن ظهر خيار **Release immutability** فعّله (لا يمكن بعدها استبدال ملف إصدار منشور بصمت؛ لم أتحقق من وجود الخيار في حسابك).
3. للنشر التلقائي يلزم سر واحد في CI (انظر القسم التالي). بدونه يبقى النشر يدويًا من واجهة GitHub.

## النشر التلقائي (الافتراضي)
عند دفع وسم `vX.Y.Z` يتولى Frontend CI كل ما كان يدويًا:
1. يرفع `HudhudNest-X.Y.Z.apk` و`.sha256` إلى Release بالوسم `vX.Y.Z` في `HudhudNest-Releases` (لا يستبدل إصدارًا موجودًا).
2. ينزّل الملف من العنوان العلني ويقارن SHA-256 بما بناه؛ أي اختلاف يُفشل المهمة ولا يُقترح الاعتماد.
3. يفتح PR باسم `chore/android-apk-X.Y.Z` فيه `downloads/android-release.json` (`approved: true`) وكتلة `/download/android` المولَّدة.
4. **أنت تدمج الـ PR فقط**؛ هذا هو الاعتماد. بعد نشر الموقع شغّل `npm run android-release -- check-remote` للتحقق.

إعداد لمرة واحدة:
- أنشئ Fine-grained personal access token: Resource owner `Naeem-Ba`، Repository access: **Only select repositories ← HudhudNest-Releases**، Permissions: **Contents: Read and write** (لا شيء غيره)، وأضفه في `HudhudNest` ← Settings ← Secrets and variables ← Actions باسم `RELEASES_REPO_TOKEN`.
- فعّل Settings ← Actions ← General ← **Allow GitHub Actions to create and approve pull requests**.
- بلا السر تُتخطّى الخطوات (إشعار في سجل المهمة) ويبقى المسار اليدوي أدناه صالحًا. الـ PR الذي يفتحه `GITHUB_TOKEN` لا يشغّل CI تلقائيًا؛ إن كانت الفحوص مطلوبة للدمج فأغلق الـ PR وأعد فتحه لتعمل.

## نشر إصدار جديد يدويًا (احتياطي)
1. بعد نجاح تشغيل الوسم: GitHub ← `HudhudNest` ← Releases ← **android-latest** ← نزّل ثلاثة ملفات: `HudhudNest-X.Y.Z.apk` و`HudhudNest-X.Y.Z.apk.sha256` و`android-release.draft.json`.
2. تحقق محليًا (اختياري لكنه مستحسن): `sha256sum -c HudhudNest-X.Y.Z.apk.sha256` (Windows: `certutil -hashfile HudhudNest-X.Y.Z.apk SHA256`).
3. في `HudhudNest-Releases`: Releases ← Draft a new release ← Tag **`vX.Y.Z`** (حرفيًا، بحرف v) ← ارفع ملفي `.apk` و`.sha256` ← عنوان `HudhudNest X.Y.Z` ← Publish release (ليس pre-release).
4. جرّب الرابط من هاتف ومن اتصال مختلف: `https://github.com/Naeem-Ba/HudhudNest-Releases/releases/download/vX.Y.Z/HudhudNest-X.Y.Z.apk`.
5. PR في `HudhudNest`: انسخ المسودة إلى `downloads/android-release.json` وغيّر `approved` إلى `true`، ثم نفّذ `npm run generate:download` (يحدّث كتلة `/download/android` في `public/_redirects`) وارفع الملفين. يتحقق CI من الصحة (`npm run test:tools`).
6. بعد الدمج وPublish الموقع: `npm run android-release -- check-remote` يُنزِّل الملف المنشور ويقارن SHA-256 والحجم بالبيان (قراءة فقط).
7. أخيرًا افتح `/download` على Android، وتحقق من ظهور الإصدار والبصمة، وأن زر التنزيل يبدأ تنزيل الملف.

سحب إصدار: ضع `"approved": false` (أو احذف الملف) ثم انشر الموقع؛ يختفي الزر ويعود `/download/android` إلى الصفحة. لا تحذف الإصدار القديم من مستودع الإصدارات ما دام أحد قد يعتمد عليه؛ احتفظ بكل الإصدارات المنشورة.

## ما يجب أن تعرفه (مخاطر وقيود حقيقية)
- **التوقيعان مختلفان.** نسخة Play موقّعة بمفتاح Google (App signing)، والـ APK المباشر بمفتاح الإصدار الخاص بنا (upload key). Android يرفض التحديث فوق تطبيق بتوقيع مختلف: من ثبّت الـ APK ثم أراد نسخة Play (أو العكس) يجب أن يحذف التطبيق أولًا (تُحذف بياناته المحلية؛ الحساب محفوظ على الخادم). الصفحة تقول ذلك للمستخدم.
- **لا تحديث تلقائي للـ APK.** نافذة التحديث داخل التطبيق (`AppRelease`) لا تقبل إلا روابط Google Play وApple (سياسة PR API #325)، فمستخدم الـ APK في بلد لا يصل فيه إلى Play سيُوجَّه إلى Play. الحل المقترح (غير منفَّذ، يحتاج موافقتك لأنه تعديل في الـ API): السماح بعنوان `https://hudhudnest.com/download` كرابط تحديث لـ Android.
- **تسجيل Google على الـ APK المباشر** يعتمد على عميل Android الخاص بمفتاح الإصدار (SHA-1 `66:14:AC:…`) الذي أنشأته في Google Cloud. لم يُجرَّب على APK مباشر بعد.
- **Google Play Protect** قد يعرض تحذيرًا لتطبيق من خارج المتجر. لا تطلب الصفحة تعطيله ولا يجب أن تفعل ذلك أبدًا. وأعلنت Google عن اشتراط تحقق هوية المطوّرين للتطبيقات المثبَّتة من خارج المتجر ابتداءً من 2026 في دول محددة؛ لم أتحقق من الجدول الحالي ولا من انطباقه على سوريا أو ألمانيا، فراجعه قبل الاعتماد على هذا المسار تجاريًا.
- **سوريا والقيود القانونية.** لم أتحقق من أن GitHub يعمل من اتصالات داخل سوريا، ولا من أن Google Play متاح للمستخدم السوري الآن. الاختبار الوحيد المعتبر: أن يجرّب شخص داخل سوريا فتح `/download` وتنزيل الملف وتثبيته وتسجيل الدخول واستلام رمز التحقق. العقوبات والتراخيص العامة مسألة قانونية لك وللمستشار القانوني؛ الصفحة لا تتجاوز أي قيد ولا تعتمد على عنوان IP لتحديد الدولة، وتعرض كل الخيارات يدويًا. إن لم يعمل GitHub هناك فالبدائل: تخزين آخر مجاني (Cloudflare R2 يتطلب بطاقة) أو نسخة على النطاق نفسه عبر Netlify (تستهلك رصيدك)، وكلاهما قرار منفصل.
- **iPhone:** لا ملف IPA مباشر. الصفحة تقول ذلك صراحة وتعرض App Store «غير متاح بعد» حتى تضع `stores.ios.published` و`appStoreId` بعد النشر.
- **الحاسوب:** لا نسخة مكتبية؛ الصفحة تعرض رمز QR لفتحها على الهاتف.

## قائمة اختبار على جهاز حقيقي (لم تُنفَّذ بعد)
- [ ] الفتح من Android Chrome: تُبرز بطاقة التنزيل المباشر («مناسب لجهازك») عند عدم نشر Play، والأزرار كلها تعمل.
- [ ] تنزيل الملف بالكامل وتطابق SHA-256 مع المعروض.
- [ ] التثبيت على جهاز نظيف: يطلب السماح بالمصدر، لا يطلب تعطيل Play Protect.
- [ ] التطبيق يتصل بالإنتاج (ليس Staging)، تسجيل الدخول بالبريد وبـ Google، رمز التحقق، تحميل العقارات والصور.
- [ ] الفتح من iPhone Safari: بطاقة App Store «غير متاح بعد» ولا رابط تثبيت وهمي.
- [ ] الفتح من الحاسوب: يظهر QR، ومسحه يفتح الصفحة.
- [ ] اللغات الثلاث (عربي RTL، إنجليزي، ألماني) وتبديلها.
