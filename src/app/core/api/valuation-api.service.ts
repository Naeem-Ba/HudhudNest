// src/app/core/api/valuation-api.service.ts
//
// Stage 7 — consumes ValuationInquiriesController (HudhudNestApi):
//   POST /api/ValuationInquiries            ← إنشاء طلب تقييم جديد
//   GET  /api/ValuationInquiries/{id}       ← التحقق من حالة الطلب (تحديث يدوي)
// Both anonymous on the backend (a guest may request a valuation), so this service never
// requires the caller to be authenticated either.

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import {
  ComparableListingsResultDto,
  CreateValuationInquiryPayload,
  CreateValuationInquiryResultDto,
  ValuationEstimateDto,
  ValuationInquiryStatusDto
} from '../models/valuation.model';

@Injectable({ providedIn: 'root' })
export class ValuationApiService {
  private readonly endpoint = '/ValuationInquiries';

  constructor(private readonly api: BackendApiService) {}

  create(payload: CreateValuationInquiryPayload): Observable<CreateValuationInquiryResultDto> {
    const body = {
      GovernorateId: payload.governorateId,
      DistrictId: payload.districtId ?? null,
      NeighborhoodId: payload.neighborhoodId ?? null,
      PropertyTypeId: payload.propertyTypeId ?? null,
      Area: payload.area ?? null,
      Rooms: payload.rooms ?? null,
      RequestType: payload.requestType
    };

    return this.api.post<unknown>(this.endpoint, body).pipe(map(response => this.toCreateResult(response)));
  }

  getStatus(inquiryId: string): Observable<ValuationInquiryStatusDto> {
    return this.api.get<unknown>(`${this.endpoint}/${inquiryId}`).pipe(map(response => this.toStatus(response)));
  }

  private toCreateResult(raw: unknown): CreateValuationInquiryResultDto {
    const r = raw as Record<string, unknown>;

    return {
      inquiryId: String(r['inquiryId'] ?? ''),
      status: (r['status'] as CreateValuationInquiryResultDto['status']) ?? 'Pending',
      expiresAt: String(r['expiresAt'] ?? ''),
      fastPath: this.toFastPath(r['fastPath']),
      requiresOfficeValuation: !!r['requiresOfficeValuation'],
      officeMatchCount: Number(r['officeMatchCount'] ?? 0),
      hasMinimumOfficeCoverage: !!r['hasMinimumOfficeCoverage'],
      insufficientOfficeCoverage: !!r['insufficientOfficeCoverage'],
      matchedNeighboringGovernorate: !!r['matchedNeighboringGovernorate']
    };
  }

  private toFastPath(raw: unknown): ComparableListingsResultDto {
    const r = (raw ?? {}) as Record<string, unknown>;

    return {
      hasComparableListings: !!r['hasComparableListings'],
      comparableCount: Number(r['comparableCount'] ?? 0),
      minPrice: r['minPrice'] as number | null | undefined,
      maxPrice: r['maxPrice'] as number | null | undefined,
      averagePrice: r['averagePrice'] as number | null | undefined,
      medianPrice: r['medianPrice'] as number | null | undefined,
      isPreliminary: !!r['isPreliminary'],
      requiresOfficeValuation: !!r['requiresOfficeValuation'],
      matchLevel: (r['matchLevel'] as ComparableListingsResultDto['matchLevel']) ?? 'Governorate',
      source: r['source'] as string | null | undefined,
      disclaimer: r['disclaimer'] as string | null | undefined,
      message: r['message'] as string | null | undefined
    };
  }

  private toStatus(raw: unknown): ValuationInquiryStatusDto {
    const r = raw as Record<string, unknown>;
    const estimates = Array.isArray(r['estimates']) ? (r['estimates'] as unknown[]) : [];

    return {
      inquiryId: String(r['inquiryId'] ?? ''),
      status: (r['status'] as ValuationInquiryStatusDto['status']) ?? 'Pending',
      expiresAt: String(r['expiresAt'] ?? ''),
      estimates: estimates.map(item => this.toEstimate(item))
    };
  }

  private toEstimate(raw: unknown): ValuationEstimateDto {
    const r = raw as Record<string, unknown>;

    return {
      estimatedPrice: Number(r['estimatedPrice'] ?? 0),
      notes: r['notes'] as string | null | undefined,
      submittedAt: String(r['submittedAt'] ?? ''),
      matchLevel: (r['matchLevel'] as ValuationEstimateDto['matchLevel']) ?? 'Governorate'
    };
  }
}
