// Growth engine P7 + P10: admin growth overview (totals, daily series, funnel, UTM campaigns, retention)
// and a UTM link builder for campaigns. Every number is defined in the API's GROWTH-METRICS.md.
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AdminGrowthApiService, GrowthOverview } from '../../core/api/growth-api.service';
import { PropertyShareUrlService } from '../../core/sharing/property-share-url.service';
import { ToastService } from '../../shared/services/toast.service';

const TAG = /^[a-z0-9._-]{1,64}$/;

/** Keeps a UTM value in the shape the API stores (lower case, letters, digits, - _ .); anything else is dropped there. */
export function normalizeTag(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

@Component({
  selector: 'app-admin-growth',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <section class="growth">
      <h1>{{ 'ADMIN_GROWTH.TITLE' | translate }}</h1>
      <p class="muted">{{ 'ADMIN_GROWTH.SUBTITLE' | translate }}</p>

      <form class="range" (ngSubmit)="load()">
        <label>{{ 'ADMIN_GROWTH.FROM' | translate }} <input type="date" name="from" [(ngModel)]="from"></label>
        <label>{{ 'ADMIN_GROWTH.TO' | translate }} <input type="date" name="to" [(ngModel)]="to"></label>
        <button type="submit" class="btn btn--primary" [disabled]="loading()">{{ 'ADMIN_GROWTH.APPLY' | translate }}</button>
        <small class="muted">{{ 'ADMIN_GROWTH.RANGE_HINT' | translate }}</small>
      </form>

      <p *ngIf="error()" role="alert" class="error">{{ 'ADMIN_GROWTH.LOAD_ERROR' | translate }}</p>

      <ng-container *ngIf="data() as d">
        <p class="muted">{{ 'ADMIN_GROWTH.PERIOD' | translate: { from: day(d.fromUtc), to: lastDay(d.toUtc) } }}</p>

        <ul class="tiles" data-testid="growth-tiles">
          <li *ngFor="let t of tiles()"><span class="tile__value">{{ t.value }}</span><span class="tile__label">{{ t.label | translate }}</span></li>
        </ul>

        <h2>{{ 'ADMIN_GROWTH.FUNNEL' | translate }}</h2>
        <p class="muted">{{ 'ADMIN_GROWTH.FUNNEL_HINT' | translate }}</p>
        <ol class="funnel" data-testid="growth-funnel">
          <li><strong>{{ d.funnel.registered }}</strong> {{ 'ADMIN_GROWTH.F_REGISTERED' | translate }}</li>
          <li><strong>{{ d.funnel.activated }}</strong> {{ 'ADMIN_GROWTH.F_ACTIVATED' | translate }} <span class="muted">{{ pct(d.funnel.activated, d.funnel.registered) }}</span></li>
          <li><strong>{{ d.funnel.published }}</strong> {{ 'ADMIN_GROWTH.F_PUBLISHED' | translate }} <span class="muted">{{ pct(d.funnel.published, d.funnel.registered) }}</span></li>
          <li><strong>{{ d.funnel.contacted }}</strong> {{ 'ADMIN_GROWTH.F_CONTACTED' | translate }} <span class="muted">{{ pct(d.funnel.contacted, d.funnel.registered) }}</span></li>
        </ol>

        <h2>{{ 'ADMIN_GROWTH.RETENTION' | translate }}</h2>
        <p class="muted" *ngIf="d.activityDataSince; else noActivity">{{ 'ADMIN_GROWTH.RETENTION_HINT' | translate: { since: day(d.activityDataSince) } }}</p>
        <ng-template #noActivity><p class="muted">{{ 'ADMIN_GROWTH.NO_ACTIVITY_YET' | translate }}</p></ng-template>
        <ul class="retention" data-testid="growth-retention">
          <li *ngFor="let r of d.retention">
            <strong>D{{ r.days }}</strong>
            <span>{{ r.cohort ? pct(r.retained, r.cohort) : '—' }}</span>
            <small class="muted">{{ 'ADMIN_GROWTH.OF_COHORT' | translate: { retained: r.retained, cohort: r.cohort } }}</small>
          </li>
        </ul>

        <h2>{{ 'ADMIN_GROWTH.CAMPAIGNS' | translate }}</h2>
        <p class="muted">{{ 'ADMIN_GROWTH.CAMPAIGNS_HINT' | translate: { untagged: d.untaggedRegistrations } }}</p>
        <div class="table-wrap">
          <table data-testid="growth-campaigns">
            <thead><tr>
              <th scope="col">utm_source</th><th scope="col">utm_medium</th><th scope="col">utm_campaign</th>
              <th scope="col">{{ 'ADMIN_GROWTH.F_REGISTERED' | translate }}</th><th scope="col">{{ 'ADMIN_GROWTH.F_ACTIVATED' | translate }}</th>
              <th scope="col">{{ 'ADMIN_GROWTH.F_PUBLISHED' | translate }}</th><th scope="col">{{ 'ADMIN_GROWTH.F_CONTACTED' | translate }}</th>
            </tr></thead>
            <tbody>
              <tr *ngFor="let c of d.campaigns">
                <td dir="ltr">{{ c.source || '—' }}</td><td dir="ltr">{{ c.medium || '—' }}</td><td dir="ltr">{{ c.campaign || '—' }}</td>
                <td>{{ c.registered }}</td><td>{{ c.activated }}</td><td>{{ c.published }}</td><td>{{ c.contacted }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p *ngIf="!d.campaigns.length" class="muted">{{ 'ADMIN_GROWTH.NO_CAMPAIGNS' | translate }}</p>

        <h2>{{ 'ADMIN_GROWTH.DAILY' | translate }}</h2>
        <div class="table-wrap">
          <table data-testid="growth-days">
            <thead><tr>
              <th scope="col">{{ 'ADMIN_GROWTH.DATE' | translate }}</th>
              <th scope="col">{{ 'ADMIN_GROWTH.T_NEW_ACCOUNTS' | translate }}</th>
              <th scope="col">{{ 'ADMIN_GROWTH.T_LISTINGS' | translate }}</th>
              <th scope="col">{{ 'ADMIN_GROWTH.T_SEARCH_REQUESTS' | translate }}</th>
              <th scope="col">{{ 'ADMIN_GROWTH.T_SAVED_SEARCHES' | translate }}</th>
              <th scope="col">{{ 'ADMIN_GROWTH.T_FAVORITES' | translate }}</th>
              <th scope="col">{{ 'ADMIN_GROWTH.T_CONTACTS' | translate }}</th>
              <th scope="col">{{ 'ADMIN_GROWTH.T_ACTIVE' | translate }}</th>
            </tr></thead>
            <tbody>
              <tr *ngFor="let r of reversedDays()">
                <td dir="ltr">{{ r.day }}</td><td>{{ r.newAccounts }}</td><td>{{ r.listingsPublished }}</td><td>{{ r.searchRequests }}</td>
                <td>{{ r.savedSearches }}</td><td>{{ r.favorites }}</td><td>{{ r.contacts }}</td><td>{{ r.activeUsers }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </ng-container>

      <h2>{{ 'ADMIN_GROWTH.LINK_BUILDER' | translate }}</h2>
      <p class="muted">{{ 'ADMIN_GROWTH.LINK_BUILDER_HINT' | translate }}</p>
      <form class="builder" (ngSubmit)="copyLink()" data-testid="growth-builder">
        <label>{{ 'ADMIN_GROWTH.PAGE' | translate }}
          <select name="path" [(ngModel)]="path">
            <option value="/">{{ 'ADMIN_GROWTH.PAGE_HOME' | translate }}</option>
            <option value="/auth/register">{{ 'ADMIN_GROWTH.PAGE_REGISTER' | translate }}</option>
            <option value="/properties">{{ 'ADMIN_GROWTH.PAGE_LISTINGS' | translate }}</option>
            <option value="/pricing">{{ 'ADMIN_GROWTH.PAGE_PRICING' | translate }}</option>
            <option value="/price-estimate">{{ 'ADMIN_GROWTH.PAGE_PRICE_ESTIMATE' | translate }}</option>
          </select>
        </label>
        <label>utm_source * <input name="source" [(ngModel)]="source" placeholder="facebook" dir="ltr"></label>
        <label>utm_medium <input name="medium" [(ngModel)]="medium" placeholder="social" dir="ltr"></label>
        <label>utm_campaign * <input name="campaign" [(ngModel)]="campaign" placeholder="launch-2026" dir="ltr"></label>
        <output class="builder__link" dir="ltr" data-testid="growth-link">{{ link() || '—' }}</output>
        <p *ngIf="invalidTag()" class="error">{{ 'ADMIN_GROWTH.TAG_INVALID' | translate }}</p>
        <button type="submit" class="btn btn--primary" [disabled]="!link()">{{ 'ADMIN_GROWTH.COPY' | translate }}</button>
      </form>
    </section>
  `,
  styles: [`
    .growth { width: min(1100px, 100%); margin-inline: auto; padding: clamp(1rem, 3vw, 2rem); display: grid; gap: .75rem; }
    h1 { margin: 0; font-size: clamp(1.3rem, 3vw, 1.8rem); color: var(--gray-900); }
    h2 { margin: 1rem 0 0; font-size: 1.15rem; }
    .muted { color: var(--gray-500); margin: 0; }
    .error { color: var(--red-600, #dc2626); margin: 0; }
    .range, .builder { display: flex; flex-wrap: wrap; gap: .5rem 1rem; align-items: end; }
    .range label, .builder label { display: grid; gap: .25rem; font-size: .9rem; }
    .range input, .builder input, .builder select { min-height: 44px; padding: .4rem .5rem; border: 1px solid var(--gray-300, #d1d5db); border-radius: 8px; font: inherit; background: var(--surface, #fff); color: inherit; }
    .tiles { list-style: none; padding: 0; margin: 0; display: grid; gap: .5rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 150px), 1fr)); }
    .tiles li { border: 1px solid var(--gray-200); border-radius: 12px; padding: .75rem; display: grid; gap: .15rem; }
    .tile__value { font-size: 1.5rem; font-weight: 700; }
    .tile__label { font-size: .85rem; color: var(--gray-500); }
    .funnel { margin: 0; padding-inline-start: 1.25rem; display: grid; gap: .25rem; }
    .retention { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: .75rem; }
    .retention li { border: 1px solid var(--gray-200); border-radius: 12px; padding: .5rem .75rem; display: grid; gap: .1rem; min-width: 120px; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: .9rem; }
    th, td { padding: .5rem; border-bottom: 1px solid var(--gray-200); text-align: start; white-space: nowrap; }
    .builder__link { flex-basis: 100%; overflow-wrap: anywhere; padding: .5rem; border-radius: 8px; background: var(--gray-50, #f8fafc); }
  `]
})
export class AdminGrowthPage implements OnInit {
  private readonly api = inject(AdminGrowthApiService);
  private readonly shareUrl = inject(PropertyShareUrlService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly data = signal<GrowthOverview | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);

  from = '';
  to = '';
  path = '/';
  source = '';
  medium = '';
  campaign = '';

  readonly tiles = computed(() => {
    const t = this.data()?.totals;
    if (!t) return [];
    return [
      { label: 'ADMIN_GROWTH.T_NEW_ACCOUNTS', value: t.newAccounts },
      { label: 'ADMIN_GROWTH.T_ACTIVE', value: t.activeUsers },
      { label: 'ADMIN_GROWTH.T_LISTINGS', value: t.listingsPublished },
      { label: 'ADMIN_GROWTH.T_SEARCH_REQUESTS', value: t.searchRequests },
      { label: 'ADMIN_GROWTH.T_SAVED_SEARCHES', value: t.savedSearches },
      { label: 'ADMIN_GROWTH.T_FAVORITES', value: t.favorites },
      { label: 'ADMIN_GROWTH.T_CONTACTS', value: t.contacts },
      { label: 'ADMIN_GROWTH.T_PROPOSALS', value: t.proposals },
      { label: 'ADMIN_GROWTH.T_REFERRALS', value: t.referralsQualified }
    ];
  });

  readonly reversedDays = computed(() => [...(this.data()?.days ?? [])].reverse());

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    const fromUtc = this.from ? `${this.from}T00:00:00Z` : null;
    // "To" is inclusive on the page; the API window ends at the start of the next day.
    const toUtc = this.to ? new Date(Date.parse(`${this.to}T00:00:00Z`) + 86_400_000).toISOString() : null;
    this.api.overview(fromUtc, toUtc).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: () => { this.error.set(true); this.loading.set(false); }
    });
  }

  pct(part: number, whole: number): string {
    return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
  }

  day(iso: string): string {
    return iso.slice(0, 10);
  }

  lastDay(isoEndExclusive: string): string {
    const t = Date.parse(isoEndExclusive.endsWith('Z') ? isoEndExclusive : `${isoEndExclusive}Z`);
    return Number.isNaN(t) ? '' : new Date(t - 1).toISOString().slice(0, 10);
  }

  invalidTag(): boolean {
    return [this.source, this.medium, this.campaign].some(v => v.trim() !== '' && !TAG.test(normalizeTag(v)));
  }

  link(): string {
    const source = normalizeTag(this.source);
    const campaign = normalizeTag(this.campaign);
    const medium = normalizeTag(this.medium);
    if (!source || !campaign || this.invalidTag()) return '';
    const params = new URLSearchParams({ utm_source: source });
    if (medium) params.set('utm_medium', medium);
    params.set('utm_campaign', campaign);
    return `${this.shareUrl.getSiteOrigin()}${this.path === '/' ? '/' : this.path}?${params.toString()}`;
  }

  async copyLink(): Promise<void> {
    const value = this.link();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      this.toast.success(this.translate.instant('ADMIN_GROWTH.COPIED'));
    } catch {
      this.toast.error(this.translate.instant('ADMIN_GROWTH.COPY_FAILED'));
    }
  }
}
