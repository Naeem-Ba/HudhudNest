import { Injectable, inject } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { SKIP_ERROR_TOAST } from '../interceptors/api-error.interceptor';

export type SearchRequestType = 'ForSale' | 'ForRent';
export type SearchRequestStatus = 'Active' | 'Paused' | 'Closed' | 'Expired';

/** What the requester fills in (growth engine P2). */
export interface SearchRequestInput {
  listingType: SearchRequestType;
  governorateId: number;
  districtId?: number | null;
  neighborhoodId?: number | null;
  propertyTypeId?: number | null;
  minBudget?: number | null;
  maxBudget: number;
  currencyCode: 'USD' | 'EUR' | 'SYP' | string;
  minRooms?: number | null;
  minArea?: number | null;
  maxArea?: number | null;
  needsBalcony: boolean;
  needsElevator: boolean;
  needsParking: boolean;
  needsFurnished: boolean;
  details?: string | null;
  expiresAt?: string | null;
}

export interface SearchRequest extends SearchRequestInput {
  id: string;
  status: SearchRequestStatus;
  expiresAt: string;
  createdAt: string;
  matchCount: number;
}

/** The anonymous form advertisers see: criteria only, never who asked. */
export interface AnonymousSearchRequest extends SearchRequestInput {
  id: string;
  createdAt: string;
  expiresAt: string;
}

export interface SearchRequestMatch {
  propertyId: string;
  title: string;
  listingType: string;
  purchasePrice: number | null;
  coldRent: number | null;
  warmRent: number | null;
  currencyCode: string;
  rooms: number | null;
  area: number | null;
  mainImageUrl: string | null;
  score: number;
  reasons: string[];
  source: 'Automatic' | 'Proposed' | string;
  matchedAt: string;
}

export interface ListingDemand {
  request: AnonymousSearchRequest;
  score: number;
  reasons: string[];
  alreadyProposed: boolean;
}

export interface PagedSearchRequests {
  items: AnonymousSearchRequest[];
  totalCount: number;
  page: number;
  pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class SearchRequestApiService {
  private readonly api = inject(BackendApiService);
  private readonly base = '/search-requests';

  getMine(): Observable<SearchRequest[]> {
    return this.api.get<SearchRequest[]>(`${this.base}/mine`);
  }

  create(input: SearchRequestInput): Observable<SearchRequest> {
    return this.api.post<SearchRequest>(this.base, input);
  }

  update(id: string, input: SearchRequestInput): Observable<SearchRequest> {
    return this.api.put<SearchRequest>(`${this.base}/${encodeURIComponent(id)}`, input);
  }

  change(id: string, action: 'pause' | 'resume' | 'close' | 'renew', expiresAt?: string | null): Observable<SearchRequest> {
    return this.api.post<SearchRequest>(`${this.base}/${encodeURIComponent(id)}/${action}`, action === 'renew' ? { expiresAt: expiresAt ?? null } : {});
  }

  getMatches(id: string): Observable<SearchRequestMatch[]> {
    return this.api.get<SearchRequestMatch[]>(`${this.base}/${encodeURIComponent(id)}/matches`);
  }

  getBoard(filter: { listingType?: SearchRequestType | null; governorateId?: number | null; page?: number }): Observable<PagedSearchRequests> {
    return this.api.get<PagedSearchRequests>(`${this.base}/board`, {
      listingType: filter.listingType ?? undefined,
      governorateId: filter.governorateId ?? undefined,
      page: filter.page ?? 1
    }, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) }); // 403 for non-advertisers is explained on the page
  }

  getForListing(propertyId: string): Observable<ListingDemand[]> {
    return this.api.get<ListingDemand[]>(`${this.base}/for-listing/${encodeURIComponent(propertyId)}`);
  }

  propose(requestId: string, propertyId: string): Observable<void> {
    return this.api.post<void>(`${this.base}/${encodeURIComponent(requestId)}/proposals`, { propertyId });
  }
}
