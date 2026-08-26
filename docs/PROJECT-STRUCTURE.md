# البنية الهيكلية للمشروع — عقار تيك / Bizorealestateworld

> **الغرض:** خريطة واحدة للمشروع كلّه — أين يعيش كل شيء، ولماذا هناك، وما الحدود التي
> لا تُعبَر. هذا الملف يجيب عن سؤال «أين أضع هذا الملف؟» قبل أن تكتبه.
> **آخر تحديث:** 2026-08-25
> **مصدر التحقّق:** إحصاء مباشر لشجرتَي المصدر — الواجهة عند `3d81d37`، الخلفية عند
> `293a5c1` — مسنوداً ببناء وتشغيل اختبارات في المستودعين.
> **الوثائق الشقيقة:** `FRONTEND-REFERENCE.md` (تفصيل الواجهة) ·
> `PropertyApi-REFERENCE.md` (تفصيل الخلفية) · `BACKEND-ISSUES.md` (عيوب الخلفية المفتوحة)
> · `RELEASE-BLOCKERS-AR.md` (موانع النشر مرتّبةً بترتيب التنفيذ).

---

## 1. أول ما يجب معرفته: **مستودعان منفصلان، لا مجلّدان**

```
C:\Users\naeem\
├── OneDrive\Desktop\Notiz\WohnungsApp\Wohnungsmieten\   ← الواجهة  (Angular 20)
│                                                          فرع افتراضي: main
│                                                          فرع حالي: feat/register-confirmation-notice
└── Source\Repos\PropertyApi\                            ← الخلفية  (.NET 8)
                                                           فرع افتراضي: master
                                                           فرع حالي: feat/resend-email-confirmation
```

⚠️ **الفرعان الافتراضيان مختلفا الاسم** — `main` في الواجهة و`master` في الخلفية.
أوامر CI وسكربتات المقارنة التي تفترض اسماً واحداً للطرفين ستفشل بصمت.

**لا أحدهما مجلّد فرعي في الآخر، ولا يشتركان في تاريخ Git.** جلسات سابقة استنتجت أن
الخلفية «غير موجودة» لأنها ليست داخل شجرة عمل Angular — وهذا خطأ: كلاهما على هذا
الجهاز وكلاهما قابل للفحص. أي مهمة تلمس عقد الاتصال بينهما تتطلب فتح المستودعين معاً،
وإلا تُكتب ادّعاءات عن طرف لم يُقرأ.

**لا يوجد مستودع ثالث**: لا حزمة عقود مشتركة، ولا مولّد أنواع، ولا OpenAPI client
مُولَّد. العقد بين الطرفين **موثَّق يدوياً** في `FRONTEND_BACKEND_CONTRACT.md` ويُطبَّق
يدوياً في `core/api/`. هذه أرخص طريقة للانحراف الصامت، ولذلك يوجد
`api-naming.adapter.ts` كنقطة اختناق واحدة (§4.3).

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
              HTTPS (Bearer)   │   WebSocket (SignalR)
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

⚠️ **نقطة معمارية حرجة يجب أن تُقرأ من هذا المخطّط:** «عدّة نسخ» حقيقية — مجموعة
اختبارات الأداء تشترط وصول الحركة إلى نسختين. Redis يجعل SignalR يعمل عبر النسخ،
لكن **المهام المجدولة داخل التطبيق لا تملك أي تنسيق بين النسخ**؛ كل نسخة تشغّل كل
مهمة. هذا البند **B-6** في `BACKEND-ISSUES.md`.

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
| **`PropertyApi`** | HTTP فقط: Controllers، Middleware، الأمان، `Program.cs` | لا منطق أعمال، ولا `AppDbContext` (‏3 استثناءات تشخيصية موثّقة) |
| **`PropertyApi.Application`** | الأوامر والاستعلامات (MediatR)، DTOs، الواجهات (Interfaces) | **صفر تبعية على البنية التحتية** — لا EF، ولا `Microsoft.Extensions.Options` |
| **`PropertyApi.Domain`** | الكيانات، الثوابت الأعمالية، قواعد السياسة | **صفر تبعيات خارجية إطلاقاً** |
| **`PropertyApi.Infrastructure`** | EF Core، Identity، Redis، Cloudinary، Twilio، المهام المجدولة | لا يعرفه أحد إلا `Program.cs` عند التركيب |

`APIDependencyGuardTests` يفرض هذا الاتجاه في البناء. عكسه ليس خطأ أسلوب — يكسر الاختبار.

### 3.2 السياقات (Bounded Contexts) — الأسماء نفسها في الطبقات الثلاث

| السياق | Domain | Application | ملاحظات |
|---|---|---|---|
| `Listings` | ✅ | ✅ | العقارات، دورة الصلاحية، الرسوم |
| `Users` | ✅ | ✅ | `UserAccount` (الدومين) منفصل عن `ApplicationUser` (‏Identity) |
| **`Agencies`** | ✅ | ✅ | **جديد في `61bd779`** — تجميع تنظيمي لا عزل بيانات |
| `Notifications` | ✅ | ✅ | يُنتَج ويُدفَع عبر SignalR |
| `Transactions` | ✅ | — | الرسوم؛ لا مجلّد Application خاص، الأوامر تحت `Listings` |
| `Reviews` · `Search` · `Bookings` · `Auth` · `Lookups` · `Messaging` · `Audit` | ✅ | جزئياً | `Bookings` قائم في الدومين ومحدود الاستخدام |
| `Common` | ✅ | ✅ | `AuditableEntity`، الاستثناءات، الواجهات المشتركة |

**قاعدة التسمية:** المجلّد نفسه بالاسم نفسه في `Domain` و`Application` و(عند اللزوم)
`Infrastructure`. ميزة جديدة تعني ثلاثة مجلّدات بالاسم نفسه، لا مجلّداً واحداً في مكان.

### 3.3 شكل أمر واحد من طرف إلى طرف

مثال حيّ — تسجيل رسم تمييز إعلان:

```
POST /api/properties/{id}/featured
  │
  ├─ PropertyApi/Controllers/PropertiesController.cs
  │    يقرأ هوية المستخدم من التوكن، لا من الجسم أبداً
  │    _mediator.Send(new RequestFeaturedListingCommand(id, userId))
  │
  ├─ Application/Listings/Commands/RequestFeaturedListing/
  │    ├─ RequestFeaturedListingCommand.cs          سجلّ موضعي (Positional record)
  │    └─ RequestFeaturedListingCommandHandler.cs   كل التحقق والمنطق هنا
  │         يستدعي IPropertyRepository · IListingFeeRepository · IUnitOfWork
  │
  ├─ Domain/Listings/ListingLifecyclePolicy.cs      السعر والمدة — مصدر حقيقة واحد
  ├─ Domain/Transactions/Entities/Transaction.cs    Transaction.Create(...)
  │
  ├─ Infrastructure/Repositories/ListingFeeRepository.cs
  │    EF Core → PostgreSQL
  │
  └─ 202 Accepted + FeaturedListingQuoteDto
```

**الأعراف المستخلَصة من هذا المسار وتُطبَّق على كل أمر جديد:**

1. **هوية المستخدم من التوكن حصراً.** جسم الطلب لا يحمل `RequestingUserId` إطلاقاً —
   ولهذا يوجد `CreateAgencyRequest` منفصلاً عن `CreateAgencyCommand`.
2. **كل التحقق في المعالِج (Handler)، لا في الـ Controller.** الـ Controller يترجم
   HTTP فقط.
3. **السجلات الموضعية بالوسائط المسمّاة:** `new MyCommand(PropertyId: x)` لا
   `new MyCommand { PropertyId = x }`.
4. **الوصول للبيانات عبر واجهة مستودع** معرَّفة في `Application`، ومنفَّذة في
   `Infrastructure`. لا `AppDbContext` في معالِج (باستثناء واحد موثّق).
5. **الثوابت التجارية في `Domain`** لا في `appsettings` — تغييرها تغيير شيفرة، وبالتالي
   تغيير مُراجَع، وهذا هو المستوى الصحيح لقيمة رآها زبون قبل أن يدفع.

### 3.4 خريطة `PropertyApi.Infrastructure`

| المجلّد | المحتوى |
|---|---|
| `Persistence/` | `AppDbContext` · `Configurations/` (‏Fluent API) · `Seeds/` · `Migrations/` (26) |
| `Repositories/` | 14 مستودعاً — كلها تنفّذ واجهات معرَّفة في `Application` |
| `Identity/` | `ApplicationUser` وخدمات Identity — **معزولة خلف واجهات** |
| `Listings/` | `ListingExpiryHostedService` — كنس الصلاحية والتمييز |
| `Search/` | `SavedSearchMatchHostedService` |
| `Auth/Services/` | Console · Twilio · Http SMS (‏ثلاثة تنفيذات لواجهة واحدة) |
| `Media/` | Cloudinary — **لا يخرج SDK منها إلى أي طبقة أخرى** |
| `Caching/` · `Hubs/` · `Email/` · `Health/` · `Security/` · `Performance/` | Redis · SignalR · التنبيهات · مدقّق الإقلاع · حماية البيانات · القياس |

### 3.5 المهام المجدولة (6) — اقرأ B-6 قبل الاعتماد عليها

| الخدمة | الدور |
|---|---|
| `ListingExpiryHostedService` | كل 6 ساعات: تحذير ← انتهاء ← حذف ← إنهاء التمييز |
| `SavedSearchMatchHostedService` | مطابقة البحوث المحفوظة وإشعار أصحابها |
| `OtpCleanupHostedService` | تنظيف رموز OTP المنتهية |
| `PhoneVerificationHostedService` | متابعة تحقّق الهاتف |
| `SecurityAlertBackgroundService` | إرسال تنبيهات الأمان (طابور، نسخة واحدة مشتركة) |
| `ProductionStartupValidator` | يتحقّق من إعدادات الإنتاج عند الإقلاع ويُفشل الإقلاع عند النقص |

⚠️ **لا واحدة منها تملك انتخاب قائد أو قفلاً موزّعاً.** في نشر متعدّد النسخ تعمل كلٌّ
منها **في كل نسخة**.

### 3.6 اختبارات الخلفية (8 مشاريع · 111 ملفاً · 516 تصريح `[Fact]`/`[Theory]`)

| المشروع | يفرض ماذا |
|---|---|
| `Architecture.Tests` | **حرّاس البناء** — اتجاه التبعية، ترتيب الوسطاء، النقاط العامة، حدود المعدّل، Redis |
| `Application.Tests` | منطق المعالِجات والدومين |
| `Auth.Tests` | المصادقة والتوكن وOTP |
| `Integration.Tests` | مسارات كاملة مقابل قاعدة بيانات |
| `Concurrency.Tests` · `Observability.Tests` · `Performance.Tests` · `StagingSmokeTests` | كلٌّ لبُعده |

> **بوابتان تفشلان البناء وليستا اختيارية:** `PublicEndpointPolicyTests` (كل نقطة
> مجهولة الهوية يجب أن تكون مُسجَّلة صراحةً) و`APIDependencyGuardTests` (اتجاه التبعية).
> كلتاهما **قائمة سماح**، لا قاعدة عامة — وهذا حدّها المهم (‏B-7).

---

## 4. الواجهة — `Wohnungsmieten` (‏Angular 20، Standalone)

### 4.1 الطبقات الأربع

```
src/app/
├── core/        ← لا مكوّنات مرئية إطلاقاً. المنطق والحالة والاتصال بالشبكة.
├── shared/      ← مكوّنات عرض بلا حالة، وموجّهات، وخدمات عرضية.
├── features/    ← 20 ميزة. كل واحدة صفحة مُحمَّلة كسولاً (lazy).
└── admin/       ← 4 شاشات إدارية خلف AdminGuard.
    layout/ navbar/ profile/ pipes/ map-picker/ language-selector/
```

**القاعدة:** `features/` تعتمد على `core/` و`shared/`. **العكس ممنوع.** ميزة تحتاج شيئاً
من ميزة أخرى تعني أن ذلك الشيء ينتمي إلى `core/` أو `shared/`.

### 4.2 داخل `core/` — سبعة مجلّدات، لكلٍّ دور واحد

| المجلّد | العدد | الدور |
|---|---|---|
| `api/` | 19 | خدمة لكل مورد. لا منطق عرض، ولا `catchError`. |
| `models/` | 15 | الأنواع فقط (‏`interface` / `type` / ثوابت). |
| `services/` | 11 | حالة عرضية: اللغة، السمة، التوكن، SignalR، زر الرجوع. |
| `interceptors/` | 3 | إرفاق التوكن وتجديده · تحويل الأخطاء. |
| `guards/` | 2 | `AuthGuard` · `AdminGuard`. |
| `adapters/` | 1 | `apiToCamelCase` — نقطة الاختناق مع PascalCase. |
| `auth/` | 1 | `auth.service.ts`. |

### 4.3 مسار طلب واحد من طرف إلى طرف

```
CheckoutPage (features/checkout)
   │  inject(ListingFeesApiService)
   ▼
ListingFeesApiService (core/api)
   │  this.api.post('/properties/{id}/featured', {})
   ▼
BackendApiService (core/api)          ← يبني العنوان من environment
   ▼
RefreshAuthInterceptor (core/interceptors)
   │  يُرفق Bearer فقط إن كان الطلب موجّهاً لواجهة الخلفية
   │  عند 401: طلب تجديد واحد مشترك بـ shareReplay
   ▼
                        ══ الشبكة ══
   ▼
ApiErrorInterceptor  ← يحوّل خطأ HTTP إلى مفتاح رسالة قابل للترجمة
   ▼
apiToCamelCase()     ← PascalCase من الخادم ⟶ camelCase في التطبيق
   ▼
ListingFeeQuote (core/models)  →  إشارة (signal) في الصفحة
```

**ثلاثة أعراف مُلزِمة يوضّحها هذا المسار:**

1. **`apiToCamelCase()` في كل خدمة API.** الخادم يرسل PascalCase (‏`PropertyNamingPolicy = null`)،
   ونسيان المحوّل يعطي حقولاً `undefined` بلا خطأ ولا تحذير.
2. **لا `catchError` داخل الخدمة.** الخطأ يصعد إلى الاعتراض المركزي، فتكون رسائل
   الأخطاء متسقة في التطبيق كلّه بدل أن تُعالَج كلٌّ على هواها.
3. **الحالة إشارات (‏`signal()`) داخل المكوّن** مع `OnPush`.

### 4.4 نظاما التنسيق — كلاهما مقصود

| النظام | الملف الجذر | يستخدمه |
|---|---|---|
| SCSS خام + متغيرات CSS | `src/styles.scss` | كل الصفحات السابقة لـ `c84052a` (~25 صفحة) |
| Tailwind v4 | `src/tailwind.css` | `checkout` فقط حتى الآن |

**الجسر بينهما:** كتلة `@theme` في `tailwind.css` تُسنِد كل لون في Tailwind إلى متغيّر
CSS يعرّفه `styles.scss`، فيبقى مصدر الألوان **واحداً** ويعمل الوضع الداكن في النظامين
بلا أي أداة `dark:`. التفاصيل والمزالق في `FRONTEND-REFERENCE.md §8.5`.

### 4.5 المحمول

```
capacitor.config.ts   →  webDir: dist/Wohnungsmieten/browser
android/              →  مشروع Android Studio مولَّد
resources/            →  الأيقونات وشاشات البدء
tools/                →  setup-ios.mjs · validate-ios-config.mjs · check-environments.mjs
                         · frontend-audit-guard.mjs  ← بوابة ما قبل الالتزام
```

مجلّد `ios/` **يُولَّد عند الطلب** بـ `npm run ios:setup` ولا يُلتزم به.

---

## 5. الحدود التي لا تُعبَر — ملخّص تنفيذي

| الحدّ | ما يفرضه |
|---|---|
| `Domain` لا يعرف شيئاً | صفر تبعيات خارجية. أي `using` لمكتبة خارجية فيه خطأ. |
| `Application` لا يعرف البنية التحتية | لا EF، لا Redis، لا `IOptions`. الواجهات فقط. |
| الـ Controller لا يفكّر | ترجمة HTTP ↔ MediatR. لا تحقّق ولا منطق. |
| `Cloudinary` حبيس `Infrastructure/Media` | SDK لا يظهر في أي طبقة أخرى. |
| `features/` لا تُستورَد من `features/` | المشترك يصعد إلى `core/` أو `shared/`. |
| `core/api` لا تعرض نقطة إدارية | ما يمنح امتيازاً مالياً أو إدارياً يبقى خارج شيفرة العميل. |
| هوية المستخدم من التوكن | لا تُقرأ من جسم الطلب في أي أمر. |
| كل نص مفتاح i18n | في `ar.json` و`en.json` و`de.json` معاً. |
| كل لون `var(--token)` | في SCSS وفي `@theme` كليهما. |

---

## 6. أين أضع الملف الجديد؟ — جدول قرار سريع

| ما تبنيه | أين |
|---|---|
| نقطة نهاية جديدة | `PropertyApi/Controllers/` + أمر/استعلام في `Application/{Context}/` |
| قاعدة أعمال أو ثابت تجاري | `Domain/{Context}/` — لا `appsettings` |
| استعلام قاعدة بيانات | واجهة في `Application/{Context}/Interfaces/` + تنفيذ في `Infrastructure/Repositories/` |
| مهمة مجدولة | `Infrastructure/{Context}/` + `AddHostedService` — **واقرأ B-6 أولاً** |
| صفحة جديدة في التطبيق | `src/app/features/{name}/` + مدخل في `app.routes.ts` |
| نداء API جديد | `src/app/core/api/{resource}.service.ts` + نوع في `core/models/` |
| مكوّن عرض مُعاد استخدامه | `src/app/shared/ui/` |
| حالة عامة عبر التطبيق | `src/app/core/services/` |
| نص ظاهر للمستخدم | مفتاح في ملفات i18n الثلاثة — **لا نصّ حرفي في قالب** |

---

## 7. الأوامر — الطرفان

### الواجهة

```bash
npm run typecheck         # فحص الأنواع
npm run audit:frontend    # بوابة ما قبل الالتزام (mojibake + أنماط غير آمنة)
npm run build:prod
npm run postmerge:verify  # البوابة الكاملة
npm run android:sync
npm run ios:setup && npm run ios:sync
```

### الخلفية

```bash
dotnet build PropertyApi.sln
dotnet test PropertyApi.sln
dotnet ef migrations add <Name> --project PropertyApi.Infrastructure --startup-project PropertyApi
```

> ⚠️ سكربتات هذا المشروع تعمل على **PowerShell**: لا `&&` ولا `||` ولا إعادة توجيه
> بأسلوب Unix. استخدم `-and` و`-or` و`$?`.

---

## 8. الوثائق — أيّها يُصدَّق

| الملف | الحالة |
|---|---|
| `docs/PROJECT-STRUCTURE.md` (هذا) | ✅ 2026-08-24 |
| `docs/FRONTEND-REFERENCE.md` | ✅ v2 — 2026-08-24 |
| `docs/PropertyApi-REFERENCE.md` | ✅ v6 — 2026-08-24 |
| `docs/BACKEND-ISSUES.md` | ✅ 2026-08-24 |
| `FRONTEND_BACKEND_CONTRACT.md` | ✅ محدَّث |
| `docs/RESPONSIVE-MANUAL-TEST-MATRIX.md` · `docs/UI-RELEASE-GATE.md` | ✅ ساريان |
| `PROJECT-REFERENCE.md` (‏`Downloads`, 2026-06-18) | ⚠️ متجاوَز جزئياً |
| `DATABASE_SCHEMA.md` (‏`Downloads`) · `REGISTER_ERROR_DIAGNOSIS.md` | ❌ **خاطئان** — يصفان SQL Server، وقاعدة البيانات PostgreSQL + PostGIS |

**ثلاث نسخ متطابقة** من `FRONTEND-REFERENCE.md` و`PropertyApi-REFERENCE.md`
و`PROJECT-STRUCTURE.md` و`BACKEND-ISSUES.md`: في `docs/` (المرجعية، مُدارة مع
المستودع)، وفي `C:\Users\naeem\Downloads\` (مكتبة المستخدم)، وفي مجلّد ذاكرة الجلسات.
**تُحدَّث الثلاث معاً** — النسخة المنحرفة هي بالضبط العطل الذي وُجدت هذه الوثائق لعلاجه.

---

*كُتب من إحصاء مباشر لشجرتَي المصدر في 2026-08-25 (الواجهة `3d81d37`، الخلفية `293a5c1`),
مسنوداً ببناء وتشغيل اختبارات في المستودعين. الأرقام مقيسة لا منقولة.*
