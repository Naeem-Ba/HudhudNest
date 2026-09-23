# الانتقال إلى النطاق `hudhudnest.com` — الحالة والتوثيق

آخر تحديث: 2026-09-23. النطاق القديم: `realestateworld.world`. النطاق الجديد: `hudhudnest.com`.

## 1. ما تم تنفيذه

| المكوّن | التغيير | الحالة |
|---|---|---|
| GitHub | `Wohnungsmieten` ← `HudhudNest`، `PropertyApi` ← `HudhudNestApi` (الـ remotes المحلية محدّثة) | تم |
| Netlify | اسم المشروع `bizorealestateworld` ← `hudhudnest` (رابط Staging: `staging--hudhudnest.netlify.app`) | تم |
| DNS | Nameservers في Hostinger ← `dns1..4.p07.nsone.net` (Netlify DNS) | تم، وانتشر |
| Netlify | `hudhudnest.com` هو Primary domain، و`realestateworld.world` بقي alias | تم |
| SSL | شهادة Let's Encrypt تغطي `hudhudnest.com` و`*.hudhudnest.com` | تم |
| Resend | نطاق `hudhudnest.com` بحالة Verified (DKIM + `send`/`rsend` CNAME + DMARC في Netlify DNS) | تم |
| الكود | `environment.prod.ts` و`environment.staging.ts` و`capacitor.config.ts` و`playwright.config.ts` | معدّل محليًا، لم يُنشر |
| Render | أسماء الخدمات فقط (Name، وليس الـ URL) | تم |

سجلات DNS في منطقة `hudhudnest.com` (Netlify DNS): `NETLIFY` للـ apex وللـ `www`، و`TXT resend._domainkey`، و`CNAME send` ← `send.forge.rmta.net`، و`CNAME rsend` ← `rsend-euw1.forge.rmta.net`، و`TXT _dmarc` = `v=DMARC1; p=none;`.

## 2. ما لم يكتمل (يتطلب إجراءً يدويًا)

### 2.1 Render (خدمة الإنتاج `HudhudNest`) — تم (2026-09-23)
عُدّلت وحُفظت عبر "Save, rebuild, and deploy" وتحقق منها بعد إعادة التحميل:
| المتغير | كان | أصبح |
|---|---|---|
| `Cors__AllowedOrigins__0` | `https://bizorealestateworld.netlify.app` | `https://hudhudnest.com` |
| `Email__From` | `no-reply@realestateworld.world` | `no-reply@hudhudnest.com` |
| `Frontend__BaseUrl` | `https://realestateworld.world` | `https://hudhudnest.com` |
| `Frontend__PasswordResetUrl` | `https://realestateworld.world/#/auth/reset-password` | `https://hudhudnest.com/#/auth/reset-password` |

بقيت `Cors__AllowedOrigins__1` = `https://realestateworld.world` و`__2` = `capacitor://localhost` و`__3` = `https://localhost` كما هي، لأن النطاق القديم ما زال alias يخدم الموقع. اختبار preflight أكّد: `hudhudnest.com` و`realestateworld.world` مسموحان، والأصل القديم `bizorealestateworld.netlify.app` مرفوض.

**ما زال معلّقًا:** خدمة `hudhudnest-staging-api`: `Cors__AllowedOrigins__0` ما زال `https://staging--bizorealestateworld.netlify.app` ويجب أن يصبح `https://staging--hudhudnest.netlify.app`، وتُراجع فيها متغيرات `Email__From` و`Frontend__*` أيضًا.

ملاحظة عن واجهة Render: تعديل قيمة موجودة يتطلب الضغط على Edit ثم الكتابة في حقل القيمة مباشرة (بعد Ctrl+A). لا تضغط "Show secret" قبل الكتابة، لأنه يعيد تحميل القيمة ويمسح التعديل. كل حفظ يعيد نشر الخدمة.

### 2.2 Google Sign-In — تم (2026-09-23)
Google Cloud Console ← مشروع `aqar-tech` ← Credentials ← `aqar-tech Web (production)`:
- Authorized JavaScript origins أصبحت: `https://realestateworld.world` و`https://hudhudnest.com` (تحقق منها بعد إعادة تحميل الصفحة).
- لا توجد Authorized redirect URIs، ولا حاجة لها (الكود يستخدم Google Identity Services).
- Google تذكر أن التفعيل قد يستغرق من 5 دقائق إلى عدة ساعات، فإن ظهر `origin_mismatch` على `hudhudnest.com` فانتظر ثم أعد المحاولة.
- لم يُختبر تسجيل الدخول فعليًا في المتصفح بعد.
- عميلا iOS وAndroid يعتمدان على bundle ID / package name ولا يتأثران بالنطاق.

### 2.3 Apple Sign-In — محجوب: الحساب غير مسجّل في Apple Developer Program
نتيجة الفحص (2026-09-23): الحساب `naeem.bazzazeh@gmail.com` حساب Apple عادي. صفحة `developer.apple.com/account` تعرض "Jetzt Mitglied im Apple Developer Program werden"، وصفحة Identifiers تعرض "Access Unavailable — only for developers enrolled in a developer program". لذلك لا يوجد Services ID ولا يمكن إنشاؤه قبل الاشتراك (99$ سنويًا).

الوضع الحالي في الكود: `APPLE_CLIENT_ID` غير معرّف في Netlify، فتكون `appleClientId` فارغة ويُعطَّل زر Apple (`SocialAuthService` يفحص `Boolean(environment.appleClientId?.trim())`).

الخطوات بعد الاشتراك:
1. Identifiers ← App IDs ← `com.realestate.app`: فعّل Capability "Sign in with Apple" (Enable as a primary App ID).
2. Identifiers ← Services IDs ← `+`: أنشئ Services ID، مثلًا `com.realestate.app.web`، وفعّل Sign in with Apple.
3. Configure: Primary App ID = `com.realestate.app`، Domains = `hudhudnest.com`، Return URLs = `https://hudhudnest.com/auth/apple/callback`. لا تضف نطاقات أخرى إلا عند الحاجة، ولا تضف الـ www لأنه يحوّل إلى النطاق الأساسي.
4. Netlify ← Environment variables: `APPLE_CLIENT_ID` = معرّف الـ Services ID. القيمة تُقرأ وقت البناء (`tools/generate-env.mjs`)، فيلزم نشر جديد.
5. Render (الإنتاج وStaging): `SocialAuth__AppleClientId` = نفس المعرّف. الباك اند يتحقق فقط من `iss = https://appleid.apple.com` و`aud = SocialAuth:AppleClientId` والـ nonce، ولا يحتاج مفتاحًا خاصًا (`AppleTokenVerifier.cs`).
6. تنبيه: الباك اند يقبل `aud` واحدًا فقط. الويب يستخدم Services ID، أما تطبيق iOS الأصلي فقد يصدر tokens بـ `aud = com.realestate.app`. تحقق من مسار iOS قبل الاعتماد على قيمة واحدة، وقد يلزم دعم أكثر من audience.

## 3. التحقق بعد إكمال الإجراءات اليدوية
```bash
curl -sSI https://hudhudnest.com            # 200
curl -sSI https://www.hudhudnest.com        # 301 -> https://hudhudnest.com/
curl -s -o /dev/null -w "%{http_code}\n" https://hudhudnest.com/api/csrf   # 200
echo | openssl s_client -connect hudhudnest.com:443 -servername hudhudnest.com 2>/dev/null | openssl x509 -noout -ext subjectAltName
```
ثم جرّب يدويًا: تسجيل دخول Google، وتسجيل دخول Apple (بعد التفعيل)، وإرسال بريد إعادة تعيين كلمة المرور والتأكد أن المرسل والرابط على `hudhudnest.com`.

## 4. ملاحظات تشغيلية
- فريق Netlify على "operational credits" وعمليات النشر متوقفة بسبب استنفاد الرصيد، فلن تصل تعديلات الكود إلى الموقع الحي قبل استئنافها.
- `realestateworld.world` ما زال يردّ 200 كـ alias ولم يُحوَّل إلى النطاق الجديد. لا تحذفه من Netlify ولا من Resend ولا من Google قبل التأكد أن الروابط والبريد القديمة لم تعد مستخدمة. تنتهي صلاحية تسجيله في Hostinger في 2026-12-30.
- ملفات الاختبار (`*.spec.ts` و`*.test.mjs`) ما زالت تستخدم `realestateworld.world` كقيمة تجريبية ولم تُعدّل.
- رجوع سريع عند مشكلة: اجعل `realestateworld.world` Primary domain من Netlify ← Domain management، وأعد قيم CORS/Email في Render إلى الأصلية الموضحة في القسم 2.1.
