import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BackendApiService } from './backend-api.service';

export type PriceKind = 'Sale' | 'Rent';
export type EstimateReason = 'not_enough_data' | 'area_out_of_range' | 'currency_rate_missing';
export type EstimateBasis = 'DistrictAndType' | 'District' | 'GovernorateAndType' | 'Governorate';
export type EstimateConfidence = 'Low' | 'Medium' | 'High';

/** Growth engine P6: a range from live asking prices, never a valuation. */
export interface PriceEstimate {
  available: boolean;
  reason: EstimateReason | null;
  kind: PriceKind;
  currencyCode: string;
  low: number | null;
  mid: number | null;
  high: number | null;
  lowPerSqm: number | null;
  midPerSqm: number | null;
  highPerSqm: number | null;
  sampleCount: number;
  basis: EstimateBasis | null;
  confidence: EstimateConfidence | null;
  dataComputedAt: string | null;
  oldestListingAt: string | null;
  newestListingAt: string | null;
}

export interface AreaPriceRow {
  governorateId: number;
  districtId: number | null;
  propertyTypeId: number | null;
  kind: PriceKind;
  currencyCode: string;
  p25PerSqm: number;
  medianPerSqm: number;
  p75PerSqm: number;
  sampleCount: number;
  confidence: EstimateConfidence;
  computedAt: string;
}

export interface PriceEstimateQuery {
  kind: PriceKind;
  governorateId: number;
  districtId?: number | null;
  propertyTypeId?: number | null;
  area: number;
  currency?: string | null;
}

@Injectable({ providedIn: 'root' })
export class PriceEstimateApiService {
  private readonly api = inject(BackendApiService);
  private readonly base = '/price-estimates';

  estimate(q: PriceEstimateQuery): Observable<PriceEstimate> {
    return this.api.get<PriceEstimate>(this.base, {
      kind: q.kind, governorateId: q.governorateId, districtId: q.districtId ?? null,
      propertyTypeId: q.propertyTypeId ?? null, area: q.area, currency: q.currency ?? null
    });
  }

  areas(governorateId: number, kind: PriceKind, currency?: string | null): Observable<AreaPriceRow[]> {
    return this.api.get<AreaPriceRow[]>(`${this.base}/areas`, { governorateId, kind, currency: currency ?? null });
  }
}
