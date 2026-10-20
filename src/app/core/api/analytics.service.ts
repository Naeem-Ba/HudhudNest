// src/app/core/api/analytics.service.ts
// Matches Backend endpoints and DTOs:
//   GET /api/Analytics/property/{propertyId}
//   GET /api/Analytics/market?countryCode=SY

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from '../api/backend-api.service';
import {
  CityMarketInsightDto,
  MarketInsightsDto,
  PropertyStatsDto
} from '../models/analytics.model';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly endpoint = '/analytics';

  constructor(private readonly api: BackendApiService) {}

  getPropertyStats(propertyId: string): Observable<PropertyStatsDto> {
    return this.api
      .get<unknown>(`${this.endpoint}/property/${propertyId}`)
      .pipe(map(raw => this.toPropertyStats(raw)));
  }

  getMarketInsights(countryCode?: string): Observable<MarketInsightsDto> {
    const query: Record<string, string | undefined> = {};
    if (countryCode?.trim()) {
      query['countryCode'] = countryCode.trim().toUpperCase();
    }

    return this.api
      .get<unknown>(`${this.endpoint}/market`, query)
      .pipe(map(raw => this.toMarketInsights(raw)));
  }

  private toPropertyStats(raw: unknown): PropertyStatsDto {
    const s = (raw as Record<string, unknown>);

    return {
      propertyId: String(s['propertyId'] ?? ''),
      propertyTitle: String(s['propertyTitle'] ?? ''),
      totalVisitRequests: Number(s['totalVisitRequests'] ?? 0),
      confirmedVisits: Number(s['confirmedVisits'] ?? 0),
      totalMessages: Number(s['totalMessages'] ?? 0),
      totalFavorites: Number(s['totalFavorites'] ?? 0),
      totalReviews: Number(s['totalReviews'] ?? 0),
      averageRating: Number(s['averageRating'] ?? 0),
      areaAveragePrice:
        s['areaAveragePrice'] === null || s['areaAveragePrice'] === undefined
          ? null
          : Number(s['areaAveragePrice'])
    };
  }

  private toMarketInsights(raw: unknown): MarketInsightsDto {
    const m = (raw as Record<string, unknown>);
    const rawCities = Array.isArray(m['cities']) ? m['cities'] : [];

    return {
      cities: rawCities.map(city => this.toCityMarketInsight(city)),
      generatedAt: String(m['generatedAt'] ?? '')
    };
  }

  private toCityMarketInsight(raw: unknown): CityMarketInsightDto {
    const c = (raw as Record<string, unknown>);

    return {
      city: String(c['city'] ?? ''),
      countryCode: String(c['countryCode'] ?? ''),
      avgPriceForRent: Number(c['avgPriceForRent'] ?? 0),
      avgPriceForSale: Number(c['avgPriceForSale'] ?? 0),
      totalActiveListings: Number(c['totalActiveListings'] ?? 0)
    };
  }
}
