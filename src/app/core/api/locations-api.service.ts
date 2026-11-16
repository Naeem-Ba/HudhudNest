// =============================================================
// src/app/core/api/locations-api.service.ts
//
// Client of the location catalog API:
//   public     GET  /locations/{countries,children,descendants,search,{id},{id}/hierarchy}
//   signed in  POST /locations/map/{search,reverse}, POST /locations/requests, GET /locations/requests/mine
//   admin      /admin/locations/*
//
// Typing-time autocomplete (`search`) is answered from HudhudNest's own catalog only. The external map
// provider is reached only through `mapSearch` (an explicit map search) and `reverse` (a settled pin) -
// and only ever through the backend.
// =============================================================

import { Injectable } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { BackendApiService } from './backend-api.service';
import { SKIP_ERROR_TOAST } from '../interceptors/api-error.interceptor';
import {
  GeoAdminLocation,
  GeoChange,
  GeoChainItem,
  GeoImportResult,
  GeoImportRow,
  GeoLocation,
  GeoLocationType,
  GeoMapSearchResult,
  GeoMapSuggestion,
  GeoMergeResult,
  GeoNode,
  GeoPolicy,
  GeoProviderStatus,
  GeoRequest,
  GeoRequestInput,
  GeoRequestResult,
  GeoRequestStatus,
  GeoReverseResult,
  toGeoType
} from '../models/geo-location.model';

type Raw = Record<string, unknown>;

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const obj = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const list = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : []);

export function toGeoNode(raw: unknown): GeoNode {
  const r = obj(raw);
  return {
    id: Number(r['id']),
    type: toGeoType(r['type']),
    nameAr: String(r['nameAr'] ?? ''),
    nameEn: String(r['nameEn'] ?? ''),
    nameDe: str(r['nameDe']) || null,
    legacyGovernorateId: num(r['legacyGovernorateId']),
    legacyDistrictId: num(r['legacyDistrictId']),
    legacyNeighborhoodId: num(r['legacyNeighborhoodId'])
  };
}

export function toGeoLocation(raw: unknown): GeoLocation {
  const r = obj(raw);
  const legacy = obj(r['legacy']);
  return {
    id: Number(r['id']),
    type: toGeoType(r['type']),
    parentId: num(r['parentId']),
    countryCode: String(r['countryCode'] ?? 'SY'),
    officialName: String(r['officialName'] ?? ''),
    nameAr: String(r['nameAr'] ?? ''),
    nameEn: String(r['nameEn'] ?? ''),
    nameDe: str(r['nameDe']) || null,
    latitude: num(r['latitude']),
    longitude: num(r['longitude']),
    path: list(r['path']).map(toGeoNode),
    legacy: {
      governorateId: num(legacy['governorateId']),
      districtId: num(legacy['districtId']),
      neighborhoodId: num(legacy['neighborhoodId'])
    },
    matchedAlias: str(r['matchedAlias'])
  };
}

function toChain(raw: unknown): GeoChainItem[] {
  return list(raw).map(c => ({ type: toGeoType(c['type']), name: String(c['name'] ?? ''), matchedLocationId: num(c['matchedLocationId']) }));
}

export function toGeoSuggestion(raw: unknown): GeoMapSuggestion {
  const r = obj(raw);
  return {
    source: r['source'] === 'provider' ? 'provider' : 'local',
    type: toGeoType(r['type']),
    name: String(r['name'] ?? ''),
    displayName: String(r['displayName'] ?? r['name'] ?? ''),
    latitude: num(r['latitude']),
    longitude: num(r['longitude']),
    locationId: num(r['locationId']),
    externalProvider: str(r['externalProvider']),
    externalPlaceId: str(r['externalPlaceId']),
    chain: toChain(r['chain']),
    proof: str(r['proof'])
  };
}

function toStatus(v: unknown): GeoProviderStatus {
  return (['ok', 'disabled', 'unavailable', 'rate_limited', 'skipped'] as const).find(s => s === v) ?? 'unavailable';
}

function toRequestResult(raw: unknown): GeoRequestResult {
  const r = obj(raw);
  return {
    id: String(r['id'] ?? ''),
    status: String(r['status'] ?? 'Pending') as GeoRequestStatus,
    autoApproved: !!r['autoApproved'],
    decisionCode: str(r['decisionCode']),
    decisionReason: str(r['decisionReason']),
    locationId: num(r['locationId']),
    duplicateOfLocationId: num(r['duplicateOfLocationId'])
  };
}

function toRequest(raw: unknown): GeoRequest {
  const r = obj(raw);
  return {
    id: String(r['id'] ?? ''),
    type: toGeoType(r['type']),
    parentLocationId: Number(r['parentLocationId']),
    parentPath: list(r['parentPath']).map(toGeoNode),
    proposedName: String(r['proposedName'] ?? ''),
    proposedNameAr: str(r['proposedNameAr']),
    proposedNameEn: str(r['proposedNameEn']),
    proposedNameDe: str(r['proposedNameDe']),
    latitude: num(r['latitude']),
    longitude: num(r['longitude']),
    source: String(r['source'] ?? ''),
    submittedByUserId: String(r['submittedByUserId'] ?? ''),
    submittedByName: str(r['submittedByName']),
    propertyId: str(r['propertyId']),
    status: String(r['status'] ?? 'Pending') as GeoRequestStatus,
    confidenceScore: num(r['confidenceScore']),
    autoApproved: !!r['autoApproved'],
    decisionCode: str(r['decisionCode']),
    decisionReason: str(r['decisionReason']),
    duplicateOfLocationId: num(r['duplicateOfLocationId']),
    resultingLocationId: num(r['resultingLocationId']),
    reviewNotes: str(r['reviewNotes']),
    createdAt: String(r['createdAt'] ?? '')
  };
}

function toAdminLocation(raw: unknown): GeoAdminLocation {
  const r = obj(raw);
  return {
    id: Number(r['id']),
    type: toGeoType(r['type']),
    parentId: num(r['parentId']),
    countryCode: String(r['countryCode'] ?? 'SY'),
    officialName: String(r['officialName'] ?? ''),
    nameAr: String(r['nameAr'] ?? ''),
    nameEn: String(r['nameEn'] ?? ''),
    nameDe: str(r['nameDe']) || null,
    latitude: num(r['latitude']),
    longitude: num(r['longitude']),
    source: String(r['source'] ?? ''),
    verificationStatus: String(r['verificationStatus'] ?? ''),
    approvalStatus: String(r['approvalStatus'] ?? ''),
    confidenceScore: num(r['confidenceScore']),
    autoApproved: !!r['autoApproved'],
    approvalReason: str(r['approvalReason']),
    isActive: r['isActive'] !== false,
    isArchived: !!r['isArchived'],
    mergedIntoLocationId: num(r['mergedIntoLocationId']),
    childCount: Number(r['childCount'] ?? 0),
    listingCount: Number(r['listingCount'] ?? 0),
    aliases: (Array.isArray(r['aliases']) ? (r['aliases'] as unknown[]) : []).map(String),
    path: list(r['path']).map(toGeoNode),
    updatedAt: String(r['updatedAt'] ?? '')
  };
}

function toPolicy(raw: unknown): GeoPolicy {
  const r = obj(raw);
  return {
    streetAutoApprovalEnabled: !!r['streetAutoApprovalEnabled'],
    streetAutoApprovalMinScore: Number(r['streetAutoApprovalMinScore'] ?? 0.75),
    maxAutoApprovalsPerUserPerDay: Number(r['maxAutoApprovalsPerUserPerDay'] ?? 10),
    fuzzyDuplicateThreshold: Number(r['fuzzyDuplicateThreshold'] ?? 0.85),
    externalLookupEnabled: !!r['externalLookupEnabled'],
    updatedAt: String(r['updatedAt'] ?? '')
  };
}

/** Typing-time lookups are background help: a failure must not pop a toast over the form. */
const QUIET = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

@Injectable({ providedIn: 'root' })
export class LocationsApiService {
  private readonly endpoint = '/locations';
  private readonly admin = '/admin/locations';

  constructor(private readonly api: BackendApiService) {}

  // ── public catalog ───────────────────────────────────────────────────────────────────────────

  getCountries(): Observable<GeoLocation[]> {
    return this.api.get<unknown[]>(`${this.endpoint}/countries`, undefined, QUIET).pipe(map(r => list(r).map(toGeoLocation)));
  }

  /** The top level of a country (its governorates): the first step of every location picker. */
  getTopLevel(countryCode = 'SY'): Observable<GeoLocation[]> {
    return this.api.get<unknown[]>(`${this.endpoint}/children`, { countryCode }, QUIET).pipe(map(r => list(r).map(toGeoLocation)));
  }

  /** Direct children of a place (one level down). */
  getChildren(parentId: number, type?: GeoLocationType): Observable<GeoLocation[]> {
    return this.api
      .get<unknown[]>(`${this.endpoint}/children`, { parentId, type: type ?? null }, QUIET)
      .pipe(map(r => list(r).map(toGeoLocation)));
  }

  /** Every place of one level inside an ancestor, whichever levels lie between (they may be missing). */
  getDescendants(ancestorId: number, type: GeoLocationType, query?: string, limit = 200): Observable<GeoLocation[]> {
    return this.api
      .get<unknown[]>(`${this.endpoint}/descendants`, { ancestorId, type, q: query?.trim() || null, limit }, QUIET)
      .pipe(map(r => list(r).map(toGeoLocation)));
  }

  /** Local autocomplete over names and aliases in all languages, optionally inside a parent. */
  search(query: string, options: { parentId?: number | null; types?: GeoLocationType[]; limit?: number } = {}): Observable<GeoLocation[]> {
    return this.api
      .get<{ items?: unknown[] }>(
        `${this.endpoint}/search`,
        { q: query.trim(), parentId: options.parentId ?? null, types: options.types?.join(',') ?? null, limit: options.limit ?? 8 },
        QUIET
      )
      .pipe(map(r => list(obj(r)['items']).map(toGeoLocation)));
  }

  get(id: number): Observable<GeoLocation> {
    return this.api.get<unknown>(`${this.endpoint}/${id}`, undefined, QUIET).pipe(map(toGeoLocation));
  }

  getHierarchy(id: number): Observable<GeoNode[]> {
    return this.api.get<unknown[]>(`${this.endpoint}/${id}/hierarchy`, undefined, QUIET).pipe(map(r => list(r).map(toGeoNode)));
  }

  // ── map (signed in) ──────────────────────────────────────────────────────────────────────────

  /** Explicit "search on the map": catalog matches first, then the provider (through the backend). */
  mapSearch(query: string, options: { parentId?: number | null; language?: string } = {}): Observable<GeoMapSearchResult> {
    return this.api
      .post<unknown>(`${this.endpoint}/map/search`, { query: query.trim(), parentId: options.parentId ?? null, countryCode: 'SY', language: options.language ?? 'ar' }, QUIET)
      .pipe(map(raw => {
        const r = obj(raw);
        return { suggestions: list(r['suggestions']).map(toGeoSuggestion), providerStatus: toStatus(r['providerStatus']), attribution: str(r['attribution']) };
      }));
  }

  /** Address suggestion for a settled pin. Never throws a toast: the form works without it. */
  reverse(latitude: number, longitude: number, language = 'ar'): Observable<GeoReverseResult> {
    return this.api
      .post<unknown>(`${this.endpoint}/map/reverse`, { latitude, longitude, language }, QUIET)
      .pipe(map(raw => {
        const r = obj(raw);
        return {
          found: !!r['found'],
          displayName: str(r['displayName']),
          matched: r['matched'] ? toGeoLocation(r['matched']) : null,
          chain: toChain(r['chain']),
          street: r['street'] ? toGeoSuggestion(r['street']) : null,
          providerStatus: toStatus(r['providerStatus']),
          attribution: str(r['attribution'])
        };
      }));
  }

  // ── proposals ────────────────────────────────────────────────────────────────────────────────

  /** "Location not found? Suggest adding it." Never blocks a listing: call it after the listing is saved. */
  submitRequest(input: GeoRequestInput): Observable<GeoRequestResult> {
    return this.api.post<unknown>(`${this.endpoint}/requests`, input, QUIET).pipe(map(toRequestResult));
  }

  myRequests(): Observable<GeoRequest[]> {
    return this.api.get<unknown[]>(`${this.endpoint}/requests/mine`).pipe(map(r => list(r).map(toRequest)));
  }

  // ── administration ───────────────────────────────────────────────────────────────────────────

  adminRequests(status: string | null, type: string | null, page = 1, pageSize = 30): Observable<{ items: GeoRequest[]; total: number }> {
    return this.api
      .get<unknown>(`${this.admin}/requests`, { status, type, page, pageSize })
      .pipe(map(raw => ({ items: list(obj(raw)['items']).map(toRequest), total: Number(obj(raw)['total'] ?? 0) })));
  }

  approveRequest(id: string, review: { notes?: string; nameAr?: string; nameEn?: string; nameDe?: string } = {}): Observable<GeoRequestResult> {
    return this.api.post<unknown>(`${this.admin}/requests/${id}/approve`, review).pipe(map(toRequestResult));
  }

  rejectRequest(id: string, notes?: string): Observable<GeoRequestResult> {
    return this.api.post<unknown>(`${this.admin}/requests/${id}/reject`, { notes: notes ?? null }).pipe(map(toRequestResult));
  }

  needsCorrection(id: string, notes?: string): Observable<GeoRequestResult> {
    return this.api.post<unknown>(`${this.admin}/requests/${id}/needs-correction`, { notes: notes ?? null }).pipe(map(toRequestResult));
  }

  markDuplicate(id: string, duplicateOfLocationId: number | null, notes?: string): Observable<GeoRequestResult> {
    return this.api.post<unknown>(`${this.admin}/requests/${id}/duplicate`, { notes: notes ?? null, duplicateOfLocationId }).pipe(map(toRequestResult));
  }

  adminList(filter: { parentId?: number | null; type?: string | null; q?: string | null; includeArchived?: boolean; page?: number; pageSize?: number }): Observable<{ items: GeoAdminLocation[]; total: number }> {
    return this.api
      .get<unknown>(this.admin, {
        parentId: filter.parentId ?? null, type: filter.type ?? null, q: filter.q?.trim() || null,
        includeArchived: filter.includeArchived ?? false, page: filter.page ?? 1, pageSize: filter.pageSize ?? 50
      })
      .pipe(map(raw => ({ items: list(obj(raw)['items']).map(toAdminLocation), total: Number(obj(raw)['total'] ?? 0) })));
  }

  adminGet(id: number): Observable<GeoAdminLocation> {
    return this.api.get<unknown>(`${this.admin}/${id}`).pipe(map(toAdminLocation));
  }

  adminCreate(body: { type: GeoLocationType; parentLocationId: number | null; nameAr: string; nameEn: string; nameDe?: string | null; latitude?: number | null; longitude?: number | null; reason?: string | null }): Observable<GeoAdminLocation> {
    return this.api.post<unknown>(this.admin, body).pipe(map(toAdminLocation));
  }

  adminUpdate(id: number, body: { nameAr?: string; nameEn?: string; nameDe?: string | null; latitude?: number | null; longitude?: number | null; clearCoordinates?: boolean; verificationStatus?: string; reason?: string | null }): Observable<GeoAdminLocation> {
    return this.api.put<unknown>(`${this.admin}/${id}`, body).pipe(map(toAdminLocation));
  }

  setActive(id: number, active: boolean, reason?: string): Observable<GeoAdminLocation> {
    return this.api.post<unknown>(`${this.admin}/${id}/${active ? 'activate' : 'deactivate'}`, { reason: reason ?? null }).pipe(map(toAdminLocation));
  }

  setArchived(id: number, archived: boolean, reason?: string): Observable<GeoAdminLocation> {
    return this.api.post<unknown>(`${this.admin}/${id}/${archived ? 'archive' : 'restore'}`, { reason: reason ?? null }).pipe(map(toAdminLocation));
  }

  addAlias(id: number, name: string, language?: string): Observable<GeoAdminLocation> {
    return this.api.post<unknown>(`${this.admin}/${id}/aliases`, { name, language: language ?? null, kind: 'Alternative' }).pipe(map(toAdminLocation));
  }

  removeAlias(id: number, name: string): Observable<GeoAdminLocation> {
    return this.api.delete<unknown>(`${this.admin}/${id}/aliases?name=${encodeURIComponent(name)}`).pipe(map(toAdminLocation));
  }

  merge(sourceLocationId: number, targetLocationId: number, reason?: string): Observable<GeoMergeResult> {
    return this.api.post<GeoMergeResult>(`${this.admin}/merge`, { sourceLocationId, targetLocationId, reason: reason ?? null });
  }

  changes(locationId: number | null, take = 100): Observable<GeoChange[]> {
    return this.api.get<unknown[]>(`${this.admin}/changes`, { locationId, take }).pipe(
      map(r => list(r).map(c => ({
        id: Number(c['id']), locationId: Number(c['locationId']), action: String(c['action'] ?? ''),
        actorUserId: str(c['actorUserId']), reason: str(c['reason']), at: String(c['at'] ?? '')
      })))
    );
  }

  getPolicy(): Observable<GeoPolicy> {
    return this.api.get<unknown>(`${this.admin}/policy`).pipe(map(toPolicy));
  }

  updatePolicy(policy: Omit<GeoPolicy, 'updatedAt'>): Observable<GeoPolicy> {
    return this.api.put<unknown>(`${this.admin}/policy`, policy).pipe(map(toPolicy));
  }

  importRows(body: { name: string; source: string; license: string; dryRun: boolean; rows: GeoImportRow[] }): Observable<GeoImportResult> {
    return this.api.post<GeoImportResult>(`${this.admin}/import`, body);
  }

  commitImport(batchId: string): Observable<{ committed: number }> {
    return this.api.post<{ committed: number }>(`${this.admin}/import/${batchId}/commit`);
  }

  rollbackImport(batchId: string): Observable<{ rolledBack: number }> {
    return this.api.post<{ rolledBack: number }>(`${this.admin}/import/${batchId}/rollback`);
  }
}
