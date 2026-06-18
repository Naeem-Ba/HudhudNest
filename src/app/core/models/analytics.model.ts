// src/app/core/models/analytics.model.ts
//
// ✅ نموذج جديد — مطابق لمواصفات الـ API (قسم 9.12)

// إحصاءات عقار محدد — GET /api/Analytics/property/{propertyId}
export interface PropertyStatsDto {
  propertyId: string;
  viewCount?: number;
  favoriteCount?: number;
  messageCount?: number;
  visitCount?: number;
  pendingVisits?: number;
  confirmedVisits?: number;
  averageRating?: number | null;
  reviewCount?: number;
}

// تحليلات السوق — GET /api/Analytics/market?countryCode=SY
// يُخزَّن في Cache لمدة 5 دقائق من جهة الـ Backend
export interface MarketInsightsDto {
  countryCode?: string;
  totalListings?: number;
  activeListings?: number;
  averageRentPrice?: number | null;
  averageSalePrice?: number | null;
  topCities?: MarketCityDto[];
  generatedAt?: string;
}

export interface MarketCityDto {
  city: string;
  listingCount: number;
  averagePrice?: number | null;
}