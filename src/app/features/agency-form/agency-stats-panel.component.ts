// src/app/features/agency-form/agency-stats-panel.component.ts
//
// إحصاءات صفحة المكتب في «مكتبي العقاري» (للمالك فقط): زيارات الصفحة، مسحات QR، نقرات التواصل، فتح الإعلانات،
// والمشاركات، لآخر 7 أو 30 أو 90 يومًا. الأرقام لا تشمل المالك وفريقه والمشرفين والبرامج الآلية، والزائر نفسه
// يُحتسب مرة واحدة لكل نوع خلال 24 ساعة. لا أرقام تجريبية: ما يُعرض هو ما سجّله الخادم فقط.
import { ChangeDetectionStrategy, Component, DestroyRef, Input, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, catchError, of, switchMap } from 'rxjs';

import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { AGENCY_STATS_RANGES, Agency, AgencyStats, AgencyStatsTotals } from '../../core/models/agency.model';

interface StatTile {
  key: keyof AgencyStatsTotals | 'uniqueVisitors';
  value: number;
}

@Component({
  selector: 'app-agency-stats-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule],
  styleUrl: './agency-panels.scss',
  template: `
    <section class="panel" data-testid="stats-panel">
      <div class="panel__header">
        <h2 class="panel__title">{{ 'OFFICE_STATS.TITLE' | translate }}</h2>
        <p class="panel__desc">{{ 'OFFICE_STATS.DESC' | translate }}</p>
      </div>
      <div class="panel__body stats">
        <div class="stats__ranges" role="group" [attr.aria-label]="'OFFICE_STATS.RANGE' | translate">
          <button type="button" *ngFor="let d of ranges" [class.is-active]="days() === d" [attr.aria-pressed]="days() === d"
                  (click)="setDays(d)" [attr.data-testid]="'range-' + d">{{ 'OFFICE_STATS.DAYS' | translate: { count: d } }}</button>
        </div>

        <p class="muted" *ngIf="loading()">{{ 'COMMON.LOADING' | translate }}</p>
        <p class="stats__error" role="alert" *ngIf="failed()">{{ 'OFFICE_STATS.LOAD_ERROR' | translate }}</p>

        <ng-container *ngIf="!loading() && stats() as s">
          <ul class="stats__tiles">
            <li *ngFor="let t of tiles()" class="stats__tile" [attr.data-testid]="'tile-' + t.key">
              <span class="stats__value">{{ t.value | number }}</span>
              <span class="stats__label">{{ 'OFFICE_STATS.TILE.' + t.key | translate }}</span>
            </li>
          </ul>

          <p class="muted" *ngIf="isEmpty()">{{ 'OFFICE_STATS.EMPTY' | translate }}</p>

          <div class="stats__chart" *ngIf="!isEmpty()" role="img"
               [attr.aria-label]="'OFFICE_STATS.CHART_LABEL' | translate: { count: s.days }" data-testid="stats-chart">
            <span class="stats__bar" *ngFor="let d of s.daily"
                  [style.height.%]="barHeight(d.profileViews + d.qrScans)"
                  [attr.title]="d.day + ': ' + (d.profileViews + d.qrScans)"></span>
          </div>

          <div class="stats__lists" *ngIf="!isEmpty()">
            <div *ngIf="s.viewSources.length">
              <h3 class="panel__subtitle">{{ 'OFFICE_STATS.SOURCES' | translate }}</h3>
              <ul><li *ngFor="let x of s.viewSources"><bdi>{{ 'OFFICE_STATS.SOURCE.' + x.source.toUpperCase() | translate }}</bdi>: <strong>{{ x.count | number }}</strong></li></ul>
            </div>
            <div *ngIf="s.contacts.length">
              <h3 class="panel__subtitle">{{ 'OFFICE_STATS.CONTACTS' | translate }}</h3>
              <ul><li *ngFor="let x of s.contacts"><bdi>{{ 'OFFICE_STATS.CHANNEL.' + x.channel.toUpperCase() | translate }}</bdi>: <strong>{{ x.count | number }}</strong></li></ul>
            </div>
          </div>

          <p class="muted stats__note">{{ 'OFFICE_STATS.NOTE' | translate }}</p>
        </ng-container>
      </div>
    </section>
  `,
  styles: [`
    .stats { display: flex; flex-direction: column; gap: 1rem; }
    .stats__ranges { display: inline-flex; align-self: flex-start; border: 1px solid var(--border); border-radius: var(--r-md); overflow: hidden; }
    .stats__ranges button { border: 0; background: var(--surface); color: var(--text-strong); padding: .4rem .8rem; font: inherit; font-weight: 600; cursor: pointer; }
    .stats__ranges button.is-active { background: var(--primary); color: var(--on-primary); }
    .stats__tiles { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: .6rem; }
    .stats__tile { border: 1px solid var(--border); border-radius: var(--r-md); padding: .7rem; display: flex; flex-direction: column; gap: .2rem; background: var(--surface); }
    .stats__value { font-size: 1.4rem; font-weight: 800; color: var(--gray-900); }
    .stats__label { font-size: .8rem; color: var(--gray-500); }
    .stats__chart { display: flex; align-items: flex-end; gap: 2px; height: 120px; padding: .5rem; border: 1px solid var(--border); border-radius: var(--r-md); }
    .stats__bar { flex: 1 1 0; min-width: 2px; min-height: 2px; background: var(--primary); border-radius: 2px 2px 0 0; }
    .stats__lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
    .stats__lists ul { margin: 0; padding-inline-start: 1.1rem; font-size: .88rem; color: var(--gray-700); }
    .stats__note { font-size: .78rem; }
    .stats__error { color: var(--danger-text); margin: 0; }
  `]
})
export class AgencyStatsPanelComponent implements OnInit {
  private readonly api = inject(AgenciesApiService);
  private readonly destroyRef = inject(DestroyRef);

  @Input({ required: true }) agency!: Agency;

  readonly ranges = AGENCY_STATS_RANGES;
  readonly days = signal(30);
  readonly stats = signal<AgencyStats | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);
  private readonly load$ = new Subject<number>();

  readonly tiles = computed<StatTile[]>(() => {
    const s = this.stats();
    if (!s) return [];
    return [
      { key: 'profileViews', value: s.totals.profileViews },
      { key: 'uniqueVisitors', value: s.uniqueVisitors },
      { key: 'qrScans', value: s.totals.qrScans },
      { key: 'contactClicks', value: s.totals.contactClicks },
      { key: 'listingClicks', value: s.totals.listingClicks },
      { key: 'shares', value: s.totals.shares }
    ];
  });

  readonly isEmpty = computed(() => {
    const t = this.stats()?.totals;
    return !t || t.profileViews + t.qrScans + t.contactClicks + t.listingClicks + t.shares === 0;
  });

  private readonly maxDaily = computed(() =>
    Math.max(1, ...(this.stats()?.daily ?? []).map(d => d.profileViews + d.qrScans)));

  ngOnInit(): void {
    this.load$.pipe(
      switchMap(days => {
        this.loading.set(true);
        this.failed.set(false);
        return this.api.getStats(this.agency.id, days).pipe(catchError(() => of(null)));
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(s => {
      this.loading.set(false);
      this.failed.set(!s);
      this.stats.set(s);
    });
    this.load$.next(this.days());
  }

  setDays(days: number): void {
    if (!AGENCY_STATS_RANGES.includes(days) || days === this.days()) return;
    this.days.set(days);
    this.load$.next(days);
  }

  barHeight(value: number): number {
    return Math.round((value / this.maxDaily()) * 100);
  }
}
