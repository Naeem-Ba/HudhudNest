// src/app/core/models/analytics.model.ts
// Matches Backend DTOs in PropertyApi.Application.Analytics.DTOs.

// GET /api/Analytics/property/{propertyId}
export interface PropertyStatsDto {
  propertyId: string;
  propertyTitle: string;
  totalVisitRequests: number;
  confirmedVisits: number;
  totalMessages: number;
  totalFavorites: number;
  totalReviews: number;
  averageRating: number;
  areaAveragePrice: number | null;
}

// GET /api/Analytics/market?countryCode=SY
export interface MarketInsightsDto {
  cities: CityMarketInsightDto[];
  generatedAt: string;
}

export interface CityMarketInsightDto {
  city: string;
  countryCode: string;
  avgPriceForRent: number;
  avgPriceForSale: number;
  totalActiveListings: number;
}
