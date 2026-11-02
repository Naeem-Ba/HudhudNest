// Growth engine P5: GET /api/referrals/me (own code + statuses, never who signed up).
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BackendApiService } from './backend-api.service';

export type ReferralStatus = 'Pending' | 'Qualified' | 'Rejected' | 'Expired';

export interface MyReferralItem {
  joinedAt: string;
  status: ReferralStatus;
  reason: string | null;
  rewarded: boolean;
}

export interface MyReferrals {
  code: string;
  pending: number;
  qualified: number;
  rejected: number;
  expired: number;
  qualifyingListingDays: number;
  requireConfirmedPhone: boolean;
  rewardAr: string | null;
  rewardEn: string | null;
  rewardDe: string | null;
  items: MyReferralItem[];
}

@Injectable({ providedIn: 'root' })
export class ReferralApiService {
  private readonly api = inject(BackendApiService);

  getMine(): Observable<MyReferrals> {
    return this.api.get<MyReferrals>('/referrals/me');
  }
}

export interface AdminReferral {
  id: string;
  referrerUserId: string;
  referrerName: string;
  referredUserId: string;
  referredName: string;
  code: string;
  status: ReferralStatus;
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
  rewardedAt: string | null;
}

export interface AdminReferralPage {
  items: AdminReferral[];
  total: number;
}

/** Growth engine P5: admin review. Rewards are recorded by hand until a reward rule is decided. */
@Injectable({ providedIn: 'root' })
export class AdminReferralApiService {
  private readonly api = inject(BackendApiService);

  list(status: ReferralStatus | null, page: number): Observable<AdminReferralPage> {
    const query = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (status) query.set('status', status);
    return this.api.get<AdminReferralPage>(`/admin/referrals?${query.toString()}`);
  }

  reject(id: string, reason: string): Observable<void> {
    return this.api.post<void>(`/admin/referrals/${id}/reject`, { reason });
  }

  markRewarded(id: string): Observable<void> {
    return this.api.post<void>(`/admin/referrals/${id}/rewarded`, {});
  }
}
