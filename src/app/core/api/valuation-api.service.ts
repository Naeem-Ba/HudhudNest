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
import { PriceEstimate } from './price-estimate-api.service';
import {
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
      RequestType: payload.requestType,
      CurrencyCode: payload.currencyCode ?? null
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
      estimate: this.toEstimateRange(r['estimate']),
      requiresOfficeValuation: !!r['requiresOfficeValuation'],
      officeMatchCount: Number(r['officeMatchCount'] ?? 0),
      hasMinimumOfficeCoverage: !!r['hasMinimumOfficeCoverage'],
      insufficientOfficeCoverage: !!r['insufficientOfficeCoverage'],
      matchedNeighboringGovernorate: !!r['matchedNeighboringGovernorate'],
      // An API from before this field existed always ran the office path.
      officePathAvailable: r['officePathAvailable'] !== false
    };
  }

  /** A response without an estimate (an API older than this app) reads as "no estimate", never as numbers. */
  private toEstimateRange(raw: unknown): PriceEstimate {
    const r = (raw ?? {}) as Partial<PriceEstimate>;
    const available = r.available === true;
    return {
      available,
      reason: available ? null : (r.reason ?? 'not_enough_data'),
      kind: r.kind === 'Rent' ? 'Rent' : 'Sale',
      currencyCode: r.currencyCode ?? 'USD',
      low: r.low ?? null,
      mid: r.mid ?? null,
      high: r.high ?? null,
      lowPerSqm: r.lowPerSqm ?? null,
      midPerSqm: r.midPerSqm ?? null,
      highPerSqm: r.highPerSqm ?? null,
      sampleCount: Number(r.sampleCount ?? 0),
      basis: r.basis ?? null,
      confidence: r.confidence ?? null,
      dataComputedAt: r.dataComputedAt ?? null,
      oldestListingAt: r.oldestListingAt ?? null,
      newestListingAt: r.newestListingAt ?? null
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
