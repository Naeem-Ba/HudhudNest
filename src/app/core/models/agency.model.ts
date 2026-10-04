// src/app/core/models/agency.model.ts
//
// يقابل HudhudNestApi.Application.Agencies.DTOs.AgencyDto (الباك اند) — بما فيها
// المرحلة 1 (إغلاق الفجوة الجغرافية): GovernorateId/DistrictId/NeighborhoodId،
// نفس حقول Property.GovernorateId/DistrictId/NeighborhoodId. جميعها null لأي
// مكتب "غير مصنَّف جغرافيًا" (مكتب قديم، أو مكتب جديد لم يحدد موقعه بعد).

export interface AgencyMember {
  userId: string;
  displayName: string;
  profileImageUrl?: string | null;
  isOwner: boolean;
  joinedAt?: string | null;
}

export interface Agency {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  city?: string | null;
  countryCode: string;
  licenseNumber?: string | null;
  ownerUserId: string;
  isActive: boolean;
  memberCount: number;
  createdAt: string;
  members: AgencyMember[];

  // ── الموقع الجغرافي المنظَّم (المرحلة 1) ──────────────────────────
  governorateId?: number | null;
  districtId?: number | null;
  neighborhoodId?: number | null;
}

/** جسم POST /api/agencies — إنشاء مكتب جديد. */
export interface CreateAgencyRequest {
  name: string;
  slug: string;
  countryCode: string;
  description?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  city?: string | null;
  licenseNumber?: string | null;
  governorateId?: number | null;
  districtId?: number | null;
  neighborhoodId?: number | null;
}

/**
 * جسم PUT /api/agencies/{id} — استبدال كامل لحقول الملف الشخصي والموقع (نفس
 * دلالة UpdateAgencyCommand بالباك اند): يجب إرسال القيم الحالية كاملةً حتى
 * عند تعديل حقل واحد فقط، وإلا سيُمسح أي حقل مُغفَل (بما فيها الموقع الجغرافي).
 */
export interface UpdateAgencyRequest {
  name: string;
  description?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  city?: string | null;
  governorateId?: number | null;
  districtId?: number | null;
  neighborhoodId?: number | null;
}

/** يقابل HudhudNestApi.Domain.Agencies.Enums.AgencyInvitationStatus (يُسلسَل نصًّا). */
export type AgencyInvitationStatus = 'Pending' | 'Accepted' | 'Declined' | 'Expired';

/**
 * يقابل AgencyInvitationDto — دعوة كما تظهر في صندوق المدعوّ (GET
 * /api/agencies/invitations/mine، الذي لا يعيد إلا الدعوات القابلة للرد)
 * وكما تُعاد لمالك المكتب بعد إرسالها.
 */
export interface AgencyInvitation {
  id: string;
  agencyId: string;
  agencyName: string;
  agencySlug: string;
  inviterUserId: string;
  inviterName: string;
  targetUserId: string;
  status: AgencyInvitationStatus;
  createdAt: string;
  expiresAt: string;
  respondedAt?: string | null;
}

const GUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * الدعوة في الباك اند تأخذ معرّف المستخدم (Guid) فقط — لا بحث بالبريد أو الهاتف
 * (عمدًا: لا نقطة تكشف وجود حساب ما). لذلك يقبل حقل الدعوة إما المعرّف نفسه أو
 * رابط الصفحة العامة للمستخدم (/users/{id}) الذي يمكنه مشاركته، ويستخرج منه
 * المعرّف. يعيد null إن لم يجد معرّفًا صالحًا.
 */
export function extractUserId(input: string | null | undefined): string | null {
  const match = (input ?? '').trim().match(GUID_PATTERN);
  return match ? match[0].toLowerCase() : null;
}
