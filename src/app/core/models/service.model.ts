// src/app/core/models/service.model.ts
//
// HudhudNest Services Marketplace — models matching HudhudNestApi.Application.Services.DTOs.
// This vertical slice ships one working category (Verification / "HudhudNest Verify"); the
// other 12 ServiceCategory values already exist on the backend enum and are included here so
// this file does not need another breaking change when they go live. The /services catalog
// lists all of them; a category with no active offering shows an empty state.

export type ServiceCategory =
  | 'Verification'
  | 'Valuation'
  | 'Inspection'
  | 'Photography'
  | 'PropertyManagement'
  | 'Legal'
  | 'Engineering'
  | 'Maintenance'
  | 'Cleaning'
  | 'Moving'
  | 'Financing'
  | 'Insurance'
  | 'Investment';

/** Display order for the public catalog (/services) — Verification first, as the one live product. */
export const SERVICE_CATEGORIES: readonly ServiceCategory[] = [
  'Verification', 'Valuation', 'Inspection', 'Photography', 'PropertyManagement', 'Legal',
  'Engineering', 'Maintenance', 'Cleaning', 'Moving', 'Financing', 'Insurance', 'Investment'
];

export type ServiceRequestStatus =
  | 'Submitted'
  | 'UnderReview'
  | 'Accepted'
  | 'Scheduled'
  | 'InProgress'
  | 'Completed'
  | 'Reviewed'
  | 'Rejected'
  | 'Cancelled';

export type ServiceProviderVerificationLevel =
  | 'None'
  | 'AccountVerified'
  | 'IdentityVerified'
  | 'BusinessVerified'
  | 'ServiceVerified';

export interface ServiceOfferingDto {
  id: string;
  serviceProviderId: string;
  serviceProviderDisplayName: string;
  serviceProviderVerificationLevel: ServiceProviderVerificationLevel;
  category: ServiceCategory;
  title: string;
  description?: string | null;
  basePrice?: number | null;
  currencyId?: number | null;
  estimatedDurationDays?: number | null;
  isActive: boolean;
  /** Governorates the provider covers; empty = not restricted (legacy providers). */
  providerCoverageGovernorateIds?: number[] | null;
  createdAt: string;
}

export interface ServiceRequestDto {
  id: string;
  requestNumber: string;
  propertyId: string;
  propertyTitle: string;
  propertyMainImageUrl?: string | null;
  requesterId: string;
  requesterName: string;
  serviceProviderId: string;
  serviceProviderDisplayName: string;
  serviceOfferingId: string;
  serviceOfferingTitle: string;
  category: ServiceCategory;
  status: ServiceRequestStatus;
  requesterNote?: string | null;
  providerNote?: string | null;
  scheduledAt?: string | null;
  quotedPrice?: number | null;
  quotedPriceCurrencyId?: number | null;
  finalPrice?: number | null;
  finalPriceCurrencyId?: number | null;
  rejectionReason?: string | null;
  cancellationReason?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface ServiceRequestStatusHistoryDto {
  id: string;
  fromStatus?: ServiceRequestStatus | null;
  toStatus: ServiceRequestStatus;
  changedByUserId?: string | null;
  note?: string | null;
  createdAt: string;
}

export interface ServiceReviewDto {
  id: string;
  serviceRequestId: string;
  serviceProviderId: string;
  reviewerId: string;
  reviewerName: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
}

export interface CreateServiceRequestPayload {
  propertyId: string;
  serviceOfferingId: string;
  requesterNote?: string | null;
}

export interface AddServiceReviewPayload {
  rating: number;
  comment?: string | null;
}

/** Client-side mirror of CreateServiceRequestCommandValidator — a fast, friendly check
 * before the round trip; the backend remains the actual authority. */
export function validateCreateServiceRequest(payload: CreateServiceRequestPayload): string | null {
  if (!payload.propertyId) return 'SERVICE_REQUEST.PROPERTY_REQUIRED';
  if (!payload.serviceOfferingId) return 'SERVICE_REQUEST.OFFERING_REQUIRED';
  if (payload.requesterNote && payload.requesterNote.length > 1000) return 'SERVICE_REQUEST.NOTE_TOO_LONG';
  return null;
}

/** The statuses a requester can still cancel from — mirrors ServiceRequest.Cancel's guard. */
export const CANCELLABLE_STATUSES: ServiceRequestStatus[] = [
  'Submitted', 'UnderReview', 'Accepted', 'Scheduled', 'InProgress'
];

/** Once Completed, the requester may leave exactly one review. */
export function canReview(request: ServiceRequestDto, currentUserId: string | null): boolean {
  return !!currentUserId && request.requesterId === currentUserId && request.status === 'Completed';
}

// ---------------------------------------------------------------------------
// Provider side — matches ServiceProvidersController / ServiceRequestsController's
// provider-inbox + accept/reject/schedule/start/complete lifecycle. See
// provider-inbox.page.ts / provider-request-detail.page.ts, the frontend entry
// points that consume these.
// ---------------------------------------------------------------------------

export interface ServiceProviderDto {
  id: string;
  userId: string;
  agencyId?: string | null;
  displayName: string;
  bio?: string | null;
  logoUrl?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  verificationLevel: ServiceProviderVerificationLevel;
  isActive: boolean;
  /** Provider status, kept apart from the application status. */
  status?: ServiceProviderStatus;
  statusReason?: string | null;
  approvedCategories?: ServiceCategory[];
  coverageGovernorateIds?: number[];
  averageRating?: number | null;
  reviewCount: number;
  createdAt: string;
}

export type ServiceProviderStatus = 'Active' | 'Suspended' | 'Revoked';

export interface UpdateServiceProviderProfilePayload {
  displayName: string;
  bio?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

export interface ServiceRequestDocumentDto {
  id: string;
  serviceRequestId: string;
  fileUrl: string;
  fileType: string;
  fileName: string;
  uploadedByUserId: string;
  createdAt: string;
}

export interface AcceptServiceRequestPayload {
  quotedPrice?: number | null;
  quotedPriceCurrencyId?: number | null;
  providerNote?: string | null;
}

export interface CompleteServiceRequestPayload {
  finalPrice?: number | null;
  finalPriceCurrencyId?: number | null;
}

/** Mirrors ServiceRequest's state machine — which single provider action (if any) applies
 * to a request's current status. 'None' covers terminal/non-actionable states (Completed,
 * Reviewed, Rejected, Cancelled).
 *
 * ✅ تصحيح (وُجد بتدقيق حيّ): 'Submitted' كانت هنا خطأً بدل 'UnderReview'. الباك اند
 * (ServiceRequestStatus.cs) يوثّق صراحة أن كل طلب يُنشأ مباشرة بحالة UnderReview —
 * "Submitted" لحظية فقط داخل ServiceRequest.Create ولا تُخزَّن أبداً كحالة فعلية
 * يراها مزوّد الخدمة. AcceptServiceRequestCommandHandler/RejectServiceRequestCommandHandler
 * يتطلبان EnsureStatus(UnderReview) تحديداً — القبول/الرفض من 'Submitted' يفشل بـ409
 * دائماً في الواقع، لأن أي طلب حقيقي لا يصل بهذه الحالة إطلاقاً. */
export type ProviderAction = 'AcceptOrReject' | 'Schedule' | 'Start' | 'Complete' | 'None';

export function nextProviderAction(status: ServiceRequestStatus): ProviderAction {
  switch (status) {
    case 'Submitted': // نظرياً غير قابل للحدوث فعلياً (انظر التعليق أعلاه) — يُعامَل بنفس UnderReview احتياطاً.
    case 'UnderReview': return 'AcceptOrReject';
    case 'Accepted': return 'Schedule';
    case 'Scheduled': return 'Start';
    case 'InProgress': return 'Complete';
    default: return 'None';
  }
}
