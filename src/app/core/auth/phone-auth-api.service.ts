import { Injectable } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { BackendApiService } from '../api/backend-api.service';
import { TokenStorageService } from '../services/token-storage.service';
import {
  AuthTokenResponse,
  PhoneLoginRequest,
  PhoneWorkflowResponse,
  normalizeAuthTokenResponse,
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

  // ── 1) تسجيل حساب جديد بالهاتف + كلمة السر ─────────────────────────────

  /** POST /auth/phone/registration/send-otp — استجابة عامة دائمًا (لا تكشف إن كان الرقم مسجّلاً). */
  sendRegistrationOtp(phoneNumber: string): Observable<PhoneWorkflowResponse> {
    return this.sendChallenge('/auth/phone/registration/send-otp', phoneNumber);
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
  }): Observable<PhoneWorkflowResponse> {
    return this.api
      .post<unknown>('/auth/phone/registration/verify', {
        challengeId: request.challengeId,
        code: request.code.trim(),
        password: request.password,
        firstName: request.firstName.trim(),
        lastName: request.lastName.trim()
      })
      .pipe(
        map(response => normalizePhoneWorkflowResult(response)),
        tap(result => this.storeTokensIfPresent(result))
      );
  }

  // ── 2) تسجيل الدخول برقم الهاتف + كلمة السر (بدون OTP) ──────────────────

  login(request: PhoneLoginRequest): Observable<AuthTokenResponse> {
    const payload: PhoneLoginRequest = {
      phoneNumber: request.phoneNumber.trim(),
      password: request.password
    };

    return this.api.post<unknown>('/auth/phone/login', payload).pipe(
      map(response => normalizeAuthTokenResponse(response)),
      tap(response => this.tokenStorage.storeTokens(response))
    );
  }

  // ── 3) استعادة كلمة السر عبر الهاتف (ثلاث خطوات) ────────────────────────

  /** POST /auth/phone/password-reset/send-otp — استجابة عامة دائمًا. */
  sendPasswordResetOtp(phoneNumber: string): Observable<PhoneWorkflowResponse> {
    return this.sendChallenge('/auth/phone/password-reset/send-otp', phoneNumber);
  }

  /** POST /auth/phone/password-reset/verify — يبادل رمز الـ OTP برمز تأكيد (ConfirmationToken). */
  verifyPasswordReset(challengeId: string, code: string): Observable<PhoneWorkflowResponse> {
    return this.api
      .post<unknown>('/auth/phone/password-reset/verify', { challengeId, code: code.trim() })
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
        phoneNumber: request.phoneNumber.trim(),
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
  sendReverificationOtp(phoneNumber: string): Observable<PhoneWorkflowResponse> {
    return this.sendChallenge('/auth/phone/reverification/send-otp', phoneNumber);
  }

  /** POST /auth/phone/reverification/verify — يعيد الحالة إلى Verified. */
  verifyReverification(challengeId: string, code: string): Observable<PhoneWorkflowResponse> {
    return this.api
      .post<unknown>('/auth/phone/reverification/verify', { challengeId, code: code.trim() })
      .pipe(map(response => normalizePhoneWorkflowResult(response)));
  }

  // ── 5) تغيير رقم الهاتف من داخل البروفايل (يتطلب تسجيل دخول + كلمة السر) ─

  /** POST /auth/phone/change/send-otp — يُرسَل إلى الرقم الجديد قبل اعتماده. */
  sendPhoneChangeOtp(newPhoneNumber: string): Observable<PhoneWorkflowResponse> {
    return this.sendChallenge('/auth/phone/change/send-otp', newPhoneNumber);
  }

  /** POST /auth/phone/change/verify — يتطلب كلمة السر الحالية ويُبطل الجلسات النشطة. */
  verifyPhoneChange(request: {
    challengeId: string;
    code: string;
    currentPassword: string;
  }): Observable<PhoneWorkflowResponse> {
    return this.api
      .post<unknown>('/auth/phone/change/verify', {
        challengeId: request.challengeId,
        code: request.code.trim(),
        currentPassword: request.currentPassword
      })
      .pipe(
        map(response => normalizePhoneWorkflowResult(response)),
        tap(result => this.storeTokensIfPresent(result))
      );
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private sendChallenge(path: string, phoneNumber: string): Observable<PhoneWorkflowResponse> {
    return this.api
      .post<unknown>(path, { phoneNumber: phoneNumber.trim() })
      .pipe(map(response => normalizePhoneWorkflowResult(response)));
  }

  /** بعض النقاط (register/change) قد تُصدر زوجًا جديدًا من الرموز — خزّنها إن وُجدت. */
  private storeTokensIfPresent(result: PhoneWorkflowResponse): void {
    if (result.accessToken) {
      this.tokenStorage.storeTokens({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken ?? undefined
      });
    }
  }
}
