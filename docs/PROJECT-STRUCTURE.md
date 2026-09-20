# البنية الهيكلية للمشروع — عقار تيك / Bizorealestateworld

> **الغرض:** خريطة واحدة للمشروع كلّه — أين يعيش كل شيء، ولماذا هناك، وما الحدود التي
> لا تُعبَر. هذا الملف يجيب عن سؤال «أين أضع هذا الملف؟» قبل أن تكتبه.
> **آخر تحديث:** 2026-08-27
> **مصدر التحقّق:** إحصاء مباشر لشجرتَي المصدر — الواجهة عند `e64daeb`، الخلفية عند
> `a151424` — مسنوداً بتشغيل فعلي لبناء الخلفية (`dotnet build -c Release`، 0 تحذير،
> 35 ثانية)، خمسة مشاريع اختبار خلفية سريعة (‏679/679 ناجحة)، وبوابات الواجهة الثلاث
> (`typecheck`/`audit:frontend`/`build:prod`) في هذه الجلسة.
> **الوثائق الشقيقة:** `FRONTEND-REFERENCE.md` (تفصيل الواجهة) ·
> `PropertyApi-REFERENCE.md` (تفصيل الخلفية) · `BACKEND-ISSUES.md` (عيوب الخلفية
> المفتوحة — بند واحد فقط الآن، لكنه الأخطر في تاريخ هذا الملف).

---

## 1. أول ما يجب معرفته: **مستودعان منفصلان، لا مجلّدان**

```
C:\Users\naeem\
├── OneDrive\Desktop\Notiz\WohnungsApp\Wohnungsmieten\   ← الواجهة  (Angular 20)
│                                                          فرع افتراضي: main
│                                                          فرع حالي: feat/listing-eligibility-gates
│                                                          (HEAD e64daeb)
└── Source\Repos\PropertyApi\                            ← الخلفية  (.NET 8)
                                                           فرع افتراضي: master
                                                           فرع حالي: master (HEAD a151424)
```

⚠️ **الفرعان الافتراضيان مختلفا الاسم** — `main` في الواجهة و`master` في الخلفية.

**لا أحدهما مجلّد فرعي في الآخر، ولا يشتركان في تاريخ Git.** أي مهمة تلمس عقد الاتصال
بينهما تتطلّب فتح المستودعين معاً — وهذه المراجعة تحديداً هي مثال حيّ على السبب: بند
`BACKEND-ISSUES.md` **B-20** لا يمكن اكتشافه من فحص أيّ من المستودعين بمفرده، بل من
قراءة الوسيط في الخلفية ومُعترِضات التوكن في الواجهة **معاً**.

**لا يوجد مستودع ثالث**: العقد بين الطرفين **موثَّق يدوياً** في
`FRONTEND_BACKEND_CONTRACT.md` (‏لم تُفحَص هذه الجلسة — يحتاج مراجعة، انظر §8) ويُطبَّق
يدوياً في `core/api/`. نقطة الاختناق الوحيدة لتحويل التسمية هي `api-naming.adapter.ts`.

⚠️ **الواجهة قيد تعديل نشط أثناء هذه المراجعة نفسها:** لوحظت تغييرات غير مُلتزَمة في
`Wohnungsmieten` أثناء الفحص الأولي لهذه الجلسة (‏حقول i18n ونموذج الإعلان)، ثم
اختفت — التُزمت كـ `e64daeb` قبل أن تكتمل هذه المراجعة. **هذا يعني أن جلسة تطوير أخرى
كانت نشطة بالتوازي مع هذا التحليل.** كل رقم في هذا الملف مأخوذ من الحالة الملتزَمة عند
`e64daeb` تحديداً، لا من أي حالة عمل غير ملتزَمة قد تظهر لاحقاً.

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
│  │ PropertyApi            (Controllers · Configuration · Security)│  │
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

* PWA غير مُفعَّلة فعلياً رغم أن @angular/service-worker صار تبعية في package.json —
  provideServiceWorker غائب من app.config.ts. انظر FRONTEND-REFERENCE §12.
```

⚠️ **ثلاث نقاط معماريتان يجب أن تُقرآ من هذا المخطّط:**

1. «عدّة نسخ» حقيقية — مجموعة اختبارات الأداء تشترط وصول الحركة إلى نسختين. **أربعة
   من خمس مهام مجدولة حقيقية** تستخدم قفلاً استشارياً في PostgreSQL
   (`BackgroundJobLock`) لمنع السباق بين النسخ؛ الخامسة (`SecurityAlertBackgroundService`)
   **مُستبعَدة عمداً بقرار موثَّق ومُختبَر** (‏مستهلكة طابور داخل العملية، لا كاسحة
   دورية — `BACKEND-ISSUES.md` B-6b مغلق بهذا التفسير، لا بإضافة قفل).
2. كوكي `refresh_token` صار `HttpOnly` + `SameSite=None` — ضروري لأن الواجهة والخلفية
   أصلان مختلفان حتى محلياً. **الخلفية فعّلت الآن حماية CSRF فعلياً**
   (`CookieCsrf:Enabled=true` في `appsettings.json` الأساسي) — لكن **لا شيء في الواجهة
   يرسل الرأس المطلوب لتلك الحماية**. النتيجة الفعلية، لا النظرية: أي متصفّح حقيقي
   يفشل تجديد جلسته كل ~30 دقيقة على النشر الحالي لكلا المستودعين معاً. هذا هو البند
   المفتوح الوحيد في `BACKEND-ISSUES.md` (‏**B-20**) — وهو الأخطر الذي وثّقته هذه
   السلسلة من المراجعات حتى الآن. التفصيل الكامل في §5 وفي `BACKEND-ISSUES.md`.
3. ~~تنسيق نشر ناقص عبر المستودعين (`OwnershipType`/`AreaUnit`/`FurnishingStatus`)~~ **مُغلق** —
   `405e23e` مدموج في `master` الخلفية؛ التفاصيل في `FRONTEND-REFERENCE.md` §3.4.

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
| **`PropertyApi`** | HTTP فقط: Controllers (‏25)، `Configuration/` (‏جديد — جذر التركيب)، الأمان، `Program.cs` (‏205 سطراً، كان 713) | لا منطق أعمال، ولا `AppDbContext` (‏3 استثناءات تشخيصية موثّقة) |
| **`PropertyApi.Application`** | الأوامر والاستعلامات (MediatR)، DTOs، الواجهات (Interfaces) | **صفر تبعية على البنية التحتية** — لا EF، ولا `Microsoft.Extensions.Options` |
| **`PropertyApi.Domain`** | الكيانات، الثوابت الأعمالية، قواعد السياسة | **صفر تبعيات خارجية إطلاقاً** |
| **`PropertyApi.Infrastructure`** | EF Core، Identity، Redis، Cloudinary، Twilio، المهام المجدولة، الأقفال الاستشارية | لا يعرفه أحد إلا `Program.cs` عند التركيب |

`APIDependencyGuardTests` يفرض هذا الاتجاه في البناء — ضمن 108/108 اختباراً في
`Architecture.Tests`، مُعاد تشغيلها فعلياً هذه الجلسة.

### 3.1.1 `PropertyApi/Configuration/` — جديد هذه الدورة، جذر تركيب حقيقي لا مجرّد تجميع

`Program.cs` كان قد كبر إلى 713 سطراً بامتصاص كل تصلّب أمني مرّ به المشروع. هذه الدورة
استخرجت كل اهتمام مستقل إلى ملف باسمه في `PropertyApi/Configuration/`:
`CorsRegistration` · `DatabaseSeedingExtensions` · `JwtAuthenticationRegistration` ·
`RateLimitingRegistration` · `RedisConnectionResolver` · `SignalRRegistration` ·
`SwaggerRegistration` — تنضمّ إلى ثلاثة كانت موجودة أصلاً هناك
(`ForwardedHeadersRegistration` · `OutputCacheRegistration` · `StagingEnvironmentGuard`).
`Program.cs` صار 205 سطراً، يُقرأ كقائمة خطوات مُسمّاة بالترتيب. **خط أنابيب الوسطاء
نفسه بقي داخل الملف وبترتيبه الأصلي عمداً** — `MiddlewareOrderGuardTests` يُثبِّت
الترتيب الفعلي في هذا الملف بالذات كالقاعدة الحقيقية، وتجميعه في استدعاء واحد كان
سيُفرِغ ذلك الاختبار من معناه. **بلا تغيير سلوكي** — `dotnet build` نظيف ومُعاد
التحقّق منه هذه الجلسة.

### 3.2 السياقات (Bounded Contexts) — الأسماء نفسها في الطبقات الثلاث

| السياق | Domain | Application | ملاحظات |
|---|---|---|---|
| `Listings` | ✅ | ✅ | العقارات، دورة الصلاحية، الرسوم، حصّة صارت **مُشتقّة من الخطة المختارة فعلياً** (‏`Plan.ListingLimit`) لا ثابتاً |
| `Users` | ✅ | ✅ | `UserAccount` (الدومين، يحمل `PlanId`) منفصل عن `ApplicationUser` (‏Identity) |
| `Agencies` | ✅ | ✅ | **دورة حياة كاملة الآن**: إنشاء، تعديل، تعطيل، **نقل ملكية** (‏جديد)، **رفع شعار** (‏جديد)، وعضوية **قائمة على دعوة وموافقة** (‏جديد، محلّ الإضافة المباشرة) |
| `Plans` | ✅ | ✅ | كتالوج خطط + اختيار صريح، **صار الآن يقود حصّة الإعلانات فعلياً** — لا مجرّد تسجيل بلا أثر |
| `Notifications` | ✅ | ✅ | يُنتَج ويُدفَع عبر SignalR |
| `Transactions` | ✅ | — | الرسوم؛ لا مجلّد Application خاص، الأوامر تحت `Listings`. **تزامن تفاؤلي (`xmin`) جديد على `Transaction`** يحمي تأكيد الدفع من سباق مديرَين |
| `Reviews` · `Search` · `Bookings` · `Auth` · `Lookups` · `Messaging` · `Audit` | ✅ | جزئياً | `Bookings` قائم في الدومين ومحدود الاستخدام |
| `Common` | ✅ | ✅ | `AuditableEntity`، الاستثناءات، الواجهات المشتركة |

**قاعدة التسمية:** المجلّد نفسه بالاسم نفسه في `Domain` و`Application` و(عند اللزوم)
`Infrastructure`. ميزة جديدة تعني ثلاثة مجلّدات بالاسم نفسه.

### 3.3 شكل أمر واحد من طرف إلى طرف — مثال محدَّث: إنشاء إعلان (‏بلا تغيير جوهري هذه الدورة)

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
  │         ├─ EnsureListingQuotaAvailableAsync()  ← IListingQuotaPolicy
  │         │      يقرأ الآن UserAccount.PlanId → Plan.ListingLimit مباشرة
  │         ├─ Property.Create(...) + SetAgency() إن وُجد مكتب
  │         └─ _uow.CommitTransactionAsync()  (أو Rollback عند أي استثناء)
  │
  ├─ Domain/Listings/ListingLifecyclePolicy.cs      المدّة والرسوم (‏لا الحدّ — انظر أعلاه)
  ├─ Domain/Plans/Entities/Plan.cs                  ListingLimit — مصدر الحقيقة للحدّ الآن
  │
  └─ 201 Created
```

**مثال أمر جديد كلياً هذه الدورة: قبول دعوة مكتب**

```
POST /api/agencies/invitations/{invitationId}/accept
  │
  ├─ Controllers/AgenciesController.cs
  ├─ Application/Agencies/Commands/AcceptAgencyInvitation/AcceptAgencyInvitationCommandHandler.cs
  │    ├─ يتحقّق أن المستدعي هو المدعوّ نفسه، لا أي مستخدم آخر
  │    ├─ Infrastructure/Agencies/AgencyInvitationLock.cs  ← قفل استشاري بنطاق معاملة
  │    ├─ يمنع: قبول مزدوج، قبول بعد رفض، قبول بعد انتهاء الصلاحية، انضمام لمكتبين
  │    └─ UserAccount.JoinAgency(...)  ← المسار الوحيد الذي يمنح العضوية فعلياً
  │
  └─ 200 OK
```

**الأعراف المستخلَصة وتُطبَّق على كل أمر جديد يلمس مورداً محدود الكمّية أو حالة
انتقالية:**

1. **هوية المستخدم من التوكن حصراً.**
2. **كل التحقق في المعالِج، لا في الـ Controller.**
3. **الفحوص الرخيصة قبل فتح المعاملة والقفل الاستشاري.**
4. **قفل استشاري بنطاق معاملة لأي فحص "اقرأ ثم اكتب" أو انتقال حالة** —
   `ListingQuotaLock` و`AgencyInvitationLock` نمط يُقلَّد، لا حالات خاصة.
5. **السجلات الموضعية بالوسائط المسمّاة.**
6. **مهمة مجدولة جديدة تستخدم `BackgroundJobLock` من أول يوم — إلا إذا كانت مستهلكة
   طابور داخل العملية فعلاً، وحينها وثِّق ذلك صراحة كما فعل `SecurityAlertBackgroundService`.**

### 3.4 خريطة `PropertyApi.Infrastructure`

| المجلّد | المحتوى |
|---|---|
| `Persistence/` | `AppDbContext` · `Configurations/` (‏`xmin` الآن على `Property`+`Transaction`+`UserAccount`) · `Seeds/` · `Migrations/` (‏**32**، كانت 29) · `BackgroundJobLock.cs` / `BackgroundJobLockKeys.cs` |
| `Repositories/` | 14 مستودعاً، منها `PlanRepository` |
| `Identity/` | `ApplicationUser` وخدمات Identity — معزولة خلف واجهات |
| `Listings/` | `ListingExpiryHostedService` (‏مقفلة) · `ListingQuotaPolicy.cs` (‏يقرأ `Plan.ListingLimit` الآن، لا `appsettings`) |
| `Agencies/` | **`AgencyInvitationLock.cs`** (‏جديد) |
| `Search/` | `SavedSearchMatchHostedService` (‏مقفلة) |
| `Auth/Services/` | Console · Twilio · Http SMS؛ `OtpCleanupHostedService` و`PhoneVerificationHostedService` (‏مقفلتان) |
| `Media/` | Cloudinary — لا يخرج SDK منها إلى أي طبقة أخرى |
| `Caching/` · `Hubs/` · `Email/` · `Health/` · `Security/` · `Performance/` | Redis · SignalR · التنبيهات (‏`SecurityAlertBackgroundService` — **مُستبعاة عمداً وموثَّقة**، لا «غير مقفلة» بلا تفسير) · مدقّق الإقلاع · حماية البيانات · القياس |

### 3.5 المهام المجدولة (6) — الاستثناء الوحيد أصبح قراراً مُثبَّتاً باختبار

| الخدمة | الدور | مقفلة بـ `BackgroundJobLock`؟ |
|---|---|---|
| `ListingExpiryHostedService` | كل 6 ساعات: تحذير ← انتهاء ← حذف ← إنهاء التمييز | ✅ |
| `SavedSearchMatchHostedService` | مطابقة البحوث المحفوظة وإشعار أصحابها | ✅ |
| `OtpCleanupHostedService` | تنظيف رموز OTP المنتهية | ✅ |
| `PhoneVerificationHostedService` | متابعة تحقّق الهاتف | ✅ |
| `SecurityAlertBackgroundService` | إرسال تنبيهات الأمان (‏مستهلك طابور داخل العملية) | ❌ **بقرار موثَّق ومُختبَر** — `BackgroundJobLockExclusionTests.cs` جديد يُثبِّته |
| `ProductionStartupValidator` | يتحقّق من إعدادات الإنتاج عند الإقلاع فقط — ليست مهمّة دورية | لا ينطبق |

### 3.6 اختبارات الخلفية (8 مشاريع) — أرقام مُعاد تشغيلها فعلياً، لا محمولة

| المشروع | يفرض ماذا | نتيجة هذه الجلسة |
|---|---|---|
| `Architecture.Tests` | حرّاس البناء — اتجاه التبعية، ترتيب الوسطاء، النقاط العامة، حدود المعدّل (‏انعكاسية الآن)، Redis، استبعاد القفل | ✅ **108/108** |
| `Application.Tests` | منطق المعالِجات والدومين | ✅ **278/278** |
| `Auth.Tests` | المصادقة والتوكن وOTP | ✅ **280/280** |
| `Observability.Tests` | القياس والتتبّع | ✅ **9/9** |
| `Concurrency.Tests` | سباقات التزامن الأساسية | ✅ **4/4** |
| `Integration.Tests` | مسارات كاملة مقابل قاعدة بيانات — يشمل الآن `CookieCsrfProtectionIntegrationTests` (‏5 سيناريوهات) و`TransactionConcurrencyTests`/`UserAccountConcurrencyTests` الجديدين | ⚠️ يحتاج Postgres حيّاً — **لم يُشغَّل هذه الجلسة** |
| `Performance.Tests` | يشترط نسختين حقيقيتين خلف موازن حِمل | ⚠️ يحتاج بيئة أداء — **لم يُشغَّل** |
| `StagingSmokeTests` | مقابل بيئة staging فعلية | ⚠️ يحتاج staging حيّة — **لم يُشغَّل** |

> **بوابتان تفشلان البناء وليستا اختياريتين:** `PublicEndpointPolicyTests` (‏قائمة
> سماح للمسارات) و`APIDependencyGuardTests`. **`RateLimitingGuardTests` لم تعد قائمة
> سماح** — صارت اختباراً انعكاسياً يفحص كل نقطة `[AllowAnonymous]` تلقائياً
> (`BACKEND-ISSUES.md` B-7 مغلق بهذا التغيير الجوهري، لا بترقيع نقطة واحدة).

---

## 4. الواجهة — `Wohnungsmieten` (‏Angular 20، Standalone)

### 4.1 الطبقات الأربع — بلا تغيير بنيوي هذه الدورة

```
src/app/
├── core/        ← لا مكوّنات مرئية إطلاقاً. المنطق والحالة والاتصال بالشبكة.
├── shared/      ← مكوّنات عرض بلا حالة، وموجّهات، وخدمات عرضية.
├── features/    ← ~20 ميزة. كل واحدة صفحة مُحمَّلة كسولاً (lazy).
└── admin/       ← 4 شاشات إدارية خلف AdminGuard.
    layout/ navbar/ profile/ pipes/ map-picker/ language-selector/
```

**القاعدة:** `features/` تعتمد على `core/` و`shared/`. **العكس ممنوع.**

### 4.2 داخل `core/` — الأعداد مُعاد إحصاؤها هذه الجلسة، مطابقة تماماً لِـ v4/v8

| المجلّد | العدد | الدور |
|---|---|---|
| `api/` | 19 | خدمة لكل مورد؛ `plans-api.service.ts` يستهلك `GET /api/plans` الحقيقية |
| `models/` | 15 | الأنواع فقط — `property.model.ts` اكتسب حقولاً جديدة هذه الدورة (‏§4.6) |
| `services/` | 11 | حالة عرضية — `enum.service.ts` اكتسب ثلاث مجموعات Enum جديدة (‏§4.6) |
| `interceptors/` | 3 | إرفاق التوكن وتجديده (‏عبر كوكي) · تحويل الأخطاء |
| `guards/` | 3 | `AuthGuard` · `AdminGuard` · `ListingEligibilityGuard` |
| `adapters/` | 1 | `apiToCamelCase` |
| `auth/` | مجلّد منفصل | `auth.service.ts` · `auth-api.service.ts` · `social-auth.service.ts` · `password-policy.ts` — **`token-storage.service.ts` يعيش فعلياً في `core/services/`، لا `core/auth/`** (‏تصحيح دقيق: النسخ السابقة من هذا الملف وضعته خطأً تحت `core/auth/`) |

### 4.3 مسار طلب واحد من طرف إلى طرف — إنشاء إعلان محمي بالأهلية (‏بلا تغيير هذه الدورة)

```
PropertyFormPage (features/property-form)
   │  canActivate: [AuthGuard, ListingEligibilityGuard]
   ▼
ListingEligibilityGuard (core/guards)
   │  ProfileService.getMe() — يجلب الملف طازجاً، لا من ذاكرة مؤقّتة
   │  isEligibleForListing(profile)? وإلا يوجّه إلى /pricing أو /profile
   ▼
                   ══ عند النجاح فقط ══
   ▼
PropertyApiService.create(...)  →  POST /api/properties
   │  الخلفية تُعيد فحص الأهلية بنفسها — الحارس تجميلي، لا الحماية الفعلية
```

### 4.4 ⚠️ مسار جديد يستحق توثيقاً خاصاً: تجديد التوكن الآن يتجاوز CSRF عمداً — وهذا يكسره

```
انتهاء صلاحية توكن الوصول (30 دقيقة)
   │
   ▼
RefreshAuthInterceptor يعترض 401
   │
   ▼
requestNewAccessToken() في core/interceptors/refresh-auth.interceptor.ts
   │  يبني new HttpClient(httpBackend) مباشرة — يتجاوز كل المُعترِضات عمداً
   │  (لتفادي حلقة تجديد لا نهائية) — بما فيها معترِض CSRF المدمَج في Angular
   │  لو كان مُفعَّلاً أصلاً (وهو ليس كذلك: لا withXsrfConfiguration في app.config.ts)
   ▼
POST /auth/refresh  (withCredentials: true، بلا رأس X-XSRF-TOKEN)
   ▼
CookieCsrfProtectionMiddleware في الخلفية (CookieCsrf:Enabled=true الآن)
   │  يرى كوكي refresh_token حاضرة → يفرض ValidateRequestAsync
   ▼
403 CSRF_VALIDATION_FAILED
   ▼
clearAndRedirect() → tokenStorage.clear() + توجيه لـ /auth/login
```

**هذا ليس افتراضاً — هذا مسار الشيفرة الفعلي في كلا المستودعين عند `e64daeb`/`a151424`
معاً.** كل مستخدم حقيقي يُسجَّل خروجه قسراً كل ~30 دقيقة. التفصيل الكامل، الدليل
الطبقي الثلاثي، والإصلاح: `BACKEND-ISSUES.md` **B-20**.

### 4.5 نظاما التنسيق — كلاهما مقصود، بلا تغيير هذه الدورة

| النظام | الملف الجذر | يستخدمه |
|---|---|---|
| SCSS خام + متغيرات CSS | `src/styles.scss` | معظم الصفحات |
| Tailwind v4 | `src/tailwind.css` | `checkout` فقط حتى هذه المراجعة |

### 4.6 تعديل جديد هذه الدورة: نموذج إعلان ديناميكي حسب `ListingType × PropertyType`

الالتزام الأحدث في الواجهة (`e64daeb`) يُكيِّف نموذج إنشاء/تعديل الإعلان حسب تركيبة
إيجار/بيع × شقة/أرض/... (‏سوق سوري):

- قسم «تفاصيل الإيجار» جديد (‏للإيجار فقط): مدّة مسبقة (‏ستة أشهر/سنة/مخصَّص) تملأ
  تاريخ الانتهاء تلقائياً.
- قائمة «الوضع القانوني» جديدة (‏للبيع)، مبنية على مجموعة Enum خلفية اسمها
  `OwnershipType` (‏لقب لـ `LegalStatusType` في الخلفية).
- فئة «أرض» تُخفي الغرف/الطابق/التدفئة/المزايا، وتُظهر قائمة «وحدة المساحة»
  (`AreaUnit`).
- `enum.service.ts`: أُضيفت `OwnershipType`/`AreaUnit`/`FurnishingStatus` لخريطة
  المجموعات وقائمة التحميل المسبق. `property.model.ts`: حقول جديدة مطابقة.
- **✅ مُغلقة (2026-09-20):** المجموعات الثلاث موجودة في `EnumController.EnumMap` على `master`
  الخلفية (`405e23e`). سبب القوائم الفارغة لاحقاً كان في الواجهة: فشل جلب الـ Enums عند الإقلاع
  كان يُخزَّن كقائمة فارغة دائمة؛ الآن `EnumService.ensureLoaded` يعيد المحاولة.

### 4.7 المحمول

```
capacitor.config.ts   →  webDir: dist/Wohnungsmieten/browser
android/              →  مشروع Android Studio مولَّد
resources/            →  الأيقونات وشاشات البدء
tools/                →  setup-ios.mjs · validate-ios-config.mjs · check-environments.mjs
                         · frontend-audit-guard.mjs  ← بوابة ما قبل الالتزام، **مؤكَّدة تمرّ فعلياً هذه الجلسة**
```

مجلّد `ios/` **يُولَّد عند الطلب** بـ `npm run ios:setup` ولا يُلتزَم به.

**ميزانية الحزمة — مُعاد قياسها فعلياً هذه الجلسة:** `angular.json`
(`production.budgets`): `maximumWarning: 650kB`, `maximumError: 1MB`. القياس الفعلي
هذه الجلسة: **597.55 kB خام / 159.44 kB منقول** (‏كانت 596.90 kB في v3/v8 — زيادة
طفيفة من حقول نموذج الإعلان الجديدة) — **داخل** الحدّ، بلا أي تحذير بناء.

---

## 5. الحدّ الذي عُبِر هذه الدورة — ولماذا يستحق قسماً خاصاً

كل الحدود المعمارية الأخرى في هذا الملف صمدت (‏راجع §6 أدناه). حدّ واحد لم يصمد،
ويستحق أن يُفرَد لأنه سبب البند الوحيد المفتوح في `BACKEND-ISSUES.md`:

> **قاعدة ضمنية لم تُكتَب صراحة قبل هذه المراجعة: أي تغيير أمني في الخلفية يفترض
> سلوكاً من الواجهة (‏إرسال رأس، قراءة كوكي، استدعاء نقطة نهاية جديدة) يجب أن يُشحَن
> مع تغيير الواجهة المقابل في **نفس** دورة النشر، أو يبقى مُعطَّلاً حتى يُشحَنا معاً.**

هذا بالضبط ما لم يحدث: `CookieCsrf:Enabled=true` شُحِن في الخلفية بمفرده. النتيجة
موثَّقة بالكامل في `BACKEND-ISSUES.md` **B-20**، وهي — للمرّة الثانية في تاريخ هذه
الوثائق (‏كانت المرّة الأولى B-13→B-18) — تحقيق حرفي للتحذير الذي كتبته مراجعة سابقة
عن التغيير السابق نفسه: *"لا تفعل نصف الإصلاح."*

---

## 6. الحدود التي لا تزال تُفرَض — ملخّص تنفيذي

| الحدّ | ما يفرضه | صمد هذه الدورة؟ |
|---|---|---|
| `Domain` لا يعرف شيئاً | صفر تبعيات خارجية. | ✅ |
| `Application` لا يعرف البنية التحتية | لا EF، لا Redis، لا `IOptions` مباشرة | ✅ — والاستثناء الوحيد الموثَّق سابقاً (`ListingQuotaOptions`) **حُذف بالكامل**، فالقاعدة عادت عامّة بلا استثناء حيّ |
| الـ Controller لا يفكّر | ترجمة HTTP ↔ MediatR فقط | ✅ |
| `Cloudinary` حبيس `Infrastructure/Media` | SDK لا يظهر في أي طبقة أخرى | ✅ — يشمل الآن رفع شعار المكتب أيضاً |
| `features/` لا تُستورَد من `features/` | المشترك يصعد إلى `core/` أو `shared/` | ✅ |
| `core/api` لا تعرض نقطة إدارية | ما يمنح امتيازاً مالياً أو إدارياً يبقى خارج شيفرة العميل | ✅ |
| هوية المستخدم من التوكن | لا تُقرأ من جسم الطلب في أي أمر | ✅ |
| فحوصات الأهلية قبل القفل | لا يُستحوَذ قفل استشاري لطلب سيُرفَض بفحص أرخص أولاً | ✅ — نمط `AgencyInvitationLock` الجديد يتّبعه أيضاً |
| كل نص مفتاح i18n | في `ar.json` و`en.json` و`de.json` معاً | ✅ |
| **تغيير أمني في الخلفية يُشحَن مع مقابله في الواجهة** | — | ❌ **لم يصمد هذه الدورة — §5، B-20** |

---

## 7. أين أضع الملف الجديد؟ — جدول قرار سريع

| ما تبنيه | أين |
|---|---|
| نقطة نهاية جديدة | `PropertyApi/Controllers/` + أمر/استعلام في `Application/{Context}/` |
| قاعدة أعمال أو ثابت تجاري ثابت | `Domain/{Context}/` — لا `appsettings` |
| قيمة مرتبطة بخطة أو خيار مستخدم | حقل على كيان الدومين (`Plan.ListingLimit` مثالاً) خلف واجهة في `Application` — لا `IOptions` بعد اليوم لهذا النوع تحديداً |
| استعلام قاعدة بيانات | واجهة في `Application/{Context}/Interfaces/` + تنفيذ في `Infrastructure/Repositories/` |
| مهمة مجدولة | `Infrastructure/{Context}/` + `AddHostedService` **+ `BackgroundJobLock`** — إلا إذا أثبتّ أنها مستهلك طابور داخل العملية لا كاسحة، ووثّقت ذلك في اختبار يُشبه `BackgroundJobLockExclusionTests` |
| فحص «اقرأ ثم اكتب» أو انتقال حالة على مورد محدود | قفل استشاري بنطاق معاملة — انسخ نمط `ListingQuotaLock`/`AgencyInvitationLock` |
| صفحة جديدة في التطبيق | `src/app/features/{name}/` + مدخل في `app.routes.ts` |
| حارس مسار يعكس قاعدة خلفية | `src/app/core/guards/` — وثّق في التعليق أن الخلفية تبقى مصدر الحقيقة |
| نداء API جديد | `src/app/core/api/{resource}.service.ts` + نوع في `core/models/` |
| نص ظاهر للمستخدم | مفتاح في ملفات i18n الثلاثة |
| **تغيير أمني في الخلفية يحتاج سلوكاً من الواجهة** | **لا تشحن الخلفية بمفردها — انسق دورة نشر واحدة لكلا المستودعين، أو أبقِ الميزة مُعطَّلة خلف علم حتى تجهز الواجهة (‏§5)** |

---

## 8. الأوامر — الطرفان

### الواجهة

```bash
npm run typecheck         # فحص الأنواع — يمرّ (مُتحقَّق هذه الجلسة)
npm run audit:frontend    # بوابة ما قبل الالتزام — تمرّ (مُشغَّلة فعلياً هذه الجلسة)
npm run build:prod        # 597.55 kB خام — داخل حدّ 650 kB (مُتحقَّق هذه الجلسة)
npm run postmerge:verify  # البوابة الكاملة
```

### الخلفية

```bash
dotnet build PropertyApi.sln -c Release   # 0 تحذير، 0 خطأ (مُتحقَّق هذه الجلسة، 35 ثانية)
dotnet test PropertyApi.sln
dotnet ef migrations add <Name> --project PropertyApi.Infrastructure --startup-project PropertyApi
```

> ⚠️ سكربتات هذا المشروع تعمل على **PowerShell**: لا `&&` ولا `||`. استخدم `-and`
> و`-or` و`$?`.

---

## 9. الوثائق — أيّها يُصدَّق

| الملف | الحالة |
|---|---|
| `docs/PROJECT-STRUCTURE.md` (هذا) | ✅ 2026-08-27 |
| `docs/FRONTEND-REFERENCE.md` | ✅ v5 — 2026-08-27 |
| `docs/PropertyApi-REFERENCE.md` | ✅ v9 — 2026-08-27 |
| `docs/BACKEND-ISSUES.md` | ✅ v4 — 2026-08-27 — بند واحد مفتوح (`B-20`)، الأخطر في تاريخ هذا الملف |
| `FRONTEND_BACKEND_CONTRACT.md` | ⚠️ لم يُعَد فحصه في هذه الدورة — يحتاج مراجعة مقابل `/plans` ونظام الدعوات الجديد ونموذج الإعلان الديناميكي |
| `DATABASE_SCHEMA.md` (‏`Downloads`) · `REGISTER_ERROR_DIAGNOSIS.md` | ❌ **خاطئان تاريخياً** — يصفان SQL Server، وقاعدة البيانات PostgreSQL + PostGIS |

**نسخ متطابقة في مستودعين:** توجد نسخة من هذا الملف وثلاثة أخرى في
`C:\Users\naeem\Source\Repos\PropertyApi\docs\` أيضاً — **لم تُفحَص أو تُحدَّث في هذه
الجلسة** (‏لم يُعثَر على ملفات بهذه الأسماء الأربعة هناك عند بدء هذه المراجعة؛ فحص
مباشر للمستودع ولتاريخ Git الكامل لم يُظهر أنها وُجدت هناك من قبل). **إن أراد الفريق
نسخة مطابقة في مستودع الخلفية أيضاً، فهذا قرار مستقبلي، لا حالة قائمة اليوم.**

---

*كُتب من إحصاء مباشر لشجرتَي المصدر في 2026-08-27 (الواجهة `e64daeb`، الخلفية
`a151424`)، مسنوداً ببناء فعلي للخلفية (‏0 تحذير، 35 ثانية)، خمسة مشاريع اختبار خلفية
سريعة (‏679/679 ناجحة)، وتشغيل فعلي لبوابات الواجهة الثلاث في هذه الجلسة. `Integration.Tests`،
`Performance.Tests`، `StagingSmokeTests`، و`ng test` الكامل لم تُشغَّل — تحتاج بنية
تحتية حيّة غير متوفّرة هذه الجلسة، ومُعلَّمة صراحةً حيث وردت. البند B-20 اكتُشف بقراءة
شيفرة عبر مستودعين معاً، لا بتشغيل حيّ — أعِد التحقق قبل التخطيط.*
