import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';

import { AdminServiceRequestsService } from '../../core/api/admin-service-requests.service';
import {
  AdminServiceRequestSummaryDto,
  ReasonCountDto,
  ServiceStatsDto,
  ServiceStatsRowDto
} from '../../core/models/admin-service-requests.model';
import { SERVICE_CATEGORIES, ServiceCategory, ServiceRequestStatus } from '../../core/models/service.model';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';
import { LocalizedNumberPipe } from '../../shared/pipes/localized-number.pipe';

type Tab = 'overview' | 'requests';
type Breakdown = 'offering' | 'category' | 'provider';

const ALL_STATUSES: ServiceRequestStatus[] = [
  'Inquiry', 'UnderReview', 'Accepted', 'Scheduled', 'InProgress', 'Completed', 'NotCompleted', 'Reviewed', 'Rejected', 'Cancelled', 'Expired'
];

/**
 * "إدارة الخدمات": the owner's view of the services marketplace. The overview answers which services
 * are active and requested, how many times, and how often they were delivered and why not; the
 * requests tab is the working list (filters, attention flags) that opens one request in detail.
 * Everything is computed on the server and paged there.
 */
@Component({
  selector: 'app-admin-services-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ LocalizedDatePipe, LocalizedNumberPipe,CommonModule, FormsModule, RouterLink, TranslateModule, LoadingSpinnerComponent, EmptyStateComponent],
  templateUrl: './admin-services.page.html',
  styleUrls: ['./admin-services.page.scss']
})
export class AdminServicesPage implements OnInit {
  private readonly api = inject(AdminServiceRequestsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageSize = 20;
  readonly categories = SERVICE_CATEGORIES;
  readonly statuses = ALL_STATUSES;

  readonly tab = signal<Tab>('overview');
  readonly breakdown = signal<Breakdown>('offering');

  // ── Overview ─────────────────────────────────────────────────────────
  readonly stats = signal<ServiceStatsDto | null>(null);
  readonly statsLoading = signal(false);
  readonly statsFailed = signal(false);
  from = '';
  to = '';

  /** Rows of the chosen breakdown, the most requested first; services nobody asked for sink to the bottom. */
  readonly rows = computed<ServiceStatsRowDto[]>(() => {
    const s = this.stats();
    if (!s) return [];
    const source = this.breakdown() === 'offering' ? s.byOffering : this.breakdown() === 'category' ? s.byCategory : s.byProvider;
    return [...source].sort((a, b) => b.requested - a.requested || (a.label ?? a.key).localeCompare(b.label ?? b.key));
  });

  readonly neverRequested = computed(() =>
    (this.stats()?.byOffering ?? []).filter(row => row.requested === 0 && row.isActive).length);

  // ── Requests ─────────────────────────────────────────────────────────
  readonly requests = signal<AdminServiceRequestSummaryDto[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  search = '';
  status: ServiceRequestStatus | '' = '';
  category: ServiceCategory | '' = '';
  offeringId: string | null = null;
  providerId: string | null = null;
  needsAttention = false;
  /** '' = all, 'yes' = confirmed requests, 'no' = inquiries that never became a request. */
  confirmed: '' | 'yes' | 'no' = '';

  private readonly search$ = new Subject<string>();
  private requestSeq = 0;

  ngOnInit(): void {
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => { this.page.set(1); this.loadRequests(); });

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.tab.set(params.get('tab') === 'requests' ? 'requests' : 'overview');
      this.status = (params.get('status') as ServiceRequestStatus | null) ?? '';
      this.category = (params.get('category') as ServiceCategory | null) ?? '';
      this.offeringId = params.get('offeringId');
      this.providerId = params.get('providerId');
      this.needsAttention = params.get('needsAttention') === 'true';
      const confirmed = params.get('confirmed');
      this.confirmed = confirmed === 'true' ? 'yes' : confirmed === 'false' ? 'no' : '';
      this.from = params.get('from') ?? '';
      this.to = (params.get('to') ?? '').slice(0, 10);
      this.page.set(1);
      if (this.tab() === 'overview') this.loadStats(); else this.loadRequests();
    });
  }

  selectTab(tab: Tab): void {
    void this.router.navigate([], { queryParams: { tab } });
  }

  selectBreakdown(value: Breakdown): void { this.breakdown.set(value); }

  // ── Overview ─────────────────────────────────────────────────────────
  loadStats(): void {
    this.statsLoading.set(true);
    this.statsFailed.set(false);
    this.api.stats(this.from || null, this.to ? this.endOfDay(this.to) : null)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: stats => { this.stats.set(stats); this.statsLoading.set(false); },
        error: () => { this.statsFailed.set(true); this.statsLoading.set(false); }
      });
  }

  applyRange(): void { this.loadStats(); }

  setLastDays(days: number | null): void {
    if (days === null) {
      this.from = '';
    } else {
      const start = new Date();
      start.setDate(start.getDate() - days);
      this.from = start.toISOString().slice(0, 10);
    }
    this.to = '';
    this.loadStats();
  }

  /** A date-only "to" must include that whole day. */
  private endOfDay(date: string): string { return `${date}T23:59:59`; }

  percent(value?: number | null): string {
    return value == null ? '—' : `${Math.round(value * 100)}%`;
  }

  barWidth(item: ReasonCountDto, list: ReasonCountDto[]): number {
    const max = Math.max(1, ...list.map(r => r.count));
    return Math.round((item.count / max) * 100);
  }

  /** Opens the requests tab narrowed to a row of the table (a service, a category or a provider). */
  openRow(row: ServiceStatsRowDto): void {
    const kind = this.breakdown();
    const queryParams: Record<string, string> = { tab: 'requests' };
    if (kind === 'offering' && row.id) queryParams['offeringId'] = row.id;
    if (kind === 'provider' && row.id) queryParams['providerId'] = row.id;
    if (kind === 'category') queryParams['category'] = row.key;
    if (this.from) queryParams['from'] = this.from;
    if (this.to) queryParams['to'] = this.to;
    void this.router.navigate([], { queryParams });
  }

  // ── Requests ─────────────────────────────────────────────────────────
  onSearchChange(value: string): void { this.search$.next(value); }

  applyFilters(): void { this.page.set(1); this.loadRequests(); }

  clearScope(): void {
    this.offeringId = null;
    this.providerId = null;
    void this.router.navigate([], { queryParams: { tab: 'requests' } });
  }

  goToPage(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.totalPages()));
    this.loadRequests();
  }

  loadRequests(): void {
    const seq = ++this.requestSeq;
    this.loading.set(true);
    this.failed.set(false);
    this.api.search({
      search: this.search,
      status: this.status,
      category: this.category,
      offeringId: this.offeringId,
      providerId: this.providerId,
      from: this.from || null,
      to: this.to ? this.endOfDay(this.to) : null,
      needsAttention: this.needsAttention,
      confirmed: this.confirmed === '' ? null : this.confirmed === 'yes',
      page: this.page(),
      pageSize: this.pageSize
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          // A slow answer for filters the admin already changed must not overwrite the newer list.
          if (seq !== this.requestSeq) return;
          this.requests.set(result.items);
          this.total.set(result.total);
          this.loading.set(false);
        },
        error: () => {
          if (seq !== this.requestSeq) return;
          this.loading.set(false);
          this.failed.set(true);
        }
      });
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
  trackByKey(_: number, item: { key: string }): string { return item.key; }
  trackByReason(_: number, item: ReasonCountDto): string { return item.reason; }
}
