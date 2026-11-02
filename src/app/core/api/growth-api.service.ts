import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BackendApiService } from './backend-api.service';

export interface GrowthTotals {
  newAccounts: number; listingsPublished: number; searchRequests: number; savedSearches: number;
  favorites: number; contacts: number; proposals: number; referralsQualified: number; activeUsers: number;
}
export interface GrowthFunnel { registered: number; activated: number; published: number; contacted: number; }
export interface GrowthDay {
  day: string; newAccounts: number; listingsPublished: number; searchRequests: number; savedSearches: number;
  favorites: number; contacts: number; activeUsers: number;
}
export interface GrowthCampaign {
  source: string | null; medium: string | null; campaign: string | null;
  registered: number; activated: number; published: number; contacted: number;
}
export interface RetentionPoint { days: number; cohort: number; retained: number; }

/** Growth engine P10: admin growth overview (counts only). Definitions: API docs/growth-engine/GROWTH-METRICS.md. */
export interface GrowthOverview {
  fromUtc: string;
  toUtc: string;
  totals: GrowthTotals;
  funnel: GrowthFunnel;
  days: GrowthDay[];
  campaigns: GrowthCampaign[];
  retention: RetentionPoint[];
  activityDataSince: string | null;
  untaggedRegistrations: number;
}

@Injectable({ providedIn: 'root' })
export class AdminGrowthApiService {
  private readonly api = inject(BackendApiService);

  overview(fromUtc?: string | null, toUtc?: string | null): Observable<GrowthOverview> {
    return this.api.get<GrowthOverview>('/admin/growth/overview', { fromUtc: fromUtc ?? null, toUtc: toUtc ?? null });
  }
}
