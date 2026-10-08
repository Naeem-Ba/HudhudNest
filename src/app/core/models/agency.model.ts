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

/**
 * يقابل AgencySentInvitationDto — دعوة معلّقة كما يراها مالك المكتب
 * (GET /api/agencies/{id}/invitations).
 */
export interface AgencySentInvitation {
  id: string;
  targetUserId: string;
  targetName: string;
  targetProfileImageUrl?: string | null;
  createdAt: string;
  expiresAt: string;
}

/** ما كتبه المالك في حقل الدعوة: معرّف/رابط صفحة، أو بريد، أو رقم هاتف. */
export type InviteTarget =
  | { kind: 'id'; userId: string }
  | { kind: 'email'; email: string }
  | { kind: 'phone'; phoneNumber: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[\d\s\-().]{7,20}$/;

/**
 * يحدد نوع ما أُدخل في حقل الدعوة. الترتيب مقصود: المعرّف أولًا (رابط صفحة يحوي
 * @ نادرًا لكنه يحوي Guid دائمًا)، ثم البريد، ثم الهاتف. التطبيع الفعلي للهاتف
 * يجري في الخادم (IPhoneNumberNormalizer)؛ هنا فرز فقط.
 */
export function parseInviteTarget(input: string | null | undefined): InviteTarget | null {
  const value = (input ?? '').trim();
  if (!value) return null;

  const userId = extractUserId(value);
  if (userId) return { kind: 'id', userId };

  if (EMAIL_PATTERN.test(value)) return { kind: 'email', email: value.toLowerCase() };

  if (PHONE_PATTERN.test(value) && (value.match(/\d/g) ?? []).length >= 7) {
    return { kind: 'phone', phoneNumber: value };
  }

  return null;
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

// ── تقييم المكتب (منفصل تمامًا عن تقييم العضو/المعلن: UserRating) ───────────────────────────
//
// تقييم المكتب كجهة تجارية. الخادم هو مصدر الحقيقة لكل القواعد: لا يقيّم المالكُ ولا الأعضاءُ
// مكتبَهم، ويلزم تفاعل فعلي (زيارة مكتملة أو مراسلة عن أحد إعلاناته)، وتقييم واحد لكل مستخدم
// يُعدَّل في مكانه. الواجهة تعرض فقط ما تقوله /ratings/eligibility.

export const AGENCY_RATING_COMMENT_MAX_LENGTH = 1000;

export const AGENCY_RATING_CRITERIA = [
  { key: 'service', labelKey: 'AGENCY_RATING.CRITERIA.SERVICE', hintKey: 'AGENCY_RATING.CRITERIA_HINT.SERVICE' },
  { key: 'professionalism', labelKey: 'AGENCY_RATING.CRITERIA.PROFESSIONALISM', hintKey: 'AGENCY_RATING.CRITERIA_HINT.PROFESSIONALISM' },
  { key: 'reliability', labelKey: 'AGENCY_RATING.CRITERIA.RELIABILITY', hintKey: 'AGENCY_RATING.CRITERIA_HINT.RELIABILITY' },
  { key: 'overallExperience', labelKey: 'AGENCY_RATING.CRITERIA.OVERALL_EXPERIENCE', hintKey: 'AGENCY_RATING.CRITERIA_HINT.OVERALL_EXPERIENCE' }
] as const;

export type AgencyRatingCriterionKey = (typeof AGENCY_RATING_CRITERIA)[number]['key'];

export interface AgencyRatingDto {
  id: string;
  agencyId: string;
  raterId: string;
  raterName: string;
  raterImageUrl?: string | null;
  service: number;
  professionalism: number;
  reliability: number;
  overallExperience: number;
  overallScore: number;
  comment?: string | null;
  createdAt: string;
}

export interface AgencyRatingSummaryDto {
  averageService: number;
  averageProfessionalism: number;
  averageReliability: number;
  averageOverallExperience: number;
  averageOverall: number;
  totalCount: number;
  page: number;
  pageSize: number;
  ratings: AgencyRatingDto[];
}

export interface AgencyRatingEligibilityDto {
  canRate: boolean;
  isMemberOrOwner: boolean;
  hasInteraction: boolean;
  alreadyRated: boolean;
  existingRating?: AgencyRatingDto | null;
}

export interface SubmitAgencyRatingRequest {
  service: number;
  professionalism: number;
  reliability: number;
  overallExperience: number;
  comment?: string | null;
}
