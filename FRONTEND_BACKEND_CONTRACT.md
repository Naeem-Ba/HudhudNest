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
