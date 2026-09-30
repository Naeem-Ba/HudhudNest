// src/app/core/api/service-offering.service.ts
//
// HudhudNest Services Marketplace — public browse surface.
// Endpoints:
//   GET /api/ServiceOfferings/categories        ← الفئات (تصنيفات الخدمات)
//   GET /api/ServiceOfferings?category=...       ← الخدمات النشطة ضمن فئة
//   GET /api/ServiceOfferings/{id}                ← تفاصيل خدمة واحدة

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { ApiPagedResult, unwrapItems } from '../models/api.model';
import { ServiceCategory, ServiceOfferingDto } from '../models/service.model';

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

  getByCategory(category: ServiceCategory): Observable<ServiceOfferingDto[]> {
    return this.api
      .get<ServiceOfferingDto[] | ApiPagedResult<ServiceOfferingDto>>(this.endpoint, { category })
      .pipe(map(response => unwrapItems(response).map(item => this.toOffering(item))));
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
      createdAt: String(o['createdAt'] ?? '')
    };
  }
}
