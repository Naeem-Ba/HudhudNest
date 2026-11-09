import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Observable, forkJoin, of, switchMap } from 'rxjs';

import { PRIVACY_POLICY_VERSION, TERMS_OF_SERVICE_VERSION } from '../models/consent-versions';

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

  /**
   * After a Google or Apple sign-in (no checkbox on that path; the sign-in page shows a notice that continuing means
   * accepting the terms and the privacy policy): records the CURRENT version of each document for an account that has
   * no active record of it, so the proof of acceptance exists for every sign-up route (QA phase 22, LEG-002).
   * Best-effort: callers ignore a failure.
   */
  ensureCurrentAcceptance(): Observable<unknown> {
    return this.getMine().pipe(
      switchMap(records => {
        const missing = ([
          ['PrivacyPolicy', PRIVACY_POLICY_VERSION],
          ['TermsOfService', TERMS_OF_SERVICE_VERSION]
        ] as const).filter(
          ([type, version]) => !records.some(record => record.policyType === type && record.policyVersion === version && record.isActive)
        );
        return missing.length > 0 ? forkJoin(missing.map(([type, version]) => this.record(type, version))) : of([]);
      })
    );
  }
}
