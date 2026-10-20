// Phase-0, Task 3 — mirrors SavedSearchDto.cs / CreateSavedSearchCommand.cs on the backend.

export interface SavedSearch {
  id: string;
  name?: string | null;
  countryCode?: string | null;
  city?: string | null;
  region?: string | null;
  governorateId?: number | null;
  districtId?: number | null;
  neighborhoodId?: number | null;
  propertyTypeId?: number | null;
  listingType?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  currencyCode?: string | null;
  minRooms?: number | null;
  maxRooms?: number | null;
  minArea?: number | null;
  maxArea?: number | null;
  createdAt: string;
  lastMatchedAt?: string | null;
}

/** Payload for POST /savedsearch. UserId is set server-side from the JWT — not sent here. */
export interface CreateSavedSearchPayload {
  Name?: string | null;
  CountryCode?: string | null;
  City?: string | null;
  Region?: string | null;
  GovernorateId?: number | null;
  DistrictId?: number | null;
  NeighborhoodId?: number | null;
  PropertyTypeId?: number | null;
  ListingType?: string | null;
  MinPrice?: number | null;
  MaxPrice?: number | null;
  CurrencyCode?: string | null;
  MinRooms?: number | null;
  MaxRooms?: number | null;
  MinArea?: number | null;
  MaxArea?: number | null;
}
