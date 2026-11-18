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
  /** Signed-in only: also ask the local offices for their price opinion, even when there is an estimate. */
  requestOfficeOpinion?: boolean;
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
  /**
   * False while offices cannot receive valuation requests, and for a guest (an office answer can only reach an
   * account). A request that needed offices was then closed at once.
   */
  officePathAvailable: boolean;
  /** True when this request was sent to local offices; their answers appear on /valuation/:inquiryId. */
  officesRequested: boolean;
}

/** One office's price opinion, as the customer sees it (Mirrors ValuationEstimateDto). The office name is public. */
export interface ValuationEstimateDto {
  invitationId: string;
  agencyName: string;
  estimatedPrice: number;
  /** Null only for answers recorded before offices were asked for a currency. */
  currencyCode: string | null;
  notes?: string | null;
  submittedAt: string;
  matchLevel: ValuationMatchLevel;
}

/** Mirrors ValuationInquiryStatusDto. */
export interface ValuationInquiryStatusDto {
  inquiryId: string;
  status: ValuationInquiryStatus;
  expiresAt: string;
  /** How many offices were asked, for "2 of 3 answered". */
  invitedOfficeCount: number;
  estimates: ValuationEstimateDto[];
}

export type ValuationOfficeInvitationStatus = 'Sent' | 'Responded' | 'Expired';

/** One request in an office's valuation inbox (Mirrors ValuationOfficeInvitationDashboardDto). */
export interface ValuationOfficeInvitation {
  invitationId: string;
  inquiryId: string;
  matchLevel: ValuationMatchLevel;
  invitationStatus: ValuationOfficeInvitationStatus;
  sentAt: string;
  respondedAt: string | null;
  /** Still open and before the deadline; the server re-checks on submit. */
  canRespond: boolean;
  governorateId: number;
  districtId: number | null;
  neighborhoodId: number | null;
  propertyTypeId: number | null;
  area: number | null;
  rooms: number | null;
  requestType: ValuationRequestType;
  inquiryExpiresAt: string;
  myEstimatedPrice: number | null;
  myCurrencyCode: string | null;
  myNotes: string | null;
  /** Only once the customer chose to share them with this office. */
  customerContactPhone: string | null;
  customerContactEmail: string | null;
}

/** An office's answer: one price in one market currency, with an optional note. */
export interface ValuationOfficeResponsePayload {
  estimatedPrice: number;
  currencyCode: string;
  notes?: string | null;
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
