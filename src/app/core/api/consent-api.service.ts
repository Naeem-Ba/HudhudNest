import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Observable } from 'rxjs';

import { BackendApiService } from './backend-api.service';

export type ConsentPolicyType = 'PrivacyPolicy' | 'TermsOfService';
export type ConsentSource = 'Web' | 'Ios' | 'Android';

export interface ConsentRecord {
  id: string;
  policyType: ConsentPolicyType;
  policyVersion: string;
  consentedAtUtc: string;
  source: ConsentSource;
  withdrawnAtUtc: string | null;
  isActive: boolean;
}

/**
 * Wraps POST/GET/DELETE /users/me/consents (see docs/privacy/privacy-gaps.md, P1, in the
 * HudhudNestApi backend repo). Registration forms call `record()` right after a successful
 * sign-up, only when the user actually checked the (never pre-checked) consent checkbox —
 * this service never decides on its own that consent happened.
 */
@Injectable({ providedIn: 'root' })
export class ConsentApiService {
  constructor(private readonly api: BackendApiService) {}

  /** 'Web' in the browser, 'Ios'/'Android' inside the Capacitor-wrapped app. */
  static currentSource(): ConsentSource {
    if (!Capacitor.isNativePlatform()) {
      return 'Web';
    }

    return Capacitor.getPlatform() === 'ios' ? 'Ios' : 'Android';
  }

  record(policyType: ConsentPolicyType, policyVersion: string): Observable<ConsentRecord> {
    return this.api.post<ConsentRecord>('/users/me/consents', {
      policyType,
      policyVersion,
      source: ConsentApiService.currentSource()
    });
  }

  getMine(): Observable<ConsentRecord[]> {
    return this.api.get<ConsentRecord[]>('/users/me/consents');
  }

  withdraw(policyType: ConsentPolicyType): Observable<{ withdrawnCount: number }> {
    return this.api.delete<{ withdrawnCount: number }>(`/users/me/consents/${policyType}`);
  }
}
