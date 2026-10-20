// src/app/core/models/visit.model.ts
//
// ✅ نموذج جديد كامل — مطابق لمواصفات الـ API (قسم 9.9)
//
// الـ Backend يُرجع camelCase الآن مباشرة (RELEASE-BLOCKERS-AR.md B-11 — كان PascalCase،
// ويُحوَّل عبر apiToCamelCase() المحذوفة). toVisitRequest() ما زالت مستخدَمة لبناء الطلب الصادر.

// حالات طلب الزيارة (قسم 9.9 من المواصفات)
export type VisitStatus =
  | 'Pending'
  | 'Confirmed'
  | 'Declined'
  | 'Cancelled'
  | 'Completed'
  | 'RescheduleProposed';

// نموذج الزيارة الكامل (ما يرجعه الـ Backend)
export interface VisitDto {
  id: string;
  propertyId: string;
  propertyTitle?: string;
  visitorId?: string;
  visitorName: string;
  visitorPhone: string;
  visitorNote?: string | null;
  proposedAt: string;
  status: VisitStatus;
  ownerId?: string;
  createdAt?: string;
  updatedAt?: string;
}

// طلب إنشاء زيارة جديدة — يُرسَل للـ Backend
export interface CreateVisitRequest {
  propertyId: string;
  proposedAt: string;          // ISO 8601 مثل: "2026-06-20T14:00:00Z"
  visitorName: string;         // مطلوب، max 150
  visitorPhone: string;        // مطلوب، صيغة دولية: +49123456789
  visitorNote?: string | null; // اختياري، max 500
}

// تحقق من القيود على CreateVisitRequest
// ProposedAt يجب أن يكون:
//   - بعد ساعتين من الآن على الأقل
//   - قبل 90 يوماً من الآن كحد أقصى
export function validateCreateVisit(request: CreateVisitRequest): string | null {
  const now = Date.now();
  const proposedMs = new Date(request.proposedAt).getTime();

  const twoHoursMs = 2 * 60 * 60 * 1000;
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

  if (isNaN(proposedMs)) {
    return 'VISIT.INVALID_DATE';
  }

  if (proposedMs < now + twoHoursMs) {
    return 'VISIT.TOO_SOON';
  }

  if (proposedMs > now + ninetyDaysMs) {
    return 'VISIT.TOO_FAR';
  }

  if (!request.visitorName?.trim()) {
    return 'VISIT.NAME_REQUIRED';
  }

  if (!request.visitorPhone?.trim()) {
    return 'VISIT.PHONE_REQUIRED';
  }

  return null;
}