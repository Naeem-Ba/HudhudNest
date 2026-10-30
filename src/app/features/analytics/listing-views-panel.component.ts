// =============================================================
// src/app/features/analytics/listing-views-panel.component.ts
//
// View statistics for the signed-in owner (and for an agency owner: the agency's listings).
// Everything shown comes from GET /api/listing-views/*; what the caller may see is decided there,
// not here. Only data that exists is drawn: the 7/30-day figures and the daily bars come from the
// view ledger, which the server keeps for a limited time (historyRetentionDays), so the panel says
// how far back the history reaches instead of implying more.
// =============================================================

import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';

import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { ListingViewsApiService } from '../../core/api/listing-views-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { uiNumberLocale } from '../../core/i18n/ui-language';
import { ListingViewStats, ListingViewTrend } from '../../core/models/listing-views.model';
import { formatViewCountFull } from '../../shared/utils/view-count';

@Component({
  selector: 'app-listing-views-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule],
  template: `
    <section class="panel" data-testid="views-panel">
      <div class="panel-head">
        <div>
          <h2>{{ 'VIEW_STATS.TITLE' | translate }}</h2>
          <p>{{ 'VIEW_STATS.HELP' | translate }}</p>
        </div>
        @if (ownsAgency()) {
          <div class="scope" role="group" [attr.aria-label]="'VIEW_STATS.SCOPE' | translate">
            <button type="button" [class.scope--on]="scope() === 'mine'" [attr.aria-pressed]="scope() === 'mine'" (click)="setScope('mine')">{{ 'VIEW_STATS.SCOPE_MINE' | translate }}</button>
            <button type="button" [class.scope--on]="scope() === 'agency'" [attr.aria-pressed]="scope() === 'agency'" (click)="setScope('agency')">{{ 'VIEW_STATS.SCOPE_AGENCY' | translate }}</button>
          </div>
        }
      </div>

      @if (loading()) {
        <div class="state">{{ 'COMMON.LOADING' | translate }}</div>
      } @else if (failed()) {
        <p class="error">{{ 'VIEW_STATS.ERROR' | translate }}</p>
      } @else if (stats(); as s) {
        <div class="metrics">
          <article><strong>{{ n(s.totalViews) }}</strong><span>{{ 'VIEW_STATS.TOTAL' | translate }}</span></article>
          <article><strong>{{ n(s.views7Days) }}</strong><span>{{ 'VIEW_STATS.LAST_7' | translate }}</span></article>
          <article><strong>{{ n(s.views30Days) }}</strong><span>{{ 'VIEW_STATS.LAST_30' | translate }}</span></article>
        </div>

        @if (trend(); as t) {
          <div class="trend" data-testid="views-trend">
            <h3>{{ 'VIEW_STATS.TREND' | translate: { days: t.days } }}</h3>
            <div class="bars" role="img" [attr.aria-label]="'VIEW_STATS.TREND_ARIA' | translate: { days: t.days, count: n(trendTotal()) }">
              @for (p of t.points; track p.date) {
                <span class="bar" [style.height.%]="barHeight(p.views)" [attr.title]="p.date + ': ' + n(p.views)"></span>
              }
            </div>
          </div>
        }

        @if (s.items.length > 0) {
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{{ 'VIEW_STATS.LISTING' | translate }}</th>
                  <th scope="col">{{ 'VIEW_STATS.TOTAL' | translate }}</th>
                  <th scope="col">{{ 'VIEW_STATS.LAST_7' | translate }}</th>
                  <th scope="col">{{ 'VIEW_STATS.LAST_30' | translate }}</th>
                  <th scope="col">{{ 'VIEW_STATS.UNIQUE_30' | translate }}</th>
                </tr>
              </thead>
              <tbody>
                @for (item of s.items; track item.listingId) {
                  <tr [class.row--selected]="item.listingId === propertyId()">
                    <th scope="row">{{ item.title }}</th>
                    <td>{{ n(item.totalViews) }}</td>
                    <td>{{ n(item.views7Days) }}</td>
                    <td>{{ n(item.views30Days) }}</td>
                    <td>{{ n(item.uniqueViewers30Days) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="state">{{ 'VIEW_STATS.EMPTY' | translate }}</p>
        }

        <p class="note">{{ 'VIEW_STATS.NOTE' | translate: { days: s.historyRetentionDays } }}</p>
      }
    </section>
  `,
  styles: [`
    .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: clamp(1rem, 2vw, 1.5rem); margin: 1rem 0; }
    .panel-head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; flex-wrap: wrap; }
    .panel-head h2 { margin: 0; color: var(--gray-800); }
    .panel-head p { color: var(--gray-500); margin: .25rem 0 0; }
    .scope { display: inline-flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
    .scope button { border: 0; background: var(--surface); color: var(--gray-700); padding: .6rem 1rem; font-weight: 600; min-height: 44px; }
    .scope .scope--on { background: var(--gray-800); color: #fff; }
    .metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; margin-top: 1rem; }
    .metrics article { border: 1px solid var(--border); border-radius: 14px; padding: 1rem; display: grid; }
    .metrics strong { font-size: 1.8rem; color: var(--gray-800); font-variant-numeric: tabular-nums; }
    .metrics span { color: var(--gray-500); }
    .trend h3 { font-size: .95rem; color: var(--gray-700); margin: 1.25rem 0 .5rem; }
    .bars { display: flex; align-items: flex-end; gap: 2px; height: 96px; border-block-end: 1px solid var(--border); }
    .bar { flex: 1 1 0; min-width: 2px; background: var(--primary, #D6A84F); border-radius: 2px 2px 0 0; min-height: 2px; opacity: .85; }
    .table-wrap { overflow-x: auto; margin-top: 1.25rem; }
    table { width: 100%; border-collapse: collapse; font-size: .9rem; }
    th, td { padding: .6rem .5rem; text-align: start; border-block-end: 1px solid var(--border); font-variant-numeric: tabular-nums; }
    thead th { color: var(--gray-500); font-weight: 600; white-space: nowrap; }
    tbody th { font-weight: 600; color: var(--gray-800); max-width: 18rem; overflow-wrap: anywhere; }
    .row--selected { background: var(--gray-50, #f8fafc); }
    .note { color: var(--gray-500); font-size: .8rem; margin: 1rem 0 0; }
    .state { text-align: center; padding: 1.5rem; color: var(--gray-600); }
    .error { color: var(--danger); }
    @media (max-width: 640px) { .metrics { grid-template-columns: 1fr; } }
  `]
})
export class ListingViewsPanelComponent {
  private readonly api = inject(ListingViewsApiService);
  private readonly agenciesApi = inject(AgenciesApiService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  /** The sale/rent listing picked in the performance panel above; its daily trend is drawn. */
  readonly propertyId = input<string>('');

  readonly scope = signal<'mine' | 'agency'>('mine');
  readonly ownsAgency = signal(false);
  readonly stats = signal<ListingViewStats | null>(null);
  readonly trend = signal<ListingViewTrend | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);

  readonly trendTotal = computed(() => this.trend()?.points.reduce((sum, p) => sum + p.views, 0) ?? 0);
  private readonly trendMax = computed(() => Math.max(1, ...(this.trend()?.points.map(p => p.views) ?? [0])));

  constructor() {
    this.loadStats();
    this.loadAgencyOwnership();

    effect(() => {
      const id = this.propertyId();
      if (this.scope() === 'mine' && id) {
        this.loadTrend(id);
      } else {
        this.trend.set(null);
      }
    });
  }

  setScope(scope: 'mine' | 'agency'): void {
    if (this.scope() === scope) return;
    this.scope.set(scope);
    this.loadStats();
  }

  n(value: number): string {
    return formatViewCountFull(value, uiNumberLocale());
  }

  barHeight(views: number): number {
    return views <= 0 ? 2 : Math.max(4, Math.round((views / this.trendMax()) * 100));
  }

  private loadStats(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api.getStats(this.scope()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: stats => { this.stats.set(stats); this.loading.set(false); },
      error: () => { this.failed.set(true); this.loading.set(false); }
    });
  }

  private loadTrend(propertyId: string): void {
    this.api.getTrend('property', propertyId, 30).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: trend => this.trend.set(trend),
      // The trend is a bonus on top of the table: if it fails the page still has its numbers.
      error: () => this.trend.set(null)
    });
  }

  private loadAgencyOwnership(): void {
    if (!this.auth.getAccessToken()) return;

    this.agenciesApi.getMine().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: agency => {
        const id = this.auth.getCurrentUserId();
        this.ownsAgency.set(!!agency && !!id && agency.ownerUserId === id);
      },
      error: () => this.ownsAgency.set(false)
    });
  }
}
