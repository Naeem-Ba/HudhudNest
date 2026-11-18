// src/app/core/models/valuation.model.ts
//
// Stage 7 (Valuation module, HudhudNestApi.Application.Valuation.*) — matches
// CreateValuationInquiryCommand/CreateValuationInquiryResultDto,
// GetValuationInquiryStatusQuery/ValuationInquiryStatusDto, and ComparableListingsResult on
// the backend. Deliberately carries no requester identity/contact field anywhere here — the
// backend's own DTOs never expose one either (see ValuationOfficeInvitationDashboardDto's and
// ValuationEstimateDto's doc comments on the backend).

import { PriceEstimate } from '../api/price-estimate-api.service';

/** Sale or rent only: the estimate is a sale price or a monthly rent (valuation audit 2026-11-17). */
export type ValuationRequestType = 'ForRent' | 'ForSale';

export type ValuationInquiryStatus =
  | 'Pending'
  | 'MatchedFromListings'
  | 'AwaitingOfficeResponses'
  | 'Completed'
  | 'Expired';

export type ValuationMatchLevel = 'Neighborhood' | 'District' | 'Governorate' | 'GovernorateNeighboring';

export interface CreateValuationInquiryPayload {
  governorateId: number;
  districtId?: number | null;
  neighborhoodId?: number | null;
  /** Required: without it the estimate would mix every kind of property. */
  propertyTypeId: number | null;
  /** Required, in square metres. */
  area: number | null;
  rooms?: number | null;
  requestType: ValuationRequestType;
  /** USD, EUR or SYP; the estimate comes back in this one currency. */
  currencyCode?: string | null;
}

/** Mirrors CreateValuationInquiryResultDto. */
export interface CreateValuationInquiryResultDto {
  inquiryId: string;
  status: ValuationInquiryStatus;
  expiresAt: string;
  /**
   * The automatic estimate: the same area price statistics as /price-estimate (a range of asking prices in one
   * currency, with sample size, confidence and dates), or available = false with a reason.
   */
  estimate: PriceEstimate;
  /** True when there is no automatic estimate, so only an office could answer. */
  requiresOfficeValuation: boolean;
  officeMatchCount: number;
  hasMinimumOfficeCoverage: boolean;
  insufficientOfficeCoverage: boolean;
  /** The Nearby-Governorate disclosure rule. */
  matchedNeighboringGovernorate: boolean;
  /** False while offices cannot receive valuation requests: a request that needed them was closed at once. */
  officePathAvailable: boolean;
}

/** Mirrors ValuationEstimateDto — deliberately no agency identity. */
export interface ValuationEstimateDto {
  estimatedPrice: number;
  notes?: string | null;
  submittedAt: string;
  matchLevel: ValuationMatchLevel;
}

/** Mirrors ValuationInquiryStatusDto. */
export interface ValuationInquiryStatusDto {
  inquiryId: string;
  status: ValuationInquiryStatus;
  expiresAt: string;
  estimates: ValuationEstimateDto[];
}

/** Client-side mirror of CreateValuationInquiryCommandValidator — a fast, friendly check
 * before the round trip; the backend (and ValuationInquiry.Create's own domain guards) remain
 * the actual authority. */
export function validateCreateValuationInquiry(payload: CreateValuationInquiryPayload): string | null {
  if (!payload.governorateId) return 'VALUATION.ERRORS.GOVERNORATE_REQUIRED';
  if (!payload.requestType) return 'VALUATION.ERRORS.REQUEST_TYPE_REQUIRED';
  if (payload.neighborhoodId && !payload.districtId) return 'VALUATION.ERRORS.NEIGHBORHOOD_NEEDS_DISTRICT';
  if (!payload.propertyTypeId) return 'VALUATION.ERRORS.PROPERTY_TYPE_REQUIRED';
  if (payload.area == null) return 'VALUATION.ERRORS.AREA_REQUIRED';
  if (payload.area <= 0) return 'VALUATION.ERRORS.AREA_INVALID';
  if (payload.rooms != null && payload.rooms <= 0) return 'VALUATION.ERRORS.ROOMS_INVALID';
  return null;
}
