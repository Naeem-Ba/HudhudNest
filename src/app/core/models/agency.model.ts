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

  /**
   * خطة المالك الآن (NoPlan | Active | Expired | Cancelled) وتاريخ نهايتها. تأتي فقط من
   * GET /api/agencies/me (للمالك وللأعضاء)، لا من الصفحة العامة. تُستعمل لإبقاء المكتب ظاهرًا
   * مع تنبيه تجديد خلال مهلة ما بعد الانتهاء (انظر agency-grace.ts).
   */
  ownerPlanStatus?: string | null;
  ownerPlanExpiresAt?: string | null;

  /** التوثيق الإداري (دليل المكاتب). الشارة لـ Verified فقط؛ غائب من خادم أقدم = غير موثّق. */
  verificationStatus?: AgencyVerificationStatus | null;
  verifiedAt?: string | null;
  /** الإعلانات النشطة المنسوبة إلى المكتب؛ تأتي من الصفحة العامة فقط. */
  activeListingCount?: number | null;
  /** فروع المكتب، الرئيسي أولًا. تأتي من الصفحة العامة ومن /me؛ غائبة من خادم أقدم. */
  branches?: AgencyBranch[] | null;

  // ── ملف المكتب (P4): كلها اختيارية، وغائبة من خادم أقدم ──
  /** صورة الغلاف العريضة أعلى صفحة المكتب. */
  coverImageUrl?: string | null;
  /** رابط https فقط (الخادم يرفض غيره). */
  website?: string | null;
  /** روابط https على نطاق كل شبكة؛ واتساب رقم دولي (+963…) والرابط يُبنى هنا. */
  socialLinks?: AgencySocialLink[] | null;
  /** أيام الأسبوع السبعة، السبت أولًا؛ يوم بلا فترات = مغلق. null = لم يحددها المكتب. */
  workingHours?: AgencyWorkingDay[] | null;
}

export type AgencySocialNetwork = 'Facebook' | 'Instagram' | 'WhatsApp' | 'Telegram' | 'X' | 'LinkedIn' | 'YouTube' | 'TikTok';

/** ترتيب العرض والتحرير. واتساب أولًا لأنه أكثر وسيلة تواصل استعمالًا هنا. */
export const AGENCY_SOCIAL_NETWORKS: readonly AgencySocialNetwork[] =
  ['WhatsApp', 'Facebook', 'Instagram', 'Telegram', 'X', 'LinkedIn', 'YouTube', 'TikTok'];

export interface AgencySocialLink {
  network: AgencySocialNetwork;
  value: string;
}

export type WeekDay = 'Saturday' | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';

/** السبت أولًا كما تُكتب ساعات العمل في المنطقة. */
export const WEEK_DAYS: readonly WeekDay[] = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

/** "HH:mm" بتوقيت المكتب المحلي؛ "24:00" = حتى منتصف الليل. */
export interface AgencyTimeRange {
  opens: string;
  closes: string;
}

export interface AgencyWorkingDay {
  day: WeekDay;
  ranges: AgencyTimeRange[];
}

/** جسم PUT /api/agencies/{id}/links: القائمة تستبدل الروابط كلها، والقيمة الفارغة تحذف الشبكة. */
export interface AgencyContactLinksInput {
  website: string | null;
  links: { network: AgencySocialNetwork; value: string | null }[];
}

/** فرع مكتب — يقابل AgencyBranchDto. الإحداثيات اختيارية؛ بلاها لا يظهر الفرع في «القريبة مني» ولا على الخريطة. */
export interface AgencyBranch {
  id: string;
  name: string;
  isMain: boolean;
  governorateId: number;
  districtId?: number | null;
  neighborhoodId?: number | null;
  address?: string | null;
  contactPhone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/** جسم POST/PUT /api/agencies/{id}/branches[/{branchId}]. */
export interface AgencyBranchInput {
  name: string;
  governorateId: number;
  districtId?: number | null;
  neighborhoodId?: number | null;
  address?: string | null;
  contactPhone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isMain?: boolean;
}

/** الحد الأقصى للفروع (AgencyBranch.MaxPerAgency بالخادم). */
export const AGENCY_BRANCH_LIMIT = 20;

/** فرع على خريطة المكاتب — يقابل AgencyMapMarkerDto. */
export interface AgencyMapMarker {
  agencyId: string;
  slug: string;
  name: string;
  logoUrl?: string | null;
  isVerified: boolean;
  branchId: string;
  branchName: string;
  isMain: boolean;
  latitude: number;
  longitude: number;
}

export interface AgencyMapResult {
  markers: AgencyMapMarker[];
  isTruncated: boolean;
}

/** يقابل HudhudNestApi.Domain.Agencies.Enums.AgencyVerificationStatus (يُسلسَل نصًّا). */
export type AgencyVerificationStatus = 'Unverified' | 'Pending' | 'Verified' | 'Rejected' | 'Revoked';

export const AGENCY_VERIFICATION_STATUSES: readonly AgencyVerificationStatus[] =
  ['Unverified', 'Pending', 'Verified', 'Rejected', 'Revoked'];

// ── دليل المكاتب العام (GET /api/agencies) ──────────────────────────────

/** نوع الصفقة الذي يجب أن يملك المكتب إعلانًا نشطًا واحدًا منه على الأقل. */
export type AgencyDirectoryDeal = 'Sale' | 'Rent' | 'ShortStay' | 'Investment';

/** الترتيب. لا يوجد «الموثّق أولًا» عمدًا: التوثيق فلتر وشارة، لا ترتيب. */
export type AgencyDirectorySort = 'MostListings' | 'TopRated' | 'Newest' | 'Nearest';

export interface AgencyDirectoryFilter {
  search?: string | null;
  governorateId?: number | null;
  districtId?: number | null;
  neighborhoodId?: number | null;
  propertyTypeId?: number | null;
  deal?: AgencyDirectoryDeal | null;
  verifiedOnly?: boolean;
  minRating?: number | null;
  sort?: AgencyDirectorySort;
  page?: number;
  pageSize?: number;
  /** «القريبة مني»: تُرسل في الطلب فقط ولا تدخل الرابط أبدًا (قاعدة 2026-11-13)، مقرّبة إلى 3 منازل. */
  latitude?: number | null;
  longitude?: number | null;
  radiusKm?: number | null;
}

/** بطاقة مكتب في الدليل — يقابل AgencyDirectoryItemDto. */
export interface AgencyDirectoryItem {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  description?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  city?: string | null;
  governorateId?: number | null;
  districtId?: number | null;
  neighborhoodId?: number | null;
  verificationStatus: AgencyVerificationStatus;
  activeListingCount: number;
  ratingAverage: number;
  ratingCount: number;
  createdAt: string;
  /** «القريبة مني» فقط: المسافة بالأمتار إلى أقرب فرع، واسم ذلك الفرع. */
  distanceMeters?: number | null;
  nearestBranchName?: string | null;
}

export interface AgencyDirectoryPage {
  items: AgencyDirectoryItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface AgencyDirectoryFacet {
  id: number;
  count: number;
}

/** عدد المكاتب المدرجة في كل مكان، كي لا يُعرض مكان بلا نتائج. */
export interface AgencyDirectoryFacets {
  governorates: AgencyDirectoryFacet[];
  districts: AgencyDirectoryFacet[];
  neighborhoods: AgencyDirectoryFacet[];
  totalCount: number;
}

// ── المشرف: التوثيق (api/admin/agencies) ───────────────────────────────

export interface AdminAgencySummary {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  verificationStatus: AgencyVerificationStatus;
  verifiedAt?: string | null;
  licenseNumber?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  governorateId?: number | null;
  ownerUserId: string;
  ownerName: string;
  memberCount: number;
  activeListingCount: number;
  createdAt: string;
}

export interface AgencyVerificationEvent {
  id: string;
  fromStatus: AgencyVerificationStatus;
  toStatus: AgencyVerificationStatus;
  actorUserId: string;
  actorName: string;
  reason: string;
  createdAt: string;
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

// ── P3: رمز QR الثابت وإحصاءات المكتب ──

/** نوع حدث على صفحة المكتب. QrScan يسجّله الخادم وحده عند فتح /o/{code}. */
export type AgencyProfileEventType = 'ProfileView' | 'QrScan' | 'ContactClick' | 'ListingClick' | 'Share';
export type AgencyEventChannel = 'None' | 'Phone' | 'WhatsApp' | 'Email' | 'NativeShare' | 'CopyLink' | AgencyLinkChannel;
/** نقرات الموقع وروابط التواصل الاجتماعي (P4)؛ تُحسب ضمن «نقرات التواصل». */
export type AgencyLinkChannel = 'Website' | Exclude<AgencySocialNetwork, 'WhatsApp'>;
/** من أين جاء الزائر إلى صفحة المكتب. قائمة مغلقة، لا نص حر. */
export type AgencyEventSource = 'None' | 'Direct' | 'Qr' | 'Directory' | 'Listing' | 'Share';

/** جسم POST /api/agencies/{id}/events. */
export type AgencyProfileEvent =
  | { type: 'ProfileView'; source: Exclude<AgencyEventSource, 'None'> }
  | { type: 'ContactClick'; channel: 'Phone' | 'WhatsApp' | 'Email' | AgencyLinkChannel }
  | { type: 'ListingClick' }
  | { type: 'Share'; channel: 'NativeShare' | 'CopyLink' };

export interface AgencyEventResult {
  counted: boolean;
  reason?: string | null;
}

export interface AgencyQrCode {
  code: string;
}

export interface AgencyQrResolution {
  slug: string;
}

export interface AgencyStatsTotals {
  profileViews: number;
  qrScans: number;
  contactClicks: number;
  listingClicks: number;
  shares: number;
}

export interface AgencyStatsDay extends AgencyStatsTotals {
  /** yyyy-MM-dd (UTC). */
  day: string;
}

/** يقابل AgencyStatsDto: آخر 7 أو 30 أو 90 يومًا (UTC، اليوم ضمنها). */
export interface AgencyStats {
  days: number;
  from: string;
  to: string;
  totals: AgencyStatsTotals;
  uniqueVisitors: number;
  contacts: { channel: AgencyEventChannel; count: number }[];
  shares: { channel: AgencyEventChannel; count: number }[];
  viewSources: { source: AgencyEventSource; count: number }[];
  daily: AgencyStatsDay[];
}

export const AGENCY_STATS_RANGES: readonly number[] = [7, 30, 90];

/**
 * مفتاح حالة التنقل (history.state) الذي يحمل مصدر زيارة صفحة المكتب ('Qr' | 'Directory' | 'Listing').
 * في الحالة لا في الرابط: الرابط يبقى نظيفًا عند المشاركة، والمشارَك لا يُحتسب «من QR».
 */
export const OFFICE_VISIT_SOURCE_STATE = 'officeVisitSource';
