# 🔄 Frontend-Backend API Contract

## Overview
هذا الملف يوثق العقد الموحد بين الخلفية والواجهة الأمامية لضمان التوافق الكامل.

---

## 1. معايير التسمية (Naming Conventions)

### ✅ المعيار الموحد: camelCase
جميع حقول JSON والنماذج تستخدم **camelCase** (الأمام والخلف):

```typescript
// ✅ صحيح
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phoneNumber": "+1234567890",
  "accessToken": "...",
  "expiresIn": 3600
}

// ❌ خطأ (PascalCase)
{
  "FirstName": "John",
  "LastName": "Doe"
}
```

### تطبيق في الخلفية (C#)
```csharp
[JsonPropertyName("firstName")]
public string FirstName { get; set; }

[JsonPropertyName("lastName")]
public string LastName { get; set; }

[JsonPropertyName("accessToken")]
public string AccessToken { get; set; }
```

### تطبيق في الأمام (TypeScript)
```typescript
interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}
```

---

## 2. معالجة الأخطاء الموحدة

### 2.1 صيغة الخطأ العام
```typescript
interface ErrorResponse {
  message: string;              // رسالة الخطأ الودودة للمستخدم
  errorCode?: string;          // رمز الخطأ البرمجي (اختياري)
  errors?: Record<string, string[]>; // أخطاء التحقق المفصلة
  statusCode?: number;         // رمز HTTP
  timestamp?: string;          // وقت الخطأ بصيغة ISO
  traceId?: string;            // معرف التتبع للتشخيص
}
```

### 2.2 أمثلة على الأخطاء
```typescript
// خطأ المصادقة
{
  "message": "Invalid email or password",
  "errorCode": "INVALID_CREDENTIALS",
  "statusCode": 401
}

// خطأ التحقق من البيانات
{
  "message": "Validation failed",
  "errors": {
    "password": [
      "Password must be at least 8 characters long",
      "Password must contain at least one uppercase letter",
      "Password must contain at least one special character"
    ]
  },
  "statusCode": 422
}

// خطأ OTP
{
  "message": "OTP verification failed",
  "errorCode": "OTP_WRONG",
  "statusCode": 400
}
```

### 2.3 رموز الأخطاء القياسية
```typescript
export const ERROR_CODES = {
  // المصادقة
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  UNAUTHORIZED: 'UNAUTHORIZED',
  
  // التحقق
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  PASSWORD_POLICY_FAILED: 'PASSWORD_POLICY_FAILED',
  
  // OTP / Phone
  OTP_INVALID: 'OTP_INVALID',
  OTP_WRONG: 'OTP_WRONG',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_RATE_LIMITED: 'OTP_RATE_LIMITED',
  PHONE_ALREADY_REGISTERED: 'PHONE_ALREADY_REGISTERED',
  PHONE_INVALID: 'PHONE_INVALID',
  
  // المستخدم
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  
  // عام
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  NOT_FOUND: 'NOT_FOUND'
} as const;
```

---

## 3. النماذج الأساسية (Core Models)

### 3.1 المصادقة
```typescript
// طلب التسجيل
interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

// استجابة التسجيل
interface RegisterResponse {
  message: string;
  userId: string;
}

// طلب تسجيل الدخول
interface LoginRequest {
  email: string;
  password: string;
}

// استجابة الرموز (موحدة لجميع أنواع تسجيل الدخول)
interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;      // بالثواني
  tokenType?: string;     // مثل "Bearer"
}

// طلب تحديث الرمز
interface RefreshTokenRequest {
  refreshToken: string;
}
```

### 3.2 التحقق من كلمة المرور
```typescript
interface PasswordValidationRequest {
  password: string;
}

interface PasswordValidationResponse {
  isValid: boolean;
  errors: string[];     // قائمة متطلبات غير مستوفاة
}

// متطلبات كلمة المرور:
// - الحد الأدنى: 8 أحرف
// - حرف كبير واحد على الأقل (A-Z)
// - حرف صغير واحد على الأقل (a-z)
// - رقم واحد على الأقل (0-9)
// - حرف خاص واحد على الأقل (!@#$%^&*)
```

### 3.3 OTP والهاتف
```typescript
// إرسال OTP
interface SendOtpRequest {
  phoneNumber: string;          // صيغة E.164: +1234567890
  email?: string;               // اختياري
  purpose?: OtpPurpose;         // PhoneRegistration, AddPhone, etc.
}

interface SendOtpResponse {
  message: string;
  expiresInSeconds: number;
}

// التحقق من OTP
interface VerifyOtpRequest {
  phoneNumber: string;
  code: string;                 // 6 أرقام
  password?: string;            // إذا كان الغرض PhoneRegistration
  firstName?: string;
  lastName?: string;
  purpose?: OtpPurpose;
}

interface VerifyOtpResponse {
  message: string;
  succeeded: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

// تسجيل الدخول بالهاتف (رقم + كلمة سر)
interface PhoneLoginRequest {
  phoneNumber: string;
  password: string;
}
```

---

## 4. رؤوس HTTP (HTTP Headers)

### 4.1 المصادقة
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

### 4.2 معالجة الأخطاء في الرؤوس
```
X-Request-ID: {unique-request-id}
X-Error-Code: {error-code}
```

---

## 5. حالات الاستجابة (Response Status Codes)

| الرمز | الحالة | الوصف |
|------|-------|-------|
| 200 | OK | طلب ناجح |
| 201 | Created | تم إنشاء مورد جديد |
| 400 | Bad Request | بيانات غير صحيحة |
| 401 | Unauthorized | المصادقة مطلوبة أو غير صحيحة |
| 403 | Forbidden | الوصول مرفوض |
| 404 | Not Found | المورد غير موجود |
| 422 | Unprocessable Entity | خطأ التحقق من البيانات |
| 423 | Locked | الحساب مقفول بعد محاولات دخول فاشلة متكررة |
| 429 | Too Many Requests | تحديد السعر (Rate Limiting) |
| 500 | Internal Server Error | خطأ في الخادم |

---

## 5.1 عقد `POST /api/auth/login` وقفل الحساب

### ⚠️ تحذير تسلسل حرج

`Program.cs` يضبط `JsonSerializerOptions.PropertyNamingPolicy = null`، أي أن **الـ DTOs
المسمّاة تُسلسَل PascalCase افتراضياً**. عقد `login` كان ولا يزال camelCase (لأن النسخة
السابقة أرجعت كائناً مجهولاً كُتبت أعضاؤه بحروف صغيرة). لذلك **كل عضو في
`LoginResponseDto` يحمل `[JsonPropertyName]` صريحاً**. حذف أي واحد منها يجعل العميل
يقرأ `accessToken` غير موجود فيخزّن توكن فارغ — فشل صامت، لا استثناء.

هذا محروس بـ `tests/PropertyApi.Auth.Tests/Contracts/LoginResponseContractTests.cs`.

### النجاح — 200

نفس الحقول الثلاثة السابقة في الجذر، فـ `normalizeAuthTokenResponse` يعمل دون تغيير:

```json
{ "success": true, "statusCode": 200, "accessToken": "…", "refreshToken": "…", "expiresIn": 3600 }
```

### الفشل — 401 / 423 / 429 / 403 / 500

```json
{
  "success": false,
  "message": "Invalid email or password",
  "errorCode": "INVALID_CREDENTIALS",
  "errorType": "InvalidCredentials",
  "failedAttemptCount": 2,
  "maxFailedAttempts": 5,
  "remainingAttemptsBeforeLockout": 3,
  "isAccountLocked": false,
  "lockoutEndTimeUtc": null,
  "recommendedAction": "retry"
}
```

**قواعد الاستهلاك:**

1. **تفرّع على `errorCode` فقط** — نص ثابت. لا تتفرّع على `message` (إنجليزي، للتشخيص)
   ولا على `errorType` (يُسلسَل نصاً بسبب `JsonStringEnumConverter`، لكن `errorCode` هو
   المعيار الموثّق في القسم 2).
2. **استخدم `lockoutEndTimeUtc` للعدّ التنازلي** وليس `lockoutMinutesRemaining` — الأخير
   يُحسب لحظة التسلسل ويصبح قديماً فوراً.
3. **رمز HTTP من الشبكة هو المرجع**، لا `statusCode` داخل الجسم (مرآة للتشخيص).

### الأكواد

| errorCode | HTTP | معالجة الواجهة |
|-----------|------|----------------|
| `INVALID_CREDENTIALS` | 401 | رسالة عامة + عدّاد المحاولات المتبقية |
| `ACCOUNT_LOCKED` | 423 | تعطيل النموذج + عدّ تنازلي حتى `lockoutEndTimeUtc` |
| `RATE_LIMITED` | 429 | رسالة انتظار |
| `ACCOUNT_DISABLED` | 403 | توجيه إلى الدعم |
| `PASSWORD_CHANGE_REQUIRED` | 403 | تحويل إلى إعادة تعيين كلمة السر |
| `SERVER_ERROR` | 500 | رسالة عامة |

المصدر الواحد للحقيقة: `LoginErrorCodes` (باك) ↔ `LOGIN_ERROR_CODES` في
`core/models/auth.model.ts` (أمام).

### حماية تعداد المستخدمين

- بريد غير مسجَّل وكلمة مرور خاطئة يُنتجان **جسماً متطابقاً بايت ببايت** (محروس باختبار).
- **لا توجد** نقطة نهاية `GET /auth/check-lockout`؛ الإجابة عن "هل هذا البريد مقفول؟"
  بلا بيانات اعتماد تكشف من هو مسجَّل. بيانات القفل تصل فقط ضمن رد `login` لمن أثبت
  معرفته بالبريد.

---

## 6. نقاط النهاية الأساسية (API Endpoints)

### 6.1 المصادقة
```
POST   /api/auth/register           تسجيل مستخدم جديد
POST   /api/auth/login              تسجيل دخول بالبريد
POST   /api/auth/refresh            تحديث الرمز
POST   /api/auth/logout             تسجيل خروج
POST   /api/auth/forgot-password    طلب إعادة تعيين كلمة السر
POST   /api/auth/reset-password     تأكيد إعادة تعيين كلمة السر
```

### 6.2 الهاتف والـ OTP
```
POST   /api/auth/phone/register     تسجيل بالهاتف (إرسال OTP)
POST   /api/auth/phone/verify       التحقق من OTP وإنشاء الحساب
POST   /api/auth/phone/login        تسجيل دخول بالهاتف + كلمة سر
POST   /api/otp/send                إرسال OTP
POST   /api/otp/verify              التحقق من OTP
```

### 6.3 الشبكات الاجتماعية
```
POST   /api/auth/social/google      تسجيل دخول / تسجيل مع Google
POST   /api/auth/social/apple       تسجيل دخول / تسجيل مع Apple
```

---

## 7. أمثلة عملية (Examples)

### 7.1 تسجيل مستخدم مع التحقق من كلمة المرور

**الطلب:**
```typescript
POST /api/auth/register
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "password": "SecureP@ssw0rd123"
}
```

**الاستجابة الناجحة (200):**
```typescript
{
  "message": "Registration successful",
  "userId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**الاستجابة الفاشلة (422):**
```typescript
{
  "message": "Validation failed",
  "errors": {
    "password": [
      "Password must contain at least one special character"
    ]
  },
  "statusCode": 422
}
```

### 7.2 تسجيل الدخول مع معالجة الأخطاء

**الطلب:**
```typescript
POST /api/auth/login
{
  "email": "john@example.com",
  "password": "WrongPassword"
}
```

**الاستجابة الفاشلة (401):**
```typescript
{
  "message": "Invalid email or password",
  "errorCode": "INVALID_CREDENTIALS",
  "statusCode": 401
}
```

### 7.3 تسجيل بالهاتف عبر OTP

**الخطوة 1: إرسال OTP**
```typescript
POST /api/otp/send
{
  "phoneNumber": "+1234567890",
  "purpose": "PhoneRegistration"
}
```

**الاستجابة:**
```typescript
{
  "message": "OTP sent successfully",
  "expiresInSeconds": 600
}
```

**الخطوة 2: التحقق من OTP وإنشاء الحساب**
```typescript
POST /api/auth/phone/verify
{
  "phoneNumber": "+1234567890",
  "code": "123456",
  "password": "SecureP@ssw0rd123",
  "firstName": "John",
  "lastName": "Doe",
  "purpose": "PhoneRegistration"
}
```

**الاستجابة:**
```typescript
{
  "message": "Account created successfully",
  "succeeded": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600
}
```

---

## 8. معالجة الأخطاء في الأمام (Frontend Error Handling)

### 8.1 اعتراض الأخطاء
```typescript
// في auth.service.ts
private handleAuthError(error: HttpErrorResponse): Observable<never> {
  const errorCode = error.error?.errorCode || 'UNKNOWN_ERROR';
  
  switch (errorCode) {
    case 'INVALID_CREDENTIALS':
      this.toast.error('Invalid email or password');
      break;
    case 'PASSWORD_POLICY_FAILED':
      this.handlePasswordPolicyError(error.error?.errors);
      break;
    case 'OTP_WRONG':
      this.toast.error('OTP code is incorrect');
      break;
    default:
      this.toast.error(error.error?.message || 'An error occurred');
  }
  
  return throwError(() => error);
}

private handlePasswordPolicyError(errors?: Record<string, string[]>): void {
  if (!errors) return;
  
  Object.values(errors).flat().forEach(message => {
    this.toast.error(message);
  });
}
```

### 8.2 عرض أخطاء التحقق
```typescript
// في login.component.ts
private displayValidationErrors(response: any): void {
  const errors = response.error?.errors;
  
  if (errors) {
    Object.entries(errors).forEach(([field, messages]) => {
      const messages_array = messages as string[];
      messages_array.forEach(msg => {
        this.toast.error(msg);
      });
    });
  }
}
```

---

## 9. معايير التطوير (Development Standards)

### ✅ المتطلبات
1. **توثق أي نقطة نهاية جديدة** في هذا الملف
2. **استخدم camelCase بشكل حصري** في JSON و TypeScript
3. **أرسل رموز أخطاء موحدة** من الخلفية
4. **اختبر التوافق** قبل الدمج
5. **حدّث النماذج TypeScript** إذا تغيرت أي استجابة

### ❌ أخطاء شائعة
- ❌ المزج بين PascalCase و camelCase
- ❌ أرسال رسائل خطأ مختلفة لنفس المشكلة
- ❌ عدم توثيق رموز الأخطاء الجديدة
- ❌ تغيير شكل الاستجابة دون إخطار الأمام

---

## 10. قائمة التحقق قبل الإطلاق (Pre-Release Checklist)

- [ ] جميع النقاط النهاية توثّق في هذا الملف
- [ ] تم اختبار معالجة الأخطاء لكل حالة
- [ ] تم التحقق من تسمية الحقول (camelCase)
- [ ] تم اختبار OTP مع الخلفية الفعلية
- [ ] تم التحقق من معالجة الرموز (tokens)
- [ ] تم اختبار تحديث الرموز
- [ ] تم اختبار معالجة انتهاء الصلاحية
- [ ] تم التحقق من رسائل الخطأ المترجمة

---

## 11. الاشتراكات والخطط (Subscriptions & Plans) — عقد مخطَّط، غير منفَّذ بعد

> **الحالة: لا يوجد أي تنفيذ في الباك-إند.** بحث شامل في `PropertyApi` عن
> `subscription | plan | billing | invoice | payment gateway | agency | tenant`
> أعطى صفر نتائج: لا كيان، لا جدول، لا migration، لا Controller.
> هذا القسم يوثّق العقد المتفق عليه **قبل** بنائه، لأن §9 من هذا الملف يوجب توثيق
> أي نقطة نهاية جديدة هنا.

### 11.1 الوضع الحالي في الواجهة

صفحة `/pricing` تعمل اليوم **دون أي اتصال بالخلفية**، وتعرض **أربع خطط**. الكتالوج ثابت في:

- `src/app/core/models/subscription-plan.model.ts` → `SUBSCRIPTION_PLANS`
- `src/app/core/api/plans-api.service.ts` → `PlansApiService.getPlans()`

`getPlans()` يعيد الكتالوج المحلي عبر `of(...)`. الدالة `getPlansFromApi()` مكتوبة
بالكامل مقابل العقد أدناه (مع `toPlans()` الذي يعالج PascalCase عبر `apiToCamelCase`)،
فالتبديل عند جاهزية الخلفية هو **سطر واحد** داخل `getPlans()`.

| الخطة | السعر | حد العقارات | حسابات الوكلاء | الموظفون | التقارير | ظهور مميز |
|---|---|---|---|---|---|---|
| **المجانية** | مجاناً | إعلان المالك الخاص، صالح 3 أشهر | — | — | — | — |
| **الأساسية** | ‎$49 / شهرياً | 50 | 1 | 3 | أساسية | — |
| **بريميوم** *(يُنصح بها)* | ‎$99 / شهرياً | 250 | 3 | 10 | أساسية + تحليلات متقدمة | ✔ |
| **النخبة** | تواصل معنا | يُتفق عليه | يُتفق عليه | يُتفق عليه | مخصصة | ✔ |

**وجهات أزرار الدعوة للإجراء (CTA):**

- الخطة **المجانية** → `‎/property-form‎` — مسار موجود وعامل اليوم خلف `AuthGuard`،
  فالمستخدم غير المسجَّل يُوجَّه لتسجيل الدخول ثم ينشر إعلانه فعلاً.
- الخطط **المدفوعة** → `‎/kontakt?plan=<tier>‎` — أي أن مسار الاشتراك ينتهي عند
  `POST /api/Contact` الموجود فعلاً. **لا توجد بوابة دفع، ولم تُعرض واجهة دفع وهمية.**

الوجهتان تُشتقّان في الواجهة (`PlansApiService.toCta()`) ولا تأتيان من الخادم عمداً:
تسليم الخادم رابطاً للتنقّل إليه يفتح سطح open-redirect بلا مقابل.

### 11.2 `GET /api/plans` — كتالوج الخطط العام

- الصلاحية: `[AllowAnonymous]` (صفحة تسويقية عامة).
- ⚠️ **إلزامي:** إضافة المسار إلى `ApprovedAnonymousEndpoints` في
  `tests/PropertyApi.Architecture.Tests/Api/PublicEndpointPolicyTests.cs`،
  وإلا **يفشل البناء** بسبب سياسة الرفض الافتراضي (`FallbackPolicy`) في `Program.cs`.

الاستجابة — `200 OK`:

```json
[
  {
    "tier": "free",
    "nameKey": "PRICING.FREE.NAME",
    "taglineKey": "PRICING.FREE.TAGLINE",
    "priceKind": "free",
    "priceUsd": 0,
    "featureKeys": ["PRICING.FREE.F1", "PRICING.FREE.F2", "PRICING.FREE.F3", "PRICING.FREE.F4"],
    "noteKey": "PRICING.FREE.NOTE",
    "isRecommended": false,
    "ctaKey": "PRICING.FREE.CTA"
  },
  {
    "tier": "premium",
    "nameKey": "PRICING.PREMIUM.NAME",
    "taglineKey": "PRICING.PREMIUM.TAGLINE",
    "priceKind": "monthly",
    "priceUsd": 99,
    "featureKeys": ["PRICING.PREMIUM.F1", "PRICING.PREMIUM.F2", "PRICING.PREMIUM.F3", "PRICING.PREMIUM.F4", "PRICING.PREMIUM.F5"],
    "isRecommended": true,
    "ctaKey": "PRICING.PREMIUM.CTA"
  }
]
```

| الحقل | النوع | ملاحظات |
|---|---|---|
| `tier` | `"free" \| "basic" \| "premium" \| "elite"` | أي قيمة أخرى تُعامَل كـ `basic` في `toTier()` |
| `priceKind` | `"free" \| "monthly" \| "contact"` | أي قيمة أخرى تُعامَل كـ `monthly` في `toPriceKind()` |
| `priceUsd` | `number \| null` | `0` للخطة المجانية، و`null` إلزامياً عندما يكون `priceKind = "contact"` |
| `featureKeys` | `string[]` | **مفاتيح ترجمة، لا نصوص** — الخلفية لا ترسل نصاً معروضاً |
| `noteKey` | `string?` | اختياري. شرط على الخطة لا ميزة فيها — يُعرض خارج قائمة العلامات (✓) عمداً |
| `isRecommended` | `bool` | خطة واحدة فقط تحملها؛ تقود تمييز البطاقة بصرياً |

**قرار تصميمي مقصود:** الخلفية ترسل **مفاتيح i18n وليس نصوصاً**. السبب أن الواجهة
تدعم ثلاث لغات (ar/en/de) من `public/i18n/*.json`، وإرسال نص جاهز من الخادم يكسر
تبديل اللغة الفوري ويضاعف مصدر الحقيقة. الأرقام فقط هي بيانات.

**تمييز `noteKey` عن `featureKeys` ليس تجميلاً:** نص الخطة المجانية يتضمن شرطاً سلبياً
(«يُحذف الإعلان تلقائياً إن لم يُمدَّد»). وضعه في `featureKeys` يعني عرضه خلف علامة ✓
خضراء بوصفه ميزة يحصل عليها المستخدم — وهذا تضليل، لا خطأ تنسيق.

### 11.3 `GET /api/subscriptions/me` — اشتراك المستخدم الحالي

- الصلاحية: `[Authorize]`.
- `200 OK` باشتراك فعّال، أو `204 No Content` إن لم يوجد.

```json
{
  "tier": "premium",
  "status": "active",
  "startedAt": "2026-08-23T10:00:00Z",
  "renewsAt": "2026-09-23T10:00:00Z",
  "agentSeatsUsed": 2,
  "agentSeatsLimit": 3,
  "staffSeatsUsed": 6,
  "staffSeatsLimit": 10,
  "listingsUsed": 122,
  "listingsLimit": 250
}
```

مقعدان منفصلان لا مقعد واحد: الخطط تفرّق صراحةً بين **حساب الوكيل** (ينشر ويملك عقارات)
و**الموظف في المكتب** (وصول تشغيلي بلا ملكية عقارات). أي حد واحد مشترك يخلط الدورين.
`listingsLimit: null` تعني "غير محدود" (تُستخدم في خطة النخبة عند الاتفاق عليها).

### 11.4 `POST /api/subscriptions` — بدء اشتراك

- الصلاحية: `[Authorize]`.
- الطلب: `{ "tier": "premium", "billingCycle": "monthly" }`
- الاستجابة: `202 Accepted` + `{ "checkoutUrl": "..." }` عند وجود بوابة دفع.
- `tier: "free"` **يجب أن يُرفض بـ `400`** — الخطة المجانية ليست اشتراكاً يُشترى،
  بل الحالة الافتراضية لأي حساب.

### 11.5 شروط مسبقة قبل بناء أي من هذا

مأخوذة من `عقار-تيك-تقييم-معماري.md` §9، وهي شروط **حاكمة** لا اقتراحات:

1. **حقول `Transaction` النصية** حُوّلت فعلاً إلى enums في migration
   `20260819084018_ConvertTransactionFieldsToEnums` — هذا الشرط **مستوفى**.
   لكن `Transaction` ما زال **جدولاً بلا كود**: صفر مراجع له في طبقتَي Application وAPI.
2. **كيان `Agency`** يحتاج Design Spike مستقلاً قبل البرمجة. الخطط أعلاه تفترض
   مقاعد وكلاء **ومقاعد موظفين منفصلة** — وكلاهما مفهوم لا وجود له في الدومين حالياً؛
   `Property.AgentId` هو FK مفرد إلى `UserAccount`، لا مكتب متعدد الموظفين.
3. **`Property.IsFeatured` / `FeaturedUntil`** موجودان كحقلين ميتين (فهرسان في
   `PropertyConfiguration.cs` فقط، ولا يقرؤهما أو يكتبهما أي كود). ميزة
   "ظهور مميز في نتائج البحث" في خطة بريميوم تُبنى فوقهما — لكن ذلك يتطلب أولاً
   أن يقوم `GetPropertiesListQuery` بالترتيب عليهما، وهو غير منفَّذ.

### 11.6 الخطة المجانية: دورة صلاحية الإعلان — **مبنيَّة في الخلفية (2026-08-23)**

> **تصحيح لنسخة سابقة من هذا القسم.** كان يذكر أن عمود `ExpiresAt` ومُنتِج الإشعارات
> **غير موجودين**. كلاهما كان موجوداً فعلاً: `Property.ExpiresAt` منذ أول migration،
> و`PublishPropertyCommandHandler` يضبطه بـ 90 يوماً عند النشر، و`PropertyRepository`
> يستبعد المنتهي من البحث أصلاً، و`INotificationService` مع `SavedSearchMatchHostedService`
> مُنتِج إشعارات عامل. الادعاء السابق كُتب دون قراءة مصدر الخلفية — وهو خطأ تحقّق لا خطأ رأي.
>
> الناقص فعلاً كان **ما بعد انقضاء التاريخ**: الحالة تبقى `Available`، والمالك لا يُبلَّغ،
> ولا شيء ينظّف. الفلتر يخفي الإعلان؛ لا شيء كان يجعل الانتهاء **حدثاً**.

**البنود النافذة** — مصدرها الوحيد `PropertyApi.Domain/Listings/ListingLifecyclePolicy.cs`:

| البند | القيمة |
|---|---|
| مدة النشر (وما يمنحه تمديد واحد) | 90 يوماً |
| التنبيه قبل الانتهاء | 7 أيام |
| مهلة السماح بعد الانتهاء قبل الحذف | 30 يوماً |
| حدّ الإعلانات النشطة في الخطة المجانية | **1** |
| رسوم تمديد إعلان واحد | **1.00 دولار** |

**ما بُني:**

| المكوّن | الحالة |
|---|---|
| `PropertyStatus.Expired` (يُخزَّن نصاً) | ✅ جديد |
| `Property.ExpiryWarningSentAt` + migration `20260823183821` | ✅ جديد — عمود واحد وفهرسان، قابل للتراجع |
| `ListingExpiryHostedService` — تنبيه ← انتهاء ← حذف، كل 6 ساعات، 200 صف لكل مرحلة | ✅ جديد |
| إشعارا `ListingExpiringSoon` و`ListingExpired` — نص عربي + دفع عبر SignalR | ✅ جديد |
| فرض حدّ الإعلان الواحد في `CreatePropertyCommandHandler` ⇒ `409 Conflict` | ✅ جديد |
| `POST /api/properties/{id}/extension` ⇒ `202 Accepted` + عرض سعر | ✅ جديد |
| `POST /api/properties/extension/{transactionId}/confirm` ⇒ إداري فقط | ✅ جديد |
| 16 اختباراً في `ListingLifecycleTests.cs` | ✅ جديد |

**الحذف ناعم:** `Status = Expired` ← إخفاء من البحث ← بعد 30 يوماً `IsDeleted = true`.
الصف يبقى في قاعدة البيانات للتدقيق والاسترجاع. لا شيء في هذا المستودع يحذف `Property`
فيزيائياً — حتى `Remove()` في المستودع يُعترَض ويُحوَّل إلى `IsDeleted = true` — ومهمة تعمل
بلا إشراف هي آخر مكان يُكسر فيه ذلك.

### 11.6.1 نقاط النهاية الجديدة

**`POST /api/properties/{id}/extension`** — `[Authorize]`، للمالك فقط.

```json
{
  "transactionId": "…",
  "propertyId": "…",
  "amountUsd": 1.00,
  "extensionDays": 90,
  "expiresAt": "2026-08-20T10:00:00Z",
  "graceEndsAt": "2026-09-19T10:00:00Z",
  "isExistingPendingFee": false
}
```

- `202 Accepted` لا `200 OK` عمداً: هذا **تسجيل مبلغ مستحق فقط**، والإعلان **لم يُمدَّد**.
- `409` إن كان الإعلان ما زال ضمن مدته، أو انقضت مهلة السماح.
- `403` لغير المالك · `404` إن لم يوجد أو كان محذوفاً.
- **تكراري الاستدعاء آمن:** الضغط مرتين يُعيد نفس المعاملة مع `isExistingPendingFee: true`
  ولا ينشئ رسوماً ثانية.

**`POST /api/properties/extension/{transactionId}/confirm`** — `[Authorize(Roles = Admin)]`.
يُسوّي المعاملة ويمنح مدة نشر جديدة، ويعيد `{ "expiresAt": "…" }`.

⚠️ **ما زال غير موجود — ولا يجوز قراءته كمنجَز:**

1. **لا بوابة دفع.** التمديد يُمنح فقط عبر نقطة النهاية الإدارية. لو نُقل هذا المسار إلى
   نقطة نهاية يستدعيها المالك، تصبح الرسوم اختيارية ويحصل الجميع على تمديد مجاني. هذه هي
   النقطة الوحيدة التي تتصل بها بوابة الدفع مستقبلاً.
2. **لا كيان `Subscription`.** لا سبيل لمعرفة خطة المستخدم، فكل الحسابات تُعامَل كخطة
   مجانية والحدّ 1 يسري عليها جميعاً. من يملك أكثر من إعلان اليوم يحتفظ بها كلها — لا حذف
   رجعي — لكنه لا يستطيع إنشاء إعلان جديد حتى يعود تحت الحدّ.
3. **مبلغ الدولار الواحد مبدئي.** قيمة واحدة في `ListingLifecyclePolicy`، وتغييرها سطر واحد.
   لم يُعرض هذا الرقم على صفحة `/pricing` بعد.
