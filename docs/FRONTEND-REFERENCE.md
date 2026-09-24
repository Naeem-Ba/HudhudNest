# WohnungsApp (Angular) — المرجع المعماري للواجهة

> **الغرض:** مرجع حيّ لكل جلسة تطوير قادمة على الواجهة.
> **آخر تحديث:** 2026-08-27 · النسخة **v5** (نموذج إعلان ديناميكي حسب النوع ×
> نوع العقار · تصحيح موقع `token-storage.service.ts` · **تحذير حرج: تجديد الجلسة
> يفشل الآن على أي نشر حقيقي — انظر §4.1**)
> **مصدر التحقّق:** فحص مباشر لشجرة المصدر في
> `C:\Users\naeem\OneDrive\Desktop\Notiz\WohnungsApp\Wohnungsmieten`
> (الفرع `feat/listing-eligibility-gates`، آخر التزام **`e64daeb`**) **و** لمستودع
> الخلفية في `C:\Users\naeem\Source\Repos\PropertyApi` (الفرع `master`، آخر التزام
> **`a151424`**).
> **تحقّق تنفيذي في هذه الجلسة:** `npm run typecheck` ✅ · `npm run audit:frontend` ✅
> (يمرّ فعلياً — الرمز 0) · `npm run build:prod` ✅ (‏597.55 kB خام، **داخل** ميزانية
> 650 kB الفعلية). **`ng test` لم يُعَد تشغيله هذه الجلسة** — الرقم المحمول من مراجعات
> سابقة (‏52/54) لم يُتحقَّق منه.
> **الحالة:** 🔴 **غير جاهزة للإنتاج بحالتها الحالية مقترنة بالخلفية الحالية** — انظر
> §4.1 و§12، و**`BACKEND-ISSUES.md` B-20** للتفصيل الكامل العابر للمستودعين.

---

## 0. اقرأ هذا قبل الوثوق بأي سطر أدناه

**هذه المراجعة تحمل تصحيحاً وتحذيراً، لا مجرد تحديث.**

**التصحيح:** كل نسخة من هذا الملف حتى v4 وضعت `token-storage.service.ts` تحت
`core/auth/`. **هذا خطأ لم يُصحَّح حتى هذه المراجعة.** الملف يعيش فعلياً في
`core/services/token-storage.service.ts` — تحقَّق منه بالمسار المباشر هذه الجلسة.
`core/auth/` يحتوي `auth.service.ts`، `auth-api.service.ts`، `social-auth.service.ts`،
و`password-policy.ts` فقط. هذا الخطأ الصغير هو بالضبط الدرس الذي يفتتح كل نسخة من هذا
الملف: **افحص المسار الفعلي، لا تنقله عن نسخة سابقة حتى لو بدا تافهاً.**

**التحذير — الأهمّ في تاريخ هذا الملف:** الخلفية فعّلت حماية CSRF فعلياً هذه الدورة
(`CookieCsrf:Enabled=true`). **لا شيء في هذه الواجهة يرسل الرأس المطلوب لتلك
الحماية.** الفحص المباشر لهذه الجلسة: بحث حسّاس لحالة الأحرف عن `csrf|xsrf` عبر كامل
`src/`، خارج ملفات `.spec.ts`، يعطي **صفر نتائج**. النتيجة العملية: **`POST
/auth/refresh` يفشل بـ `403 CSRF_VALIDATION_FAILED` لكل مستخدم حقيقي بعد ~30 دقيقة من
تسجيل الدخول، ويُسجَّل خروجه قسراً.** هذا ليس نظرياً — هو مسار الشيفرة الفعلي في
`refresh-auth.interceptor.ts` و`app.config.ts` كليهما، مقترناً بوسيط الخلفية الفعلي.
التفصيل الكامل بثلاث طبقات دليل مستقلة في §4.1 وفي `BACKEND-ISSUES.md` **B-20**.

| البند | v4 قالت | v5 مُتحقَّق |
|---|---|---|
| مسار `token-storage.service.ts` | `core/auth/` | **`core/services/`** — تصحيح مسار، لا تغيير سلوك |
| CSRF عند الكتابة | «صار مطلوباً فعلياً بعد ترحيل كوكي التجديد» (‏نظري، بانتظار تفعيل الخلفية) | **الخلفية فعّلته فعلاً (`CookieCsrf:Enabled=true`) والواجهة لا تزال لا ترسل شيئاً — النتيجة فشل حقيقي لتجديد الجلسة، لا مجرّد سطح نظري** |
| نموذج الإعلان | ثابت الحقول حسب `ListingType` فقط | **ديناميكي حسب `ListingType × PropertyType`** — حقول إيجار/بيع/أرض جديدة (‏§5.9) |
| تبعية `@angular/service-worker` | غير مذكورة | **موجودة في `package.json` (`^20.3.25`) لكن `provideServiceWorker` لا يزال غائباً من `app.config.ts` — PWA لا تزال غير مفعَّلة فعلياً** |
| ميزانية الحزمة | 596.90 kB خام | **597.55 kB خام / 159.44 kB منقول** — لا يزال داخل حدّ 650 kB، زيادة طفيفة من حقول النموذج الجديدة |

**قاعدة ملزمة، لم تتغيّر:** كل جدول هنا يحمل ملاحظة مصدر. أعِد التحقق من الشيفرة قبل
استخدام هذا الملف في التخطيط.

---

## 1. هوية الواجهة

| الخاصية | القيمة |
|---|---|
| الإطار | Angular **20.3.26** (‏مُحلّلة فعلياً من `node_modules`؛ `package.json` يُثبِّت `^20.2.0`) — Standalone فقط، لا NgModules |
| اللغة | TypeScript **5.9.2** · `strict: false` ⚠️ — `npm run typecheck` **يمرّ** ✅ (مُتحقَّق هذه الجلسة) |
| التوجيه | `provideRouter(routes, withHashLocation())` — مسارات hash (`/#/pricing`) |
| كشف التغيير | `ChangeDetectionStrategy.OnPush` + `signal()` — إلزامي في كل مكوّن جديد |
| الحقن | `inject()` دالةً، لا حقن بالمُنشئ في الكود الجديد |
| التنسيق | نظامان معاً: SCSS خام + متغيرات CSS (معظم الصفحات) و**Tailwind v4** (`checkout`) |
| الخطوط | Roboto · IBM Plex Sans Arabic · Cairo (من Google Fonts في `index.html`) |
| التعريب | `@ngx-translate/core` 17 — ثلاث لغات، الافتراضية `ar` |
| الخرائط | Leaflet 1.9 |
| الزمن الحقيقي | `@microsoft/signalr` 10 |
| المحمول | Capacitor 8 — Android + iOS. `@angular/service-worker` **^20.3.25** تبعية موجودة، **غير مُفعَّلة** (‏§12) |
| المصادقة | Bearer في الذاكرة + كوكي `refresh_token` (‏`HttpOnly`) — **لكن تجديدها يفشل الآن فعلياً، §4.1** |
| الاختبار | Karma + Jasmine — 7 ملفات spec (‏52/54 محمول من مراجعات سابقة، **لم يُعَد تشغيله هذه الجلسة**) |

---

## 2. البنية الفعلية (مُحصاة من الشجرة، هذه الجلسة)

```
src/
├── app/
│   ├── core/                     الطبقة الأساسية — لا مكوّنات مرئية
│   │   ├── adapters/             api-naming.adapter.ts  (apiToCamelCase)
│   │   ├── api/                  19 خدمة API
│   │   ├── auth/                 auth.service.ts · auth-api.service.ts ·
│   │   │                         social-auth.service.ts · password-policy.ts
│   │   │                         (لا token-storage.service.ts — انظر §0)
│   │   ├── guards/                AuthGuard · AdminGuard · ListingEligibilityGuard
│   │   ├── interceptors/         3 اعتراضات
│   │   ├── models/               15 نموذجاً
│   │   └── services/              11 خدمة عرضية، منها token-storage.service.ts
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

### 3.1 خدمات الـ API (19) — بلا تغيير في العدد هذه الدورة

`admin-users` · `analytics` · `api-error` · `backend-api` · `contact` ·
`favorites-api` · `listing-fees-api` · `location-suggestions-api` · `lookups-api` ·
`messages-api` · `notifications-api` · `otp-api` · `plans-api` · `profile` ·
`property-api` · `review` · `saved-search-api` · `user-profile-api` · `visit`

**النمط الموحّد:** `@Injectable({ providedIn: 'root' })` + حقل `endpoint` ثابت +
الاعتماد على `BackendApiService`. **لا `catchError` داخل الخدمة.**

### 3.2 الاعتراضات (3)

| الملف | الدور |
|---|---|
| `refresh-auth.interceptor.ts` | إرفاق `Bearer` + تجديد التوكن تلقائياً عند 401 — **يبني `HttpClient` خاماً على `HttpBackend` مباشرة، متجاوزاً كل المُعترِضات الأخرى عمداً (‏بما فيها أي معترِض CSRF)، انظر §4.1** |
| `auth-interceptor.ts` | مجرد إعادة تصدير لـ `RefreshAuthInterceptor` |
| `api-error.interceptor.ts` | تحويل أخطاء HTTP إلى رسائل قابلة للعرض |

### 3.3 الحرّاس (3)

- `AuthGuard` — على معظم المسارات المحمية.
- `AdminGuard` — على 4 مسارات إدارية، يوجّه عند الرفض إلى `/not-authorized`.
- `ListingEligibilityGuard` — على `property-form` **للإنشاء فقط**، وليس على
  `properties/edit/:id`. يجلب الملف الشخصي طازجاً ويوجّه إلى `/pricing` أو `/profile`
  حسب البوابة الناقصة. **تعليق الملف نفسه يقرّ أن الخلفية تبقى مصدر الحقيقة الفعلي.**

### 3.4 الخدمات العرضية (11) — `core/services/`، بما فيها `token-storage.service.ts`

`enum` · `language` · `lead` · `meta` · `native-back-button` · `overlay-back-handler` ·
`password-validator` · `signalr-notification` · `theme` · **`token-storage`** · `url`

**`enum.service.ts`:** 10 مجموعات تُحمَّل مسبقاً عند الإقلاع (تشمل `OWNERSHIPTYPE`، `AREAUNIT`،
`FURNISHINGSTATUS`، `RENTALDURATIONTYPE`). فشل الجلب **لا يُخزَّن** كقائمة فارغة (كان يجعل
فشلاً عابراً دائماً حتى إعادة تحميل الصفحة)؛ بدلاً من ذلك تُعيد `ensureLoaded(groups)` جلب
المجموعات الناقصة فقط (مع منع الطلبات المتزامنة المكرَّرة). `PropertyFormPage` تستدعيها في
`ngOnInit`، وتعرض القوائم كـ signals، وتُظهر تلميح `PROPERTY_FORM.OPTIONS_LOAD_FAILED` إن بقيت
فارغة؛ وضع التعديل ينتظرها قبل تعيين `ownershipType`/`furnishingStatus` كي لا يُمحى الحقل عند الحفظ.

### 3.5 النماذج (15)

`analytics` · `api` · `auth` · `favorite` · `lead` · `listing-fee` ·
`location-suggestion` · `message` · `notification` · `property` (‏حقول جديدة، §5.9) ·
`review` · `saved-search` · `subscription-plan` · `user-profile` · `visit`

---

## 4. المصادقة وتخزين التوكن

مقروء من `core/services/token-storage.service.ts` مباشرة (‏المسار الصحيح — §0):

| العنصر | أين يُخزَّن | التقييم |
|---|---|---|
| **Access token** | حقل خاص في الذاكرة — لا يلمس التخزين إطلاقاً | ✅ صحيح |
| **Refresh token** | كوكي `refresh_token` — `HttpOnly` + `Secure` + `SameSite=None`، يديره المتصفّح والخلفية حصراً | ✅ JavaScript لا يستطيع قراءته |
| `TokenStorageService.clear()` | يمسح مفاتيح `sessionStorage`/`localStorage` القديمة دفاعياً فقط | تنظيف احتياطي — لا شيء يكتب هذه المفاتيح بعد الآن |

**استعادة الجلسة:** `restoreSession()` في `app.config.ts` يستدعي `POST /auth/refresh`
عند الإقلاع عبر `HttpClient` خام على `HttpBackend` (‏السطر 40: `new
HttpClient(httpBackend)`) — **نفس نمط التجاوز الموصوف في §4.1، ونفس نقطة الفشل.**

### 4.1 🔴 حرج — تجديد الجلسة يفشل الآن فعلياً؛ CSRF مفعَّلة في الخلفية والواجهة صامتة

**هذا القسم يحلّ محلّ كل ما كتبته v4 عن CSRF كـ«اعتبار مفتوح».** الخلفية لم تعد
تعتبره مفتوحاً — فعّلته (`CookieCsrf:Enabled=true` في `appsettings.json` الأساسي، لا
ملف تطوير). المشكلة الآن وظيفية، لا نظرية.

**الدليل — ثلاث طبقات مستقلة، كل واحدة كافية وحدها:**

1. **لا استدعاء لنقطة الحصول على التوكن.** بحث حسّاس لحالة الأحرف عن `csrf|xsrf` عبر
   كامل `src/`، خارج `.spec.ts`: **صفر نتائج.** لا استدعاء لـ
   `GET /api/security/csrf-token` في أي مكان.
2. **حتى لو استُدعيت، الكوكي الناتجة غير قابلة للقراءة من أصل هذه الواجهة.** الخلفية
   تكتب كوكي `XSRF-TOKEN` بلا `Domain` صريحة — تُقيَّد افتراضياً بأصل الخلفية وحده.
   `app.config.ts` لا يستخدم `withXsrfConfiguration` من Angular، وحتى لو استُخدم فآلية
   Angular تقرأ `document.cookie` من صفحة الواجهة نفسها — أصل مختلف عن أصل الخلفية
   (‏`Cors:AllowedOrigins` في الخلفية يُثبت هذا: `https://localhost:4200` حتى محلياً).
3. **حتى لو قُرئت، مسارا التجديد الفعليَّين يتجاوزان كل مُعترِض عمداً.**
   `requestNewAccessToken()` (`refresh-auth.interceptor.ts:81`) و`restoreSession()`
   (`app.config.ts:40`) يبنيان `new HttpClient(httpBackend)` مباشرة — تعليق الشيفرة نفسه
   يقرّ: *"bypasses every interceptor on purpose"* (‏لتفادي حلقة تجديد لا نهائية). أي
   معترِض CSRF، مُفعَّلاً كان أم لا، **لن يُستدعى على هذين المسارين بالذات.**

**الأثر العملي — سيناريو حرفي، لا افتراضي:**

```
تسجيل دخول ناجح → توكن وصول صالح 30 دقيقة (Jwt:AccessTokenMinutes)
      ↓ (بعد 30 دقيقة)
أي طلب API → 401 → RefreshAuthInterceptor يعترض
      ↓
requestNewAccessToken() → POST /auth/refresh (بلا X-XSRF-TOKEN)
      ↓
الخلفية: كوكي refresh_token حاضرة → CookieCsrfProtectionMiddleware يفرض التحقق
      ↓
403 CSRF_VALIDATION_FAILED
      ↓
catchError → clearAndRedirect() → tokenStorage.clear() + توجيه لـ /auth/login
```

**كل مستخدم، بلا استثناء، يُسجَّل خروجه قسراً كل ~30 دقيقة على أي نشر حالي لكلا
المستودعين معاً.** هذا ليس ثغرة تُستغَلّ — الحماية تعمل تماماً كما صُمِّمت، ضد الجميع
بلا تمييز.

**الإصلاح المطلوب في هذه الواجهة تحديداً (‏لا يكفي تفعيل خيار Angular العام
وحده):**

1. استدعِ `GET /api/security/csrf-token` مرّة عند الإقلاع (‏أو قبل أوّل طلب كتابة).
2. أضِف رأس `X-XSRF-TOKEN` **يدوياً** في كل من `requestNewAccessToken()` و
   `restoreSession()` تحديداً — لأن كلاهما يتجاوز سلسلة المُعترِضات بتصميم مقصود، فآلية
   Angular التلقائية (‏`withXsrfConfiguration`) لن تصل إلى هذين المسارين مهما فُعِّلت.
3. تأكَّد أن الكوكي `XSRF-TOKEN` قابلة للقراءة فعلياً من أصل هذه الواجهة قبل الاعتماد
   على أي آلية تلقائية للمسارات الأخرى.

**بديل فوري إن تعذَّر الإصلاح الكامل الآن:** اطلب من فريق الخلفية إعادة
`CookieCsrf:Enabled` إلى `false` مؤقّتاً — إبقاؤه مفعَّلاً بلا عميل يرسل التوكن يُعطِّل
كل الجلسات بلا أي فائدة أمنية مُحقَّقة اليوم.

**التفصيل الكامل، درجة الثقة، وسجلّ الاختبار الذي يُثبت شكل الفشل بالضبط:**
`BACKEND-ISSUES.md` **B-20**.

---

## 5. عقد الاتصال مع الخلفية

### 5.1 قاعدة التسمية — بلا تغيير هذه الدورة

الخلفية ترسل camelCase عالمياً (`Program.cs`: `PropertyNamingPolicy =
JsonNamingPolicy.CamelCase`). `apiToCamelCase()` يبقى في مكانه في الخدمات القائمة —
غير ضروري لخدمة جديدة، لكن لا داعي لحذفه من مكان يعمل.

### 5.2 خريطة نقاط النهاية (واجهة ← خلفية) — محدَّثة، الوكالات تغيّرت جوهرياً

| مسار الواجهة | Controller في الخلفية | موجود؟ |
|---|---|---|
| `/properties`, `/properties/{id}`, `/properties/mine`, `/properties/geo-search`, `/properties/{id}/publish`, `/properties/{id}/manage` | `PropertiesController` | ✅ |
| `/properties/{id}/extension`, `/properties/{id}/featured` | `PropertiesController` | ✅ |
| `/properties/{id}/images/...` | `PropertyImagesController` | ✅ |
| `/auth/phone/registration/*`, `/auth/phone/login`, `/auth/phone/password-reset/*` | `PhonePasswordAuthController` | ✅ |
| `/users/me`, `/users/me/avatar`, `/users/me/change-password`, `/users/me/plan` | `UsersController` | ✅ |
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
| `/plans` | `PlansController` | ✅ — يُصدِّر `listingLimit` الآن أيضاً (‏§5.4) |
| `/agencies/{slug}`, `/agencies/me`, `/agencies` (‏POST) | `AgenciesController` | ✅ |
| — (لا نظير في الواجهة) | `PUT/DELETE /agencies/{agencyId}` (‏تعديل/تعطيل) | ❌ |
| — (لا نظير في الواجهة) | **`POST .../transfer-ownership`, `POST .../logo`** (‏نقل الملكية ورفع الشعار — جديدان تماماً هذه الدورة) | ❌ |
| — (لا نظير في الواجهة) | **`POST .../invitations`, `GET .../invitations/mine`, `POST .../invitations/{id}/accept\|decline`** (‏نظام الدعوات الجديد الذي حلّ محلّ الإضافة المباشرة) | ❌ |
| — (‏كانت موجودة، حُذفت من الخلفية) | ~~`POST /agencies/{agencyId}/members`~~ | ❌ **الخلفية حذفتها هذه الدورة** — أي كود واجهة كان يستهدفها (‏لم يُعثَر على أي استخدام فعلي) صار يستهدف نقطة غير موجودة |

**⚠️ فجوة الوكالات اتّسعت جوهرياً هذه الدورة، لا مجرد استمرت.** الخلفية أضافت دورة
حياة مكتب كاملة (‏نقل ملكية، شعار، دعوات بموافقة) بلا أي مقابل في الواجهة إطلاقاً — لا
خدمة، لا نموذج، لا مسار، لا مفتاح ترجمة. اقرأ `PropertyApi-REFERENCE.md §7.5` قبل
تصميم أي شاشة وكالات.

### 5.3 `/plans` — يقود حصّة الإعلانات فعلياً الآن، لا مجرد تسجيل

`PlansApiService.getPlans()` يستدعي `GET /api/plans`. `selectPlan(tier)` تستدعي
`POST /api/users/me/plan`. **تغيّر جوهري هذه الدورة على الخلفية:** حصّة الإعلانات
**تُقرَأ الآن فعلياً** من `Plan.ListingLimit` عبر `UserAccount.PlanId` — الفجوة التي
وثّقتها v4 («اختيار خطة مدفوعة لا يغيّر أي حدّ فعلي») **أُغلقت من طرف الخلفية**.
الواجهة لا تحتاج تغييراً لتستفيد من هذا — الاستجابة نفسها (`/plans`) تحمل الآن
`listingLimit` أيضاً، فيمكن عرضه في `/pricing` دون طلب إضافي.

### 5.4 رسوم الإعلانات — بلا تغيير هذه الدورة

تمديد إعلان (‏$1.00، 90 يوماً) وتمييز (‏$5.00، 30 يوماً)، كلاهما `202 Accepted` يُسجِّل
ولا يمنح، ويُؤكَّد إدارياً. `checkout.page.ts` تعكس هذا حرفياً.

### 5.5 الوكالات — انظر §5.2، الفجوة الأكبر في هذا الملف الآن بعد B-20

### 5.6 CSRF — انظر §4.1، لم يعد قسماً فرعياً بل القضية المركزية لهذه المراجعة

### 5.7 قواعد كلمة المرور — بلا تغيير هذه الدورة

`core/auth/password-policy.ts` ما زال يكرّر يدوياً قواعد `PasswordSecurityService.cs`.
الدَّين نفسه قائم.

### 5.8 تأكيد البريد — بلا تغيير هذه الدورة، مكتمل

رسالة «أُرسل رابط تأكيد»، صفحة `/auth/verify-email`، وصول الرابط بـ`#`، «أعِد
الإرسال» — الأربعة مبنيّة ومُتّصلة.

### 5.9 🆕 نموذج الإعلان الديناميكي — `ListingType × PropertyType` (‏سوق سوري)

الالتزام الأحدث (`e64daeb`) يُكيِّف `property-form` حسب تركيبة النوع (‏إيجار/بيع) ×
نوع العقار (‏شقة/أرض/...):

- **قسم «تفاصيل الإيجار»** (‏للإيجار فقط): مدّة مسبقة (‏ستة أشهر/سنة/مخصَّص) تملأ
  تاريخ الانتهاء بحساب تاريخ آمن UTC؛ «مخصَّص» يترك الحقل قابلاً للتعديل.
- **قائمة «الوضع القانوني»** (‏للبيع)، من مجموعة Enum خلفية `OwnershipType` (‏لقب لِـ
  `LegalStatusType`، شاملة قيمة `AssociationTransfer` الجديدة).
- **فئة «أرض»** (‏من حقل `category` في كتالوج أنواع العقار المخزَّن مؤقّتاً، عبر
  إشارة `selectedCategory`): تُخفي الغرف/الطابق/التدفئة/المزايا/حالة الفرش، وتُظهر
  قائمة «وحدة المساحة» (`AreaUnit`: متر مربع/قصبة/دونم/هكتار)؛ فاحص «المساحة > 10»
  يُطبَّق على متر مربع فقط الآن.
- محقِّق عابر للحقول أُضيف: `ownershipTypeRequired`، `rentalStartDateRequired`،
  `rentalEndDateRequired`، `rentalDurationRequired`، `rentalEndBeforeStart`،
  `areaRequiredForLand`.
- حقل «الرمز البريدي» أُزيل من القالب (‏بقي في النموذج، يُرسَل `null`) — مرحلة سوريا
  فقط، يطابق نمط إخفاء المدينة/المنطقة الموجود مسبقاً.
- ~30 مفتاح ترجمة جديد `PROPERTY_FORM.*` في الملفات الثلاثة، بلا نصوص حرفية.

**✅ التبعية الخلفية مُغلقة (2026-09-20):** مجموعات `OwnershipType`/`AreaUnit`/`FurnishingStatus`
موجودة الآن في `EnumController` على `master` الخلفية (الالتزام `405e23e`) — تحقّق فعلي:
`GET /api/enums/OwnershipType` و`/FurnishingStatus` تُرجعان 200 محلياً وعلى النشر. القوائم كانت
تبقى فارغة طوال الجلسة عند فشل جلب الـ Enums مرة واحدة عند الإقلاع (انظر §3.4)؛ أُصلح ذلك.

---

### 5.10 🆕 دليل تصوير العقار — طبقة UX فوق رفع الصور

- **الهدف:** مساعدة المستخدم على التقاط صور أفضل دون تعقيد النشر. طبقة عرض فقط: لا تلمس
  نموذج البيانات ولا التحقق من الصور ولا نداءات الـ API ولا قواعد العمل.
- **المكان:** رابط خفيف «📷 كيف ألتقط صورًا احترافية؟» (`PHOTO_GUIDE.OPEN`) في قسم «صور العقار»
  في `property-form` (إضافة وتعديل، بيع وإيجار) وفي قسم الصور في `short-stay-listing-form`
  (إنشاء وتعديل). لا يشغل مساحة دائمة.
- **المكوّن:** `shared/ui/photo-guide/photo-guide-sheet.component` (لا يوجد Dialog/Sheet عام آخر
  في المشروع؛ `confirm-modal` نافذة تأكيد بزرّين ولا تناسب). Bottom Sheet على الهاتف وحوار
  مركزي من 640px، Esc/النقر على الخلفية/زر × للإغلاق، أسهم لوحة المفاتيح تتبع اتجاه القراءة،
  حبس التركيز وإعادته لزر الفتح، و`ScrollLockService` الموجود لقفل التمرير.
- **التجربة:** «دليل سريع — 30 ثانية» ← لقطات مرقّمة (١…٦/٧) ← شاشة أخيرة «جاهز؟ لنأخذ أفضل
  صورة أولًا» بنصائح عامة و«ابدأ بإضافة الصور». الزر يُصدر `start` فيفتح المضيف *منتقي الملفات
  نفسه* (`input.click()`) — لا مسار رفع جديد.
- **حسب نوع الإعلان** (`photo-guide.data.ts`): بيع = واجهة، معيشة، نوم، مطبخ، حمّام، شرفة،
  فناء/سطح · إيجار = معيشة، نوم، مطبخ، حمّام، شرفة، واجهة · إقامة قصيرة = نوم، مطبخ، حمّام،
  معيشة، شرفة، مدخل. لكل نوع سطر تمهيدي ونصيحة خاصة. نوع الإعلان في النموذج: 1 إيجار، 2 بيع.
- **الصور:** ثمانية ملفات SVG منفصلة في `public/images/photo-guide/` (لا Infographic واحد)، بطابع
  سوري: أقواس، حجر أبلق، صالون عربي، بلاط مزخرف، فناء بنافورة وليمون. شبكة الأثلاث تُرسم
  بـ CSS فوق الصورة. **هذه رسوم توضيحية وليست صوراً فوتوغرافية** — لاستبدالها بصور حقيقية
  غيّر المسارات في `PHOTO_GUIDE_IMAGES` فقط.
- **الترجمة:** `PHOTO_GUIDE.*` في ar/en/de (لكل لقطة `TITLE/WHAT/WHY/HOW`)، بلا نصوص حرفية في
  القوالب؛ RTL عبر خصائص منطقية وسهم يُعكس بـ `:host-context([dir='rtl'])`.
- **اختبارات:** `photo-guide-sheet.component.spec.ts` (9): الفتح/الإغلاق وقفل التمرير وتحريره
  عند التدمير، Esc/الخلفية/×، التنقل والأسهم في RTL/LTR، اختلاف اللقطات حسب النوع.

---

## 6. SignalR — بلا تغيير هذه الدورة

`signalr-notification.service.ts` يتصل بـ `environment.signalRUrl`؛
`accessTokenFactory` يقرأ التوكن الحالي عند كل استدعاء؛ الحدث `ReceiveNotification`؛
الخلفية تستخدم Redis backplane.

---

## 7. التعريب والاتجاه — بلا تغيير هذه الدورة

| البند | القيمة |
|---|---|
| الملفات | `public/i18n/ar.json` · `en.json` · `de.json` |
| الافتراضية والاحتياطية | `ar` |
| التخزين | `localStorage` تحت `lang` |
| الاتجاه | `LanguageService` يضبط `document.documentElement.dir` |

**قاعدة ملزمة:** لا نصوص مكتوبة يدوياً في القوالب أو الشيفرة — كل نص مفتاح ترجمة.

---

## 8. نظام التصميم — بلا تغيير هذه الدورة

راجع v3 للتفاصيل الكاملة (‏الرموز، الوضع الداكن، نقاط الانكسار، فخّ الشبكة، Tailwind
v4، الخطوط) — لم يتغيّر شيء منها هذه الدورة.

---

## 9. المسارات — بلا تغيير بنيوي، مُعاد فحصها من `app.routes.ts` مباشرة

المجموعات: عامة، محمية بـ`AuthGuard`، إدارية بـ`AdminGuard` (‏4 مسارات:
`admin/messages`, `admin/messages/:id`, `admin/users`, `admin/location-suggestions`)،
مصادقة (‏login, register, forgot-password, reset-password, verify-email,
phone-register, phone-password-reset, phone-reverify, phone-change)، `property-form`
محمي بـ`[AuthGuard, ListingEligibilityGuard]` معاً (‏الإنشاء فقط)، بينما
`properties/edit/:id` على `AuthGuard` وحده.

**تحذير غير متغيّر:** `{ path: '**', redirectTo: 'home' }` يبتلع أي مسار غير مسجَّل
بصمت.

---

## 10. المحمول (Capacitor 8) — بلا تغيير هذه الدورة

راجع v3 للتفاصيل. لا تغيير في `capacitor.config.ts` أو الأدوات المرتبطة.

---

## 11. الأوامر والبوابات — مُعاد تشغيلها فعلياً هذه الجلسة

```bash
npm run typecheck        # ✅ يمرّ
npm run audit:frontend   # ✅ يمرّ — الرمز 0
npm run typecheck:strict # ✅ يمرّ (مفروض في CI منذ 2026-09-24)
npm run check:i18n       # ✅ مفاتيح الترجمة المستعملة كلها موجودة وar/en/de متطابقة
npm run build:prod       # ✅ 579.62 kB خام / 156.31 kB منقول (2026-09-24)
npm run postmerge:verify # check:env + audit + typecheck + build:prod
```

### 11.1 ميزانية الحزمة — لا تحذير، زيادة طفيفة متوقَّعة

**الحدّ الفعلي في `angular.json` (منذ 2026-09-24): `maximumWarning: 600kB`, `maximumError: 700kB`.** آخر قياس 2026-09-24: **579.62 kB خام / 156.31 kB منقول** (SignalR يُحمَّل كسولًا).

_القياس التاريخي أدناه محفوظ للسياق:_
القياس الفعلي هذه الجلسة:

```
Initial total | 597.55 kB | 159.44 kB (منقول)
```

زيادة ~0.65 kB عن آخر قياس (‏596.90 kB)، متوقَّعة من حقول نموذج الإعلان الجديدة
(‏§5.9). **لا تزال داخل الحدّ بمسافة كبيرة — لا حاجة لأي إجراء.**

### 11.2 `audit:frontend` — يمرّ

```
$ npm run audit:frontend
[frontend-audit] WARN: TypeScript strict mode is still disabled in tsconfig.json.
[frontend-audit] Checks passed.
```

خروج بالرمز **0**.

### 11.3 `ng test` — لم يُعَد تشغيله هذه الجلسة

الرقم المحمول من مراجعات سابقة (‏52/54) **لم يُتحقَّق منه هنا**. أعِد تشغيله عند أول
جلسة تلمس `core/auth`، `core/services/token-storage`، أو `TestBed` — وبعد أي إصلاح
لـ B-20، لأن ذلك الإصلاح يلمس مساري تجديد الجلسة مباشرة.

---

## 12. ما لم يُبنَ بعد أو ما زال مكسوراً (قائمة صادقة، محدَّثة)

| البند | الحالة | الدليل |
|---|---|---|
| **🔴 تجديد الجلسة عبر CSRF** | ❌ **مكسور فعلياً** | §4.1 — يفشل لكل مستخدم كل ~30 دقيقة على أي نشر حالي |
| **Service Worker / PWA** | ❌ غير مُفعَّل رغم وجود التبعية | `@angular/service-worker` في `package.json`، `provideServiceWorker` غائب من `app.config.ts` |
| **تغطية الاختبارات تحت `features/`** | ⚠️ لم تُفحَص هذه الجلسة | `ng test` لم يُعَد تشغيله |
| **`strict: false`** | 🟡 جزئيًا | `tsconfig.json` ما زال `strict: false`، لكن `typecheck:strict` يمرّ بلا أخطاء ومفروض في CI منذ 2026-09-24 |
| **حجم الحزمة** | ✅ داخل الحدّ الفعلي | 597.55 kB مقابل حدّ 650 kB |
| **واجهة الوكالات** | ❌ غير مبنيّة، والفجوة اتّسعت أكثر | نقل ملكية + شعار + دعوات — كلّها جديدة في الخلفية بلا أي مقابل هنا |
| **حدّ إعلانات مرتبط بالخطة المختارة** | ✅ **الخلفية أنجزته** | الواجهة لا تحتاج تغييراً لتستفيد — `/plans` تُصدِّر `listingLimit` الآن |
| **بوابة الدفع** | ❌ غير موجودة | بلا تغيير |
| **نموذج الإعلان الديناميكي** | ⚠️ **مبنيّ في الواجهة، غير مكتمل في الخلفية** | حقلا الوضع القانوني ووحدة المساحة بلا خيارات على `master` — §5.9 |

---

## 13. قواعد ملزمة عند التطوير

1. **`OnPush` + `signal()`** في كل مكوّن جديد. لا استثناء.
2. **`inject()`** لا حقن بالمُنشئ.
3. **`takeUntilDestroyed(this.destroyRef)`** على كل `subscribe`.
4. **كل نص مفتاح i18n** في الملفات الثلاثة معاً.
5. **كل لون `var(--token)`** — لا ألوان حرفية.
6. **`apiToCamelCase()` يبقى في كل خدمة قائمة تستخدمه.**
7. **لا `catchError` في الخدمات.**
8. **لا تغلّف نقطة نهاية إدارية في خدمة عميل.**
9. **حارس مسار يعكس قاعدة خلفية يجب أن يوثّق أن الخلفية تبقى مصدر الحقيقة.**
10. **شغّل `audit:frontend` قبل الالتزام.**
11. **أي طلب يبني `HttpClient` خاماً على `HttpBackend` (‏لتجاوز المُعترِضات) يجب أن
    يُرفَق يدوياً بأي رأس أمني تفرضه الخلفية على مساره — لا تعتمد على مُعترِض عام
    ليصل إليه، فهو لن يصل** (‏الدرس المباشر من B-20).
12. **لا تفعِّل ميزة خلفية جديدة في الواجهة قبل التأكد أنها موجودة على `master`
    فعلياً، لا على فرع منفصل** (‏الدرس المباشر من §5.9).

---

## 14. ملفات مرجعية ذات صلة

| الملف | الحالة |
|---|---|
| `docs/PROJECT-STRUCTURE.md` | ✅ محدَّث 2026-08-27 |
| `docs/BACKEND-ISSUES.md` | ✅ v4 — 2026-08-27 — بند واحد مفتوح (`B-20`)، حرج |
| `docs/PropertyApi-REFERENCE.md` | ✅ v9 — 2026-08-27 |
| `FRONTEND_BACKEND_CONTRACT.md` | ⚠️ لم يُعَد فحصه هذه الدورة — يحتاج تحديث لقسم `/plans`، نظام الدعوات، ونموذج الإعلان الديناميكي |
| `REGISTER_ERROR_DIAGNOSIS.md` | ❌ خاطئ تاريخياً (‏SQL Server) |

---

*كُتب من فحص ثابت مباشر للمصدرين معاً في 2026-08-27 (الواجهة `e64daeb`، الخلفية
`a151424`)، مسنوداً بتشغيل فعلي لـ `typecheck`/`audit:frontend`/`build:prod` في هذه
الجلسة. `ng test` لم يُعَد تشغيله ومُعلَّم صراحةً حيث ورد. بند §4.1 (‏B-20) اكتُشف
بقراءة شيفرة عبر مستودعين معاً — الخلفية والواجهة — لا بتشغيل حيّ؛ درجة ثقته البنيوية
عالية، وأثره التشغيلي الحقيقي على مستخدمين فعليين يحتاج تأكيداً ميدانياً غير متاح هذه
الجلسة. لا شيء هنا منقول عن نسخة سابقة دون إعادة تحقّق.*
