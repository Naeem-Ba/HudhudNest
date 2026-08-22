# 📋 دليل التكامل - تحسين التوافق بين الأمام والخلف

## نظرة عامة
هذا الدليل يوضح كيفية دمج الخدمات الجديدة في المشروع الحالي لتحسين التوافق بين الواجهة والخلفية.

---

## 1. الخدمات الجديدة المضافة

### 1.1 ApiErrorService
**الملف:** `src/app/core/api/api-error.service.ts`

**الوظيفة:**
- معالجة موحدة لأخطاء API
- قراءة دفاعية تدعم PascalCase و camelCase
- توليد رسائل خطأ موحدة

**الاستخدام:**
```typescript
import { ApiErrorService } from '../core/api/api-error.service';

constructor(private errorService: ApiErrorService) {}

// في معالج الخطأ
this.authApi.login(request).subscribe({
  error: (error) => {
    const formatted = this.errorService.formatError(error);
    this.toast.error(formatted.message);
    
    // عرض أخطاء التحقق إن وجدت
    if (formatted.validationErrors) {
      this.displayValidationErrors(formatted.validationErrors);
    }
  }
});
```

### 1.2 PasswordValidatorService
**الملف:** `src/app/core/services/password-validator.service.ts`

**الوظيفة:**
- التحقق من قوة كلمة المرور
- إرجاع قائمة بالمتطلبات غير المستوفاة
- مزامنة المتطلبات بين الأمام والخلف

**الاستخدام:**
```typescript
import { PasswordValidatorService } from '../core/services/password-validator.service';

constructor(private passwordValidator: PasswordValidatorService) {}

onPasswordChange(password: string): void {
  const result = this.passwordValidator.validate(password);
  
  if (!result.isValid) {
    this.passwordErrors = result.errors;
    this.registerData.Password = '';
  }
}
```

### 1.3 PasswordStrengthIndicatorComponent
**الملف:** `src/app/shared/ui/password-strength-indicator.component.ts`

**الوظيفة:**
- عرض مرئي لقوة كلمة المرور
- عرض قائمة بالمتطلبات بشكل تفاعلي
- تحديث فوري مع كل تغيير

**الاستخدام في القالب:**
```html
<input 
  type="password" 
  [(ngModel)]="registerData.Password"
  (ngModelChange)="onPasswordChange($event)">

<app-password-strength-indicator 
  [password]="registerData.Password">
</app-password-strength-indicator>
```

---

## 2. تحديث المكونات الموجودة

### 2.1 تحديث LoginComponent

**الخطوة 1: إضافة الخدمات الجديدة**
```typescript
import { ApiErrorService } from '../../../core/api/api-error.service';
import { PasswordValidatorService } from '../../../core/services/password-validator.service';
import { PasswordStrengthIndicatorComponent } from '../../../shared/ui/password-strength-indicator.component';

@Component({
  // ...
  imports: [
    // ...existing imports...
    PasswordStrengthIndicatorComponent
  ]
})
export class LoginComponent implements OnDestroy {
  constructor(
    private readonly authApi: AuthApiService,
    private readonly authState: AuthService,
    private readonly errorService: ApiErrorService,      // جديد
    private readonly passwordValidator: PasswordValidatorService, // جديد
    // ...other services...
  ) {}
}
```

**الخطوة 2: تحسين معالجة أخطاء التسجيل**
```typescript
onRegister(form: NgForm): void {
  this.submitted = true;
  form.control.markAllAsTouched();

  if (form.invalid || this.loading) {
    this.setError(this.t('AUTH.ERRORS.FIX_FIELDS'));
    return;
  }

  // تحقق من كلمة المرور قبل الإرسال
  const passwordValidation = this.passwordValidator.validate(this.registerData.Password);
  if (!passwordValidation.isValid) {
    this.setError('كلمة المرور لا تستوفي المتطلبات الأمنية');
    return;
  }

  this.loading = true;
  this.message = '';

  const firstName = this.registerData.FirstName.trim();
  const lastName = this.registerData.LastName.trim();
  const email = this.registerData.Email.trim().toLowerCase();
  const password = this.registerData.Password;

  this.authApi.register({ firstName, lastName, email, password }).subscribe({
    next: () => {
      // نفس المنطق الموجود
    },
    error: (error) => {
      this.loading = false;
      const formatted = this.errorService.formatError(error);
      
      // عرض رسالة الخطأ الموحدة
      this.setError(formatted.message);
      
      // عرض أخطاء التحقق من البيانات بالتفصيل
      if (formatted.validationErrors) {
        this.displayDetailedErrors(formatted.validationErrors);
      }
    }
  });
}

private displayDetailedErrors(errors: Record<string, string[]>): void {
  Object.entries(errors).forEach(([field, messages]) => {
    messages.forEach(msg => {
      this.toast.error(msg);
    });
  });
}
```

**الخطوة 3: تحسين معالجة أخطاء OTP**
```typescript
private getOtpErrorMessage(error: unknown, fallbackKey: string): string {
  const formatted = this.errorService.formatError(error);
  
  // استخدام الخدمة الموحدة بدلاً من الكود المكرر
  return this.errorService.getErrorMessage(formatted.code, this.t(fallbackKey));
}
```

### 2.2 تحديث auth-api.service.ts

**إضافة معالجة أخطاء موحدة:**
```typescript
import { ApiErrorService } from './api-error.service';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  constructor(
    private readonly api: BackendApiService,
    private readonly tokenStorage: TokenStorageService,
    private readonly errorService: ApiErrorService  // جديد
  ) {}

  register(request: RegisterRequest): Observable<RegisterResponse> {
    return this.api.post<RegisterResponse>('/auth/register', request).pipe(
      catchError(error => {
        const formatted = this.errorService.formatError(error);
        
        // يمكن إضافة معالجة محددة بناءً على الكود
        if (this.errorService.shouldRedirectToLogin(formatted.statusCode, formatted.code)) {
          this.tokenStorage.clear();
        }
        
        return throwError(() => error);
      })
    );
  }
}
```

---

## 3. تحديث النماذج في auth.model.ts

**ملاحظة مهمة:** تأكد من أن جميع النماذج تستخدم camelCase:

```typescript
// ✅ صحيح
export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

// إذا كانت الخلفية تستخدم PascalCase، تأكد من الـ serializer:
// [JsonPropertyName("firstName")]
// public string FirstName { get; set; }
```

---

## 4. تحديث الاختبارات

### 4.1 اختبار PasswordValidatorService

```typescript
import { TestBed } from '@angular/core/testing';
import { PasswordValidatorService } from './password-validator.service';

describe('PasswordValidatorService', () => {
  let service: PasswordValidatorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PasswordValidatorService);
  });

  it('should reject passwords with less than 8 characters', () => {
    const result = service.validate('Pass1!');
    expect(result.isValid).toBeFalse();
    expect(result.requirements.minLength).toBeFalse();
  });

  it('should accept strong passwords', () => {
    const result = service.validate('SecureP@ssw0rd');
    expect(result.isValid).toBeTrue();
  });

  it('should reject passwords without uppercase', () => {
    const result = service.validate('securepass1!');
    expect(result.requirements.hasUppercase).toBeFalse();
  });

  it('should reject passwords without special character', () => {
    const result = service.validate('SecurePassword123');
    expect(result.requirements.hasSpecialChar).toBeFalse();
  });
});
```

### 4.2 اختبار ApiErrorService

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiErrorService } from './api-error.service';

describe('ApiErrorService', () => {
  let service: ApiErrorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApiErrorService);
  });

  it('should handle PascalCase error codes', () => {
    const error = new HttpErrorResponse({
      error: { ErrorCode: 'INVALID_CREDENTIALS' }
    });
    
    const formatted = service.formatError(error);
    expect(formatted.code).toBe('INVALID_CREDENTIALS');
  });

  it('should handle camelCase error codes', () => {
    const error = new HttpErrorResponse({
      error: { errorCode: 'INVALID_CREDENTIALS' }
    });
    
    const formatted = service.formatError(error);
    expect(formatted.code).toBe('INVALID_CREDENTIALS');
  });

  it('should flatten validation errors', () => {
    const errors = {
      password: ['Too short', 'No uppercase'],
      email: ['Invalid format']
    };
    
    const flat = service.flattenValidationErrors(errors);
    expect(flat).toEqual(['Too short', 'No uppercase', 'Invalid format']);
  });
});
```

---

## 5. قائمة الفحص (Checklist)

### قبل الدمج
- [ ] تم قراءة FRONTEND_BACKEND_CONTRACT.md
- [ ] تم فهم معايير التسمية (camelCase)
- [ ] تم فهم صيغة الأخطاء الموحدة

### خلال الدمج
- [ ] تم نسخ الخدمات الجديدة إلى المشروع
- [ ] تم تحديث LoginComponent
- [ ] تم تحديث auth-api.service.ts
- [ ] تم التحقق من النماذج (camelCase)
- [ ] تم تشغيل الاختبارات المحلية

### بعد الدمج
- [ ] اختبار تسجيل مستخدم جديد مع كلمة مرور ضعيفة
- [ ] اختبار رسائل الخطأ من الخلفية
- [ ] اختبار OTP والرسائل
- [ ] اختبار تحديث الرموز
- [ ] اختبار إعادة التوجيه عند انتهاء الصلاحية

---

## 6. نصائح لحل المشاكل الشائعة

### المشكلة: رسائل الخطأ لا تظهر
**الحل:**
1. تحقق من أن الخلفية ترسل `errorCode` أو `ErrorCode`
2. تأكد من استخدام `errorService.formatError()`
3. تحقق من رسائل الترجمة في ملفات i18n

### المشكلة: كلمة المرور لا تقبل الأحرف الخاصة الصحيحة
**الحل:**
1. تأكد من أن الخلفية والأمام يستخدمان نفس قائمة الأحرف الخاصة
2. تحقق من الـ regex في `PasswordValidatorService`

### المشكلة: OTP لا تُعرض رسائل الخطأ بشكل صحيح
**الحل:**
1. استخدم `getOtpErrorMessage()` بدلاً من الكود المخصص
2. تأكد من أن الخلفية ترسل `errorCode` موحد

---

## 7. مراجع إضافية

- [FRONTEND_BACKEND_CONTRACT.md](./FRONTEND_BACKEND_CONTRACT.md) - العقد الموحد
- [PasswordValidatorService](./src/app/core/services/password-validator.service.ts) - الخدمة
- [ApiErrorService](./src/app/core/api/api-error.service.ts) - معالج الأخطاء

---

## 8. الدعم والأسئلة

للأسئلة أو المشاكل:
1. تحقق من رسائل وحدة التحكم (Console) في المتصفح
2. تحقق من Network tab في DevTools
3. راجع FRONTEND_BACKEND_CONTRACT.md للتحقق من الالتزام بالعقد
