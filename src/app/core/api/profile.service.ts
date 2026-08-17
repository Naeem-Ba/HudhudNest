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
import { Observable, map, switchMap, throwError } from 'rxjs';
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
  constructor(private readonly api: BackendApiService) {}

  getMe(): Observable<UserProfile> {
    return this.api
      .get<BackendUserProfile>('/users/me')
      .pipe(map(user => this.toLegacyUserProfile(user)));
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

  deleteAccount(): Observable<void> {
    return this.api.delete<void>('/users/me');
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

  uploadAvatar(_file: File): Observable<{ ImageUrl: string; imageUrl: string }> {
    return throwError(() => new Error('Avatar upload endpoint is not confirmed in Backend contract yet.'));
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

      EmailConfirmed: user.emailConfirmed ?? user.EmailConfirmed ?? false
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
    return {
      firstName:   user.Vorname?.trim()     || undefined,
      lastName:    user.Name?.trim()        || undefined,
      displayName: user.DisplayName?.trim() || undefined,
      phoneNumber: user.Phone?.trim()       || undefined
    };
  }
}
