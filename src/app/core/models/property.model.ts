// src/app/core/models/property.model.ts
//
// ❌ المشاكل:
//   1. PropertyStatus: يحتوي 'Draft' (غير موجود في API) وكان يفتقد 'Reserved'
//      API spec status values: Available, Reserved, Sold, Rented, Archived
//   2. PropertyFilterDto: يفتقد كثيراً من params الـ API:
//      region, condition, currencyCode, hasBalcony, hasElevator,
//      hasParkingSpace, amenityIds, sortBy, sortDescending
//
// ✅ الإصلاح: مطابقة كاملة مع مواصفات الـ API (قسم 5.2).

export type ListingType = 'ForRent' | 'ForSale' | 'ForRentAndSale' | number | string;

// ✅ إصلاح: إضافة 'Reserved' وحذف 'Draft' (غير موجود في API spec)
export type PropertyStatus =
  | 'Available'
  | 'Reserved'       // ✅ مضاف
  | 'Rented'
  | 'Sold'
  | 'Archived'
  | number
  | string;

// حالة العقار من ناحية الجودة
export type PropertyCondition =
  | 'Unknown'
  | 'New'
  | 'Renovated'
  | 'GoodCondition'
  | 'NeedsRenovation'
  | number
  | string;

export interface PropertyImage {
  id?: string;
  url: string;
  isMain?: boolean;
  altText?: string;
  sortOrder?: number;
}

export interface Amenity {
  id: string;
  name: string;
  icon?: string;
}

export interface Property {
  id: string;
  title: string;
  description?: string;
  street?: string;
  city: string;
  region?: string;
  countryCode?: string;
  postalCode?: string;
  // Phase-0, Task 0: structured location + property-type FKs. Optional — old
  // listings created before this feature have none of these set, and the
  // free-text city/region fields keep working exactly as before.
  governorateId?: number | null;
  districtId?: number | null;
  // Manual fallback name when districtId has no matching seeded row —
  // submitted automatically as an admin-reviewed LocationSuggestion.
  districtText?: string | null;
  neighborhoodId?: number | null;
  // Manual fallback name when neighborhoodId has no matching seeded row —
  // same LocationSuggestion mechanism as districtText.
  neighborhoodText?: string | null;
  propertyTypeId?: number | null;
  // Phase-0, Task 2: price-history + availability confirmation.
  lastConfirmedAvailableAt?: string | null;
  latitude?: number;
  longitude?: number;
  listingType?: ListingType;
  status?: PropertyStatus;
  condition?: PropertyCondition;
  coldRent?: number;
  warmRent?: number;
  purchasePrice?: number;
  deposit?: number;
  additionalCosts?: number;
  currencyCode?: string;
  rooms?: number;
  area?: number;
  // Dynamic listing form (ListingType × PropertyType redesign, Syrian market).
  // Returned as enum-name strings (e.g. "SquareMeter", "GreenDeed") — see
  // PropertyDto on the backend. RentalStartDate/RentalEndDate are 'YYYY-MM-DD'.
  areaUnit?: string;
  floor?: number;
  rentalStartDate?: string | null;
  rentalEndDate?: string | null;
  rentalDurationType?: string | null;
  legalStatus?: string;
  furnishingStatus?: string;
  hasBalcony?: boolean;
  hasElevator?: boolean;
  hasParkingSpace?: boolean;
  heatingType?: number | string;
  energyEfficiency?: number | string;
  images?: PropertyImage[];
  mainImageUrl?: string;
  imageUrls?: string[];
  amenities?: Amenity[];
  ownerId?: string;
  ownerName?: string;
  availableFrom?: string;
  isPublished?: boolean;
  publishedAt?: string;
  expiresAt?: string;
  // إعلان مميّز مدفوع. isFeatured هو القيمة الفعّالة وقت الاستجابة لا العمود الخام:
  // كنس إنهاء التمييز يعمل كل ست ساعات، فبين دورتين قد يبقى العمود true لنافذة انقضت.
  // featuredUntil هو سجلّ ما دُفِع ثمنه ومتى ينتهي.
  isFeatured?: boolean;
  featuredUntil?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// ✅ إصلاح: PropertyFilterDto مكتمل مع جميع params من API spec (قسم 5.2)
export interface PropertyFilterDto {
  // Pagination
  page?: number;
  pageSize?: number;

  // Free-text keyword search — matched against Title/Description on the backend (Phase 3).
  searchTerm?: string;

  // Location
  countryCode?: string;
  city?: string;
  region?: string;         // ✅ مضاف
  // Phase-0, Task 0: structured location + property-type filters.
  governorateId?: number;
  districtId?: number;
  neighborhoodId?: number;
  propertyTypeId?: number;

  // Type & Status
  listingType?: string | number;
  status?: string | number;
  condition?: string | number;   // ✅ مضاف

  // Price
  minPrice?: number;
  maxPrice?: number;
  currencyCode?: string;         // ✅ مضاف

  // Size
  minRooms?: number;
  maxRooms?: number;
  minArea?: number;
  maxArea?: number;

  // Features
  hasBalcony?: boolean;          // ✅ مضاف
  hasElevator?: boolean;         // ✅ مضاف
  hasParkingSpace?: boolean;     // ✅ مضاف

  // Amenities (multiple IDs)
  amenityIds?: string[];         // ✅ مضاف

  // Owner filter
  ownerId?: string;

  // Sorting
  // Values: 'CreatedAt' | 'PurchasePrice' | 'ColdRent' | 'Area'
  sortBy?: string;               // ✅ مضاف
  sortDescending?: boolean;      // ✅ مضاف

  // Internal (not sent to API)
  isPublished?: boolean;
}

// ✅ نموذج إنشاء عقار — مطابق لما يتوقعه الـ Backend
export interface CreatePropertyDto {
  title: string;
  description?: string;
  listingType: ListingType;
  street?: string;
  city: string;
  region?: string | null;
  countryCode: string;
  postalCode?: string | null;
  // Phase-0, Task 0. Not currently used — see PropertySavePayload in
  // property-form.page.ts for the interface actually sent on the wire; kept
  // here in sync anyway since this DTO documents the backend contract.
  governorateId?: number | null;
  districtId?: number | null;
  neighborhoodId?: number | null;
  neighborhoodText?: string | null;
  propertyTypeId?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  coldRent?: number | null;
  warmRent?: number | null;
  purchasePrice?: number | null;
  deposit?: number | null;
  additionalCosts?: number | null;
  currencyCode: string;
  rooms?: number | null;
  area?: number | null;
  floor?: number | null;
  hasBalcony: boolean;
  hasElevator: boolean;
  hasParkingSpace: boolean;
  heatingType?: number | string;
  energyEfficiency?: number | string;
  condition?: number | string;
  availableFrom?: string | null;
  amenityIds?: string[] | null;
  // Dynamic listing form (ListingType × PropertyType redesign, Syrian market).
  legalStatus?: number | null;
  areaUnit: number;
  rentalStartDate?: string | null;
  rentalEndDate?: string | null;
  rentalDurationType?: number | null;
  furnishingStatus?: number | null;
}

// Phase-0, Task 4 — advisory duplicate-listing check (GET /properties/check-duplicate).
export interface DuplicateCandidate {
  propertyId: string;
  title: string;
  isSameOwner: boolean;
  matchReason: string;
}

export interface DuplicateCheckResult {
  hasPotentialDuplicates: boolean;
  candidates: DuplicateCandidate[];
}

// ✅ نموذج صور العقار من الـ API
export interface PropertyImageDto {
  Id?: string;
  id?: string;
  Url?: string;
  url?: string;
  IsMain?: boolean;
  isMain?: boolean;
  SortOrder?: number;
  sortOrder?: number;
}