// src/app/core/models/admin-service-requests.model.ts
//
// Admin view of service requests — matches HudhudNestApi.Application.Services.Admin.AdminServiceRequestDtos.

import {
  ServiceCategory,
  ServiceOutcomeReason,
  ServiceRequestDto,
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
}

export interface AdminSetOutcomePayload {
  completed: boolean;
  reason?: ServiceOutcomeReason | null;
  providerNote?: string | null;
  adminNote: string;
}
