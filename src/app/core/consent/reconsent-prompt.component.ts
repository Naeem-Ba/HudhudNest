import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { distinctUntilChanged, filter, map, switchMap, timer } from 'rxjs';

import { ConsentApiService, ConsentPolicyType, ConsentRecord } from '../api/consent-api.service';
import { AuthService } from '../auth/auth.service';
import { PRIVACY_POLICY_META, TERMS_OF_SERVICE_META } from '../models/consent-versions';

const CURRENT: ReadonlyArray<{ type: ConsentPolicyType; version: string; material: boolean }> = [
  { type: 'TermsOfService', version: TERMS_OF_SERVICE_META.version, material: TERMS_OF_SERVICE_META.changeType === 'material' },
  { type: 'PrivacyPolicy', version: PRIVACY_POLICY_META.version, material: PRIVACY_POLICY_META.changeType === 'material' }
];

/** The current documents a signed-in account has no active record for (material versions only). */
export function outdatedDocuments(records: readonly ConsentRecord[]): ConsentPolicyType[] {
  return CURRENT.filter(d => d.material && !records.some(r => r.policyType === d.type && r.policyVersion === d.version && r.isActive)).map(
    d => d.type
  );
}

/**
 * After a material change to the Terms or the Privacy Policy, a signed-in person whose recorded version is older is
 * shown the change and asked to accept it with an explicit button (recorded as method UpdatePrompt). Using the app
 * on is never treated as acceptance. "Later" hides the prompt for this page session only; the person can also delete
 * the account instead (Terms, section 26).
 */
@Component({
  selector: 'app-reconsent-prompt',
  standalone: true,
  imports: [RouterLink, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pending().length > 0 && !dismissed()) {
      <section class="rc" role="dialog" aria-modal="false" aria-labelledby="rc-title" data-testid="reconsent-prompt">
        <h2 id="rc-title" class="rc__title">{{ 'RECONSENT.TITLE' | translate }}</h2>
        <p class="rc__text">{{ 'RECONSENT.TEXT' | translate }}</p>
        <ul class="rc__docs">
          @for (doc of pending(); track doc) {
            <li>
              <a [routerLink]="doc === 'TermsOfService' ? '/terms-of-service' : '/privacy-policy'" target="_blank" rel="noopener">
                {{ (doc === 'TermsOfService' ? 'LEGAL_LINKS.TERMS' : 'LEGAL_LINKS.PRIVACY') | translate }}
              </a>
            </li>
          }
        </ul>
        @if (failed()) {
          <p class="rc__error" role="alert">{{ 'NEWSLETTER.ERROR' | translate }}</p>
        }
        <div class="rc__actions">
          <button type="button" class="rc__btn" (click)="dismissed.set(true)">{{ 'RECONSENT.LATER' | translate }}</button>
          <button type="button" class="rc__btn rc__btn--primary" [disabled]="busy()" (click)="accept()">{{ 'RECONSENT.ACCEPT' | translate }}</button>
        </div>
      </section>
    }
  `,
  styles: [
    `
      .rc { position: fixed; inset-inline: 1rem; inset-block-end: 1rem; z-index: 1001; max-width: 34rem; margin-inline: auto; padding: 1rem 1.1rem; border-radius: 14px; background: var(--card-bg, #fff); color: var(--gray-900, #111827); border: 1px solid var(--gray-300, #d1d5db); box-shadow: var(--shadow-lg); }
      .rc__title { margin: 0 0 .35rem; font-size: 1rem; }
      .rc__text { margin: 0 0 .5rem; font-size: .88rem; line-height: 1.5; }
      .rc__docs { margin: 0 0 .75rem; padding-inline-start: 1.25rem; font-size: .9rem; }
      .rc__docs a { color: inherit; text-decoration: underline; }
      .rc__error { color: var(--danger-text); font-size: .85rem; }
      .rc__actions { display: flex; gap: .6rem; justify-content: flex-end; flex-wrap: wrap; }
      .rc__btn { min-height: 44px; padding: .5rem 1.1rem; border-radius: 10px; border: 1px solid var(--gray-400, #9ca3af); background: transparent; color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
      .rc__btn--primary { background: var(--navy); color: var(--text-on-navy); border-color: transparent; }
    `
  ]
})
export class ReconsentPromptComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly consent = inject(ConsentApiService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pending = signal<ConsentPolicyType[]>([]);
  protected readonly dismissed = signal(false);
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);

  ngOnInit(): void {
    this.auth.currentUser$
      .pipe(
        map(user => user?.id ?? null),
        distinctUntilChanged(),
        filter((id): id is string => !!id),
        // A short wait lets a social sign-in record its acceptance first (login.component, ensureCurrentAcceptance),
        // so a brand-new account is not asked twice.
        switchMap(() => timer(1500).pipe(switchMap(() => this.consent.getMine()))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({ next: records => this.pending.set(outdatedDocuments(records)), error: () => this.pending.set([]) });
  }

  protected accept(): void {
    const docs = this.pending();
    const version = (type: ConsentPolicyType) => CURRENT.find(d => d.type === type)!.version;
    this.busy.set(true);
    this.failed.set(false);
    let left = docs.length;
    for (const type of docs) {
      this.consent.record(type, version(type), 'UpdatePrompt').subscribe({
        next: () => {
          this.pending.update(list => list.filter(t => t !== type));
          if (--left === 0) this.busy.set(false);
        },
        error: () => {
          this.failed.set(true);
          this.busy.set(false);
        }
      });
    }
  }
}
