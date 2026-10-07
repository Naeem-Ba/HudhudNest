import { Injectable } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { BackendApiService } from '../api/backend-api.service';
import { withUiLanguage } from '../i18n/ui-language';
import { TokenStorageService } from '../services/token-storage.service';
import { normalizePhoneInput } from './phone-number';
import {
  AuthTokenResponse,
  OtpChannel,
  OtpChannelOption,
  PhoneLoginRequest,
  PhoneWorkflowResponse,
  normalizeAuthTokenResponse,
  normalizeOtpChannels,
  normalizePhoneWorkflowResult
} from '../models/auth.model';

/**
 * تدفق المصادقة الموازي الكامل عبر PhonePasswordAuthController
 * (`api/auth/phone/...`) — راجع docs/phone-password-authentication-and-reverification.md
 * على الباك للتصميم الكامل. كل نقاط النهاية العشر موثّقة هنا.
 *
 * ✅ `login()` كانت الوحيدة المُنفَّذة سابقًا وبقيت كما هي دون أي تغيير.
 */
@Injectable({ providedIn: 'root' })
export class PhoneAuthApiService {
  constructor(
    private readonly api: BackendApiService,
    private readonly tokenStorage: TokenStorageService
  ) {}

  /**
   * POST /auth/phone/channels — وسائل إيصال الرمز (SMS / Telegram / WhatsApp) المتاحة لهذا الرقم،
   * مع سبب عدم التوفر وقائمة الدول التي لا تعمل فيها كل وسيلة. الرقم اختياري؛ بدونه (أو برقم غير صالح)
   * يعيد الباك الصورة الخالية من الدولة. الإجابة لا تكشف إن كان للرقم حساب أو حساب Telegram.
   */
  getOtpChannels(phoneNumber?: string): Observable<OtpChannelOption[]> {
    const phone = phoneNumber ? normalizePhoneInput(phoneNumber) : null;
    return this.api
      .post<unknown>('/auth/phone/channels', { phoneNumber: phone })
      .pipe(map(response => normalizeOtpChannels(response)));
  }

  // ── 1) تسجيل حساب جديد بالهاتف + كلمة السر ─────────────────────────────

  /** POST /auth/phone/registration/send-otp — استجابة عامة دائمًا (لا تكشف إن كان الرقم مسجّلاً). */
  sendRegistrationOtp(phoneNumber: string, channel?: OtpChannel): Observable<PhoneWorkflowResponse> {
    return this.sendChallenge('/auth/phone/registration/send-otp', phoneNumber, channel);
  }

  /**
   * POST /auth/phone/registration/verify
   * يُنشئ الحساب مباشرة (Identity + الدور + رمز التحديث) في نفس الطلب،
   * ويعيد accessToken/refreshToken عند النجاح — يخزَّنان تلقائيًا.
   */
  register(request: {
    challengeId: string;
    code: string;
    password: string;
    firstName: string;
    lastName: string;
    channel?: OtpChannel;
  }): Observable<PhoneWorkflowResponse> {
    return this.api
      .post<unknown>('/auth/phone/registration/verify', {
        challengeId: request.challengeId,
        code: request.code.trim(),
        password: request.password,
        firstName: request.firstName.trim(),
        lastName: request.lastName.trim(),
        ...channelField(request.channel)
      })
      .pipe(
        map(response => normalizePhoneWorkflowResult(response)),
        tap(result => this.storeTokensIfPresent(result))
      );
  }

  // ── 2) تسجيل الدخول برقم الهاتف + كلمة السر (بدون OTP) ──────────────────

  login(request: PhoneLoginRequest): Observable<AuthTokenResponse> {
    const payload: PhoneLoginRequest = {
      phoneNumber: normalizePhoneInput(request.phoneNumber),
      password: request.password
    };

    return this.api.post<unknown>('/auth/phone/login', payload).pipe(
      map(response => normalizeAuthTokenResponse(response)),
      tap(response => this.tokenStorage.storeTokens(response))
    );
  }

  // ── 3) استعادة كلمة السر عبر الهاتف (ثلاث خطوات) ────────────────────────

  /** POST /auth/phone/password-reset/send-otp — استجابة عامة دائمًا. */
  sendPasswordResetOtp(phoneNumber: string, channel?: OtpChannel): Observable<PhoneWorkflowResponse> {
    return this.sendChallenge('/auth/phone/password-reset/send-otp', phoneNumber, channel);
  }

  /** POST /auth/phone/password-reset/verify — يبادل رمز الـ OTP برمز تأكيد (ConfirmationToken). */
  verifyPasswordReset(challengeId: string, code: string, channel?: OtpChannel): Observable<PhoneWorkflowResponse> {
    return this.api
      .post<unknown>('/auth/phone/password-reset/verify', { challengeId, code: code.trim(), ...channelField(channel) })
      .pipe(map(response => normalizePhoneWorkflowResult(response)));
  }

  /** POST /auth/phone/password-reset/confirm — يستهلك ConfirmationToken ويُبطل الجلسات النشطة. */
  confirmPasswordReset(request: {
    phoneNumber: string;
    confirmationToken: string;
    newPassword: string;
  }): Observable<PhoneWorkflowResponse> {
    return this.api
      .post<unknown>('/auth/phone/password-reset/confirm', {
        phoneNumber: normalizePhoneInput(request.phoneNumber),
        confirmationToken: request.confirmationToken,
        newPassword: request.newPassword
      })
      .pipe(map(response => normalizePhoneWorkflowResult(response)));
  }

  // ── 4) إعادة تحقق الهوية لحساب مُقيَّد (يتطلب تسجيل دخول) ────────────────

  /** GET /auth/phone/reverification/status — الحالة الحالية والمواعيد النهائية. */
  getReverificationStatus(): Observable<PhoneWorkflowResponse> {
    return this.api
      .get<unknown>('/auth/phone/reverification/status')
      .pipe(map(response => normalizePhoneWorkflowResult(response)));
  }

  /** POST /auth/phone/reverification/send-otp — يُرسَل إلى الرقم المسجَّل على الحساب. */
  sendReverificationOtp(phoneNumber: string, channel?: OtpChannel): Observable<PhoneWorkflowResponse> {
    return this.sendChallenge('/auth/phone/reverification/send-otp', phoneNumber, channel);
  }

  /** POST /auth/phone/reverification/verify — يعيد الحالة إلى Verified. */
  verifyReverification(challengeId: string, code: string, channel?: OtpChannel): Observable<PhoneWorkflowResponse> {
    return this.api
      .post<unknown>('/auth/phone/reverification/verify', { challengeId, code: code.trim(), ...channelField(channel) })
      .pipe(map(response => normalizePhoneWorkflowResult(response)));
  }

  // ── 5) تغيير رقم الهاتف من داخل البروفايل (يتطلب تسجيل دخول + كلمة السر) ─

  /** POST /auth/phone/change/send-otp — يُرسَل إلى الرقم الجديد قبل اعتماده. */
  sendPhoneChangeOtp(newPhoneNumber: string, channel?: OtpChannel): Observable<PhoneWorkflowResponse> {
    return this.sendChallenge('/auth/phone/change/send-otp', newPhoneNumber, channel);
  }

  /** POST /auth/phone/change/verify — يتطلب كلمة السر الحالية ويُبطل الجلسات النشطة. */
  verifyPhoneChange(request: {
    challengeId: string;
    code: string;
    currentPassword: string;
    channel?: OtpChannel;
  }): Observable<PhoneWorkflowResponse> {
    return this.api
      .post<unknown>('/auth/phone/change/verify', {
        challengeId: request.challengeId,
        code: request.code.trim(),
        currentPassword: request.currentPassword,
        ...channelField(request.channel)
      })
      .pipe(
        map(response => normalizePhoneWorkflowResult(response)),
        tap(result => this.storeTokensIfPresent(result))
      );
  }

  // ── 6) بريد إلكتروني ثانوي (email/add + email/verify) ───────────────────
  // ✅ إضافة: PhoneAuthController كان يوفّر هذين المسارين بلا أي استهلاك من
  // الواجهة. التدفق مختلف عن OTP الهاتف: email/add يتطلب تسجيل دخول (Bearer)
  // ويُرسل رابط تفعيل بالبريد (وليس كودًا يُكتَب يدويًا)، والمستخدم يفعّله
  // بالنقر على الرابط الذي يفتح صفحة auth/verify-email التي تستدعي
  // email/verify تلقائيًا بالـ userId + token من الـ query params.

  /**
   * POST /auth/email/add — يتطلب تسجيل دخول (BackendApiService يُرفق التوكن
   * تلقائيًا عبر الـ interceptor). الباك اند يرفض الطلب إن كان لدى الحساب
   * بريد مفعّل بالفعل (EMAIL_ALREADY_SET) أو إن كان البريد مستخدَمًا من حساب
   * آخر (EMAIL_TAKEN) — الأخطاء تصل كـ HttpErrorResponse.status === 400 مع
   * error.code، ونتركها لتُعالَج في المكوّن المستدعي.
   */
  addEmail(email: string): Observable<{ message: string; verificationSent?: boolean }> {
    return this.api.post<{ message: string; verificationSent?: boolean }>(
      '/auth/email/add',
      withUiLanguage({ email: email.trim().toLowerCase() })
    );
  }

  /**
   * POST /auth/email/verify — [AllowAnonymous] عمدًا بالباك اند لأن المستخدم
   * قد يفتح رابط التفعيل من جهاز/متصفح مختلف عن الذي سجّل الدخول منه، أو من
   * جلسة منتهية الصلاحية. userId و token يصلان عبر رابط البريد (لا يُكتَبان
   * يدويًا) — راجع EmailVerificationService.SendVerificationLinkAsync بالباك
   * اند لصيغة الرابط: {frontend}/auth/verify-email?userId=..&email=..&token=..
   */
  verifyEmail(userId: string, token: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>('/auth/email/verify', {
      userId,
      token
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private sendChallenge(path: string, phoneNumber: string, channel?: OtpChannel): Observable<PhoneWorkflowResponse> {
    return this.api
      .post<unknown>(path, { phoneNumber: normalizePhoneInput(phoneNumber), ...channelField(channel) })
      .pipe(map(response => normalizePhoneWorkflowResult(response)));
  }

  /**
   * بعض النقاط (register/change) قد تُصدر accessToken جديدًا — خزّنه إن وُجد.
   * RELEASE-BLOCKERS-AR.md B-13: result.refreshToken لم يعد يُقرأ هنا — الخادم يرسله عبر
   * كعكة HttpOnly فقط الآن، لا في جسم الاستجابة.
   */
  private storeTokensIfPresent(result: PhoneWorkflowResponse): void {
    if (result.accessToken) {
      this.tokenStorage.storeTokens({ accessToken: result.accessToken });
    }
  }
}

/** القناة تُرسَل فقط عند اختيارها صراحةً، فيبقى الطلب القديم (بلا channel) = SMS كما كان. */
function channelField(channel: OtpChannel | undefined): { channel?: OtpChannel } {
  return channel ? { channel } : {};
}
