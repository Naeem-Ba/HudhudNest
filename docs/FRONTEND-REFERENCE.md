# WohnungsApp (Angular) — المرجع المعماري للواجهة

> **الغرض:** مرجع حيّ لكل جلسة تطوير قادمة على الواجهة.
> **آخر تحديث:** 2026-08-24 · النسخة **v2.1** (شارة الإعلان المميّز — إغلاق B-1)
> **مصدر التحقّق:** فحص مباشر لشجرة المصدر في
> `C:\Users\naeem\OneDrive\Desktop\Notiz\WohnungsApp\Wohnungsmieten`
> (الفرع `feature/add-ios-platform`، آخر التزام **`c84052a`**) **و** لمستودع الخلفية في
> `C:\Users\naeem\Source\Repos\PropertyApi` (آخر التزام **`61bd779`**).
> **الحالة:** ⚠️ صالح للإنتاج بشروط — انظر §12 و§13.

---

## 0. اقرأ هذا قبل الوثوق بأي سطر أدناه

هذا الملف كُتب لأن الوثائق السابقة انحرفت عن الشيفرة، وهو يُعاد التحقق منه كاملاً في كل
تحديث بدل نقل بنوده.

**ما تغيّر في v2 (خلال يوم واحد من v1.1):**

| البند | v1.1 قالت | v2 مُتحقَّق |
|---|---|---|
| Tailwind | «لا Tailwind، لا مكتبة UI» | ❌ **صارت خاطئة** — Tailwind v4 يعمل **بجانب** SCSS منذ `c84052a` (§8.5) |
| الخطوط | Cairo وحدها | Roboto ← IBM Plex Sans Arabic ← Cairo، والترتيب آلية لا تفضيل (§8.6) |
| المسارات | 43 | **44** — أُضيف `checkout/:kind/:propertyId` |
| مفاتيح i18n | 942 | **976** لكل ملف من الثلاثة (تطابق تام) |
| خدمات API | 18 | **19** — أُضيفت `listing-fees-api` |
| الميزات | 19 | **20** — أُضيفت `checkout` |
| رسوم الإعلانات | غير موجودة في الواجهة | **مبنيّة كاملة** — شاشة مراجعة + تسجيل رسم معلّق (§5.4) |
| الوكالات (Agencies) | غير موجودة في الدومين | موجودة **في الخلفية فقط**؛ الواجهة لا تستهلكها إطلاقاً (§5.5) |

**قاعدة ملزمة:** كل جدول هنا يحمل ملاحظة مصدر. إن مرّت دورة نشر واحدة، أعِد التحقق من
الشيفرة قبل استخدام هذا الملف في التخطيط. الدرس تكرّر مرتين خلال ثلاثة أيام: سطر
«لا Tailwind» صار خاطئاً بعد أقلّ من 24 ساعة من كتابته.

---

## 1. هوية الواجهة

| الخاصية | القيمة |
|---|---|
| الإطار | Angular **20.2** — Standalone فقط، لا NgModules |
| اللغة | TypeScript 5.9 · `strict: false` ⚠️ (انظر §12) — `npm run typecheck` **يمرّ** ✅ |
| التوجيه | `provideRouter(routes, withHashLocation())` — **مسارات hash** (`/#/pricing`) |
| كشف التغيير | `ChangeDetectionStrategy.OnPush` + `signal()` — إلزامي في كل مكوّن جديد |
| الحقن | `inject()` دالةً، لا حقن بالمُنشئ في الكود الجديد |
| التنسيق | **نظامان معاً:** SCSS خام + متغيرات CSS (كل الصفحات القديمة) **و** Tailwind v4 (الصفحات الجديدة) — §8.5 |
| الخطوط | Roboto · IBM Plex Sans Arabic · Cairo (من Google Fonts في `index.html`) — §8.6 |
| التعريب | `@ngx-translate/core` 17 — ثلاث لغات، الافتراضية `ar` |
| الخرائط | Leaflet 1.9 |
| الزمن الحقيقي | `@microsoft/signalr` 10 |
| المحمول | Capacitor 8 — Android + iOS |
| الاختبار | Karma + Jasmine — **6 ملفات spec فقط** ⚠️ |
| نمط التنسيق | Prettier: `printWidth: 100`, `singleQuote: true` |

---

## 2. البنية الفعلية (مُحصاة من الشجرة)

```
src/
├── app/
│   ├── core/                     الطبقة الأساسية — لا مكوّنات مرئية
│   │   ├── adapters/             api-naming.adapter.ts  (apiToCamelCase)
│   │   ├── api/                  19 خدمة API
│   │   ├── auth/                 auth.service.ts (+ spec)
│   │   ├── guards/               auth-guard.ts · admin-guard.ts
│   │   ├── interceptors/         3 اعتراضات
│   │   ├── models/               15 نموذجاً
│   │   └── services/             11 خدمة عرضية
│   ├── features/                 20 ميزة (lazy-loaded بالكامل)
│   ├── admin/                    4 شاشات إدارية
│   ├── shared/
│   │   ├── ui/                   8 مكوّنات عرض مشتركة
│   │   ├── directives/           image-fallback · loading · rtl
│   │   └── services/             toast.service.ts
│   ├── layout/ navbar/ profile/ pipes/ map-picker/ language-selector/
│   ├── app.config.ts             المزوّدات + APP_INITIALIZER
│   └── app.routes.ts             44 مدخل path:
├── environments/                 environment · .prod · .staging · .model
├── styles/                       _breakpoints.scss · _auth-flow.scss
├── styles.scss                   نظام التصميم الكامل + الوضع الداكن  (SCSS)
└── tailwind.css                  مدخل Tailwind + جسر الرموز @theme      (CSS خام)
```

**الأحجام:** 124 ملف `.ts` · 26 قالب `.html` · 27 ملف `.scss` · 6 ملفات `.spec.ts`.

**الميزات العشرون:** `analytics` `auth` **`checkout`** `contact` `favorites` `home`
`landing` `messages` `my-listings` `not-authorized` `notifications` `offline` `pricing`
`properties` `property-detail` `property-form` `reviews` `saved-searches` `user-profile`
`visits`.

بعض الميزات تستخدم قوالب inline وبعضها ملفات `.html` منفصلة. **كلا النمطين مقبول** —
الحدّ العملي المتبع: قالب inline للشاشات القصيرة، ملف منفصل لما يتجاوز ~40 سطراً.

---

## 3. طبقة `core/` — ما يوجد بالضبط

### 3.1 خدمات الـ API (19)

`admin-users` · `analytics` · `api-error` · `backend-api` · `contact` ·
`favorites-api` · **`listing-fees-api`** · `location-suggestions-api` · `lookups-api` ·
`messages-api` · `notifications-api` · `otp-api` · `plans-api` · `profile` ·
`property-api` · `review` · `saved-search-api` · `user-profile-api` · `visit`

**النمط الموحّد:** `@Injectable({ providedIn: 'root' })` + حقل `endpoint` ثابت +
الاعتماد على `BackendApiService`. **لا `catchError` داخل الخدمة** — الأخطاء تصعد
إلى `ApiErrorInterceptor`. أي خدمة جديدة تتبع هذا العرف حرفياً.

`listing-fees-api.service.ts` يوضّح عرفاً إضافياً يستحق التقليد: **نقاط النهاية
الإدارية لا تُغلَّف في خدمة عميل**. تأكيد الدفع (`.../confirm`) محصور بالمدير في
الخلفية، ولفّه هنا كان سيمنح كل قارئ للشيفرة خريطة لمحاولة استدعائه.

### 3.2 الاعتراضات (3)

| الملف | الدور |
|---|---|
| `refresh-auth.interceptor.ts` | إرفاق `Bearer` + تجديد التوكن تلقائياً عند 401 |
| `auth-interceptor.ts` | **مجرد إعادة تصدير** لـ `RefreshAuthInterceptor` — ليس اعتراضاً ثانياً |
| `api-error.interceptor.ts` | تحويل أخطاء HTTP إلى رسائل قابلة للعرض |

`refresh-auth.interceptor` يحمل حرّاساً مهمّين مُتحقَّقين:

- `isBackendApiRequest()` — التوكن **لا يُرفق إلا** بطلبات الـ REST API. هذا يمنع
  تسريبه إلى ملفات i18n، الملفات الساكنة، Leaflet، أو أي طرف ثالث مستقبلي.
- `isAuthEndpoint()` — مسارات المصادقة مستثناة من التجديد لمنع حلقات لا نهائية.
- `refreshRequest$` مشترك بـ `shareReplay` — طلبات 401 المتزامنة تُنتج **طلب تجديد واحداً**.

### 3.3 الحرّاس

- `AuthGuard` — على 13 مساراً (‏`checkout/:kind/:propertyId` أحدثها).
- `AdminGuard` — على 4 مسارات إدارية، ويوجّه عند الرفض إلى `/not-authorized`.

### 3.4 الخدمات العرضية (11)

`enum` · `language` · `lead` · `meta` · `native-back-button` · `overlay-back-handler` ·
`password-validator` · `signalr-notification` · `theme` · `token-storage` · `url`

### 3.5 النماذج (15)

`analytics` · `api` · `auth` · `favorite` · `lead` · **`listing-fee`** ·
`location-suggestion` · `message` · `notification` · `property` · `review` ·
`saved-search` · `subscription-plan` · `user-profile` · `visit`

---

## 4. المصادقة وتخزين التوكن — ⚠️ الحقيقة المُتحقَّقة

مقروء من `token-storage.service.ts` مباشرة، **دون تغيير عن v1.1**:

| العنصر | أين يُخزَّن | التقييم |
|---|---|---|
| **Access token** | حقل خاص في الذاكرة — لا يلمس التخزين إطلاقاً | ✅ صحيح |
| **Refresh token** | `sessionStorage` تحت `wohnungsapp_refresh` | ⚠️ **قابل للقراءة بـ XSS** |
| علم «تذكّرني» | `localStorage` تحت `wohnungsapp_remember` | انظر التحذير أدناه |

**الخلاصة الصريحة:** التوكن **ليس** في كوكي `HttpOnly`. وضع الـ access token في
الذاكرة قرار صحيح ويقلّل السطح كثيراً، لكن الـ refresh token في `sessionStorage`
يعني أن ثغرة XSS واحدة تكفي لسرقة جلسة كاملة قابلة للتجديد. التصنيف الصحيح اليوم:
**مفتوح، مُخفَّف جزئياً** — لا «مُنجَز».

⚠️ **تناقض وظيفي مُتحقَّق (F-1):** `storeTokens()` يكتب الـ refresh token في
`sessionStorage` **دائماً** ويمسحه من `localStorage`، بينما يكتب علم «تذكّرني» في
`localStorage`. النتيجة: تفعيل «تذكّرني» يحفظ علماً يبقى بعد إغلاق التبويب، **بلا
توكن يقابله**. الميزة لا تعمل كما يتوقع المستخدم.

**استعادة الجلسة:** `restoreSession()` في `app.config.ts` (‏`APP_INITIALIZER`) يقرأ
الـ refresh token عند الإقلاع ويستدعي `POST /auth/refresh` عبر `HttpBackend` مباشرةً
(‏تجاوزاً للاعتراضات، وهو الصحيح)، بمهلة 5 ثوانٍ. فشل التجديد ⇒ `tokenStorage.clear()`.

---

## 5. عقد الاتصال مع الخلفية

### 5.1 قاعدة PascalCase — التكلفة الدائمة

الخلفية تضبط `PropertyNamingPolicy = null` (‏`Program.cs:301` — مُتحقَّق). أي أن
**كل استجابة نجاح تصل بـ PascalCase**.

المحوّل المركزي `apiToCamelCase()` في `core/adapters/api-naming.adapter.ts`
مستخدم في **16 ملفاً**. أي خدمة API جديدة **يجب** أن تمرّ به.

استثناءان مُتحقَّقان يجب ألّا يُفترض غيابهما:

1. `ExceptionHandlingMiddleware.cs:27` يستخدم `JsonNamingPolicy.CamelCase` — أي أن
   **أجسام الأخطاء تصل camelCase بينما أجسام النجاح تصل PascalCase**.
2. نقطتا تأكيد الدفع في `PropertiesController` تُعيدان كائناً مجهول النوع
   (‏`new { expiresAt = ... }` و`new { featuredUntil }`)، فتخرجان camelCase أيضاً.
   `apiToCamelCase()` يبتلع الحالتين بلا ضرر، لكن لا تبنِ افتراضاً على تناسق المسارين.

### 5.2 خريطة نقاط النهاية (واجهة ← خلفية)

| مسار الواجهة | Controller في الخلفية | موجود؟ |
|---|---|---|
| `/properties`, `/properties/{id}`, `/properties/mine`, `/properties/geo-search`, `/properties/check-duplicate`, `/properties/{id}/publish`, `/properties/{id}/manage`, `/properties/{id}/confirm-availability` | `PropertiesController` | ✅ |
| **`/properties/{id}/extension`**, **`/properties/{id}/featured`** | `PropertiesController` | ✅ **جديد** |
| `/properties/{id}/images/...` | `PropertyImagesController` | ✅ |
| `/auth/phone/send-otp`, `/auth/phone/verify` | `PhoneAuthController` | ✅ |
| `/users/me`, `/users/me/avatar`, `/users/me/change-password`, `/Users/{id}/profile`, `/Users/{id}/ratings` | `UsersController` | ✅ |
| `/Admin/users`, `/Admin/roles`, `/Admin/users/{id}/role` | `AdminController` | ✅ |
| `/admin/location-suggestions` | `LocationSuggestionsController` | ✅ |
| `/notifications`, `/notifications/unread-count`, `/notifications/{id}/read`, `/notifications/read-all`, `/notifications/{id}/soft-delete` | `NotificationsController` | ✅ |
| `/favorites`, `/favorites/{propertyId}` | `FavoritesController` | ✅ |
| `/savedsearch` | `SavedSearchController` | ✅ |
| `/visits` | `VisitsController` | ✅ |
| `/reviews` | `ReviewsController` | ✅ |
| `/analytics` | `AnalyticsController` | ✅ |
| `/contact` | `ContactController` | ✅ |
| `/lookups` | `LookupsController` | ✅ |
| `/Messages` | `MessagesController` | ✅ |
| **`/plans`** | — | ❌ **غير موجود** (§5.3) |
| — | **`AgenciesController`** | ⚠️ **خلفية بلا عميل** (§5.5) |

### 5.3 `‎/plans‎` — عقد مكتوب بلا خلفية

`PlansApiService.getPlans()` يعيد اليوم الكتالوج المحلي عبر `of(...)`. الدالة
`toPlans()` مكتوبة بالكامل مقابل العقد الموثّق في `FRONTEND_BACKEND_CONTRACT.md §11`،
فالتبديل عند جاهزية الخلفية **سطر واحد**. بحث في مصدر الخلفية عن
`subscription | billing | invoice | stripe | paytabs | paymob` أعطى **صفر نتائج**.

**لا يوجد كيان `Subscription` في الخلفية**، ولذلك لا شيء يستطيع السؤال «على أي خطة
هذا المستخدم». صفحة `/pricing` تعرض خططاً لا يمكن شراؤها ولا يعرف النظام من اشتراها،
وكل حساب يُعامَل على أنه في الخطة المجانية.

### 5.4 رسوم الإعلانات — المسار الوحيد المكتمل بين الطرفين

هذان الرسمان **مبنيّان فعلاً في الطرفين**، وهما اليوم المسار المالي الوحيد الذي يعمل
من طرف إلى طرف:

| الرسم | المسار | السعر | المدة |
|---|---|---|---|
| تمديد إعلان منتهٍ | `POST /properties/{id}/extension` | 1.00 $ | 90 يوماً |
| تمييز إعلان | `POST /properties/{id}/featured` | 5.00 $ | 30 يوماً |

**كلاهما يعيد `202 Accepted` لا `200 OK`، وهذا هو جوهر التصميم:** الاستدعاء **يسجّل
ما يترتّب على المالك ولا يغيّر الإعلان**. لا توجد بوابة دفع في النظام، فالرسم يبقى
`Pending` حتى يؤكّده **مدير** عبر نقطة نهاية محصورة به.

`checkout.page.ts` بُنيت على هذا حرفياً: **لا حقول بطاقة، ولا إعادة توجيه لمزوّد،
ولا شاشة «جارٍ تنفيذ الدفع»**. شاشة تبدو وكأنها تقبض بطاقة كانت ستجمع أرقام بطاقات
حقيقية وترسلها إلى لا مكان. ما تفعله الشاشة: تراجع الرسم، ثم تسجّله، ثم تعرض
`transactionId` بوصفه المرجع الذي يذكره المالك في حوالته البنكية.

**الاستدعاء آمن التكرار:** الخادم يعيد استخدام رسماً معلّقاً من النوع نفسه بدل تكديس
رسم ثانٍ، ويعلن ذلك في `isExistingPendingFee` — والصفحة تقوله بصوت عالٍ، فزيارة ثانية
يجب ألّا تترك أحداً يظن أنه حُوسِب مرتين.

✅ **التمييز صار يُسلَّم فعلاً** (2026-08-24، إغلاق **B-1**). ما تعتمد عليه الواجهة:

- `Property.isFeatured` — **القيمة الفعّالة** من الخادم لا العمود الخام. كنس إنهاء
  التمييز يعمل كل ست ساعات، فالحقل الخام قد يبقى `true` لنافذة انقضت؛ الخادم يحسم ذلك
  قبل الإرسال. **لا تقارن `featuredUntil` بالتاريخ في الواجهة** — تكرارٌ للمنطق سيتباعد.
- `Property.featuredUntil` — سجلّ ما دُفِع ثمنه. للعرض فقط (صفحة إعلاناتي).
- الشارة تُرسم في: بطاقة القائمة، وبطاقة الرئيسية، ورأس صفحة التفاصيل، وسطر «مميّز حتى»
  في إعلاناتي. المفتاحان `PROPERTY.FEATURED` و`MY_LISTINGS.FEATURED_UNTIL` في ar/en/de.
- **الترتيب:** المميّز يتصدّر **الفرز الافتراضي وحده**. الفرز الصريح (سعر/مساحة) يبقى
  نقياً عمداً، والبحث الجغرافي يعرض الشارة ويبقى مرتّباً بالمسافة. لا تُضِف تقديماً في
  الواجهة يناقض ذلك.

### 5.5 الوكالات — وحدة خلفية كاملة بلا عميل

الخلفية أضافت في `61bd779` وحدة `Agencies` كاملة: كيان، مستودع، خمس نقاط نهاية،
دورا `AgencyOwner`/`AgencyAgent`، وصفحة عامة على `GET /api/agencies/{slug}`.

**الواجهة لا تعرف عنها شيئاً:** لا خدمة في `core/api`، ولا نموذج، ولا مسار، ولا
مفتاح ترجمة. من يفتح هذا الملف ليخطّط ميزة الوكالات يبدأ من صفر على جانب Angular —
وليس من صفر على جانب الخلفية. اقرأ `docs/PropertyApi-REFERENCE.md §10` قبل التصميم،
وقيود الوحدة في `docs/BACKEND-ISSUES.md` البنود **B-2** إلى **B-5**.

### 5.6 CSRF — القدرة موجودة، والمفتاح **مطفأ عمداً**

| الطرف | الحالة |
|---|---|
| الخلفية | `AddPropertyApiAntiforgery` + `UseCookieCsrfProtection()` مُسجَّلان في `Program.cs` |
| المفتاح | `CookieCsrfOptions.Enabled = false` افتراضياً، ولا مفتاح `CookieCsrf` في أي `appsettings` |
| الواجهة | **لا ترسل أي رأس `X-XSRF-TOKEN`** — بحث عن `csrf|xsrf|antiforgery` أعطى صفر نتائج |

**وهذا صحيح ومتّسق:** المصادقة بـ `Authorization: Bearer` لا بكوكي، وحماية CSRF
لا لزوم لها ما دام لا يوجد اعتماد ضمني على كوكي.

⚠️ **لكن انتبه:** أي تحوّل مستقبلي إلى مصادقة بالكوكي يتطلب تغييراً **متزامناً على
الطرفين**: تفعيل `CookieCsrf:Enabled` **و** جعل الواجهة تجلب
`GET /api/security/csrf-token` ثم ترسل الرأس. تفعيل طرف واحد يكسر كل طلبات الكتابة
صامتاً — وسيفشل عند الوسيط قبل أي Controller، فلن يبدو الخطأ خطأ CSRF إطلاقاً.

---

## 6. SignalR

- `signalr-notification.service.ts` يتصل بـ `environment.signalRUrl`.
- `accessTokenFactory: () => this.tokenStorage.getAccessToken() ?? ''` — **دالة تقرأ
  التوكن الحالي عند كل استدعاء**، لا قيمة ملتقطة مرة واحدة. القيمة الملتقطة تجعل
  إعادة الاتصال بعد التجديد تستخدم توكناً منتهياً.
- الحدث المستقبَل: `ReceiveNotification`.
- الخلفية تستخدم Redis backplane (‏`AddStackExchangeRedis`) — تعدد النسخ مدعوم للإشعارات.
  ⚠️ لكنه **غير مدعوم للمهام المجدولة** في الخلفية؛ انظر `docs/BACKEND-ISSUES.md` البند **B-6**.
- أنواع الإشعارات المضافة حديثاً في الخلفية: `ListingExpiringSoon` و`ListingExpired`
  (نصّها عربي ويصل عبر القناة نفسها بلا تغيير في الواجهة).

---

## 7. التعريب والاتجاه

| البند | القيمة |
|---|---|
| الملفات | `public/i18n/ar.json` · `en.json` · `de.json` |
| عدد المفاتيح | **976 لكل ملف — تطابق تام** (مُحصاة بعد التسطيح، 2026-08-24) |
| الافتراضية والاحتياطية | `ar` |
| التخزين | `localStorage` تحت `lang` |
| الاتجاه | `LanguageService` يضبط `document.documentElement.dir` ويبدّل `body.rtl/.ltr` |

**قاعدة ملزمة:** لا نصوص مكتوبة يدوياً في القوالب أو الشيفرة — كل نص مفتاح ترجمة.
حتى رسائل الخطأ تُخزَّن كـ **مفاتيح** في الإشارات وتُترجم عند العرض:
`{{ error() | translate }}`.

**عند إضافة مفاتيح:** أضِفها إلى الملفات الثلاثة معاً وتحقّق من تطابق العدد. النقص في
ملف واحد لا يُسقط البناء — يظهر المفتاح الخام للمستخدم في تلك اللغة فقط.

---

## 8. نظام التصميم

### 8.1 الرموز (Tokens)

كلها متغيرات CSS في `src/styles.scss`. المجموعات:

- **الهوية:** `--navy` `--navy-600` `--navy-80` · `--gold` `--gold-dark` `--gold-light`
  `--gold-soft` `--gold-text` · `--primary` `--primary-dark` `--primary-soft`
- **المحايدات:** `--gray-50` … `--gray-900` · `--surface` · `--page-bg` · `--border` · `--border-focus`
- **الدلالية:** `--success` `--warning` `--danger` (+ `-soft`) · `--badge-rent-*` · `--badge-sale-*`
- **الخط:** `--font-display` `--font-body` `--font-mono` · `--text-xs` … `--text-4xl`
- **المسافات:** `--space-1` … `--space-16`
- **الأنصاف والظلال:** `--r-sm` … `--r-2xl` `--r-pill` · `--shadow-xs` … `--shadow-xl`
- **الطبقات:** `--z-dropdown` `--z-sticky` `--z-overlay` `--z-modal` `--z-toast`
- **المحمول:** `--app-safe-area-top/bottom/left/right` · `--navbar-height`

### 8.2 الوضع الداكن

فاتح افتراضاً، و`html[data-theme="dark"]` (‏`styles.scss:137`) يعيد تعريف الرموز فقط.
`ThemeService` يضبط السمة ويحفظ في `localStorage` تحت `aqar-tech-theme`، ويقاوم فشل
التخزين (وضع التصفح الخاص) بصمت.

**القاعدة:** استخدم `var(--token)` حصراً. أي لون حرفي يكسر الوضع الداكن.
`saved-searches.page.scss` **يخالف** هذه القاعدة — انسخ بنيته لا ألوانه.

### 8.3 نقاط الانكسار

```scss
@use '../../../styles/breakpoints' as bp;
@include bp.mobile  { }   // ≤ 640
@include bp.tablet  { }   // ≤ 980
@include bp.desktop { }   // ≥ 1280
```

استخدام `@media (max-width: N)` الخام **ممنوع صراحةً** في `_breakpoints.scss`
(‏في ملفات SCSS؛ صفحات Tailwind تستخدم بادئات `sm:` `md:` `lg:` بدلاً منها).

### 8.4 فخّ الشبكة — درس مدفوع الثمن

`.btn` العام في `styles.scss` يحمل `white-space: nowrap`. في أي شبكة بطاقات، هذا يجعل
أطول نص زر هو `min-content` للبطاقة كلها — و`1fr` هي `minmax(auto, 1fr)` التي **لا
تنكمش تحت `min-content`**، فتتجاوز الشبكة الشاشة أفقياً وتخرج الأعمدة غير متساوية.

**العلاج (طُبِّق في `pricing.page.scss`):**

```scss
grid-template-columns: repeat(4, minmax(0, 1fr));  // لا 1fr
.card { min-width: 0; overflow-wrap: break-word; }
.card__cta { white-space: normal; }                 // .btn يبقي min-height: 44px
```

أي شبكة أزرار جديدة سترث هذا الفخ. لا تعالجه بتعديل `.btn` العام.

### 8.5 Tailwind v4 — **يعمل بجانب SCSS، لا بدلاً منه**

| البند | القيمة |
|---|---|
| الإصدار | `tailwindcss` 4.3 عبر `@tailwindcss/postcss` |
| الإعداد | `.postcssrc.json` — لا ملف `tailwind.config.js`؛ الإعداد كله داخل CSS |
| المدخل | `src/tailwind.css` — **ملف `.css` خام، ليس SCSS** |
| ترتيب التحميل | في `angular.json`: `tailwind.css` **أولاً** ثم `styles.scss` |
| الصفحات المستخدِمة | `checkout` فقط حتى الآن؛ الـ ~25 صفحة الأخرى لم تُمسّ |

**ثلاثة قرارات هنا كلٌّ منها يمنع عطلاً محدّداً — لا تعكسها:**

1. **لماذا ملف `.css` منفصل؟** Angular يصرّف Sass **قبل** أن يعمل PostCSS. وضع
   `@import "tailwindcss"` داخل ملف `.scss` يجعل Sass يعترضه كاستيراد Sass ويفشل.
2. **لماذا Tailwind أولاً في `angular.json`؟** كي تفوز أنماط التطبيق عند التعادل،
   فلا تُغيّر Tailwind شكل صفحة قديمة.
3. **لماذا `@custom-variant dark` ؟** التطبيق يبدّل `html[data-theme="dark"]` يدوياً،
   وافتراضي Tailwind هو `prefers-color-scheme`. بلا هذا السطر ستتبع كل أداة `dark:`
   نظامَ التشغيل وتناقض مبدّل السمة في شريط التنقّل على الصفحة نفسها.

**جسر الرموز (`@theme`):** كل لون في Tailwind يشير إلى متغيّر CSS الذي يعرّفه
`styles.scss` أصلاً (`--color-surface: var(--surface)`) ولا يكرّر قيمته السداسية.
لهذا تعمل `bg-surface` في الوضع الداكن **بلا أي أداة `dark:`**: `styles.scss` يعيد
تعريف `--surface` تحت `[data-theme="dark"]`، والإشارة تُحلّ لحظة الرسم.

> **القاعدة الملزمة:** لا تكرّر قيمة لون سداسية داخل `tailwind.css`. تكرارها يخلق
> مصدر حقيقة ثانياً ينحرف عن الأول لحظة تعديل أي لون في `styles.scss`.

**أي نمط أستخدم في صفحة جديدة؟** كلاهما مقبول. الحدّ العملي: صفحة جديدة قائمة بذاتها
⟵ Tailwind؛ تعديل على صفحة قائمة ⟵ SCSS الخاص بها. **لا تخلط النظامين داخل مكوّن واحد**
— أصعب ما في الصيانة ليس أيّهما استُخدم، بل ألّا يُعرف أيّهما استُخدم.

### 8.6 الخطوط — الترتيب آلية، لا تفضيل

```
Roboto  ←  IBM Plex Sans Arabic  ←  Cairo  ←  system-ui
```

`--font-display` و`--font-body` كلاهما يحمل هذه السلسلة نفسها في `styles.scss:85-86`.

**لماذا هذا الترتيب بالذات:** Roboto **لا يحوي محارف عربية**، فيسقط المتصفّح
حرفاً حرفاً إلى العائلة التالية. النتيجة: اللاتيني يُرسم بـ Roboto والعربي بـ
IBM Plex Sans Arabic — **بلا سطر شيفرة واحد وبلا `:lang()`**.

> ⚠️ **لا تضع أي خط عربي قبل Roboto.** الخط العربي يحوي محارف لاتينية أيضاً، فسيلتقط
> اللاتيني كذلك ويُبطل التقسيم كله. Cairo يبقى أخيراً لأن كل الصفحات القديمة رُسمت عليه.

---

## 9. المسارات (44 مدخل `path:`)

| المجموعة | أمثلة | الحماية |
|---|---|---|
| عامة داخل `LayoutComponent` | `home` `wohnungen` `wohnungen/:id` `properties/:id` `kontakt` `reviews` `users/:id` `pricing` `not-authorized` `offline` | — |
| محمية بـ `AuthGuard` | `my-listings` `property-form` `properties/edit/:id` `favorites` `saved-searches` `notifications` `visits` `analytics` `profile` `messages/:propertyId` **`checkout/:kind/:propertyId`** | 🔒 |
| إدارية بـ `AdminGuard` | `admin/messages` `admin/messages/:id` `admin/users` `admin/location-suggestions` | 🔒👑 |
| مصادقة | `login` `auth/login` `auth/send-otp` `auth/verify-otp` وبقية تدفقات الهاتف والبريد | — |
| خارج التخطيط | `landing` `language` | — |
| الشامل | `**` → `home` | — |

**`checkout/:kind/:propertyId`** محمي بـ `AuthGuard` لأن نقطتَي النهاية خلفه محصورتان
بمالك الإعلان — زائر مجهول لم يكن ليرى إلا 401. و`:kind` يقبل `extension` أو `featured`
فقط، ويتحقّق منه `isListingFeeKind()` قبل أي طلب.

**تحذير:** `{ path: '**', redirectTo: 'home' }` يبتلع أي مسار غير مسجَّل **بصمت**.
إذا وجّه حارس أو شيفرة إلى مسار نسيت تسجيله، لن ترى 404 — سترى الصفحة الرئيسية بلا
تفسير. هذا بالضبط ما كان يحدث مع `/not-authorized`.

---

## 10. المحمول (Capacitor 8)

| البند | القيمة |
|---|---|
| `appId` | `com.realestate.app` |
| `webDir` | `dist/Wohnungsmieten/browser` |
| المخططات | Android: `https` · iOS: `capacitor` |
| `cleartext` | مربوط بمتغيّر البيئة `CAPACITOR_ALLOW_CLEARTEXT` — **يجب أن يبقى `false` في الإنتاج** |
| `allowNavigation` | `realestateworld.world` و`*.realestateworld.world` فقط |
| أوامر | `android:sync` · `android:open` · `ios:check` · `ios:setup` · `ios:sync` · `ios:open` |

خدمات مرتبطة: `native-back-button.service.ts` و`overlay-back-handler.service.ts`
(زر الرجوع الفيزيائي يجب أن يغلق الطبقات المفتوحة قبل أن يتنقّل).

⚠️ **الخطوط تُحمَّل من Google Fonts عبر الشبكة.** داخل التطبيق المحمول هذا يعني
اعتماداً على اتصال خارجي عند الإقلاع؛ في وضع بلا اتصال يسقط العرض إلى `system-ui`.
إن أصبح هذا مهماً، الحلّ تضمين ملفات الخطوط في `public/` لا تعديل ترتيب السلسلة.

---

## 11. الأوامر والبوابات

```bash
npm run typecheck        # tsc --noEmit على tsconfig.app.json
npm run audit:frontend   # يفشل عند نمط غير آمن أو سرّ مكشوف
npm run build:prod
npm run postmerge:verify # check:env + audit + typecheck + build:prod — البوابة الكاملة
```

**`audit:frontend` يفحص** (‏`tools/frontend-audit-guard.mjs`):
1. **mojibake** — تحذير لا إسقاط، لكنه حرج هنا لأن المحتوى عربي كثيف.
2. ثلاثة أنماط غير آمنة **تُسقط الفحص**: تجاوز تعقيم HTML عبر `DomSanitizer`، والربط
   المباشر بخاصية HTML الداخلية للعنصر (بالقالب أو بالإسناد)، وأي مفتاح سرّي مكشوف
   متبوع بسلسلة ≥ 8 أحرف.
3. عنوان إنتاج محظور في `environment.prod.ts` (‏`localhost` أو نظام غير مشفَّر).
4. تحذير دائم: `strict: false` في `tsconfig.json`.

⚠️ **الفاحص لا يميّز الشرح عن الاستخدام:** أي ملف — بما فيه ملفات التوثيق `.md` —
يطابق تلك التعابير النمطية يُسقط الفحص. لذلك تُوصَف هذه الأنماط هنا بالكلمات لا
بصيغتها الحرفية. هذا سلوك مقصود من الفاحص ولا يُعالَج بإضعافه.

**الحالة المُتحقَّقة (2026-08-24):**

| الفحص | النتيجة |
|---|---|
| `npm run typecheck` | ✅ يمرّ |
| `npm run audit:frontend` | ❌ يفشل بإخفاق واحد معروف: `REGISTER_ERROR_DIAGNOSIS.md` يطابق نمط «سرّ محتمل» — ملف تشخيص قديم لا شيفرة إنتاج |
| تحذير `strict: false` | ⚠️ قائم |

**ميزانية الحزمة:** الحدّ 500 kB. آخر رقم مقيس (‏2026-08-23، قبل إضافة Tailwind
والـ checkout) كان **593.36 kB**. الرقم بعد `c84052a` **لم يُقَس بعد** — لا تنقله
من هنا، شغّل `build:prod`.

**الاختبار اليدوي:** `docs/RESPONSIVE-MANUAL-TEST-MATRIX.md` — ثلاثة عروض بالضبط
(‏375 / 768 / 1440)، صفر تمرير أفقي، صفر هدف لمس < 44×44px، دورة RTL ودورة LTR،
الوضعان الفاتح والداكن. **صفحة `checkout` أول صفحة Tailwind — أخضِعها لهذه المصفوفة
كاملةً قبل الإصدار**، لأن قواعد الاتجاه والوضع الداكن فيها تمرّ بمسار مختلف عن كل ما سبقها.

---

## 12. ما لم يُبنَ بعد (قائمة صادقة)

| البند | الحالة | الدليل |
|---|---|---|
| **Service Worker / PWA** | ❌ **غير مُفعَّل** | `@angular/service-worker` مثبَّت و`ngsw-config.json` موجود، لكن **لا `provideServiceWorker` في `app.config.ts` ولا مدخل `serviceWorker` في `angular.json`** — الإعداد يتيم، وصفحة `/offline` بلا آلية تخزين تسندها |
| **تغطية الاختبارات** | ⚠️ 6 ملفات فقط | كلها لـ `core/`؛ **صفر اختبار تحت `features/`** رغم 20 ميزة — بما فيها `checkout` التي تلمس المال |
| **`strict: false`** | ⚠️ مفتوح | `tsconfig.strict.json` جاهز و`typecheck:strict` موجود — لم يُفعَّل بعد |
| **حجم الحزمة** | ⚠️ فوق الميزانية | آخر قياس 593.36 kB مقابل حدّ 500 kB؛ لم يُعَد القياس بعد Tailwind |
| **الاشتراكات والخطط** | ❌ غير مبنيّة في الطرفين | لا `PlansController` ولا كيان `Subscription`؛ `/pricing` كتالوج محلي |
| **بوابة الدفع** | ❌ غير موجودة | كل الرسوم تُسجَّل `Pending` وتُسوّى بتأكيد إداري يدوي. لا Stripe/PayTabs/Paymob |
| **دورة صلاحية الإعلان المجاني** | ✅ **مبنيَّة** (2026-08-23) | `ExpiresAt` + `ListingExpiryHostedService` + إشعارا `ListingExpiringSoon`/`ListingExpired` + حدّ إعلان واحد + رسم تمديد |
| **رسم التمييز** | ✅ **مبنيّ** (2026-08-24) | الشراء والتسليم معاً: تقديم في الفرز الافتراضي، وحقلان في `PropertyDto`، وشارة ⭐ في أربعة مواضع. `BACKEND-ISSUES.md` **B-1** مُغلَق |
| **واجهة الوكالات** | ❌ غير مبنيّة في Angular | الخلفية جاهزة (§5.5)؛ صفر شيفرة في الواجهة |
| **إشعارات الدفع (FCM)** | ❌ غير مبنيّ | صفر مراجع في الطرفين |
| **فيديو للعقارات** | ❌ غير مبنيّ | صفر مراجع في الدومين/التطبيق |
| **تخزين الـ refresh token** | ⚠️ مفتوح | `sessionStorage` لا `HttpOnly` — §4 |

---

## 13. قواعد ملزمة عند التطوير

1. **`OnPush` + `signal()`** في كل مكوّن جديد. لا استثناء.
2. **`inject()`** لا حقن بالمُنشئ.
3. **`takeUntilDestroyed(this.destroyRef)`** على كل `subscribe`.
4. **`*ngIf` / `*ngFor` + `CommonModule`** — بنية `@if`/`@for` غير مستخدمة في المشروع
   كله؛ لا تُدخلها في ملف واحد وتترك الباقي.
5. **كل نص مفتاح i18n** في الملفات الثلاثة معاً، وتحقّق من تطابق العدد.
6. **كل لون `var(--token)`** — لا ألوان حرفية، في SCSS **ولا في `@theme` الخاص بـ Tailwind**.
7. **`bp.mobile/tablet/desktop`** في SCSS، وبادئات `sm:`/`md:`/`lg:` في Tailwind — لا `@media` خام.
8. **نظام تنسيق واحد لكل مكوّن** — Tailwind أو SCSS، لا خلط داخل الملف الواحد.
9. **`apiToCamelCase()`** في كل خدمة API جديدة.
10. **لا `catchError` في الخدمات** — الأخطاء إلى `ApiErrorInterceptor`.
11. **لا تغلّف نقطة نهاية إدارية في خدمة عميل** — أي نقطة تمنح امتيازاً مالياً أو
    إدارياً تبقى خارج شيفرة الواجهة تماماً.
12. **الوجهات تبقى في الواجهة** — لا تدع الخادم يسلّم رابطاً للتنقل إليه
    (سطح open-redirect بلا مقابل).
13. **حرّاس `*ngIf` على الأزرار المالية تجميلية لا أمنية** — الملكية تُفرَض في الخلفية
    بـ 403، وهذا هو الضمان الوحيد.
14. **شغّل `audit:frontend` قبل الالتزام** — mojibake يمرّ من العين ولا يمرّ منه.

---

## 14. ملفات مرجعية ذات صلة

| الملف | الدور | الحالة |
|---|---|---|
| `docs/PROJECT-STRUCTURE.md` | البنية الهيكلية للمستودعين معاً وحدود الطبقات | ✅ **جديد** 2026-08-24 |
| `docs/BACKEND-ISSUES.md` | المشاكل المرصودة في كود الخلفية، مرتّبة بالأولوية | ✅ **جديد** 2026-08-24 |
| `docs/PropertyApi-REFERENCE.md` | المرجع المعماري للخلفية | ✅ محدَّث v6 |
| `FRONTEND_BACKEND_CONTRACT.md` | عقد الواجهة/الخلفية | ✅ محدَّث |
| `docs/RESPONSIVE-MANUAL-TEST-MATRIX.md` | مصفوفة الاختبار اليدوي الإلزامية | ✅ ساري |
| `docs/UI-RELEASE-GATE.md` | بوابة الإصدار | ✅ ساري |
| `docs/SUBSCRIPTION-PAGE-REPORT-AR.md` | تقرير صفحة الاشتراكات | ✅ محدَّث 2026-08-23 |
| `PROJECT-REFERENCE.md` (في `Downloads`) | مرجع عام قديم (‏2026-06-18) | ⚠️ **متجاوَز** — هذا الملف يَحُلّ محلّ قسمه الخاص بالواجهة |
| `REGISTER_ERROR_DIAGNOSIS.md` | تشخيص قديم يوجّه لأوامر SQL Server | ❌ **خاطئ** — قاعدة البيانات PostgreSQL |
| `DATABASE_SCHEMA.md` (في `Downloads`) | يصف SQL Server | ❌ **خاطئ** — PostgreSQL + PostGIS |

---

*كُتب من فحص ثابت مباشر للمصدرين معاً في 2026-08-24 (الواجهة `c84052a`، الخلفية
`61bd779`). كل بند لم يُتحقَّق منه بالشيفرة مُعلَّم صراحةً؛ لا شيء هنا منقول عن وثيقة
سابقة دون إعادة تحقّق.*
