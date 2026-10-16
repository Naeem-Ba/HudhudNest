// src/app/core/api/service-offering.service.ts
//
// HudhudNest Services Marketplace — public browse surface.
// Endpoints:
//   GET /api/ServiceOfferings/categories        ← الفئات (تصنيفات الخدمات)
//   GET /api/ServiceOfferings?category=...&governorateId=...  ← الخدمات المتاحة للحجز ضمن فئة (ومحافظة)
//   GET /api/ServiceOfferings/categories/availability ← كل الفئات مع عدد العروض المتاحة
//   GET /api/ServiceOfferings/mine                ← عروض المزوّد نفسه
//   GET /api/ServiceOfferings/{id}                ← تفاصيل خدمة واحدة

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { ApiPagedResult, unwrapItems } from '../models/api.model';
import { ServiceCategory, ServiceOfferingDto } from '../models/service.model';
import { ServiceCategoryAvailabilityDto } from '../models/provider-onboarding.model';

export interface ServiceOfferingPayload {
  title: string;
  description?: string | null;
  basePrice?: number | null;
  currencyId?: number | null;
  estimatedDurationDays?: number | null;
}

interface LookupItem {
  id: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class ServiceOfferingService {
  private readonly endpoint = '/ServiceOfferings';

  constructor(private readonly api: BackendApiService) {}

  getCategories(): Observable<LookupItem[]> {
    return this.api
      .get<LookupItem[] | ApiPagedResult<LookupItem>>(`${this.endpoint}/categories`)
      .pipe(map(response => unwrapItems(response)));
  }

  /** `governorateId` keeps only providers that cover that governorate (a property's, typically). */
  getByCategory(category: ServiceCategory, governorateId?: number | null): Observable<ServiceOfferingDto[]> {
    const query: Record<string, string | number> = { category };
    if (governorateId) query['governorateId'] = governorateId;
    return this.api
      .get<ServiceOfferingDto[] | ApiPagedResult<ServiceOfferingDto>>(this.endpoint, query)
      .pipe(map(response => unwrapItems(response).map(item => this.toOffering(item))));
  }

  /** GET /categories/availability — every category with the number of bookable offerings behind it. */
  getAvailability(): Observable<ServiceCategoryAvailabilityDto[]> {
    return this.api
      .get<ServiceCategoryAvailabilityDto[]>(`${this.endpoint}/categories/availability`)
      .pipe(map(items => (items ?? []).map(i => ({ category: i.category, offeringCount: Number(i.offeringCount ?? 0) }))));
  }

  /** GET /mine — the signed-in provider's own offerings, active or not. */
  getMine(): Observable<ServiceOfferingDto[]> {
    return this.api
      .get<ServiceOfferingDto[] | ApiPagedResult<ServiceOfferingDto>>(`${this.endpoint}/mine`)
      .pipe(map(response => unwrapItems(response).map(item => this.toOffering(item))));
  }

  create(payload: ServiceOfferingPayload & { category: ServiceCategory }): Observable<ServiceOfferingDto> {
    return this.api
      .post<unknown>(this.endpoint, this.body(payload))
      .pipe(map(response => this.toOffering(response)));
  }

  update(id: string, payload: ServiceOfferingPayload & { isActive: boolean }): Observable<ServiceOfferingDto> {
    return this.api
      .put<unknown>(`${this.endpoint}/${id}`, { ...this.body(payload), isActive: payload.isActive })
      .pipe(map(response => this.toOffering(response)));
  }

  private body(payload: ServiceOfferingPayload & { category?: ServiceCategory }): Record<string, unknown> {
    return {
      category: payload.category,
      title: payload.title.trim(),
      description: payload.description?.trim() || null,
      basePrice: payload.basePrice ?? null,
      currencyId: payload.currencyId ?? null,
      estimatedDurationDays: payload.estimatedDurationDays ?? null
    };
  }

  getById(id: string): Observable<ServiceOfferingDto> {
    return this.api
      .get<unknown>(`${this.endpoint}/${id}`)
      .pipe(map(response => this.toOffering(response)));
  }

  private toOffering(raw: unknown): ServiceOfferingDto {
    const o = raw as Record<string, unknown>;
    return {
      id: String(o['id'] ?? ''),
      serviceProviderId: String(o['serviceProviderId'] ?? ''),
      serviceProviderDisplayName: String(o['serviceProviderDisplayName'] ?? ''),
      serviceProviderVerificationLevel:
        (o['serviceProviderVerificationLevel'] as ServiceOfferingDto['serviceProviderVerificationLevel']) ?? 'None',
      category: o['category'] as ServiceOfferingDto['category'],
      title: String(o['title'] ?? ''),
      description: o['description'] as string | null | undefined,
      basePrice: o['basePrice'] as number | null | undefined,
      currencyId: o['currencyId'] as number | null | undefined,
      estimatedDurationDays: o['estimatedDurationDays'] as number | null | undefined,
      isActive: Boolean(o['isActive']),
      providerCoverageGovernorateIds: (o['providerCoverageGovernorateIds'] as number[] | null | undefined) ?? [],
      createdAt: String(o['createdAt'] ?? '')
    };
  }
}
