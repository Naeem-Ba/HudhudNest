// Growth engine P5: "Invite friends". Shows the user's code and link, the conditions, and the status of each
// invitation (dates and statuses only; the API never says who signed up).
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { MyReferrals, ReferralApiService } from '../../core/api/referral-api.service';
import { ToastService } from '../../shared/services/toast.service';
import { PropertyShareUrlService } from '../../core/sharing/property-share-url.service';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';

@Component({
  selector: 'app-referrals',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LocalizedDatePipe, CommonModule, TranslateModule, LoadingSpinnerComponent],
  template: `
    <section class="referrals-page">
      <header>
        <h1>{{ 'REFERRALS.TITLE' | translate }}</h1>
        <p>{{ 'REFERRALS.SUBTITLE' | translate }}</p>
      </header>

      <app-loading-spinner *ngIf="loading()" [label]="'COMMON.LOADING' | translate" />
      <p *ngIf="error()" class="error" role="alert">{{ 'REFERRALS.LOAD_ERROR' | translate }}</p>

      <ng-container *ngIf="data() as d">
        <div class="card code-card">
          <span class="label">{{ 'REFERRALS.YOUR_CODE' | translate }}</span>
          <strong class="code" data-testid="ref-code" dir="ltr">{{ d.code }}</strong>
          <input class="link" readonly [value]="link()" dir="ltr" [attr.aria-label]="'REFERRALS.YOUR_LINK' | translate" />
          <div class="actions">
            <button type="button" class="btn btn--primary" (click)="copy()">{{ 'REFERRALS.COPY' | translate }}</button>
            <button type="button" class="btn btn--secondary" *ngIf="canShare" (click)="share()">{{ 'REFERRALS.SHARE' | translate }}</button>
          </div>
        </div>

        <div class="card">
          <h2>{{ 'REFERRALS.HOW_TITLE' | translate }}</h2>
          <ol>
            <li>{{ 'REFERRALS.HOW_1' | translate }}</li>
            <li *ngIf="d.requireConfirmedPhone">{{ 'REFERRALS.HOW_PHONE' | translate }}</li>
            <li>{{ 'REFERRALS.HOW_LISTING' | translate: { days: d.qualifyingListingDays } }}</li>
          </ol>
          <p class="reward" data-testid="ref-reward">{{ reward() ?? ('REFERRALS.NO_REWARD' | translate) }}</p>
        </div>

        <div class="stats">
          <div class="stat"><strong>{{ d.pending }}</strong><span>{{ 'REFERRALS.STATUS.Pending' | translate }}</span></div>
          <div class="stat"><strong>{{ d.qualified }}</strong><span>{{ 'REFERRALS.STATUS.Qualified' | translate }}</span></div>
          <div class="stat"><strong>{{ d.rejected + d.expired }}</strong><span>{{ 'REFERRALS.NOT_COUNTED' | translate }}</span></div>
        </div>

        <ul class="items" *ngIf="d.items.length > 0; else empty">
          <li *ngFor="let item of d.items" data-testid="ref-item">
            <span>{{ item.joinedAt | localDate:'dd/MM/yyyy' }}</span>
            <span class="chip">{{ ('REFERRALS.STATUS.' + item.status) | translate }}</span>
            <span *ngIf="item.rewarded" class="chip chip--ok">{{ 'REFERRALS.REWARDED' | translate }}</span>
          </li>
        </ul>
        <ng-template #empty><p class="muted">{{ 'REFERRALS.EMPTY' | translate }}</p></ng-template>
      </ng-container>
    </section>
  `,
  styles: [`
    .referrals-page { width: min(760px, 100%); margin-inline: auto; padding: clamp(1rem, 3vw, 2rem); display: grid; gap: 1rem; }
    h1 { margin: 0 0 .25rem; font-size: clamp(1.4rem, 3vw, 2rem); color: var(--gray-900); }
    header p, .muted { margin: 0; color: var(--gray-500); }
    .card { border: 1px solid var(--gray-200); border-radius: 12px; padding: 1rem; background: var(--card-bg); }
    .card h2 { margin: 0 0 .5rem; font-size: 1.1rem; }
    .code-card { display: grid; gap: .5rem; }
    .label { color: var(--gray-500); font-size: .9rem; }
    .code { font-size: 1.6rem; letter-spacing: .15em; color: var(--gray-900); }
    .link { width: 100%; padding: .45rem .6rem; border: 1px solid var(--gray-300); border-radius: 8px; color: var(--gray-700); background: var(--gray-50, transparent); min-width: 0; }
    .actions { display: flex; gap: .5rem; flex-wrap: wrap; }
    .reward { margin: .5rem 0 0; font-weight: 600; color: var(--gray-700); }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: .5rem; }
    .stat { border: 1px solid var(--gray-200); border-radius: 12px; padding: .75rem; text-align: center; display: grid; }
    .stat strong { font-size: 1.4rem; color: var(--gray-900); }
    .stat span { font-size: .85rem; color: var(--gray-500); }
    .items { list-style: none; margin: 0; padding: 0; display: grid; gap: .4rem; }
    .items li { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; padding: .5rem 0; border-bottom: 1px solid var(--gray-100); }
    .chip { padding: .1rem .6rem; border-radius: 999px; font-size: .8rem; background: var(--gray-100); color: var(--gray-700); }
    .chip--ok { background: var(--green-100, #dcfce7); color: var(--green-800, #166534); }
    .error { color: var(--red-600, #dc2626); }
  `]
})
export class ReferralsPage implements OnInit {
  private readonly api = inject(ReferralApiService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly shareUrl = inject(PropertyShareUrlService);

  readonly data = signal<MyReferrals | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  readonly link = computed(() => {
    const code = this.data()?.code;
    // The public site origin, not window.location.origin: inside the native app that is capacitor://localhost.
    return code ? `${this.shareUrl.getSiteOrigin()}/auth/register?ref=${encodeURIComponent(code)}` : '';
  });

  readonly reward = computed(() => {
    const d = this.data();
    if (!d) return null;
    const lang = (this.translate.currentLang || 'ar').slice(0, 2);
    const text = lang === 'de' ? d.rewardDe : lang === 'en' ? d.rewardEn : d.rewardAr;
    return text?.trim() || null;
  });

  ngOnInit(): void {
    this.loading.set(true);
    this.api.getMine().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: () => { this.error.set(true); this.loading.set(false); }
    });
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.link());
      this.toast.success(this.translate.instant('REFERRALS.COPIED'));
    } catch {
      this.toast.error(this.translate.instant('REFERRALS.COPY_FAILED'));
    }
  }

  async share(): Promise<void> {
    try {
      await navigator.share({ title: this.translate.instant('REFERRALS.SHARE_TITLE'), url: this.link() });
    } catch {
      // the user closed the share sheet
    }
  }
}
