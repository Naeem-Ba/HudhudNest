// src/app/core/models/service.model.ts
//
// AqarTech Services Marketplace — models matching PropertyApi.Application.Services.DTOs.
// This vertical slice ships one working category (Verification / "AqarTech Verify"); the
// other 12 ServiceCategory values already exist on the backend enum and are included here so
// this file does not need another breaking change when they go live — nothing in the UI shows
// them yet.

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
