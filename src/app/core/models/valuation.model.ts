// src/app/core/models/valuation.model.ts
//
// Stage 7 (Valuation module, HudhudNestApi.Application.Valuation.*) — matches
// CreateValuationInquiryCommand/CreateValuationInquiryResultDto,
// GetValuationInquiryStatusQuery/ValuationInquiryStatusDto, and ComparableListingsResult on
// the backend. Deliberately carries no requester identity/contact field anywhere here — the
// backend's own DTOs never expose one either (see ValuationOfficeInvitationDashboardDto's and
// ValuationEstimateDto's doc comments on the backend).

export type ValuationRequestType = 'ForRent' | 'ForSale' | 'ForRentAndSale';

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
  propertyTypeId?: number | null;
  area?: number | null;
  rooms?: number | null;
  requestType: ValuationRequestType;
}

/** Mirrors HudhudNestApi.Application.Valuation.DTOs.ComparableListingsResult (Stage 3). */
export interface ComparableListingsResultDto {
  hasComparableListings: boolean;
  comparableCount: number;
  minPrice?: number | null;
  maxPrice?: number | null;
  averagePrice?: number | null;
  medianPrice?: number | null;
  isPreliminary: boolean;
  requiresOfficeValuation: boolean;
  matchLevel: ValuationMatchLevel;
  source?: string | null;
  disclaimer?: string | null;
  message?: string | null;
}

/** Mirrors CreateValuationInquiryResultDto. */
export interface CreateValuationInquiryResultDto {
  inquiryId: string;
  status: ValuationInquiryStatus;
  expiresAt: string;
  fastPath: ComparableListingsResultDto;
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
  if (payload.area != null && payload.area <= 0) return 'VALUATION.ERRORS.AREA_INVALID';
  if (payload.rooms != null && payload.rooms <= 0) return 'VALUATION.ERRORS.ROOMS_INVALID';
  return null;
}
