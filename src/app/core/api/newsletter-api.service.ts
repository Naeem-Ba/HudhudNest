import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { PRIVACY_POLICY_VERSION } from '../models/consent-versions';
import { withUiLanguage } from '../i18n/ui-language';
import { BackendApiService } from './backend-api.service';
import { ConsentApiService } from './consent-api.service';

export type NewsletterStatus = 'None' | 'Pending' | 'Active' | 'Unsubscribed';

export interface NewsletterStatusDto {
  status: NewsletterStatus;
  language: string | null;
  requestedAtUtc: string | null;
  confirmedAtUtc: string | null;
  unsubscribedAtUtc: string | null;
}

/**
 * The newsletter (marketing e-mail) endpoints of the API. Subscribing only asks for the double opt-in mail; the
 * subscription becomes active when its link is confirmed. Unsubscribing by token needs no sign-in. Service e-mail
 * (account, security, bookings) is not affected by any of this.
 */
@Injectable({ providedIn: 'root' })
export class NewsletterApiService {
  private readonly api = inject(BackendApiService);

  /** `consent` must come from a box the person ticked themselves; the API refuses the request without it. */
  subscribe(email: string, consent: boolean): Observable<{ status: string }> {
    return this.api.post<{ status: string }>(
      '/newsletter/subscriptions',
      withUiLanguage({ email, consent, policyVersion: PRIVACY_POLICY_VERSION, source: ConsentApiService.currentSource() })
    );
  }

  confirm(token: string): Observable<{ status: string }> {
    return this.api.post<{ status: string }>('/newsletter/confirm', { token, source: ConsentApiService.currentSource() });
  }

  unsubscribe(token: string): Observable<{ status: string }> {
    return this.api.post<{ status: string }>('/newsletter/unsubscribe', { token, source: ConsentApiService.currentSource() });
  }

  getMine(): Observable<NewsletterStatusDto> {
    return this.api.get<NewsletterStatusDto>('/newsletter/me');
  }

  unsubscribeMine(): Observable<{ withdrawnCount: number }> {
    return this.api.delete<{ withdrawnCount: number }>(`/newsletter/me?source=${ConsentApiService.currentSource()}`);
  }
}
