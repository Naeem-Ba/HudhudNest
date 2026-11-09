// =============================================================
// src/app/core/models/geo-location.model.ts
//
// Models of HudhudNest's own geographic catalog (API: /api/locations/*, /api/admin/locations/*).
// The catalog is the source of truth for approved places; the external map provider only suggests,
// and the frontend never talks to it directly (everything goes through the backend).
// =============================================================

/** Levels of the hierarchy, from the top down. Only the governorate is mandatory on a listing. */
export type GeoLocationType = 'Country' | 'Governorate' | 'City' | 'District' | 'Neighborhood' | 'Street';

/** The levels a user fills in a listing form, in order. */
export const GEO_FORM_LEVELS: readonly GeoLocationType[] = ['Governorate', 'City', 'District', 'Neighborhood', 'Street'];

export interface GeoLegacyIds {
  governorateId: number | null;
  districtId: number | null;
  neighborhoodId: number | null;
}

/** One ancestor (or the place itself) of a breadcrumb. */
export interface GeoNode {
  id: number;
  type: GeoLocationType;
  nameAr: string;
  nameEn: string;
  nameDe: string | null;
  legacyGovernorateId: number | null;
  legacyDistrictId: number | null;
  legacyNeighborhoodId: number | null;
}

export interface GeoLocation {
  id: number;
  type: GeoLocationType;
  parentId: number | null;
  countryCode: string;
  officialName: string;
  nameAr: string;
  nameEn: string;
  nameDe: string | null;
  latitude: number | null;
  longitude: number | null;
  path: GeoNode[];
  legacy: GeoLegacyIds;
  matchedAlias: string | null;
}

export type GeoProviderStatus = 'ok' | 'disabled' | 'unavailable' | 'rate_limited' | 'skipped';

export interface GeoChainItem {
  type: GeoLocationType;
  name: string;
  matchedLocationId: number | null;
}

/** A suggestion from the catalog (`source` = local) or from the map provider (`source` = provider). */
export interface GeoMapSuggestion {
  source: 'local' | 'provider';
  type: GeoLocationType;
  name: string;
  displayName: string;
  latitude: number | null;
  longitude: number | null;
  locationId: number | null;
  externalProvider: string | null;
  externalPlaceId: string | null;
  chain: GeoChainItem[];
  /** Server-signed snapshot of a provider result. Send it back unchanged when proposing the street. */
  proof: string | null;
}

export interface GeoMapSearchResult {
  suggestions: GeoMapSuggestion[];
  providerStatus: GeoProviderStatus;
  attribution: string | null;
}

export interface GeoReverseResult {
  found: boolean;
  displayName: string | null;
  /** The deepest catalog place the pin falls in (with its ancestors). */
  matched: GeoLocation | null;
  chain: GeoChainItem[];
  street: GeoMapSuggestion | null;
  providerStatus: GeoProviderStatus;
  attribution: string | null;
}

export interface GeoRequestInput {
  type: GeoLocationType;
  parentLocationId: number;
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
  nameDe?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  proof?: string | null;
  propertyId?: string | null;
}

export type GeoRequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'NeedsCorrection' | 'Duplicate';

export interface GeoRequestResult {
  id: string;
  status: GeoRequestStatus;
  autoApproved: boolean;
  decisionCode: string | null;
  decisionReason: string | null;
  locationId: number | null;
  duplicateOfLocationId: number | null;
}

export interface GeoRequest {
  id: string;
  type: GeoLocationType;
  parentLocationId: number;
  parentPath: GeoNode[];
  proposedName: string;
  proposedNameAr: string | null;
  proposedNameEn: string | null;
  proposedNameDe: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string;
  submittedByUserId: string;
  submittedByName: string | null;
  propertyId: string | null;
  status: GeoRequestStatus;
  confidenceScore: number | null;
  autoApproved: boolean;
  decisionCode: string | null;
  decisionReason: string | null;
  duplicateOfLocationId: number | null;
  resultingLocationId: number | null;
  reviewNotes: string | null;
  createdAt: string;
}

/** A place as the administrator sees it. */
export interface GeoAdminLocation {
  id: number;
  type: GeoLocationType;
  parentId: number | null;
  countryCode: string;
  officialName: string;
  nameAr: string;
  nameEn: string;
  nameDe: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string;
  verificationStatus: string;
  approvalStatus: string;
  confidenceScore: number | null;
  autoApproved: boolean;
  approvalReason: string | null;
  isActive: boolean;
  isArchived: boolean;
  mergedIntoLocationId: number | null;
  childCount: number;
  listingCount: number;
  aliases: string[];
  path: GeoNode[];
  updatedAt: string;
}

export interface GeoChange {
  id: number;
  locationId: number;
  action: string;
  actorUserId: string | null;
  reason: string | null;
  at: string;
}

export interface GeoPolicy {
  streetAutoApprovalEnabled: boolean;
  streetAutoApprovalMinScore: number;
  maxAutoApprovalsPerUserPerDay: number;
  fuzzyDuplicateThreshold: number;
  externalLookupEnabled: boolean;
  updatedAt: string;
}

export interface GeoImportRow {
  key: string;
  type: GeoLocationType;
  parentKey?: string | null;
  parentLocationId?: number | null;
  nameAr: string;
  nameEn?: string | null;
  nameDe?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  aliases?: string[] | null;
}

export interface GeoImportResult {
  batchId: string | null;
  dryRun: boolean;
  rowsTotal: number;
  rowsStaged: number;
  rowsSkipped: number;
  issues: { key: string; code: string; message: string }[];
}

export interface GeoMergeResult {
  sourceLocationId: number;
  targetLocationId: number;
  childrenMoved: number;
  listingsMoved: number;
  aliasesAdded: number;
}

/** Name in the current UI language; German falls back to English, anything unknown to English. */
export function geoName(item: { nameAr: string; nameEn: string; nameDe?: string | null }, lang: string): string {
  if (lang === 'ar') return item.nameAr || item.nameEn;
  if (lang === 'de' && item.nameDe) return item.nameDe;
  return item.nameEn || item.nameAr;
}

const TYPES: readonly GeoLocationType[] = ['Country', 'Governorate', 'City', 'District', 'Neighborhood', 'Street'];

export function toGeoType(value: unknown): GeoLocationType {
  const found = TYPES.find(t => t.toLowerCase() === String(value ?? '').toLowerCase());
  return found ?? 'District';
}

/** Breadcrumb "Damascus › Mazzeh › Villat" in the UI language, skipping the country. */
export function geoBreadcrumb(path: readonly GeoNode[], lang: string): string {
  return path.filter(n => n.type !== 'Country').map(n => geoName(n, lang)).join(' › ');
}
