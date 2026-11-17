import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BackendApiService } from './backend-api.service';

/** A hold keeps an account's scheduled erasure from running until an administrator releases it. */
export interface LegalHold {
  id: string;
  userAccountId: string;
  reason: string;
  placedByUserId: string;
  placedAtUtc: string;
  releasedByUserId: string | null;
  releasedAtUtc: string | null;
  isActive: boolean;
}

/** Same limit as LegalHold.MaxReasonLength in the API. */
export const LEGAL_HOLD_REASON_MAX = 500;

/** Admin only: GET/POST /api/admin/legal-holds, POST /api/admin/legal-holds/{id}/release. Holds are never deleted. */
@Injectable({ providedIn: 'root' })
export class LegalHoldsApiService {
  private readonly api = inject(BackendApiService);

  list(userAccountId: string | null, activeOnly: boolean): Observable<LegalHold[]> {
    return this.api.get<LegalHold[]>('/admin/legal-holds', { userAccountId: userAccountId || undefined, activeOnly });
  }

  place(userAccountId: string, reason: string): Observable<LegalHold> {
    return this.api.post<LegalHold>('/admin/legal-holds', { userAccountId, reason });
  }

  release(id: string): Observable<LegalHold> {
    return this.api.post<LegalHold>(`/admin/legal-holds/${id}/release`, {});
  }
}
