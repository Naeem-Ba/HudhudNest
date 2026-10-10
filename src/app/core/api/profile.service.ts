// src/app/core/api/profile.service.ts
//
// ✅ Bug Fix — updateProfile (Bug #2)
//
// المشكلة الأولى — Request body خاطئ:
//   كان toUpdateRequest() يُرسل: { fullName, phoneNumber, isAgent, taxNumber }
//   لكن Backend يتوقع UpdateProfileRequest:
//     public sealed record UpdateProfileRequest(
//         string? FirstName, string? LastName, string? DisplayName, string? PhoneNumber
//     );
//   أي: حقول مختلفة تماماً + حقول غير موجودة في الـ contract (isAgent, taxNumber).
//
// المشكلة الثانية — 204 NoContent بدون body:
//   كان: put<BackendUserProfile>(...).pipe(map(user => toLegacyUserProfile(user)))
//   لكن HttpPut /users/me يُعيد 204 NoContent → body = null
//   map(null → toLegacyUserProfile(null)) يُعطي profile فارغاً ويُسبِّب أخطاءً صامتة.
//
// الإصلاح:
//   1. تصحيح toUpdateRequest() ليُرسل { firstName, lastName, displayName, phoneNumber }
//      (System.Text.Json يُطابق بدون حساسية لحالة الأحرف عند الاستقبال)
//   2. تغيير put<void>() ثم switchMap(() => this.getMe()) لإعادة البيانات المحدَّثة
//
// التغييرات:
//   - إضافة switchMap للـ imports
//   - تغيير توقيع put من BackendUserProfile إلى void
//   - استبدال map بـ switchMap → getMe() في updateProfile
//   - إصلاح شامل لـ toUpdateRequest

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, catchError, map, of, switchMap, tap, throwError } from 'rxjs';
import { BackendApiService } from './backend-api.service';

export interface UserProfile {
  Id?: string;
  id?: string;

  Vorname?: string;
  Name?: string;
  DisplayName?: string;
  Email?: string;
  Phone?: string;
  ImageUrl?: string;

  IsAgent?: boolean;
  TaxNumber?: string;

  Role?: string;

  /**
   * ✅ إضافة: حالة تفعيل البريد الإلكتروني (UserDto.EmailConfirmed بالباك اند).
   * ضرورية لبناء تدفق "إضافة بريد ثانوي" — الحقل موجود بالفعل في استجابة
   * GET /users/me لكنه لم يكن مُستهلَكًا في الواجهة إطلاقاً.
   */
  EmailConfirmed?: boolean;

  /**
   * ✅ إضافة: حالة تفعيل رقم الهاتف (UserDto.PhoneConfirmed بالباك اند) — إلى جانب
   * EmailConfirmed أعلاه، يحدّدان معاً هل يحق للمستخدم نشر إعلان (تأكيد أحدهما كافٍ).
   */
  PhoneConfirmed?: boolean;

  /**
   * ✅ إضافة: الخطة التي اختارها المستخدم صراحةً (UserDto.PlanTier بالباك اند).
   * null/undefined تعني أن المستخدم لم يختر أي خطة بعد — حالة مختلفة عمداً عن
   * اعتباره على الخطة المجانية ضمنياً. ينشر إعلاناً فقط بعد اختيار خطة، حتى لو
   * كانت "free".
   */
  PlanTier?: string | null;
  PlanSelectedAt?: string | null;

  /**
   * الخطة المدفوعة التي طلبها المستخدم ولم يفعّلها المشرف بعد (UserDto.PendingPlanTier):
   * لا تمنح أي ميزة حتى يؤكد المشرف الدفع. PlanTier أعلاه هو ما هو سارٍ فعلًا.
   */
  PendingPlanTier?: string | null;

  /**
   * ✅ إضافة: نبذة تعريفية + عنوان/معلومات تواصل تُعرض علنًا بالملف الشخصي
   * العام (UserDto.Bio / UserDto.ContactInfo بالباك اند).
   */
  Bio?: string;
  ContactInfo?: string;

  /**
   * ✅ إضافة: هل لدى هذا الحساب كلمة مرور (UserDto.HasPassword بالباك اند)؟ false لحساب
   * تسجيل الدخول الاجتماعي فقط (Google/Apple بلا كلمة مرور إطلاقاً). يحدّد ما إذا كانت
   * شاشة "إعادة المصادقة" قبل حذف الحساب تطلب كلمة المرور أم لا — راجع
   * profile.component.ts: onDeleteAccount/confirmDeleteAccount.
   */
  HasPassword?: boolean;

  /**
   * When a pending self-service deletion request will be executed (UserDto.DeletionScheduledFor,
   * ISO date). null/undefined means no request is pending. DELETE /api/Users/me only schedules
   * the deletion (AccountDeletion:DelayDays, 30 by default); the account stays fully usable and
   * the request can be cancelled until this date.
   */
  DeletionScheduledFor?: string | null;

  /** Account-level preferences (UserDto). *Chosen is false until the user picked one: the code is then only the stored default. */
  PreferredLanguage?: string | null;
  PreferredCurrency?: string | null;
  HasChosenLanguage?: boolean;
  HasChosenCurrency?: boolean;
}

/** 202 body of DELETE /api/Users/me (UsersController.DeleteAccount). */
export interface AccountDeletionSchedule {
  scheduledFor: string | null;
}

interface BackendUserProfile {
  id?: string;
  Id?: string;

  userName?: string;
  UserName?: string;

  fullName?: string;
  FullName?: string;

  firstName?: string;
  FirstName?: string;

  lastName?: string;
  LastName?: string;

  displayName?: string;
  DisplayName?: string;

  email?: string;
  Email?: string;

  phoneNumber?: string;
  PhoneNumber?: string;
  phone?: string;
  Phone?: string;

  profileImageUrl?: string;
  ProfileImageUrl?: string;
  imageUrl?: string;
  ImageUrl?: string;

  isAgent?: boolean;
  IsAgent?: boolean;

  taxNumber?: string;
  TaxNumber?: string;

  role?: string;
  Role?: string;

  emailConfirmed?: boolean;
  EmailConfirmed?: boolean;

  phoneConfirmed?: boolean;
  PhoneConfirmed?: boolean;

  planTier?: string | null;
  PlanTier?: string | null;
  planSelectedAt?: string | null;
  PlanSelectedAt?: string | null;
  pendingPlanTier?: string | null;
  PendingPlanTier?: string | null;

  bio?: string;
  Bio?: string;
  contactInfo?: string;
  ContactInfo?: string;

  hasPassword?: boolean;
  HasPassword?: boolean;

  deletionScheduledFor?: string | null;
  DeletionScheduledFor?: string | null;

  preferredLanguage?: string | null;
  PreferredLanguage?: string | null;
  preferredCurrency?: string | null;
  PreferredCurrency?: string | null;
  hasChosenLanguage?: boolean;
  HasChosenLanguage?: boolean;
  hasChosenCurrency?: boolean;
  HasChosenCurrency?: boolean;
}

/**
 * The two gates a brand-new account must clear before it can add/publish a listing —
 * mirrors CreatePropertyCommandHandler's EnsureContactConfirmedAsync/EnsurePlanSelected
 * exactly, so the frontend never diverges from what the backend actually enforces. Used
 * by the navbar's "Add property" visibility and by listing-eligibility.guard.ts.
 */
export function isEligibleForListing(profile: UserProfile | null): boolean {
  if (!profile) {
    return false;
  }

  const contactConfirmed = !!(profile.EmailConfirmed || profile.PhoneConfirmed);
  const planSelected = !!profile.PlanTier;

  return contactConfirmed && planSelected;
}

/**
 * What the API (IAgencyEligibilityPolicy) requires before an office can be created or an
 * invitation sent: a verified account (email OR phone confirmed), then a paid plan.
 * This is only the early, friendly version of that check — it lets a screen explain what
 * is missing and link to the fix instead of letting the user fill a form the server will
 * refuse. The server stays the source of truth: it also knows a plan is cancelled or
 * expired, which /users/me does not expose, and answers with an AGENCY_* error code.
 */
export type AgencyEligibility = 'ok' | 'unverified' | 'paid-plan-required';

export function hasPaidPlan(profile: UserProfile | null): boolean {
  const tier = profile?.PlanTier?.toLowerCase();
  return !!tier && tier !== 'free';
}

export function agencyEligibility(profile: UserProfile | null): AgencyEligibility {
  if (!profile || !(profile.EmailConfirmed || profile.PhoneConfirmed)) {
    return 'unverified';
  }
  return hasPaidPlan(profile) ? 'ok' : 'paid-plan-required';
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/**
 * ✅ إضافة: يستهلك GET /api/users/{id} (UsersController.GetById) — كان غير
 * مستخدَم إطلاقاً. الباك اند (GetUserByIdQueryHandler) يُعيد عمداً حقول عامة
 * آمنة فقط: الاسم المعروض وصورة البروفايل دائمًا، بينما رقم الهاتف لا يظهر
 * إلا إذا كان المستخدم Agent (وسيط عقاري) — تصميم واعٍ للخصوصية من الباك اند،
 * لا نغيّره من طرف الواجهة.
 */
export interface PublicUserProfile {
  id: string;
  displayName: string;
  profileImageUrl: string | null;
  phoneNumber: string | null;
  roles: string[];
}

interface BackendUserSummary {
  id?: string;
  Id?: string;
  displayName?: string;
  DisplayName?: string;
  profileImageUrl?: string | null;
  ProfileImageUrl?: string | null;
  phoneNumber?: string | null;
  PhoneNumber?: string | null;
  roles?: string[];
  Roles?: string[];
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  /**
   * Shared, cached profile stream. getMe() previously fired one independent HTTP call per
   * caller with no shared state; the navbar's "Add property" gate, the listing-eligibility
   * guard, and the pricing page all now need to read (and react to changes in)
   * EmailConfirmed/PhoneConfirmed/PlanTier without each maintaining its own copy or
   * re-fetching independently. null means "not loaded yet" (or logged out) — callers that
   * care about the logged-out case should already be gating on AuthService.isLoggedIn$.
   */
  private readonly profileSubject = new BehaviorSubject<UserProfile | null>(null);
  readonly profile$: Observable<UserProfile | null> = this.profileSubject.asObservable();

  /**
   * true once a GET /users/me has failed and no later one has succeeded. profile$ alone
   * cannot tell "still loading" from "gave up" (both are null), and the navbar needs that
   * to stop showing its avatar placeholder and fall back to the initial instead.
   */
  private readonly loadFailedSubject = new BehaviorSubject<boolean>(false);
  readonly loadFailed$: Observable<boolean> = this.loadFailedSubject.asObservable();

  constructor(private readonly api: BackendApiService) {}

  getMe(): Observable<UserProfile> {
    return this.api
      .get<BackendUserProfile>('/users/me')
      .pipe(
        map(user => this.toLegacyUserProfile(user)),
        tap({
          next: profile => {
            this.loadFailedSubject.next(false);
            this.profileSubject.next(profile);
          },
          error: () => this.loadFailedSubject.next(true)
        })
      );
  }

  /**
   * Re-fetches /users/me and pushes the result into profile$ — call after anything that
   * changes eligibility-relevant state (confirming email/phone, selecting a plan) so every
   * subscriber (navbar, guard, pricing page) picks it up immediately instead of only after
   * their next independent load.
   */
  refresh(): Observable<UserProfile> {
    return this.getMe();
  }

  /**
   * Clears the cached profile (back to "not loaded"). Called from AuthService.clearSession()
   * on every logout path — including the one account deletion runs (logoutLocal()) — so a
   * stale profile (name, email, avatar) from the just-ended session never leaks into a
   * component that reads profile$ after logout/deletion but before a full page reload.
   */
  clearCache(): void {
    this.profileSubject.next(null);
    this.loadFailedSubject.next(false);
  }

  /**
   * ✅ FIX: إصلاح مزدوج
   *
   * 1. put<void> لأن Backend يُعيد 204 NoContent — لا يوجد body لقراءته.
   * 2. switchMap(() => this.getMe()) للحصول على البيانات المحدَّثة بعد الحفظ.
   *    هذا النهج أكثر أماناً من الاعتماد على البيانات المُرسَلة (optimistic update)
   *    لأن Backend قد يُطبِّق transformations على الحقول (trim, normalize, إلخ).
   */
  updateProfile(data: UserProfile): Observable<UserProfile> {
    return this.api
      .put<void>('/users/me', this.toUpdateRequest(data))
      .pipe(switchMap(() => this.getMe()));
  }

  changePassword(data: ChangePasswordRequest): Observable<void> {
    return this.api.post<void>('/users/me/change-password', data);
  }

  /**
   * DELETE /api/Users/me — requests deletion of the caller's account. The server does NOT
   * delete anything yet: it re-authenticates, then schedules the deletion and answers 202
   * with { scheduledFor } (RequestDeleteUserCommandHandler). AccountDeletionSweepHostedService
   * anonymizes the account once that date arrives, unless cancelAccountDeletion() runs first.
   * currentPassword is required only for a password-based account (UserProfile.HasPassword).
   * Error codes: CURRENT_PASSWORD_REQUIRED / INVALID_CURRENT_PASSWORD / ACCOUNT_LOCKED.
   * Calling it again while a request is pending returns the existing date (idempotent).
   */
  deleteAccount(currentPassword?: string): Observable<AccountDeletionSchedule> {
    return this.api
      .delete<{ scheduledFor?: string | null; ScheduledFor?: string | null } | null>(
        '/users/me',
        currentPassword ? { currentPassword } : {}
      )
      .pipe(map(res => ({ scheduledFor: res?.scheduledFor ?? res?.ScheduledFor ?? null })));
  }

  /**
   * POST /api/Users/me/deletion/cancel — withdraws a pending deletion request (204). No
   * re-authentication by design (see CancelAccountDeletionCommandHandler). 404 means there was
   * nothing pending, e.g. it was already cancelled from another device; callers treat that as
   * done. Either way profile$ is refreshed so every DeletionScheduledFor reader updates.
   */
  cancelAccountDeletion(): Observable<UserProfile> {
    return this.api.post<void>('/users/me/deletion/cancel').pipe(
      catchError(err => (err?.status === 404 ? of(undefined) : throwError(() => err))),
      switchMap(() => this.getMe())
    );
  }

  /**
   * GET /api/Users/me/export — the caller's own data as one JSON document (AccountDataExportDto).
   * Rate-limited server-side to one per 24 hours ("data-export" policy → 429).
   */
  exportMyData(): Observable<unknown> {
    return this.api.get<unknown>('/users/me/export');
  }

  /** GET /api/users/{id} — ملف تعريف عام (مثلاً لعرض بيانات مالك عقار). */
  getPublicProfile(userId: string): Observable<PublicUserProfile> {
    return this.api
      .get<BackendUserSummary>(`/users/${userId}`)
      .pipe(map(user => ({
        id: user.id ?? user.Id ?? userId,
        displayName: user.displayName ?? user.DisplayName ?? 'User',
        profileImageUrl: user.profileImageUrl ?? user.ProfileImageUrl ?? null,
        phoneNumber: user.phoneNumber ?? user.PhoneNumber ?? null,
        roles: user.roles ?? user.Roles ?? []
      })));
  }

  /**
   * ✅ تفعيل: POST /users/me/avatar (multipart/form-data) — كان يرمي خطأ ثابتًا
   * بانتظار جاهزية نقطة الباك اند؛ الآن مفعَّلة فعليًا (UsersController.UploadAvatar).
   * حقل الفورم اسمه "file" مطابقًا لاسم بارامتر [FromForm] IFormFile? file بالباك اند.
   * الباك اند يُعيد الآن { imageUrl } بصيغة camelCase مباشرة (RELEASE-BLOCKERS-AR.md B-11 —
   * Program.cs: PropertyNamingPolicy = CamelCase). قراءة PascalCase أدناه أُبقيت احتياطاً
   * فقط، بلا أثر عملي بعد هذا التغيير.
   */
  uploadAvatar(file: File): Observable<{ ImageUrl: string; imageUrl: string }> {
    const formData = new FormData();
    formData.append('file', file);

    return this.api
      .upload<{ ImageUrl?: string; imageUrl?: string }>('/users/me/avatar', formData)
      .pipe(map(res => {
        const url = res.ImageUrl ?? res.imageUrl ?? '';
        return { ImageUrl: url, imageUrl: url };
      }));
  }

  private toLegacyUserProfile(user: BackendUserProfile): UserProfile {
    const fullName = user.fullName ?? user.FullName ?? user.displayName ?? user.DisplayName ?? user.userName ?? user.UserName ?? '';
    const nameParts = fullName.trim().split(/\s+/).filter(Boolean);

    return {
      Id: user.id ?? user.Id,
      id: user.id ?? user.Id,

      Vorname: user.firstName ?? user.FirstName ?? nameParts[0] ?? '',
      Name: user.lastName ?? user.LastName ?? nameParts.slice(1).join(' ') ?? '',
      DisplayName: user.displayName ?? user.DisplayName ?? fullName,

      Email: user.email ?? user.Email ?? '',
      Phone: user.phoneNumber ?? user.PhoneNumber ?? user.phone ?? user.Phone ?? '',
      ImageUrl: user.profileImageUrl ?? user.ProfileImageUrl ?? user.imageUrl ?? user.ImageUrl ?? '',

      IsAgent: user.isAgent ?? user.IsAgent ?? false,
      TaxNumber: user.taxNumber ?? user.TaxNumber ?? '',

      Role: user.role ?? user.Role,

      EmailConfirmed: user.emailConfirmed ?? user.EmailConfirmed ?? false,
      PhoneConfirmed: user.phoneConfirmed ?? user.PhoneConfirmed ?? false,

      PlanTier: user.planTier ?? user.PlanTier ?? null,
      PlanSelectedAt: user.planSelectedAt ?? user.PlanSelectedAt ?? null,
      PendingPlanTier: user.pendingPlanTier ?? user.PendingPlanTier ?? null,

      Bio: user.bio ?? user.Bio ?? '',
      ContactInfo: user.contactInfo ?? user.ContactInfo ?? '',

      HasPassword: user.hasPassword ?? user.HasPassword ?? false,

      DeletionScheduledFor: user.deletionScheduledFor ?? user.DeletionScheduledFor ?? null,

      PreferredLanguage: user.preferredLanguage ?? user.PreferredLanguage ?? null,
      PreferredCurrency: user.preferredCurrency ?? user.PreferredCurrency ?? null,
      HasChosenLanguage: user.hasChosenLanguage ?? user.HasChosenLanguage ?? false,
      HasChosenCurrency: user.hasChosenCurrency ?? user.HasChosenCurrency ?? false
    };
  }

  /**
   * ✅ FIX: إرسال الحقول الصحيحة المطابقة لـ Backend UpdateProfileRequest:
   *   public sealed record UpdateProfileRequest(
   *     string? FirstName, string? LastName, string? DisplayName, string? PhoneNumber
   *   );
   *
   * الحقول المُحذوفة مقارنةً بالكود السابق:
   *   - fullName   → غير موجود في UpdateProfileRequest (تم استبداله بـ firstName + lastName)
   *   - isAgent    → غير موجود في UpdateProfileRequest (endpoint منفصل إن وُجد)
   *   - taxNumber  → غير موجود في UpdateProfileRequest (endpoint منفصل إن وُجد)
   *
   * ملاحظة: System.Text.Json يُطابق camelCase ↔ PascalCase بدون حساسية أثناء الـ deserialization.
   */
  private toUpdateRequest(user: UserProfile): Record<string, unknown> {
    // phoneNumber is deliberately absent: it is the login and recovery phone, which the API only lets a
    // verified code flow add or change (profile page: PhoneChangePage). Saving the profile must never touch it.
    return {
      firstName:   user.Vorname?.trim()     || undefined,
      lastName:    user.Name?.trim()        || undefined,
      displayName: user.DisplayName?.trim() || undefined,
      // ✅ إضافة: نُرسل قيمة فارغة صراحةً (وليس undefined) عند مسح الحقل
      // بالكامل، كي يتوافق مع دلالة "null تعني عدم التغيير" بالباك اند —
      // إرسال '' (وليس undefined) يُترجَم بالـ Handler إلى مسح الحقل فعليًا.
      bio:         user.Bio !== undefined ? (user.Bio?.trim() ?? '') : undefined,
      contactInfo: user.ContactInfo !== undefined ? (user.ContactInfo?.trim() ?? '') : undefined
    };
  }
}
