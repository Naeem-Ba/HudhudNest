// src/app/core/models/admin-service-requests.model.ts
//
// Admin view of service requests — matches HudhudNestApi.Application.Services.Admin.AdminServiceRequestDtos.

import {
  ServiceCategory,
  ServiceOutcomeReason,
  ServiceParty,
  ServiceRequestDto,
  ServiceRequestIntent,
  ServiceRequestMessageDto,
  ServiceRequestStatus,
  ServiceRequestStatusHistoryDto,
  ServiceRequesterAnswer,
  ServiceRequesterReason
} from './service.model';
import { ServicePage } from './provider-onboarding.model';

export interface AdminServiceRequestFilter {
  search?: string;
  status?: ServiceRequestStatus | '';
  category?: ServiceCategory | '';
  offeringId?: string | null;
  providerId?: string | null;
  from?: string | null;
  to?: string | null;
  needsAttention?: boolean;
  /** true = confirmed requests only, false = inquiries that never became a request. */
  confirmed?: boolean | null;
  page?: number;
  pageSize?: number;
}

export interface AdminServiceRequestSummaryDto {
  id: string;
  requestNumber: string;
  propertyId: string;
  propertyTitle: string;
  requesterName: string;
  serviceProviderId: string;
  serviceProviderName: string;
  serviceOfferingId: string;
  serviceOfferingTitle: string;
  category: ServiceCategory;
  status: ServiceRequestStatus;
  outcomeReason?: ServiceOutcomeReason | null;
  requesterAnswer?: ServiceRequesterAnswer | null;
  requesterReason?: ServiceRequesterReason | null;
  rating?: number | null;
  needsAttention: boolean;
  createdAt: string;
  updatedAt?: string | null;
  intent?: ServiceRequestIntent | null;
  confirmedAt?: string | null;
  lastActivityAt?: string | null;
  expiredWaitingOn?: ServiceParty | null;
  messageCount?: number;
}

export type AdminServiceRequestPage = ServicePage<AdminServiceRequestSummaryDto>;

export interface AdminServiceReviewDto {
  id: string;
  serviceRequestId: string;
  reviewerName: string;
  rating: number;
  comment?: string | null;
  isHidden: boolean;
  hiddenReason?: string | null;
  createdAt: string;
}

export interface AdminServiceRequestDetailDto {
  request: ServiceRequestDto;
  history: ServiceRequestStatusHistoryDto[];
  review?: AdminServiceReviewDto | null;
  needsAttention: boolean;
  /** The whole conversation; the admin reads it but is not a side of it. */
  messages?: ServiceRequestMessageDto[] | null;
}

export interface ReasonCountDto {
  reason: string;
  count: number;
}

/** One line of the statistics table: a category, a service or a provider. */
export interface ServiceStatsRowDto {
  key: string;
  id?: string | null;
  label?: string | null;
  subLabel?: string | null;
  isActive?: boolean | null;
  requested: number;
  open: number;
  completed: number;
  notCompleted: number;
  rejected: number;
  cancelled: number;
  disputed: number;
  averageRating?: number | null;
  ratingCount: number;
  closed: number;
  /** Completed / closed, 0..1. Null until something closed. */
  completionRate?: number | null;
  /** Every conversation opened (confirmed or not). `requested` counts only the confirmed ones. */
  inquiries?: number;
  openInquiries?: number;
  /** Conversations that ended (declined, withdrawn or expired) without ever becoming a request. */
  inquiriesDropped?: number;
  expired?: number;
  /** requested / inquiries, 0..1. Null until someone made contact. */
  conversionRate?: number | null;
}

export interface ServiceStatsDto {
  from?: string | null;
  to?: string | null;
  totals: ServiceStatsRowDto;
  byCategory: ServiceStatsRowDto[];
  byOffering: ServiceStatsRowDto[];
  byProvider: ServiceStatsRowDto[];
  providerReasons: ReasonCountDto[];
  requesterReasons: ReasonCountDto[];
  /** Who stayed silent when requests expired: `Provider` or `Requester`. */
  expiryReasons?: ReasonCountDto[] | null;
}

export interface AdminSetOutcomePayload {
  completed: boolean;
  reason?: ServiceOutcomeReason | null;
  providerNote?: string | null;
  adminNote: string;
}
