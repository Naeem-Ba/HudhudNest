# WohnungsApp (Angular) — المرجع المعماري للواجهة

> **الغرض:** مرجع حيّ لكل جلسة تطوير قادمة على الواجهة.
> **آخر تحديث:** 2026-08-23 · النسخة v1.1
> (‏v1.1 يصحّح خطأ في v1: دورة صلاحية الإعلان لم تكن «غير مبنيّة» — كان عمود
> `ExpiresAt` ومُنتِج الإشعارات موجودين أصلاً. انظر §12.)
> **مصدر التحقّق:** فحص مباشر لشجرة المصدر في
> `C:\Users\naeem\OneDrive\Desktop\Notiz\WohnungsApp\Wohnungsmieten`
> (الفرع `feature/add-ios-platform`) **و** لمستودع الخلفية في
> `C:\Users\naeem\Source\Repos\PropertyApi` (آخر التزام `b3d0d0b`).
> **الحالة:** ⚠️ صالح للإنتاج بشروط — انظر §12 و§13.

---

## 0. اقرأ هذا قبل الوثوق بأي سطر أدناه

هذا الملف كُتب لأن الوثائق السابقة انحرفت عن الشيفرة. `PROJECT-REFERENCE.md`
(‏2026-06-18) يصف الواجهة بحالة تجاوزتها الأحداث، و`PropertyApi-REFERENCE.md` v4
كان يصنّف كل ادعاء عن الواجهة بأنه **غير قابل للتحقق** لأن مصدر Angular لم يكن
متاحاً في الأرشيف الذي بُني منه.

**ما يميّز هذه النسخة:** لأول مرة الواجهة والخلفية **كلتاهما موجودتان على هذا الجهاز
وقابلتان للفحص معاً**، فكل بند متقاطع بينهما (التوكن، PascalCase، CSRF، SignalR)
مُتحقَّق من الطرفين لا من طرف واحد.

**قاعدة ملزمة:** كل جدول هنا يحمل عمود «التحقّق» أو ملاحظة مصدر. إن مرّت دورة نشر
واحدة، أعِد التحقق من الشيفرة قبل استخدام هذا الملف في التخطيط — لا تُكرّر خطأ الانحراف
الذي وُجد هذا الملف لتصحيحه.

---

## 1. هوية الواجهة

| الخاصية | القيمة |
|---|---|
| الإطار | Angular **20.2** — Standalone فقط، لا NgModules |
| اللغة | TypeScript 5.9 · `strict: false` ⚠️ (انظر §12) |
| التوجيه | `provideRouter(routes, withHashLocation())` — **مسارات hash** (`/#/pricing`) |
| كشف التغيير | `ChangeDetectionStrategy.OnPush` + `signal()` — إلزامي في كل مكوّن جديد |
| الحقن | `inject()` دالةً، لا حقن بالمُنشئ في الكود الجديد |
| التنسيق | SCSS خام + متغيرات CSS — **لا Tailwind، لا مكتبة UI** |
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
│   │   ├── api/                  18 خدمة API
│   │   ├── auth/                 auth.service.ts (+ spec)
│   │   ├── guards/               auth-guard.ts · admin-guard.ts
│   │   ├── interceptors/         3 اعتراضات
│   │   ├── models/               14 نموذجاً
│   │   └── services/             11 خدمة عرضية
│   ├── features/                 19 ميزة (lazy-loaded بالكامل)
│   ├── admin/                    4 شاشات إدارية
│   ├── shared/
│   │   ├── ui/                   8 مكوّنات عرض مشتركة
│   │   ├── directives/           image-fallback · loading · rtl
│   │   └── services/             toast.service.ts
│   ├── layout/ navbar/ profile/ pipes/ map-picker/ language-selector/
│   ├── app.config.ts             المزوّدات + APP_INITIALIZER
│   └── app.routes.ts             43 مدخل path:
├── environments/                 environment · .prod · .staging · .model
├── styles/                       _breakpoints.scss · _auth-flow.scss
└── styles.scss                   نظام التصميم الكامل + الوضع الداكن
```

**الأحجام:** 121 ملف `.ts` · 25 قالب `.html` · 27 ملف `.scss` · 6 ملفات `.spec.ts`.

بعض الميزات تستخدم قوالب inline (‏`notifications`, `messages`, `user-profile`,
`offline`, `not-authorized`) وبعضها ملفات `.html` منفصلة. **كلا النمطين مقبول** —
الحدّ العملي المتبع: قالب inline للشاشات القصيرة، ملف منفصل لما يتجاوز ~40 سطراً.

---

## 3. طبقة `core/` — ما يوجد بالضبط

### 3.1 خدمات الـ API (18)

`admin-users` · `analytics` · `api-error` · `backend-api` · `contact` ·
`favorites-api` · `location-suggestions-api` · `lookups-api` · `messages-api` ·
`notifications-api` · `otp-api` · `plans-api` · `profile` · `property-api` ·
`review` · `saved-search-api` · `user-profile-api` · `visit`

**النمط الموحّد:** `@Injectable({ providedIn: 'root' })` + حقل `endpoint` ثابت +
الاعتماد على `BackendApiService`. **لا `catchError` داخل الخدمة** — الأخطاء تصعد
إلى `ApiErrorInterceptor`. أي خدمة جديدة تتبع هذا العرف حرفياً.

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

- `AuthGuard` — على 12 مساراً.
- `AdminGuard` — على 4 مسارات إدارية، ويوجّه عند الرفض إلى `/not-authorized`
  (المسار مسجَّل الآن في `app.routes.ts`؛ كان مفقوداً سابقاً فكان يبتلعه `**`).

### 3.4 الخدمات العرضية (11)

`enum` · `language` · `lead` · `meta` · `native-back-button` · `overlay-back-handler` ·
`password-validator` · `signalr-notification` · `theme` · `token-storage` · `url`

---

## 4. المصادقة وتخزين التوكن — ⚠️ الحقيقة المُتحقَّقة

هذا البند كان مصنّفاً **«غير قابل للتحقق»** في `PropertyApi-REFERENCE.md` v4
(‏H-4/S-2). هذه هي الإجابة، مقروءة من `token-storage.service.ts` مباشرة:

| العنصر | أين يُخزَّن | التقييم |
|---|---|---|
| **Access token** | حقل خاص في الذاكرة — لا يلمس التخزين إطلاقاً | ✅ صحيح |
| **Refresh token** | `sessionStorage` تحت `wohnungsapp_refresh` | ⚠️ **قابل للقراءة بـ XSS** |
| علم «تذكّرني» | `localStorage` تحت `wohnungsapp_remember` | انظر التحذير أدناه |

**الخلاصة الصريحة:** التوكن **ليس** في كوكي `HttpOnly`. وضع الـ access token في
الذاكرة قرار صحيح ويقلّل السطح كثيراً، لكن الـ refresh token في `sessionStorage`
يعني أن ثغرة XSS واحدة تكفي لسرقة جلسة كاملة قابلة للتجديد. تصنيف H-4/S-2 الصحيح
اليوم: **مفتوح، مُخفَّف جزئياً** — لا «مُنجَز».

⚠️ **تناقض وظيفي مُتحقَّق:** `storeTokens()` يكتب الـ refresh token في `sessionStorage`
**دائماً** ويمسحه من `localStorage`، بينما يكتب علم «تذكّرني» في `localStorage`.
النتيجة: تفعيل «تذكّرني» يحفظ علماً يبقى بعد إغلاق التبويب، **بلا توكن يقابله** —
لأن `sessionStorage` يموت مع التبويب. الميزة لا تعمل كما يتوقع المستخدم.

**استعادة الجلسة:** `restoreSession()` في `app.config.ts` (‏`APP_INITIALIZER`) يقرأ
الـ refresh token عند الإقلاع ويستدعي `POST /auth/refresh` عبر `HttpBackend` مباشرةً
(‏تجاوزاً للاعتراضات، وهو الصحيح)، بمهلة 5 ثوانٍ. فشل التجديد ⇒ `tokenStorage.clear()`.

---

## 5. عقد الاتصال مع الخلفية

### 5.1 قاعدة PascalCase — التكلفة الدائمة

الخلفية تضبط `PropertyNamingPolicy = null` (‏`Program.cs:301` — مُتحقَّق). أي أن
**كل استجابة نجاح تصل بـ PascalCase**.

المحوّل المركزي `apiToCamelCase()` في `core/adapters/api-naming.adapter.ts`
مستخدم في **15 ملفاً**. أي خدمة API جديدة **يجب** أن تمرّ به.

استثناء مُتحقَّق: `ExceptionHandlingMiddleware.cs:27` يستخدم `JsonNamingPolicy.CamelCase`
— أي أن **أجسام الأخطاء تصل camelCase بينما أجسام النجاح تصل PascalCase**. هذا
مصدر ارتباك حقيقي عند كتابة مُحوّلات جديدة؛ لا تفترض تناسقاً بين المسارين.

### 5.2 خريطة نقاط النهاية (واجهة → خلفية)

| مسار الواجهة | Controller في الخلفية | موجود؟ |
|---|---|---|
| `/properties`, `/properties/{id}`, `/properties/mine`, `/properties/geo-search`, `/properties/check-duplicate`, `/properties/{id}/publish`, `/properties/{id}/manage`, `/properties/{id}/confirm-availability` | `PropertiesController` | ✅ |
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
| **`/plans`** | — | ❌ **غير موجود** (انظر §5.3) |

### 5.3 `‎/plans‎` — عقد مكتوب بلا خلفية

`PlansApiService.getPlans()` يعيد اليوم الكتالوج المحلي عبر `of(...)`. الدالة
`toPlans()` مكتوبة بالكامل مقابل العقد الموثّق في `FRONTEND_BACKEND_CONTRACT.md §11`،
فالتبديل عند جاهزية الخلفية **سطر واحد**. بحث في مصدر الخلفية عن
`subscription | billing | invoice | stripe | paytabs | paymob` أعطى **صفر نتائج** —
مؤكَّد أنه غير مبنيّ، لا مفقود من البحث.

### 5.4 CSRF — القدرة موجودة، والمفتاح **مطفأ عمداً**

| الطرف | الحالة |
|---|---|
| الخلفية | `AddPropertyApiAntiforgery` + `UseCookieCsrfProtection()` مُسجَّلان في `Program.cs` |
| المفتاح | `CookieCsrfOptions.Enabled = false` افتراضياً، و`false` صراحةً في كل `appsettings` |
| الواجهة | **لا ترسل أي رأس `X-XSRF-TOKEN`** — بحث عن `csrf|xsrf|antiforgery` أعطى صفر نتائج |

**وهذا صحيح ومتّسق:** المصادقة بـ `Authorization: Bearer` لا بكوكي، وحماية CSRF
لا لزوم لها ما دام لا يوجد اعتماد ضمني على كوكي. التعليق داخل `CookieCsrfOptions.cs`
ينصّ على ذلك حرفياً.

⚠️ **لكن انتبه:** أي تحوّل مستقبلي إلى مصادقة بالكوكي يتطلب تغييراً **متزامناً على
الطرفين**: تفعيل `CookieCsrf:Enabled` **و** جعل الواجهة تجلب `GET /api/security/csrf-token`
ثم ترسل الرأس. تفعيل طرف واحد يكسر كل طلبات الكتابة صامتاً.

---

## 6. SignalR

- `signalr-notification.service.ts` يتصل بـ `environment.signalRUrl`.
- `accessTokenFactory: () => this.tokenStorage.getAccessToken() ?? ''` — **دالة تقرأ
  التوكن الحالي عند كل استدعاء**، لا قيمة ملتقطة مرة واحدة. هذا إصلاح مقصود وموثّق
  في الملف نفسه: القيمة الملتقطة تجعل إعادة الاتصال بعد التجديد تستخدم توكناً منتهياً.
- الحدث المستقبَل: `ReceiveNotification`.
- الخلفية تستخدم Redis backplane (‏`AddStackExchangeRedis`) — أي أن تعدد النسخ مدعوم.

---

## 7. التعريب والاتجاه

| البند | القيمة |
|---|---|
| الملفات | `public/i18n/ar.json` · `en.json` · `de.json` |
| عدد المفاتيح | **942 لكل ملف — تطابق تام** (مُحصاة بعد التسطيح) |
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

استخدام `@media (max-width: N)` الخام **ممنوع صراحةً** في `_breakpoints.scss`.

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

---

## 9. المسارات (43 مدخل `path:`)

| المجموعة | أمثلة | الحماية |
|---|---|---|
| عامة داخل `LayoutComponent` | `home` `wohnungen` `wohnungen/:id` `properties/:id` `kontakt` `reviews` `users/:id` **`pricing`** **`not-authorized`** `offline` | — |
| محمية بـ `AuthGuard` | `my-listings` `property-form` `properties/edit/:id` `favorites` `saved-searches` `notifications` `visits` `analytics` `profile` `messages/:propertyId` | 🔒 |
| إدارية بـ `AdminGuard` | `admin/messages` `admin/messages/:id` `admin/users` `admin/location-suggestions` | 🔒👑 |
| مصادقة | `login` `auth/login` `auth/send-otp` `auth/verify-otp` وبقية تدفقات الهاتف والبريد | — |
| خارج التخطيط | `landing` `language` | — |
| الشامل | `**` → `home` | — |

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

---

## 11. الأوامر والبوابات

```bash
npm run typecheck        # tsc --noEmit على tsconfig.app.json
npm run audit:frontend   # يفشل عند mojibake أو نمط سرّ مكشوف
npm run build:prod
npm run postmerge:verify # check:env + audit + typecheck + build:prod — البوابة الكاملة
```

**`audit:frontend` يفحص:**
1. **mojibake** — حرج هنا لأن المحتوى عربي كثيف؛ شغّله قبل أي التزام.
2. ثلاثة أنماط غير آمنة: تجاوز تعقيم HTML عبر `DomSanitizer`، والربط المباشر
   بخاصية HTML الداخلية للعنصر (بالقالب أو بالإسناد)، وأي مفتاح سرّي مكشوف
   متبوع بسلسلة ≥ 8 أحرف.
3. تحذير دائم: `strict: false` في `tsconfig.json`.

⚠️ **الفاحص لا يميّز الشرح عن الاستخدام:** أي ملف — بما فيه ملفات التوثيق — يطابق
تلك التعابير النمطية يُسقط الفحص. لذلك تُوصَف هذه الأنماط هنا بالكلمات لا بصيغتها
الحرفية. هذا سلوك مقصود من الفاحص (بسيط ومتشدّد) ولا يُعالَج بإضعافه.

**إخفاقان قائمان معروفان** (سابقان لأي عمل حديث): تحذير `strict: false`،
و`REGISTER_ERROR_DIAGNOSIS.md` يطابق نمط «سرّ محتمل».

**ميزانية الحزمة:** الحدّ 500 kB والواقع **593.36 kB** ⇒ تحذير دائم في كل بناء.

**الاختبار اليدوي:** `docs/RESPONSIVE-MANUAL-TEST-MATRIX.md` — ثلاثة عروض بالضبط
(‏375 / 768 / 1440)، صفر تمرير أفقي، صفر هدف لمس < 44×44px، دورة RTL ودورة LTR،
الوضعان الفاتح والداكن.

---

## 12. ما لم يُبنَ بعد (قائمة صادقة)

| البند | الحالة | الدليل |
|---|---|---|
| **Service Worker / PWA** | ❌ **غير مُفعَّل** | `@angular/service-worker` مثبَّت و`ngsw-config.json` موجود، لكن **لا `provideServiceWorker` في `app.config.ts` ولا مدخل `serviceWorker` في `angular.json`** — الإعداد يتيم، وصفحة `/offline` بلا آلية تخزين تسندها |
| **تغطية الاختبارات** | ⚠️ 6 ملفات فقط | كلها لـ `core/`؛ **صفر اختبار تحت `features/`** رغم 19 ميزة |
| **`strict: false`** | ⚠️ مفتوح | `tsconfig.strict.json` جاهز و`typecheck:strict` موجود — لم يُفعَّل بعد |
| **حجم الحزمة** | ⚠️ +93 kB فوق الميزانية | 593.36 kB مقابل حدّ 500 kB |
| **الاشتراكات/الدفع** | ❌ غير مبنيّ في الطرفين | صفحة `/pricing` تعرض خططاً؛ لا `PlansController` ولا بوابة دفع |
| **دورة صلاحية الإعلان المجاني** | ✅ **مبنيَّة** (2026-08-23) | عمود `ExpiresAt` + `ListingExpiryHostedService` + إشعارا `ListingExpiringSoon`/`ListingExpired` + حدّ إعلان واحد + رسوم تمديد. التفاصيل في `PropertyApi-REFERENCE.md §9.1` |
| **بوابة الدفع لرسوم التمديد** | ❌ غير موجودة | رسوم التمديد تُسجَّل `Pending` ولا تُسوّى إلا بتأكيد إداري يدوي. لا Stripe/PayTabs/Paymob |
| **الظهور المميز** | ❌ حقلان ميتان | `Property.IsFeatured` و`FeaturedUntil` معرَّفان (‏`Property.cs:210-211`) وفهرس واحد — **لا كود يقرؤهما أو يكتبهما** |
| **الوكالات / مقاعد الوكلاء والموظفين** | ❌ غير موجود في الدومين | `Property.AgentId` مفتاح مفرد إلى `UserAccount`، لا مكتب متعدد. `عقار-تيك §9` يوجب Design Spike مستقلاً أولاً |
| **إشعارات الدفع (FCM)** | ❌ غير مبنيّ | صفر مراجع في الخلفية |
| **فيديو للعقارات** | ❌ غير مبنيّ | صفر مراجع في الدومين/التطبيق |
| **تخزين الـ refresh token** | ⚠️ مفتوح | `sessionStorage` لا `HttpOnly` — §4 |

---

## 13. قواعد ملزمة عند التطوير

1. **`OnPush` + `signal()`** في كل مكوّن جديد. لا استثناء.
2. **`inject()`** لا حقن بالمُنشئ.
3. **`takeUntilDestroyed(this.destroyRef)`** على كل `subscribe`.
4. **`*ngIf` / `*ngFor` + `CommonModule`** — بنية `@if`/`@for` غير مستخدمة في المشروع
   كله؛ لا تُدخلها في ملف واحد وتترك الباقي.
5. **كل نص مفتاح i18n** في الملفات الثلاثة معاً.
6. **كل لون `var(--token)`** — لا ألوان حرفية.
7. **`bp.mobile/tablet/desktop`** — لا `@media` خام.
8. **`apiToCamelCase()`** في كل خدمة API جديدة.
9. **لا `catchError` في الخدمات** — الأخطاء إلى `ApiErrorInterceptor`.
10. **الوجهات تبقى في الواجهة** — لا تدع الخادم يسلّم رابطاً للتنقل إليه
    (سطح open-redirect بلا مقابل).
11. **شغّل `audit:frontend` قبل الالتزام** — mojibake يمرّ من العين ولا يمرّ منه.

---

## 14. ملفات مرجعية ذات صلة

| الملف | الدور | الحالة |
|---|---|---|
| `FRONTEND_BACKEND_CONTRACT.md` | عقد الواجهة/الخلفية — §11 يوثّق الاشتراكات كعقد مخطَّط | ✅ محدَّث |
| `docs/RESPONSIVE-MANUAL-TEST-MATRIX.md` | مصفوفة الاختبار اليدوي الإلزامية | ✅ ساري |
| `docs/UI-RELEASE-GATE.md` | بوابة الإصدار | ✅ ساري |
| `docs/SUBSCRIPTION-PAGE-REPORT-AR.md` | تقرير صفحة الاشتراكات | ✅ محدَّث 2026-08-23 |
| `docs/PropertyApi-REFERENCE.md` | المرجع المعماري للخلفية | ✅ محدَّث v5 |
| `PROJECT-REFERENCE.md` (في `Downloads`) | مرجع عام قديم (‏2026-06-18) | ⚠️ **متجاوَز جزئياً** — هذا الملف يَحُلّ محلّ قسمه الخاص بالواجهة |
| `REGISTER_ERROR_DIAGNOSIS.md` | تشخيص قديم يوجّه لأوامر SQL Server | ❌ **خاطئ** — قاعدة البيانات PostgreSQL |
| `DATABASE_SCHEMA.md` (في `Downloads`) | يصف SQL Server | ❌ **خاطئ** — PostgreSQL + PostGIS |

---

*كُتب من فحص ثابت مباشر للمصدرين معاً في 2026-08-23. كل بند لم يُتحقَّق منه بالشيفرة
مُعلَّم صراحةً؛ لا شيء هنا منقول عن وثيقة سابقة دون إعادة تحقّق.*
