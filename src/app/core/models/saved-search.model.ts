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
  // Growth engine P3
  hasBalcony?: boolean | null;
  hasElevator?: boolean | null;
  hasParkingSpace?: boolean | null;
  frequency: SavedSearchFrequency;
  isPaused: boolean;
  lastNotifiedAt?: string | null;
  notifiedCount: number;
  /** Floor range, 0 = ground floor; one floor is from = to. Null = any floor. The "highest/lowest available floor" mode is never saved. */
  floorFrom?: number | null;
  floorTo?: number | null;
}

export type SavedSearchFrequency = 'Instant' | 'Daily';

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
  HasBalcony?: boolean | null;
  HasElevator?: boolean | null;
  HasParkingSpace?: boolean | null;
  Frequency?: SavedSearchFrequency | null;
  FloorFrom?: number | null;
  FloorTo?: number | null;
}
