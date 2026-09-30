// Endpoints (HudhudNestApi.Controllers.InvestmentsController / AdminInvestmentsController):
//   GET    /api/investments/projects                        ← public list (anonymous)
//   GET    /api/investments/projects/{id}                    ← public detail (anonymous)
//   GET    /api/investments/projects/{id}/financials          ← public (anonymous)
//   GET    /api/investments/projects/{id}/risk                ← public (anonymous)
//   GET    /api/investments/projects/{id}/documents            ← public documents (anonymous)
//   GET    /api/investments/projects/{id}/updates              ← public timeline (anonymous)
//   POST   /api/investments/projects/{id}/calculator           ← indicative calculator (anonymous)
//   GET    /api/investments/watchlist                          ← my watchlist (auth)
//   POST   /api/investments/projects/{id}/watchlist             ← add to watchlist (auth)
//   DELETE /api/investments/projects/{id}/watchlist             ← remove from watchlist (auth)
//   GET    /api/investments/interests                          ← my interests (auth)
//   GET    /api/investments/projects/{id}/interest              ← my interest status for a project (auth)
//   POST   /api/investments/projects/{id}/interest              ← "أرغب بالاستثمار" (auth)
//   DELETE /api/investments/projects/{id}/interest              ← withdraw interest (auth)

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService, QueryValue } from './backend-api.service';
import { ApiPagedResult, normalizePagedResult, PagedResult, unwrapItems } from '../models/api.model';
import {
  InvestmentCalculatorResult,
  InvestmentDocument,
  InvestmentFinancialSummary,
  InvestmentInterest,
  InvestmentInterestStatus,
  InvestmentProjectDetails,
  InvestmentProjectFilter,
  InvestmentProjectSummary,
  InvestmentRisk,
  InvestmentUpdateItem,
  InvestmentWatchlistItem
} from '../models/investment.model';

@Injectable({ providedIn: 'root' })
export class InvestmentApiService {
  private readonly endpoint = '/investments';

  constructor(private readonly api: BackendApiService) {}

  // ── Public ────────────────────────────────────────────────────

  getProjects(filter: InvestmentProjectFilter = {}): Observable<PagedResult<InvestmentProjectSummary>> {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const query: Record<string, QueryValue> = {
      search: filter.search,
      projectType: filter.projectType,
      riskLevel: filter.riskLevel,
      minTermMonths: filter.minTermMonths,
      maxTermMonths: filter.maxTermMonths,
      minTargetAmount: filter.minTargetAmount,
      maxTargetAmount: filter.maxTargetAmount,
      minExpectedReturn: filter.minExpectedReturn,
      city: filter.city,
      page,
      pageSize
    };

    return this.api
      .get<InvestmentProjectSummary[] | ApiPagedResult<InvestmentProjectSummary>>(`${this.endpoint}/projects`, query)
      .pipe(map(response => normalizePagedResult(response, item => item, page, pageSize)));
  }

  getProjectById(id: string): Observable<InvestmentProjectDetails> {
    return this.api.get<InvestmentProjectDetails>(`${this.endpoint}/projects/${id}`);
  }

  getFinancials(id: string): Observable<InvestmentFinancialSummary> {
    return this.api.get<InvestmentFinancialSummary>(`${this.endpoint}/projects/${id}/financials`);
  }

  getRisk(id: string): Observable<InvestmentRisk> {
    return this.api.get<InvestmentRisk>(`${this.endpoint}/projects/${id}/risk`);
  }

  getDocuments(id: string): Observable<InvestmentDocument[]> {
    return this.api
      .get<InvestmentDocument[] | ApiPagedResult<InvestmentDocument>>(`${this.endpoint}/projects/${id}/documents`)
      .pipe(map(response => unwrapItems(response)));
  }

  getUpdates(id: string): Observable<InvestmentUpdateItem[]> {
    return this.api
      .get<InvestmentUpdateItem[] | ApiPagedResult<InvestmentUpdateItem>>(`${this.endpoint}/projects/${id}/updates`)
      .pipe(map(response => unwrapItems(response)));
  }

  calculate(id: string, amount: number, termMonths: number | null): Observable<InvestmentCalculatorResult> {
    return this.api.post<InvestmentCalculatorResult>(`${this.endpoint}/projects/${id}/calculator`, {
      amount,
      termMonths
    });
  }

  // ── Authenticated: Watchlist ─────────────────────────────────

  getMyWatchlist(): Observable<InvestmentWatchlistItem[]> {
    return this.api
      .get<InvestmentWatchlistItem[] | ApiPagedResult<InvestmentWatchlistItem>>(`${this.endpoint}/watchlist`)
      .pipe(map(response => unwrapItems(response)));
  }

  addToWatchlist(id: string): Observable<void> {
    return this.api.post<void>(`${this.endpoint}/projects/${id}/watchlist`);
  }

  removeFromWatchlist(id: string): Observable<void> {
    return this.api.delete<void>(`${this.endpoint}/projects/${id}/watchlist`);
  }

  // ── Authenticated: Expression of Interest ────────────────────

  getMyInterests(): Observable<InvestmentInterest[]> {
    return this.api
      .get<InvestmentInterest[] | ApiPagedResult<InvestmentInterest>>(`${this.endpoint}/interests`)
      .pipe(map(response => unwrapItems(response)));
  }

  getInterestStatus(id: string): Observable<InvestmentInterestStatus | null> {
    return this.api
      .get<{ status: InvestmentInterestStatus | null }>(`${this.endpoint}/projects/${id}/interest`)
      .pipe(map(response => response.status ?? null));
  }

  expressInterest(id: string): Observable<{ message?: string; interest?: InvestmentInterest }> {
    return this.api.post<{ message?: string; interest?: InvestmentInterest }>(`${this.endpoint}/projects/${id}/interest`);
  }

  withdrawInterest(id: string): Observable<void> {
    return this.api.delete<void>(`${this.endpoint}/projects/${id}/interest`);
  }
}
