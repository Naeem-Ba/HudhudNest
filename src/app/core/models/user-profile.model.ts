// =============================================================
// src/app/core/models/user-profile.model.ts
//
// يطابق:
//   - PropertyApi.Application.Users.DTOs.UserProfileDto
//     (GET /api/Users/{id}/profile)
//   - PropertyApi.Application.Reviews.DTOs.UserRatingDto /
//     UserRatingSummaryDto (GET/POST /api/Users/{id}/ratings)
//
// صفحة "الملف الشخصي العام" (Public Profile) — منفصلة عمداً عن
// ProfileService (إدارة حساب المستخدم نفسه عبر /users/me) لأن هذه
// نقاط عامة (AllowAnonymous بالباك اند عدا الإرسال) تُستهلَك من أي
// زائر يشاهد صفحة بائع آخر.
// =============================================================

export interface UserProfileDto {
  id: string;
  displayName: string;
  profileImageUrl: string | null;
  memberSince: string;
  isAgent: boolean;

  bio: string | null;
  contactInfo: string | null;

  soldCount: number;
  rentedCount: number;

  averageCredibility: number;
  averageSafety: number;
  averageResponseSpeed: number;
  averageTransparency: number;
  averageOverall: number;
  ratingsCount: number;
}

export interface UserRatingDto {
  id: string;
  ratedUserId: string;
  raterId: string;
  raterName: string;
  raterImageUrl: string | null;
  credibility: number;
  safety: number;
  responseSpeed: number;
  transparency: number;
  overallScore: number;
  comment: string | null;
  createdAt: string;
}

export interface UserRatingSummaryDto {
  averageCredibility: number;
  averageSafety: number;
  averageResponseSpeed: number;
  averageTransparency: number;
  averageOverall: number;
  totalCount: number;
  page: number;
  pageSize: number;
  ratings: UserRatingDto[];
}

export interface SubmitUserRatingRequest {
  credibility: number;
  safety: number;
  responseSpeed: number;
  transparency: number;
  comment?: string | null;
}

/**
 * GET /api/Users/{id}/ratings/eligibility — تُستدعى قبل عرض نموذج التقييم كي
 * تعرف الصفحة أي حالة تعرضها: (أ) غير مؤهَّل بعد (زر مُعطَّل + رسالة توضيحية)،
 * (ب) مؤهَّل ولم يُقيِّم بعد (نموذج فارغ)، (ج) قيَّم من قبل (نموذج مُعبَّأ للتعديل).
 */
export interface RatingEligibilityDto {
  canRate: boolean;
  isSelf: boolean;
  alreadyRated: boolean;
  existingRating: UserRatingDto | null;
}

/**
 * المحاور الأربعة التي يُبنى عليها التقييم — نفس الترتيب المعروض
 * بالصفحة وبنموذج الإرسال. مفتاح كل عنصر مطابق لاسم الحقل بـ DTOs
 * أعلاه (بلا "average" البادئة) كي يُستخدم كمفتاح ديناميكي في القالب.
 */
export const RATING_CRITERIA = [
  { key: 'credibility', labelKey: 'PUBLIC_PROFILE.CRITERIA.CREDIBILITY' },
  { key: 'safety', labelKey: 'PUBLIC_PROFILE.CRITERIA.SAFETY' },
  { key: 'responseSpeed', labelKey: 'PUBLIC_PROFILE.CRITERIA.RESPONSE_SPEED' },
  { key: 'transparency', labelKey: 'PUBLIC_PROFILE.CRITERIA.TRANSPARENCY' }
] as const;

export type RatingCriterionKey = (typeof RATING_CRITERIA)[number]['key'];

export function starsFor(score: number): boolean[] {
  const rounded = Math.round(score);
  return Array.from({ length: 5 }, (_, i) => i < rounded);
}
