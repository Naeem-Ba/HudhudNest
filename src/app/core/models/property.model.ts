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
  floor?: number;
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
  createdAt?: string;
  updatedAt?: string;
}

// ✅ إصلاح: PropertyFilterDto مكتمل مع جميع params من API spec (قسم 5.2)
export interface PropertyFilterDto {
  // Pagination
  page?: number;
  pageSize?: number;

  // Location
  countryCode?: string;
  city?: string;
  region?: string;         // ✅ مضاف

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