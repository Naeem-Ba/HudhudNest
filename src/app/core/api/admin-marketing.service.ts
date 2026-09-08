// =============================================================
// src/app/core/api/admin-marketing.service.ts
//
// يغلّف نقاط النهاية الإدارية لميزات صفحة الهبوط (LeadsController،
// OffersController، SurveysController، MarketingEventsController على
// الباك-إند) — كلها تتطلب دور Admin:
//   GET  /api/leads?page=&pageSize=&source=&userType=
//   GET  /api/offers
//   POST /api/offers
//   PUT  /api/offers/{id}
//   PUT  /api/offers/{id}/status        { "Active" | "Paused" | "Ended" }
//   GET  /api/surveys?page=&pageSize=
//   GET  /api/surveys/stats
//   GET  /api/marketing-events/summary?fromUtc=&toUtc=
//
// كل الحقول هنا camelCase مباشرة (JsonNamingPolicy.CamelCase على الباك-إند
// بالكامل) — لا حاجة لتوافق PascalCase كما في admin-users.service.ts القديمة.
// =============================================================

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { PagedResult } from '../models/api.model';

export type LeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Converted' | 'Rejected';

export interface AdminLeadDto {
  id: string;
  fullName: string;
  phone: string;
  city: string;
  userType: string;
  notes: string | null;
  source: string;
  campaign: string | null;
  offerId: string | null;
  offerName: string | null;
  status: LeadStatus;
  createdAt: string;
}

export type OfferDiscountType = 'Percentage' | 'FixedAmountUsd' | 'FreeMonths';
export type OfferStatus = 'Draft' | 'Active' | 'Paused' | 'Ended';

export interface AdminOfferDto {
  id: string;
  name: string;
  description: string | null;
  discountType: OfferDiscountType;
  discountValue: number;
  targetPlanTier: string | null;
  startsAtUtc: string;
  endsAtUtc: string | null;
  maxRedemptions: number | null;
  redeemedCount: number;
  status: OfferStatus;
  terms: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OfferFormValue {
  name: string;
  description?: string | null;
  discountType: OfferDiscountType;
  discountValue: number;
  targetPlanTier?: string | null;
  startsAtUtc: string;
  endsAtUtc?: string | null;
  maxRedemptions?: number | null;
  terms?: string | null;
}

export type PaymentWillingness = 'Yes' | 'No' | 'Maybe';
export type PreferredPaymentModel =
  | 'MonthlySubscription' | 'YearlySubscription' | 'PerListingFee' | 'CommissionOnSale' | 'Mixed';

export interface AdminSurveyResponseDto {
  id: string;
  leadId: string | null;
  willingnessToPay: PaymentWillingness | null;
  preferredPaymentModel: PreferredPaymentModel | null;
  expectedMonthlyPriceUsd: number | null;
  expectedPerListingPriceUsd: number | null;
  acceptableCommissionPercent: number | null;
  mostImportantFeature: string | null;
  biggestProblem: string | null;
  subscriptionBlocker: string | null;
  wantsTrialBeforePaying: boolean | null;
  teamSize: number | null;
  propertyCount: number | null;
  usesSimilarToolCurrently: boolean | null;
  similarToolName: string | null;
  source: string;
  createdAt: string;
}

export interface SurveyStatsDto {
  totalResponses: number;
  willingnessBreakdown: Record<string, number>;
  paymentModelBreakdown: Record<string, number>;
  averageExpectedMonthlyPriceUsd: number | null;
  averageExpectedPerListingPriceUsd: number | null;
  averageAcceptableCommissionPercent: number | null;
  trialWantedCount: number;
  usesSimilarToolCount: number;
}

export type MarketingEventType =
  | 'PageView' | 'CtaClick' | 'FormStart' | 'FormComplete'
  | 'PricingView' | 'PlanSelect' | 'SurveyStart' | 'SurveySubmit' | 'DemoRequest';

export interface MarketingEventsSummaryDto {
  fromUtc: string;
  toUtc: string;
  countsByEventType: Record<string, number>;
}

interface RawPage<T> {
  total: number;
  page: number;
  pageSize: number;
  data: T[];
}

@Injectable({ providedIn: 'root' })
export class AdminMarketingService {
  constructor(private readonly api: BackendApiService) {}

  getLeads(
    page = 1,
    pageSize = 20,
    filters: { source?: string; userType?: string } = {}
  ): Observable<PagedResult<AdminLeadDto>> {
    const params: Record<string, string | number> = { page, pageSize };
    if (filters.source) params['source'] = filters.source;
    if (filters.userType) params['userType'] = filters.userType;

    return this.api
      .get<RawPage<AdminLeadDto>>('/leads', params)
      .pipe(map(res => this.toPagedResult(res, page, pageSize)));
  }

  getOffers(): Observable<AdminOfferDto[]> {
    return this.api.get<AdminOfferDto[]>('/offers');
  }

  createOffer(value: OfferFormValue): Observable<{ id: string }> {
    return this.api.post<{ id: string }>('/offers', value);
  }

  updateOffer(id: string, value: OfferFormValue): Observable<void> {
    return this.api.put<void>(`/offers/${id}`, value);
  }

  setOfferStatus(id: string, status: OfferStatus): Observable<void> {
    return this.api.put<void>(`/offers/${id}/status`, status);
  }

  getSurveyResponses(page = 1, pageSize = 20): Observable<PagedResult<AdminSurveyResponseDto>> {
    return this.api
      .get<RawPage<AdminSurveyResponseDto>>('/surveys', { page, pageSize })
      .pipe(map(res => this.toPagedResult(res, page, pageSize)));
  }

  getSurveyStats(): Observable<SurveyStatsDto> {
    return this.api.get<SurveyStatsDto>('/surveys/stats');
  }

  /** fromUtc/toUtc فارغان يعنيان "آخر 30 يومًا" — نفس الافتراضي على الخادم
   *  (GetMarketingEventsSummaryQueryHandler). مرَّرا كسلاسل ISO كاملة. */
  getMarketingEventsSummary(fromUtc?: string, toUtc?: string): Observable<MarketingEventsSummaryDto> {
    const params: Record<string, string> = {};
    if (fromUtc) params['fromUtc'] = fromUtc;
    if (toUtc) params['toUtc'] = toUtc;

    return this.api.get<MarketingEventsSummaryDto>('/marketing-events/summary', params);
  }

  private toPagedResult<T>(res: RawPage<T>, fallbackPage: number, fallbackPageSize: number): PagedResult<T> {
    const total = res?.total ?? 0;
    const currentPage = res?.page ?? fallbackPage;
    const pageSize = res?.pageSize ?? fallbackPageSize;
    const totalPages = Math.max(1, Math.ceil(total / (pageSize || 1)));

    return {
      items: res?.data ?? [],
      totalCount: total,
      page: currentPage,
      pageSize,
      totalPages,
      hasNext: currentPage < totalPages,
      hasPrevious: currentPage > 1
    };
  }
}
