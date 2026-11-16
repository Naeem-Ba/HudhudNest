// src/app/core/api/agencies-api.service.ts
//
// يستهلك AgenciesController (api/Agencies/*) بالكامل: إنشاء/تعديل المكتب، الصفحة
// العامة بالـ slug، الدعوات (إرسال/صندوق/قبول/رفض)، إزالة عضو أو المغادرة، نقل
// الملكية، الشعار، والتعطيل. كل تحقق صلاحيات يجري في الخادم (المقارنة مع
// OwnerUserId الفعلي — ADR-006)؛ ما تخفيه الواجهة هنا تجميلي فقط.

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import {
  AgencyRatingDto,
  AgencyRatingEligibilityDto,
  AgencyRatingSummaryDto,
  SubmitAgencyRatingRequest,
  Agency,
  AgencyDirectoryFacets,
  AgencyDirectoryFilter,
  AgencyDirectoryPage,
  AgencyInvitation,
  AgencySentInvitation,
  AgencyMember,
  CreateAgencyRequest,
  UpdateAgencyRequest
} from '../models/agency.model';

@Injectable({ providedIn: 'root' })
export class AgenciesApiService {
  private readonly endpoint = '/agencies';

  constructor(private readonly api: BackendApiService) {}

  /**
   * GET /api/agencies/me — مكتب المستخدم الحالي. الباك اند يعيد 204 (لا 404)
   * إن لم ينتمِ المستخدم إلى أي مكتب — BackendApiService/HttpClient يترجم جسم
   * 204 الفارغ إلى null تلقائيًا، فتُعاد Observable<null> بلا أي معالجة خاصة هنا.
   */
  getMine(): Observable<Agency | null> {
    return this.api.get<Agency | null>(`${this.endpoint}/me`);
  }

  /**
   * GET /api/agencies — دليل المكاتب العام (مجهول). الخادم يدرج فقط المكاتب الفعّالة التي خطة مالكها
   * سارية أو ضمن مهلة الثلاثين يومًا. القيم الفارغة لا تُرسل.
   */
  searchDirectory(filter: AgencyDirectoryFilter): Observable<AgencyDirectoryPage> {
    const query: Record<string, string | number | boolean> = {};
    Object.entries(filter).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '' || value === false) return;
      query[key] = value as string | number | boolean;
    });
    return this.api.get<AgencyDirectoryPage>(this.endpoint, query);
  }

  /** GET /api/agencies/directory/facets — عدد المكاتب في كل محافظة/منطقة/حي. */
  getDirectoryFacets(governorateId?: number | null, districtId?: number | null): Observable<AgencyDirectoryFacets> {
    const query: Record<string, number> = {};
    if (governorateId) query['governorateId'] = governorateId;
    if (districtId) query['districtId'] = districtId;
    return this.api.get<AgencyDirectoryFacets>(`${this.endpoint}/directory/facets`, query);
  }

  /** GET /api/agencies/{slug} — الصفحة العامة (مجهول؛ 404 لمكتب غير مفعّل). */
  getBySlug(slug: string): Observable<Agency> {
    return this.api.get<Agency>(`${this.endpoint}/${encodeURIComponent(slug)}`);
  }

  // ── تقييم المكتب — منفصل عن تقييم العضو (/Users/{id}/ratings) ─────────────────────────────

  /** GET /api/agencies/{id}/ratings — عام. الملخص والمتوسطات تُحسب في الخادم. */
  getRatings(agencyId: string, page = 1, pageSize = 20): Observable<AgencyRatingSummaryDto> {
    return this.api.get<AgencyRatingSummaryDto>(`${this.endpoint}/${agencyId}/ratings`, { page, pageSize });
  }

  /** GET /api/agencies/{id}/ratings/eligibility — يتطلب تسجيل دخول. */
  getRatingEligibility(agencyId: string): Observable<AgencyRatingEligibilityDto> {
    return this.api.get<AgencyRatingEligibilityDto>(`${this.endpoint}/${agencyId}/ratings/eligibility`);
  }

  /** POST /api/agencies/{id}/ratings — إنشاء تقييمي للمكتب أو تعديله في مكانه. المُقيِّم من التوكن فقط. */
  submitRating(agencyId: string, request: SubmitAgencyRatingRequest): Observable<AgencyRatingDto> {
    return this.api.post<AgencyRatingDto>(`${this.endpoint}/${agencyId}/ratings`, {
      Service: request.service,
      Professionalism: request.professionalism,
      Reliability: request.reliability,
      OverallExperience: request.overallExperience,
      Comment: request.comment?.trim() || null
    });
  }

  /** POST /api/agencies — تسجيل مكتب جديد؛ ينجح مرة واحدة فقط لكل مستخدم. */
  create(request: CreateAgencyRequest): Observable<Agency> {
    return this.api.post<Agency>(this.endpoint, request);
  }

  /**
   * PUT /api/agencies/{id} — تعديل مالك فقط. استبدال كامل (انظر
   * UpdateAgencyRequest's doc comment) — أرسل كل الحقول الحالية.
   */
  update(agencyId: string, request: UpdateAgencyRequest): Observable<Agency> {
    return this.api.put<Agency>(`${this.endpoint}/${agencyId}`, request);
  }

  /**
   * DELETE /api/agencies/{id} — تعطيل (لا حذف نهائي): تختفي الصفحة العامة ولا
   * يمكن دعوة أعضاء جدد. يُعكس بـ reactivate().
   */
  deactivate(agencyId: string): Observable<void> {
    return this.api.delete<void>(`${this.endpoint}/${agencyId}`);
  }

  /** POST /api/agencies/{id}/reactivate — عكس التعطيل (مالك فقط، idempotent). */
  reactivate(agencyId: string): Observable<void> {
    return this.api.post<void>(`${this.endpoint}/${agencyId}/reactivate`);
  }

  /** POST /api/agencies/{id}/transfer-ownership — المالك الجديد يجب أن يكون عضوًا. */
  transferOwnership(agencyId: string, newOwnerUserId: string): Observable<Agency> {
    return this.api.post<Agency>(`${this.endpoint}/${agencyId}/transfer-ownership`, { newOwnerUserId });
  }

  /** POST /api/agencies/{id}/logo — multipart، الحقل `file` (حد الطلب ~2.5MB). */
  uploadLogo(agencyId: string, file: File): Observable<Agency> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.api.upload<Agency>(`${this.endpoint}/${agencyId}/logo`, formData);
  }

  /** POST /api/agencies/{id}/invitations — ينشئ دعوة معلّقة فقط، لا عضوية. */
  createInvitation(agencyId: string, userId: string): Observable<AgencyInvitation> {
    return this.api.post<AgencyInvitation>(`${this.endpoint}/${agencyId}/invitations`, { userId });
  }

  /**
   * POST /api/agencies/{id}/invitations/by-contact — دعوة بالبريد أو الهاتف المسجّل
   * به الحساب (واحد فقط). 404 إن لم يوجد حساب بهذه الجهة.
   */
  createInvitationByContact(
    agencyId: string,
    contact: { email: string } | { phoneNumber: string }
  ): Observable<AgencyInvitation> {
    return this.api.post<AgencyInvitation>(`${this.endpoint}/${agencyId}/invitations/by-contact`, contact);
  }

  /** GET /api/agencies/{id}/invitations — دعوات المكتب المعلّقة (مالك فقط). */
  getSentInvitations(agencyId: string): Observable<AgencySentInvitation[]> {
    return this.api.get<AgencySentInvitation[]>(`${this.endpoint}/${agencyId}/invitations`);
  }

  /** GET /api/agencies/invitations/mine — دعوات المستخدم الحالي القابلة للرد. */
  getMyInvitations(): Observable<AgencyInvitation[]> {
    return this.api.get<AgencyInvitation[]>(`${this.endpoint}/invitations/mine`);
  }

  /** POST /api/agencies/invitations/{id}/accept — الخطوة الوحيدة التي تنشئ العضوية. */
  acceptInvitation(invitationId: string): Observable<AgencyMember> {
    return this.api.post<AgencyMember>(`${this.endpoint}/invitations/${invitationId}/accept`);
  }

  /** POST /api/agencies/invitations/{id}/decline */
  declineInvitation(invitationId: string): Observable<void> {
    return this.api.post<void>(`${this.endpoint}/invitations/${invitationId}/decline`);
  }

  /**
   * DELETE /api/agencies/{id}/members/{memberUserId} — نفس النقطة للحالتين: المالك
   * يزيل عضوًا، أو العضو يغادر (memberUserId = معرّفه هو). المالك لا يُزال أبدًا.
   */
  removeMember(agencyId: string, memberUserId: string): Observable<void> {
    return this.api.delete<void>(`${this.endpoint}/${agencyId}/members/${memberUserId}`);
  }
}
