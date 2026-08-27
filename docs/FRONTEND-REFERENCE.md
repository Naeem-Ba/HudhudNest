# WohnungsApp (Angular) — المرجع المعماري للواجهة

> **الغرض:** مرجع حيّ لكل جلسة تطوير قادمة على الواجهة.
> **آخر تحديث:** 2026-08-26 · النسخة **v4** (بوابات أهلية الإعلان · توكن التجديد صار
> كوكياً لا `sessionStorage` · `/plans` صار حقيقياً · تصحيح ميزانية الحزمة)
> **مصدر التحقّق:** فحص مباشر لشجرة المصدر في
> `C:\Users\naeem\OneDrive\Desktop\Notiz\WohnungsApp\Wohnungsmieten`
> (الفرع `feat/listing-eligibility-gates`، آخر التزام **`730af55`**) **و** لمستودع
> الخلفية في `C:\Users\naeem\Source\Repos\PropertyApi` (آخر التزام **`3cadb4b`**).
> **تحقّق تنفيذي في هذه الجلسة:** `npm run typecheck` ✅ · `npm run audit:frontend` ✅
> (يمرّ فعلياً — الرمز 0) · `npm run build:prod` ✅ (‏596.90 kB خام، **داخل** ميزانية
> 650 kB الفعلية — انظر §11). **`ng test` لم يُعَد تشغيله هذه الجلسة** — الرقم المذكور
> أدناه (‏52/54) محمول من v3 ومُعلَّم كذلك.
> **الحالة:** ⚠️ صالح للإنتاج بشروط — انظر §12، و**`BACKEND-ISSUES.md`** للبنود
> العابرة للمستودعين.

---

## 0. اقرأ هذا قبل الوثوق بأي سطر أدناه

**أهمّ تصحيح في v4 ليس ميزة جديدة، بل تصحيح ادّعاء كان خاطئاً في v1 حتى v3:** §4 في
النسخ السابقة قالت إن توكن التجديد يُخزَّن في `sessionStorage` تحت
`wohnungsapp_refresh` — وهذا **لم يعد صحيحاً في الشيفرة التي تلك النسخ نفسها ادّعت
فحصها**. القراءة المباشرة لـ `token-storage.service.ts` في هذه الجلسة تُظهر أن الملف
لا يكتب توكن التجديد في أي تخزين متصفّح إطلاقاً؛ تعليق الملف نفسه يشرح أن الانتقال إلى
كوكي `HttpOnly` تمّ. هذا بالضبط الدرس الذي يفتتح كل نسخة من هذا الملف — **ولم يُطبَّق
على القسم الأكثر حساسية أمنياً فيه**. لا تكرّر هذا: افحص، لا تنقل.

| البند | v3 قالت | v4 مُتحقَّق |
|---|---|---|
| توكن التجديد | `sessionStorage` تحت `wohnungsapp_refresh`، «قابل للقراءة بـ XSS» | **كوكي `HttpOnly`+`Secure`+`SameSite=None`** يديره المتصفّح بلا وصول JS. `TokenStorageService.clear()` يمسح مفاتيح `sessionStorage`/`localStorage` القديمة **دفاعياً فقط** — لا شيء يكتبها بعد الآن |
| `/plans` | عقد مكتوب، الدالة تعيد كتالوجاً محلياً عبر `of(...)` | **`GET /api/plans` حقيقية** — `PlansApiService.getPlans()` يستدعي الخلفية مباشرة؛ الكتالوج المحلي بقي فقط كمرجع لجدول `toCta()` |
| بوابة إنشاء الإعلان | لا يوجد حارس أهلية | **`ListingEligibilityGuard`** جديد على `property-form` (‏الإنشاء فقط) |
| ميزانية الحزمة | «500 kB، تجاوز 95 kB» | **الحدّ الفعلي في `angular.json` هو 650 kB تحذيراً / 1MB خطأً.** القياس الحالي 596.90 kB **داخل** الحدّ — لا تحذير بناء إطلاقاً. الرقم القديم لم يظهر في `angular.json` قط |
| `npm run audit:frontend` في CI | 🔴 يخرج بالرمز 1 | ✅ **يمرّ** — شُغِّل فعلياً في هذه الجلسة، خروج 0 |

**قاعدة ملزمة، لم تتغيّر:** كل جدول هنا يحمل ملاحظة مصدر. أعِد التحقق من الشيفرة قبل
استخدام هذا الملف في التخطيط — لا تنقل بند من نسخة سابقة حتى لو بدا مستقراً.

---

## 1. هوية الواجهة

| الخاصية | القيمة |
|---|---|
| الإطار | Angular **20.2** — Standalone فقط، لا NgModules |
| اللغة | TypeScript 5.9 · `strict: false` ⚠️ — `npm run typecheck` **يمرّ** ✅ (مُتحقَّق هذه الجلسة) |
| التوجيه | `provideRouter(routes, withHashLocation())` — مسارات hash (`/#/pricing`). روابط بريد الخلفية تحمل `#` الآن (‏`BACKEND-ISSUES.md` B-14 مغلق) |
| كشف التغيير | `ChangeDetectionStrategy.OnPush` + `signal()` — إلزامي في كل مكوّن جديد |
| الحقن | `inject()` دالةً، لا حقن بالمُنشئ في الكود الجديد |
| التنسيق | نظامان معاً: SCSS خام + متغيرات CSS (معظم الصفحات) و**Tailwind v4** (`checkout`) |
| الخطوط | Roboto · IBM Plex Sans Arabic · Cairo (من Google Fonts في `index.html`) |
| التعريب | `@ngx-translate/core` 17 — ثلاث لغات، الافتراضية `ar` |
| الخرائط | Leaflet 1.9 |
| الزمن الحقيقي | `@microsoft/signalr` 10 |
| المحمول | Capacitor 8 — Android + iOS |
| المصادقة | Bearer في الذاكرة + كوكي `refresh_token` (‏`HttpOnly`) — **لا تخزين توكن في `localStorage`/`sessionStorage` بعد الآن** — §4 |
| الاختبار | Karma + Jasmine — 7 ملفات spec (‏52/54 محمول من v3، **لم يُعَد تشغيله هذه الجلسة**) |

---

## 2. البنية الفعلية (مُحصاة من الشجرة)

```
src/
├── app/
│   ├── core/                     الطبقة الأساسية — لا مكوّنات مرئية
│   │   ├── adapters/             api-naming.adapter.ts  (apiToCamelCase)
│   │   ├── api/                  19 خدمة API — منها plans-api.service.ts (خلفية حقيقية الآن)
│   │   ├── auth/                 auth.service.ts + token-storage.service.ts (كوكي لا تخزين)
│   │   ├── guards/                AuthGuard · AdminGuard · ListingEligibilityGuard (جديد)
│   │   ├── interceptors/         3 اعتراضات
│   │   ├── models/               15 نموذجاً
│   │   └── services/             11 خدمة عرضية
│   ├── features/                 ~20 ميزة (lazy-loaded بالكامل)
│   ├── admin/                    4 شاشات إدارية
│   ├── shared/
│   │   ├── ui/                   مكوّنات عرض مشتركة
│   │   ├── directives/           image-fallback · loading · rtl
│   │   └── services/             toast.service.ts
│   ├── layout/ navbar/ profile/ pipes/ map-picker/ language-selector/
│   ├── app.config.ts             المزوّدات + APP_INITIALIZER
│   └── app.routes.ts
├── environments/                 environment · .prod · .staging · .model
├── styles/                       _breakpoints.scss · _auth-flow.scss
├── styles.scss                   نظام التصميم الكامل + الوضع الداكن  (SCSS)
└── tailwind.css                  مدخل Tailwind + جسر الرموز @theme      (CSS خام)
```

**الميزات:** `analytics` `auth` `checkout` `contact` `favorites` `home` `landing`
`messages` `my-listings` `not-authorized` `notifications` `offline` `pricing`
`properties` `property-detail` `property-form` `reviews` `saved-searches` `user-profile`
`visits`.

---

## 3. طبقة `core/` — ما يوجد بالضبط

### 3.1 خدمات الـ API (19)

`admin-users` · `analytics` · `api-error` · `backend-api` · `contact` ·
`favorites-api` · `listing-fees-api` · `location-suggestions-api` · `lookups-api` ·
`messages-api` · `notifications-api` · `otp-api` · **`plans-api`** · `profile` ·
`property-api` · `review` · `saved-search-api` · `user-profile-api` · `visit`

**النمط الموحّد:** `@Injectable({ providedIn: 'root' })` + حقل `endpoint` ثابت +
الاعتماد على `BackendApiService`. **لا `catchError` داخل الخدمة.**

**`plans-api.service.ts` تغيّرت جوهرياً هذه الدورة:** `getPlans()` يستدعي
`GET /api/plans` الحقيقية الآن (‏لا `of(...)`)، و`selectPlan(tier)` جديدة تستدعي
`POST /api/users/me/plan` — بما فيها اختيار الخطة المجانية صراحة (ليست افتراضاً
ضمنياً). الكتالوج المحلي `SUBSCRIPTION_PLANS` بقي فقط كمرجع لجدول تحويل الخطة إلى
رابط CTA، لا كمصدر بيانات.

### 3.2 الاعتراضات (3)

| الملف | الدور |
|---|---|
| `refresh-auth.interceptor.ts` | إرفاق `Bearer` + تجديد التوكن تلقائياً عند 401 |
| `auth-interceptor.ts` | مجرد إعادة تصدير لـ `RefreshAuthInterceptor` |
| `api-error.interceptor.ts` | تحويل أخطاء HTTP إلى رسائل قابلة للعرض |

`requestNewAccessToken()` في `refresh-auth.interceptor.ts` يستدعي
`POST /auth/refresh` عبر `HttpBackend` مباشرة (‏تجاوزاً للاعتراضات) مع
`withCredentials: true` **بلا أي قيمة توكن في الجسم** — الكوكي يحمل التوكن ضمنياً. هذا
اتّساق تام مع كوكي `HttpOnly` الجديد على الخلفية.

### 3.3 الحرّاس — **ثلاثة الآن، لا اثنين**

- `AuthGuard` — على معظم المسارات المحمية.
- `AdminGuard` — على 4 مسارات إدارية، يوجّه عند الرفض إلى `/not-authorized`.
- **`ListingEligibilityGuard`** (‏جديد) — على `property-form` **للإنشاء فقط**، وليس
  على `properties/edit/:id`. مُدرَج بعد `AuthGuard` في مصفوفة `canActivate` كي يُوجَّه
  الزائر المجهول إلى تسجيل الدخول أولاً. يجلب الملف الشخصي طازجاً (لا من ذاكرة مؤقّتة)
  ويوجّه إلى `/pricing` (إن كانت وسيلة التواصل مؤكَّدة والخطة ناقصة) أو `/profile`
  (إن كانت وسيلة التواصل نفسها ناقصة). **تعليق الملف نفسه يقرّ أن الخلفية تبقى مصدر
  الحقيقة الفعلي** — هذا الحارس يمنع 403 شائعاً، لا يستبدله.

### 3.4 الخدمات العرضية (11)

`enum` · `language` · `lead` · `meta` · `native-back-button` · `overlay-back-handler` ·
`password-validator` · `signalr-notification` · `theme` · `token-storage` · `url`

### 3.5 النماذج (15)

`analytics` · `api` · `auth` · `favorite` · `lead` · `listing-fee` ·
`location-suggestion` · `message` · `notification` · `property` · `review` ·
`saved-search` · `subscription-plan` · `user-profile` · `visit`

---

## 4. المصادقة وتخزين التوكن — ⚠️ مصحَّحة بالكامل هذه المراجعة

مقروء من `token-storage.service.ts` مباشرة، **وهذا يناقض ما قالته v1 حتى v3**:

| العنصر | أين يُخزَّن | التقييم |
|---|---|---|
| **Access token** | حقل خاص في الذاكرة — لا يلمس التخزين إطلاقاً | ✅ صحيح، بلا تغيير |
| **Refresh token** | **كوكي `refresh_token`** — `HttpOnly` + `Secure` + `SameSite=None`، يديره المتصفّح والخلفية حصراً | ✅ **JavaScript لا يستطيع قراءته حتى مع XSS كاملة** |
| `TokenStorageService.clear()` | يمسح مفاتيح `sessionStorage`/`localStorage` القديمة (`accessToken`, `refreshToken`, `wohnungsapp_refresh`, `wohnungsapp_remember`, …) | تنظيف دفاعي فقط — «لا شيء يكتب هذه المفاتيح بعد الآن»، بحسب تعليق الملف |

**الخلاصة الصريحة:** ثغرة XSS واحدة لم تعد تكفي لسرقة توكن تجديد قابل للتصدير خارج
المتصفّح — الكوكي غير مقروء بجافاسكربت. هذا يُغلق بند «توكن التجديد في تخزين قابل
للقراءة» الذي حملته كل نسخة سابقة من هذا الملف.

**استعادة الجلسة:** `restoreSession()` في `app.config.ts` يستدعي `POST /auth/refresh`
عند الإقلاع؛ الكوكي يحمل التوكن ضمنياً، فلا حاجة لقراءة أي تخزين محلي أولاً.

### 4.1 ⚠️ ما فتحه هذا الإصلاح — اعتبار جديد لا تتجاهله

كوكي `SameSite=None` يعني أن المتصفّح يُرفقه **حتى في طلبات عبر المواقع**. الواجهة **لا
ترسل أي رأس `X-XSRF-TOKEN`** (‏بحث هذه الجلسة: صفر مطابقة لـ `csrf|xsrf` في `src/`
خارج الاختبارات)، بينما الخلفية تبقي `CookieCsrf:Enabled = false` افتراضياً. النتيجة:
موقع خبيث يستطيع تحفيز `POST /api/auth/refresh` أو `POST /api/auth/logout` من متصفّح
المستخدم بلا علمه — لا يُسرَّق التوكن (‏CORS يمنع قراءة الاستجابة)، لكن تدويراً أو
تسجيل خروج قسريَّين ممكنان. هذا بند خلفية أساساً — **`BACKEND-ISSUES.md` B-18** — لكن
إصلاحه يتطلّب تغييراً هنا أيضاً: جلب `GET /api/security/csrf-token` وإرسال الرأس على
كل طلب كتابة، بالتزامن مع تفعيل `CookieCsrf:Enabled` على الخلفية. **لا تفعل نصف
الإصلاح.**

---

## 5. عقد الاتصال مع الخلفية

### 5.1 قاعدة التسمية — تصحيح جوهري

النسخ حتى v3 قالت إن الخلفية ترسل PascalCase (`PropertyNamingPolicy = null`) وإن
`apiToCamelCase()` ضرورة دائمة. **الخلفية تغيّرت:** `Program.cs:317` يضبط
`PropertyNamingPolicy = JsonNamingPolicy.CamelCase` الآن — كل استجابة، ناجحة أو خطأ،
camelCase من مصدرها.

`apiToCamelCase()` **يبقى في مكانه** ولا يزال يعمل بلا ضرر (‏تحويل camelCase إلى
camelCase عملية عديمة الأثر)، لكنه لم يعد **ضرورياً** لخدمة جديدة كما كان. **لا تحذفه
من الخدمات القائمة** — إزالته الآن مجرد تبسيط بلا فائدة تشغيلية وخطر انحدار غير
ضروري إن عاد أي مسار للتسمية القديمة لاحقاً.

### 5.2 خريطة نقاط النهاية (واجهة ← خلفية) — محدَّثة

| مسار الواجهة | Controller في الخلفية | موجود؟ |
|---|---|---|
| `/properties`, `/properties/{id}`, `/properties/mine`, `/properties/geo-search`, `/properties/{id}/publish`, `/properties/{id}/manage` | `PropertiesController` | ✅ |
| `/properties/{id}/extension`, `/properties/{id}/featured` | `PropertiesController` | ✅ |
| `/properties/{id}/images/...` | `PropertyImagesController` | ✅ |
| `/auth/phone/registration/*`, `/auth/phone/login`, `/auth/phone/password-reset/*` | `PhonePasswordAuthController` | ✅ |
| `/users/me`, `/users/me/avatar`, `/users/me/change-password`, **`/users/me/plan`** (‏جديد) | `UsersController` | ✅ |
| `/admin/users`, `/admin/roles` | `AdminController` | ✅ |
| `/admin/location-suggestions` | `LocationSuggestionsController` | ✅ |
| `/notifications`, `/notifications/unread-count`, … | `NotificationsController` | ✅ |
| `/favorites`, `/favorites/{propertyId}` | `FavoritesController` | ✅ |
| `/savedsearch` | `SavedSearchController` | ✅ |
| `/visits` | `VisitsController` | ✅ |
| `/reviews` | `ReviewsController` | ✅ |
| `/analytics` | `AnalyticsController` | ✅ |
| `/contact` | `ContactController` | ✅ |
| `/lookups` | `LookupsController` | ✅ |
| `/messages` | `MessagesController` | ✅ |
| **`/plans`** | **`PlansController`** | ✅ **صار موجوداً — أُغلقت الفجوة القديمة** |
| `/agencies/{slug}`, `/agencies/me`, `/agencies` (‏POST) | `AgenciesController` | ⚠️ **لا خدمة عميل بعد** — انظر §5.5 |
| — (لا نظير في الواجهة) | `PUT/DELETE /agencies/{agencyId}` (‏تعديل/تعطيل، جديدان في الخلفية) | ❌ |

### 5.3 `/plans` — لم يعد عقداً بلا خلفية

`PlansApiService.getPlans()` يستدعي `GET /api/plans` مباشرة. `selectPlan(tier)` جديدة
تستدعي `POST /api/users/me/plan`. **ما زال ناقصاً:** لا فوترة ولا بوابة دفع، وحدّ
الإعلانات على الخلفية **لا يقرأ** الخطة المختارة بعد (‏`BACKEND-ISSUES.md` B-3) — أي
أن اختيار خطة مدفوعة اليوم لا يغيّر أي حدّ فعلي. لا تَعِد المستخدم بأثر فوري لاختيار
خطة أعلى حتى يُغلَق B-3.

### 5.4 رسوم الإعلانات — بلا تغيير هذه الدورة

بلا تغيير عن v3: تمديد إعلان (‏$1.00، 90 يوماً) وتمييز (‏$5.00، 30 يوماً)، كلاهما
`202 Accepted` يُسجِّل ولا يمنح، ويُؤكَّد إدارياً. `checkout.page.ts` تعكس هذا حرفياً.

### 5.5 الوكالات — لا تزال خلفية بلا عميل، والفجوة تكبر

الخلفية أضافت هذه الدورة **تعديل وتعطيل** المكتب (‏`PUT`/`DELETE
/api/agencies/{agencyId}`) فوق ما كان موجوداً. **الواجهة لا تزال بلا أي شيء**: لا خدمة،
لا نموذج، لا مسار، لا مفتاح ترجمة — والفجوة بين ما تستطيعه الخلفية وما تعرضه الواجهة
اتّسعت لا ضاقت. اقرأ `PropertyApi-REFERENCE.md §7.5` قبل تصميم أي شاشة وكالات.

### 5.6 CSRF — لم يعد سؤالاً نظرياً — انظر §4.1

القسم القديم هنا (‏«لا كوكي مصادقة فلا حاجة لـ CSRF») **لم يعد صحيحاً** بعد ترحيل
توكن التجديد إلى كوكي. التفصيل الكامل في §4.1؛ لا تكرّر الادّعاء القديم في أي مكان آخر
من هذا المستودع.

### 5.7 قواعد كلمة المرور — بلا تغيير هذه الدورة

`core/auth/password-policy.ts` ما زال يكرّر يدوياً قواعد
`PasswordSecurityService.cs`. الدَّين نفسه قائم: مصدرا حقيقة لقاعدة واحدة، بلا اختبار
يفرض تطابقهما.

### 5.8 تأكيد البريد — التدفّق مكتمل الآن

| القطعة | الحالة |
|---|---|
| رسالة «أُرسل رابط تأكيد» بعد التسجيل | ✅ |
| صفحة `/auth/verify-email` | ✅ |
| **وصول الرابط إليها** | ✅ **أُصلح** — `EmailConfirmationUrlBuilder` يبني المسار بـ `#` الآن (‏`BACKEND-ISSUES.md` B-14 مغلق) |
| **«أعِد إرسال الرابط»** | ✅ **مبنيّة** — `resendConfirmationEmail()` مستدعاة من `register.page.ts` و`verify-email.page.ts` كلتيهما (‏B-15 مغلق) |

---

## 6. SignalR — بلا تغيير هذه الدورة

`signalr-notification.service.ts` يتصل بـ `environment.signalRUrl`؛
`accessTokenFactory` يقرأ التوكن الحالي عند كل استدعاء لا قيمة ملتقطة؛ الحدث
`ReceiveNotification`؛ الخلفية تستخدم Redis backplane.

---

## 7. التعريب والاتجاه — بلا تغيير جوهري هذه الدورة

| البند | القيمة |
|---|---|
| الملفات | `public/i18n/ar.json` · `en.json` · `de.json` |
| الافتراضية والاحتياطية | `ar` |
| التخزين | `localStorage` تحت `lang` |
| الاتجاه | `LanguageService` يضبط `document.documentElement.dir` |

**قاعدة ملزمة:** لا نصوص مكتوبة يدوياً في القوالب أو الشيفرة — كل نص مفتاح ترجمة.
أضِف أي مفتاح جديد (مثل رسائل `ListingEligibilityGuard`) إلى الملفات الثلاثة معاً.

---

## 8. نظام التصميم — بلا تغيير هذه الدورة

راجع §8 من v3 للتفاصيل الكاملة (‏الرموز، الوضع الداكن، نقاط الانكسار، فخّ الشبكة،
Tailwind v4، الخطوط) — لم يتغيّر شيء منها في هذه الدورة، ولذلك لم تُكرَّر هنا حرفياً.
**القاعدة نفسها تسري:** لا تنقلها دون إعادة فحص عند أول تعديل تصميمي مستقبلي.

---

## 9. المسارات

المجموعات كما في v3 (‏عامة، محمية بـ `AuthGuard`، إدارية بـ `AdminGuard`، مصادقة، خارج
التخطيط، الشامل) **بإضافة واحدة**: `property-form` (‏الإنشاء فقط) صار محمياً بـ
`[AuthGuard, ListingEligibilityGuard]` معاً، بينما `properties/edit/:id` يبقى على
`AuthGuard` وحده — التمييز متعمَّد (‏تعديل إعلان مملوك ليس «نشراً جديداً»، انظر §3.3).

**تحذير غير متغيّر:** `{ path: '**', redirectTo: 'home' }` يبتلع أي مسار غير مسجَّل
بصمت.

---

## 10. المحمول (Capacitor 8) — بلا تغيير هذه الدورة

راجع §10 من v3. لا تغيير في `capacitor.config.ts` أو الأدوات المرتبطة هذه الدورة.

---

## 11. الأوامر والبوابات — مُعاد تشغيلها فعلياً هذه الجلسة

```bash
npm run typecheck        # ✅ يمرّ
npm run audit:frontend   # ✅ يمرّ — الرمز 0 (كان 🔴 1 في v3)
npm run build:prod       # ✅ 596.90 kB خام / 159.10 kB منقول
npm run postmerge:verify # check:env + audit + typecheck + build:prod
```

### 11.1 ميزانية الحزمة — تصحيح لا تحديث

**الحدّ الفعلي في `angular.json` (‏`production.budgets`):
`maximumWarning: 650kB`, `maximumError: 1MB`.** لم يكن «500 kB» يوماً القيمة المضبوطة
في هذا الملف عبر كل النسخ التي فحصتها هذه المراجعة تاريخياً. القياس الفعلي هذه الجلسة:

```
Initial total | 596.90 kB | 159.10 kB (منقول)
```

**596.90 كيلوبايت أقلّ من 650 — لا تحذير بناء، ولا حاجة لأي إجراء.** أي مراجعة سابقة
ادّعت تجاوزاً وتحذيراً كانت تقرأ رقماً غير موجود في هذا المستودع.

### 11.2 `audit:frontend` — أُغلق البند الذي كان يُسقِطه

```
$ npm run audit:frontend
[frontend-audit] WARN: TypeScript strict mode is still disabled in tsconfig.json.
[frontend-audit] Checks passed.
```

خروج بالرمز **0**. `REGISTER_ERROR_DIAGNOSIS.md` ما زال في المستودع، لكن قيمته
النموذجية لم تعد تطابق نمط «سرّ محتمل» — البوابة التي كانت تمنع كل دمج على `main` لم
تعد حمراء (‏`BACKEND-ISSUES.md` B-17 مغلق).

### 11.3 `ng test` — لم يُعَد تشغيله هذه الجلسة

الرقم المحمول من v3 (‏52/54، حالتا `AppComponent` تفشلان بـ `NG0201` لغياب
`provideHttpClient` في `TestBed`) **لم يُعَد التحقّق منه في هذه الجلسة**. لا تزال هذه
الخطوة غائبة عن `frontend-ci.yml` بحسب آخر فحص مسجَّل. أعِد تشغيله عند أول جلسة تلمس
`core/auth` أو `TestBed`.

---

## 12. ما لم يُبنَ بعد (قائمة صادقة، محدَّثة)

| البند | الحالة | الدليل |
|---|---|---|
| **Service Worker / PWA** | ❌ غير مُفعَّل | بلا تغيير عن v3 — `provideServiceWorker` غائب |
| **تغطية الاختبارات تحت `features/`** | ⚠️ لم تُفحَص هذه الجلسة | راجع v3؛ لم يتغيّر شيء يُعرَف بلا إعادة تشغيل `ng test` |
| **`strict: false`** | ⚠️ مفتوح | بلا تغيير |
| **حجم الحزمة** | ✅ **داخل الحدّ الفعلي** | 596.90 kB مقابل حدّ 650 kB — كان يُوصَف خطأً بأنه متجاوِز |
| **واجهة الوكالات** | ❌ غير مبنيّة، والفجوة اتّسعت | الخلفية أضافت تعديلاً وتعطيلاً هذه الدورة بلا أي مقابل هنا — §5.5 |
| **ربط توكن Apple بـ nonce** | ✅ **مبنيّ على الطرفين** | `social-auth.service.ts` يرسله، `AppleTokenVerifier.cs` يتحقّق منه — B-16 مغلق |
| **حدّ إعلانات مرتبط بالخطة المختارة** | ❌ غير مبنيّ | `/plans` حقيقية الآن، لكن لا ربط بحدّ الإعلانات على الخلفية — B-3 |
| **بوابة الدفع** | ❌ غير موجودة | بلا تغيير — لا Stripe/PayTabs/Paymob |
| **CSRF عند الكتابة** | ❌ غير مُرسَل | صار مطلوباً فعلياً بعد ترحيل كوكي التجديد — §4.1 |
| **تخزين توكن التجديد** | ✅ **أُصلح** | كوكي `HttpOnly` — لم يعد `sessionStorage` |
| **«أعِد إرسال رابط التأكيد»** | ✅ **مبنيّة** | مستدعاة من صفحتين — B-15 مغلق |

---

## 13. قواعد ملزمة عند التطوير

1. **`OnPush` + `signal()`** في كل مكوّن جديد. لا استثناء.
2. **`inject()`** لا حقن بالمُنشئ.
3. **`takeUntilDestroyed(this.destroyRef)`** على كل `subscribe`.
4. **كل نص مفتاح i18n** في الملفات الثلاثة معاً.
5. **كل لون `var(--token)`** — لا ألوان حرفية.
6. **`apiToCamelCase()` يبقى في كل خدمة قائمة تستخدمه** — لم يعد ضرورياً لخدمة جديدة
   بعد توحيد الخلفية على camelCase، لكن لا تُزِله من مكان يعمل.
7. **لا `catchError` في الخدمات.**
8. **لا تغلّف نقطة نهاية إدارية في خدمة عميل.**
9. **حارس مسار يعكس قاعدة خلفية يجب أن يوثّق أن الخلفية تبقى مصدر الحقيقة** — انظر
   نمط `ListingEligibilityGuard` (§3.3).
10. **شغّل `audit:frontend` قبل الالتزام.**
11. **لا تَعِد المستخدم بأثر فوري لاختيار خطة** حتى يُربَط `/plans` بحدّ الإعلانات
    فعلياً على الخلفية (‏B-3).

---

## 14. ملفات مرجعية ذات صلة

| الملف | الحالة |
|---|---|
| `docs/PROJECT-STRUCTURE.md` | ✅ محدَّث 2026-08-26 |
| `docs/BACKEND-ISSUES.md` | ✅ v3 — 2026-08-26 |
| `docs/PropertyApi-REFERENCE.md` | ✅ v8 — 2026-08-26 |
| `FRONTEND_BACKEND_CONTRACT.md` | ⚠️ لم يُعَد فحصه هذه الدورة — يحتاج تحديث قسم `/plans` (‏§11) ليعكس أنه صار مُنفَّذاً |
| `REGISTER_ERROR_DIAGNOSIS.md` | ❌ خاطئ تاريخياً (‏SQL Server) — أصبح أيضاً مرجع القيمة النموذجية التي أصلحت B-17 |

---

*كُتب من فحص ثابت مباشر للمصدرين معاً في 2026-08-26 (الواجهة `730af55`، الخلفية
`3cadb4b`)، مسنوداً بتشغيل فعلي لـ `typecheck`/`audit:frontend`/`build:prod` في هذه
الجلسة. `ng test` لم يُعَد تشغيله ومُعلَّم صراحةً حيث ورد. كل بند لم يُتحقَّق منه
بالشيفرة الحالية مُعلَّم صراحةً؛ لا شيء هنا منقول عن نسخة سابقة دون إعادة تحقّق —
والقسم §0 هو أفضل دليل على سبب أهمية هذه القاعدة تحديداً.*
