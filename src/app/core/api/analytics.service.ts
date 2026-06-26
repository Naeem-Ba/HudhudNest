// src/app/core/services/analytics.service.ts
//
// ✅ خدمة جديدة — مطابقة لمواصفات الـ API (قسم 9.12)
//
// Endpoints:
//   GET /api/Analytics/property/{propertyId}   ← إحصاءات عقار (يتطلب JWT + ملكية)
//   GET /api/Analytics/market?countryCode=SY   ← تحليلات السوق (عام، Cache 5 دق)

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from '../api/backend-api.service';
import { apiToCamelCase } from '../adapters/api-naming.adapter';
import { MarketInsightsDto, PropertyStatsDto } from '../models/analytics.model';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly endpoint = '/analytics';

  constructor(private readonly api: BackendApiService) {}

  /**
   * إحصاءات عقار محدد — للمالك فقط (يتطلب JWT).
   */
  getPropertyStats(propertyId: string): Observable<PropertyStatsDto> {
    return this.api
      .get<unknown>(`${this.endpoint}/property/${propertyId}`)
      .pipe(map(raw => this.toPropertyStats(raw)));
  }

  /**
   * تحليلات السوق — عام بدون JWT.
   * مُخزَّن في Cache من جهة الـ Backend لمدة 5 دقائق.
   * @param countryCode كود الدولة ISO 3166-1 alpha-2 مثل 'SY', 'DE'
   */
  getMarketInsights(countryCode?: string): Observable<MarketInsightsDto> {
    const query: Record<string, string | undefined> = {};
    if (countryCode) query['countryCode'] = countryCode;

    return this.api
      .get<unknown>(`${this.endpoint}/market`, query)
      .pipe(map(raw => this.toMarketInsights(raw)));
  }

  private toPropertyStats(raw: unknown): PropertyStatsDto {
    const s = apiToCamelCase<Record<string, unknown>>(raw);
    return {
      propertyId: String(s['propertyId'] ?? ''),
      viewCount: s['viewCount'] as number | undefined,
      favoriteCount: s['favoriteCount'] as number | undefined,
      messageCount: s['messageCount'] as number | undefined,
      visitCount: s['visitCount'] as number | undefined,
      pendingVisits: s['pendingVisits'] as number | undefined,
      confirmedVisits: s['confirmedVisits'] as number | undefined,
      averageRating: s['averageRating'] as number | null | undefined,
      reviewCount: s['reviewCount'] as number | undefined
    };
  }

  private toMarketInsights(raw: unknown): MarketInsightsDto {
    const m = apiToCamelCase<Record<string, unknown>>(raw);
    const topCities = Array.isArray(m['topCities'])
      ? m['topCities'].map((c: unknown) => {
          const city = apiToCamelCase<Record<string, unknown>>(c);
          return {
            city: String(city['city'] ?? ''),
            listingCount: Number(city['listingCount'] ?? 0),
            averagePrice: city['averagePrice'] as number | null | undefined
          };
        })
      : [];

    return {
      countryCode: m['countryCode'] as string | undefined,
      totalListings: m['totalListings'] as number | undefined,
      activeListings: m['activeListings'] as number | undefined,
      averageRentPrice: m['averageRentPrice'] as number | null | undefined,
      averageSalePrice: m['averageSalePrice'] as number | null | undefined,
      topCities,
      generatedAt: m['generatedAt'] as string | undefined
    };
  }
}