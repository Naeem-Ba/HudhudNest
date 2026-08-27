# البنية الهيكلية للمشروع — عقار تيك / Bizorealestateworld

> **الغرض:** خريطة واحدة للمشروع كلّه — أين يعيش كل شيء، ولماذا هناك، وما الحدود التي
> لا تُعبَر. هذا الملف يجيب عن سؤال «أين أضع هذا الملف؟» قبل أن تكتبه.
> **آخر تحديث:** 2026-08-26
> **مصدر التحقّق:** إحصاء مباشر لشجرتَي المصدر — الواجهة عند `730af55`، الخلفية عند
> `3cadb4b` — مسنوداً بتشغيل فعلي لبناء الخلفية (`dotnet build -c Release`، 0 تحذير) وبوابة
> `audit:frontend` (تمرّ) في هذه الجلسة.
> **الوثائق الشقيقة:** `FRONTEND-REFERENCE.md` (تفصيل الواجهة) ·
> `PropertyApi-REFERENCE.md` (تفصيل الخلفية) · `BACKEND-ISSUES.md` (عيوب الخلفية المفتوحة).

---

## 1. أول ما يجب معرفته: **مستودعان منفصلان، لا مجلّدان**

```
C:\Users\naeem\
├── OneDrive\Desktop\Notiz\WohnungsApp\Wohnungsmieten\   ← الواجهة  (Angular 20)
│                                                          فرع افتراضي: main
│                                                          فرع حالي: feat/listing-eligibility-gates
└── Source\Repos\PropertyApi\                            ← الخلفية  (.NET 8)
                                                           فرع افتراضي: master
                                                           فرع حالي: master (HEAD 3cadb4b)
```

⚠️ **الفرعان الافتراضيان مختلفا الاسم** — `main` في الواجهة و`master` في الخلفية.

**لا أحدهما مجلّد فرعي في الآخر، ولا يشتركان في تاريخ Git.** أي مهمة تلمس عقد الاتصال
بينهما تتطلّب فتح المستودعين معاً.

**لا يوجد مستودع ثالث**: العقد بين الطرفين **موثَّق يدوياً** في
`FRONTEND_BACKEND_CONTRACT.md` ويُطبَّق يدوياً في `core/api/`. نقطة الاختناق الوحيدة
لتحويل التسمية هي `api-naming.adapter.ts` (§4.3).

---

## 2. مخطّط النظام كاملاً

```
┌──────────────────────────────────────────────────────────────────────┐
│  العميل                                                              │
│  ┌────────────────┐   ┌──────────────────┐   ┌──────────────────┐   │
│  │  متصفّح (PWA*)  │   │  Android (Cap 8) │   │   iOS (Cap 8)    │   │
│  └────────┬───────┘   └────────┬─────────┘   └────────┬─────────┘   │
│           └────────────────────┴──────────────────────┘             │
│                          حزمة Angular واحدة                          │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
   HTTPS (Bearer + كوكي refresh_token HttpOnly)   │   WebSocket (SignalR)
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│  موازِن حِمل  →  عدّة نسخ من PropertyApi (.NET 8)                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ PropertyApi            (Controllers · Middleware · Security)   │  │
│  │ PropertyApi.Application (Commands · Queries · DTOs)  ← MediatR │  │
│  │ PropertyApi.Domain      (Entities · Policies)   لا تبعيات      │  │
│  │ PropertyApi.Infrastructure (EF · Identity · Jobs · Media)      │  │
│  └────────────────────────────────────────────────────────────────┘  │
└───────┬───────────────┬──────────────────┬──────────────┬────────────┘
        │               │                  │              │
   PostgreSQL 16     Redis            Cloudinary EU     Twilio
   + PostGIS      (cache · rate      (صور العقارات      (رسائل OTP)
   (Supabase)      limit · SignalR    والشعارات)
                   backplane)

* PWA غير مُفعَّلة فعلياً — الإعداد موجود والتسجيل غائب. انظر FRONTEND-REFERENCE §12.
```

⚠️ **نقطتان معماريتان يجب أن تُقرآ من هذا المخطّط:**

1. «عدّة نسخ» حقيقية — مجموعة اختبارات الأداء تشترط وصول الحركة إلى نسختين. Redis يجعل
   SignalR يعمل عبر النسخ، و**أربعاً من خمس مهام مجدولة حقيقية** صارت تستخدم قفلاً
   استشارياً في PostgreSQL (`BackgroundJobLock`) لمنع السباق بين النسخ — تحسّن جوهري عن
   المراجعات السابقة. الاستثناء الباقي: `SecurityAlertBackgroundService` (‏`BACKEND-ISSUES.md`
   **B-6b**).
2. كوكي `refresh_token` صار `HttpOnly` + `SameSite=None` — لازم لأن الواجهة والخلفية
   أصلان مختلفان حتى محلياً — لكن هذا فتح اعتباراً أمنياً جديداً موثَّقاً في
   `BACKEND-ISSUES.md` **B-18**: CSRF ما زالت مطفأة افتراضياً بينما صار كوكي مصادقة
   حقيقياً يُرسَل عبر المواقع.

---

## 3. الخلفية — `PropertyApi` (‏.NET 8، Modular Monolith)

### 3.1 المشاريع الأربعة واتجاه التبعية

```
PropertyApi              ──►  PropertyApi.Application  ──►  PropertyApi.Domain
      │                              ▲                            ▲
      └──────────────────────────────┴────────────────────────────┘
                     PropertyApi.Infrastructure
```

| المشروع | مسؤوليته | ما يُمنَع فيه |
|---|---|---|
| **`PropertyApi`** | HTTP فقط: Controllers (‏25)، Middleware، الأمان، `Program.cs` | لا منطق أعمال، ولا `AppDbContext` (‏3 استثناءات تشخيصية موثّقة) |
| **`PropertyApi.Application`** | الأوامر والاستعلامات (MediatR)، DTOs، الواجهات (Interfaces) | **صفر تبعية على البنية التحتية** — لا EF، ولا `Microsoft.Extensions.Options` |
| **`PropertyApi.Domain`** | الكيانات، الثوابت الأعمالية، قواعد السياسة | **صفر تبعيات خارجية إطلاقاً** |
| **`PropertyApi.Infrastructure`** | EF Core، Identity، Redis، Cloudinary، Twilio، المهام المجدولة، الأقفال الاستشارية | لا يعرفه أحد إلا `Program.cs` عند التركيب |

`APIDependencyGuardTests` يفرض هذا الاتجاه في البناء.

### 3.2 السياقات (Bounded Contexts) — الأسماء نفسها في الطبقات الثلاث

| السياق | Domain | Application | ملاحظات |
|---|---|---|---|
| `Listings` | ✅ | ✅ | العقارات، دورة الصلاحية، الرسوم، **حصّة المكتب الجديدة (`ListingQuotaPolicy`)** |
| `Users` | ✅ | ✅ | `UserAccount` (الدومين، ويحمل الآن `PlanId`) منفصل عن `ApplicationUser` (‏Identity) |
| `Agencies` | ✅ | ✅ | **صار قابلاً للتعديل والتعطيل** هذه الدورة (كان إنشاء فقط) |
| **`Plans`** | ✅ | ✅ | **جديد** — كتالوج خطط + اختيار صريح، **بلا** فوترة أو ربط بحدّ الإعلانات بعد |
| `Notifications` | ✅ | ✅ | يُنتَج ويُدفَع عبر SignalR |
| `Transactions` | ✅ | — | الرسوم؛ لا مجلّد Application خاص، الأوامر تحت `Listings` |
| `Reviews` · `Search` · `Bookings` · `Auth` · `Lookups` · `Messaging` · `Audit` | ✅ | جزئياً | `Bookings` قائم في الدومين ومحدود الاستخدام |
| `Common` | ✅ | ✅ | `AuditableEntity`، الاستثناءات، الواجهات المشتركة |

**قاعدة التسمية:** المجلّد نفسه بالاسم نفسه في `Domain` و`Application` و(عند اللزوم)
`Infrastructure`. ميزة جديدة (كما `Plans`) تعني ثلاثة مجلّدات بالاسم نفسه.

### 3.3 شكل أمر واحد من طرف إلى طرف — مثال محدَّث: إنشاء إعلان

```
POST /api/properties
  │
  ├─ PropertyApi/Controllers/PropertiesController.cs
  │    يقرأ هوية المستخدم من التوكن، لا من الجسم أبداً
  │
  ├─ Application/Listings/Commands/CreateProperty/CreatePropertyCommandHandler.cs
  │    1. EnsureContactConfirmedAsync()   ← 403 LISTING_CONTACT_NOT_CONFIRMED
  │    2. EnsurePlanSelected()            ← 403 LISTING_PLAN_REQUIRED
  │    3. CreateWithQuotaEnforcedAsync()
  │         ├─ _uow.BeginTransactionAsync()
  │         ├─ _uow.AcquireAdvisoryLockAsync(ListingQuotaLock.ForAgency|ForOwner)
  │         ├─ EnsureListingQuotaAvailableAsync()  ← يقرأ IListingQuotaPolicy
  │         ├─ Property.Create(...) + SetAgency() إن وُجد مكتب
  │         └─ _uow.CommitTransactionAsync()  (أو Rollback عند أي استثناء)
  │
  ├─ Domain/Listings/ListingLifecyclePolicy.cs      السعر والمدة والحدّ الفردي
  ├─ Infrastructure/Listings/ListingQuotaPolicy.cs  حدّ المكتب (config-driven، مؤقّت)
  │
  └─ 201 Created
```

**الأعراف المستخلَصة وتُطبَّق على كل أمر جديد يلمس مورداً محدود الكمّية:**

1. **هوية المستخدم من التوكن حصراً.**
2. **كل التحقق في المعالِج، لا في الـ Controller.**
3. **الفحوص الرخيصة قبل فتح المعاملة والقفل الاستشاري** — طلب سيُرفَض على أي حال لا
   يستحقّ قفلاً.
4. **قفل استشاري بنطاق معاملة (`pg_advisory_xact_lock`) لأي فحص "اقرأ ثم اكتب"** —
   `ListingQuotaLock` نمط يُقلَّد، لا حالة خاصة.
5. **السجلات الموضعية بالوسائط المسمّاة.**

### 3.4 خريطة `PropertyApi.Infrastructure`

| المجلّد | المحتوى |
|---|---|
| `Persistence/` | `AppDbContext` · `Configurations/` · `Seeds/` · `Migrations/` (‏29) · **`BackgroundJobLock.cs` / `BackgroundJobLockKeys.cs`** (‏جديد) |
| `Repositories/` | 14 مستودعاً، منها **`PlanRepository`** (‏جديد) |
| `Identity/` | `ApplicationUser` وخدمات Identity — معزولة خلف واجهات |
| `Listings/` | `ListingExpiryHostedService` (‏مقفلة الآن) · **`ListingQuotaPolicy.cs`** (‏جديد) |
| `Search/` | `SavedSearchMatchHostedService` (‏مقفلة الآن) |
| `Auth/Services/` | Console · Twilio · Http SMS؛ `OtpCleanupHostedService` و`PhoneVerificationHostedService` (‏مقفلتان الآن) |
| `Media/` | Cloudinary — لا يخرج SDK منها إلى أي طبقة أخرى |
| `Caching/` · `Hubs/` · `Email/` · `Health/` · `Security/` · `Performance/` | Redis · SignalR · التنبيهات (‏`SecurityAlertBackgroundService` — **غير مقفلة**، B-6b) · مدقّق الإقلاع · حماية البيانات · القياس |

### 3.5 المهام المجدولة (6) — القفل الاستشاري صار القاعدة، لا الاستثناء

| الخدمة | الدور | مقفلة بـ `BackgroundJobLock`؟ |
|---|---|---|
| `ListingExpiryHostedService` | كل 6 ساعات: تحذير ← انتهاء ← حذف ← إنهاء التمييز | ✅ |
| `SavedSearchMatchHostedService` | مطابقة البحوث المحفوظة وإشعار أصحابها | ✅ |
| `OtpCleanupHostedService` | تنظيف رموز OTP المنتهية | ✅ |
| `PhoneVerificationHostedService` | متابعة تحقّق الهاتف | ✅ |
| `SecurityAlertBackgroundService` | إرسال تنبيهات الأمان (طابور) | ❌ — `BACKEND-ISSUES.md` **B-6b** |
| `ProductionStartupValidator` | يتحقّق من إعدادات الإنتاج عند الإقلاع فقط — ليست مهمّة دورية | لا ينطبق |

### 3.6 اختبارات الخلفية (8 مشاريع)

| المشروع | يفرض ماذا |
|---|---|
| `Architecture.Tests` | حرّاس البناء — اتجاه التبعية، ترتيب الوسطاء، النقاط العامة، حدود المعدّل، Redis |
| `Application.Tests` | منطق المعالِجات والدومين، بما فيها `Agencies`/`Plans`/حصّة الإعلانات الجديدة |
| `Auth.Tests` | المصادقة والتوكن وOTP |
| `Integration.Tests` | مسارات كاملة مقابل قاعدة بيانات |
| `Concurrency.Tests` · `Observability.Tests` · `Performance.Tests` · `StagingSmokeTests` | كلٌّ لبُعده |

⚠️ **أعداد الحالات (‏516/588 في مراجعات سابقة) محمولة من تشغيل عند `293a5c1`، قبل
تغييرات هذه الدورة — لم يُعَد تشغيل `dotnet test` الكامل في هذه الجلسة.** `dotnet build
-c Release` عند `3cadb4b` نُفِّذ فعلياً هنا: **0 تحذير، 0 خطأ**، 59 ثانية.

> **بوابتان تفشلان البناء وليستا اختياريتين:** `PublicEndpointPolicyTests` و
> `APIDependencyGuardTests`. كلتاهما **قائمة سماح**، لا قاعدة عامة — `BACKEND-ISSUES.md`
> **B-7**.

---

## 4. الواجهة — `Wohnungsmieten` (‏Angular 20، Standalone)

### 4.1 الطبقات الأربع

```
src/app/
├── core/        ← لا مكوّنات مرئية إطلاقاً. المنطق والحالة والاتصال بالشبكة.
├── shared/      ← مكوّنات عرض بلا حالة، وموجّهات، وخدمات عرضية.
├── features/    ← ~20 ميزة. كل واحدة صفحة مُحمَّلة كسولاً (lazy).
└── admin/       ← 4 شاشات إدارية خلف AdminGuard.
    layout/ navbar/ profile/ pipes/ map-picker/ language-selector/
```

**القاعدة:** `features/` تعتمد على `core/` و`shared/`. **العكس ممنوع.**

### 4.2 داخل `core/` — الأدوار المحدَّثة

| المجلّد | العدد | الدور |
|---|---|---|
| `api/` | 19 | خدمة لكل مورد، منها `plans-api.service.ts` (‏تستهلك `GET /api/plans` الحقيقية الآن) |
| `models/` | 15 | الأنواع فقط |
| `services/` | 11 | حالة عرضية |
| `interceptors/` | 3 | إرفاق التوكن وتجديده (‏عبر كوكي الآن، لا جسم) · تحويل الأخطاء |
| `guards/` | **3** (‏كان 2) | `AuthGuard` · `AdminGuard` · **`ListingEligibilityGuard`** (‏جديد — يعكس بوابتَي الخلفية) |
| `adapters/` | 1 | `apiToCamelCase` |
| `auth/` | 2 | `auth.service.ts` + `token-storage.service.ts` (‏لم يعد يخزّن توكن التجديد في أي تخزين متصفّح) |

### 4.3 مسار طلب واحد من طرف إلى طرف — مثال محدَّث: إنشاء إعلان محمي بالأهلية

```
PropertyFormPage (features/property-form)
   │  canActivate: [AuthGuard, ListingEligibilityGuard]
   ▼
ListingEligibilityGuard (core/guards)
   │  ProfileService.getMe() — يجلب الملف طازجاً، لا من ذاكرة مؤقّتة
   │  isEligibleForListing(profile)? وإلا يوجّه إلى /pricing أو /profile حسب البوابة الناقصة
   ▼
                   ══ عند النجاح فقط ══
   ▼
PropertyApiService.create(...)  →  POST /api/properties
   │  الخلفية تُعيد فحص الأهلية بنفسها — الحارس تجميلي لتحسين التجربة، لا الحماية الفعلية
```

**عرف مُلزِم جديد يوضّحه هذا المسار:** أي حارس واجهة يعكس قاعدة عمل من الخلفية **يجب أن
يقول ذلك صراحةً في تعليقه** (كما فعل `ListingEligibilityGuard`) — الخلفية تبقى مصدر
الحقيقة دائماً، والحارس تحسين تجربة لا بديلاً عن 403.

### 4.4 نظاما التنسيق — كلاهما مقصود، بلا تغيير هذه الدورة

| النظام | الملف الجذر | يستخدمه |
|---|---|---|
| SCSS خام + متغيرات CSS | `src/styles.scss` | معظم الصفحات |
| Tailwind v4 | `src/tailwind.css` | `checkout` فقط حتى هذه المراجعة |

### 4.5 المحمول

```
capacitor.config.ts   →  webDir: dist/Wohnungsmieten/browser
android/              →  مشروع Android Studio مولَّد
resources/            →  الأيقونات وشاشات البدء
tools/                →  setup-ios.mjs · validate-ios-config.mjs · check-environments.mjs
                         · frontend-audit-guard.mjs  ← بوابة ما قبل الالتزام، **مؤكَّدة تمرّ فعلياً هذه الجلسة**
```

مجلّد `ios/` **يُولَّد عند الطلب** بـ `npm run ios:setup` ولا يُلتزَم به.

⚠️ **تصحيح ميزانية الحزمة:** المراجعات حتى v7 كرّرت رقم «500 kB» كحدّ. الحدّ الفعلي في
`angular.json` هو **`maximumWarning: 650kB` / `maximumError: 1MB`**. القياس الفعلي في
هذه الجلسة: **596.90 kB خام (‏159.10 kB منقول)** — **داخل** الحدّ، بلا أي تحذير بناء.
الرقم القديم لم يكن يوماً موجوداً في هذا الملف؛ من كتبه قرأ مصدراً آخر أو افترضه.

---

## 5. الحدود التي لا تُعبَر — ملخّص تنفيذي

| الحدّ | ما يفرضه |
|---|---|
| `Domain` لا يعرف شيئاً | صفر تبعيات خارجية. |
| `Application` لا يعرف البنية التحتية | لا EF، لا Redis، لا `IOptions` — **باستثناء موثَّق واحد:** `ListingQuotaOptions` تُقرأ عبر `IListingQuotaPolicy` في `Infrastructure`، فتبقى `Application` نظيفة والاستثناء في الطبقة الصحيحة. |
| الـ Controller لا يفكّر | ترجمة HTTP ↔ MediatR فقط. |
| `Cloudinary` حبيس `Infrastructure/Media` | SDK لا يظهر في أي طبقة أخرى. |
| `features/` لا تُستورَد من `features/` | المشترك يصعد إلى `core/` أو `shared/`. |
| `core/api` لا تعرض نقطة إدارية | ما يمنح امتيازاً مالياً أو إدارياً يبقى خارج شيفرة العميل. |
| هوية المستخدم من التوكن | لا تُقرأ من جسم الطلب في أي أمر. |
| فحوصات الأهلية قبل القفل | لا يُستحوَذ قفل استشاري لطلب سيُرفَض بفحص أرخص أولاً. |
| كل نص مفتاح i18n | في `ar.json` و`en.json` و`de.json` معاً. |

---

## 6. أين أضع الملف الجديد؟ — جدول قرار سريع

| ما تبنيه | أين |
|---|---|
| نقطة نهاية جديدة | `PropertyApi/Controllers/` + أمر/استعلام في `Application/{Context}/` |
| قاعدة أعمال أو ثابت تجاري ثابت | `Domain/{Context}/` — لا `appsettings` |
| قيمة تشغيلية قابلة للضبط دون هجرة (كحدّ حصّة مؤقّت) | `IOptions` في `Infrastructure/{Context}/`، خلف واجهة في `Application` — انظر نمط `ListingQuotaPolicy` |
| استعلام قاعدة بيانات | واجهة في `Application/{Context}/Interfaces/` + تنفيذ في `Infrastructure/Repositories/` |
| مهمة مجدولة | `Infrastructure/{Context}/` + `AddHostedService` **+ `BackgroundJobLock` من أول يوم** |
| فحص «اقرأ ثم اكتب» على مورد محدود | قفل استشاري بنطاق معاملة — انسخ نمط `ListingQuotaLock`، لا تخترع قفلاً جديداً |
| صفحة جديدة في التطبيق | `src/app/features/{name}/` + مدخل في `app.routes.ts` |
| حارس مسار يعكس قاعدة خلفية | `src/app/core/guards/` — وثّق في التعليق أن الخلفية تبقى مصدر الحقيقة |
| نداء API جديد | `src/app/core/api/{resource}.service.ts` + نوع في `core/models/` |
| نص ظاهر للمستخدم | مفتاح في ملفات i18n الثلاثة |

---

## 7. الأوامر — الطرفان

### الواجهة

```bash
npm run typecheck         # فحص الأنواع — يمرّ (مُتحقَّق هذه الجلسة)
npm run audit:frontend    # بوابة ما قبل الالتزام — تمرّ (مُشغَّلة فعلياً هذه الجلسة)
npm run build:prod        # 596.90 kB خام — داخل حدّ 650 kB (مُتحقَّق هذه الجلسة)
npm run postmerge:verify  # البوابة الكاملة
```

### الخلفية

```bash
dotnet build PropertyApi.sln -c Release   # 0 تحذير، 0 خطأ (مُتحقَّق هذه الجلسة، 59 ثانية)
dotnet test PropertyApi.sln
dotnet ef migrations add <Name> --project PropertyApi.Infrastructure --startup-project PropertyApi
```

> ⚠️ سكربتات هذا المشروع تعمل على **PowerShell**: لا `&&` ولا `||`. استخدم `-and`
> و`-or` و`$?`.

---

## 8. الوثائق — أيّها يُصدَّق

| الملف | الحالة |
|---|---|
| `docs/PROJECT-STRUCTURE.md` (هذا) | ✅ 2026-08-26 |
| `docs/FRONTEND-REFERENCE.md` | ✅ محدَّث 2026-08-26 |
| `docs/PropertyApi-REFERENCE.md` | ✅ v8 — 2026-08-26 |
| `docs/BACKEND-ISSUES.md` | ✅ v3 — 2026-08-26 |
| `FRONTEND_BACKEND_CONTRACT.md` | ⚠️ لم يُعَد فحصه في هذه الدورة — يحتاج مراجعة مقابل `/plans` الحقيقية الآن |
| `DATABASE_SCHEMA.md` (‏`Downloads`) · `REGISTER_ERROR_DIAGNOSIS.md` | ❌ **خاطئان** — يصفان SQL Server، وقاعدة البيانات PostgreSQL + PostGIS |

**نسخ متطابقة في مستودعين:** توجد نسخة من هذا الملف وثلاثة أخرى في
`C:\Users\naeem\Source\Repos\PropertyApi\docs\` أيضاً (‏مستودع الخلفية) — **تُحدَّث
معاً**. النسخة المنحرفة هي بالضبط العطل الذي وُجدت هذه الوثائق لعلاجه.

---

*كُتب من إحصاء مباشر لشجرتَي المصدر في 2026-08-26 (الواجهة `730af55`، الخلفية `3cadb4b`)،
مسنوداً ببناء فعلي للخلفية (‏0 تحذير) وتشغيل فعلي لبوابة `audit:frontend` (‏تمرّ) وقياس
فعلي لحزمة الإنتاج في هذه الجلسة. `dotnet test`/`ng test` الكاملان لم يُعادا تشغيلهما —
مُعلَّم صراحةً حيث ورد. الأرقام الأخرى مقيسة لا منقولة.*
