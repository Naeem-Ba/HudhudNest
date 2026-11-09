import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';

import { AdminListingReportsService } from '../../core/api/admin-listing-reports.service';
import {
  AdminAssigneeDto,
  AdminListingReportStatsDto,
  AdminListingReportSummaryDto,
  LISTING_REPORT_REASONS,
  ListingReportFilter,
  ListingReportPriority,
  ListingReportReason,
  ListingReportStatus,
  REPORT_PRIORITIES,
  REPORT_STATUSES
} from '../../core/models/listing-report.model';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';
import { LocalizedNumberPipe } from '../../shared/pipes/localized-number.pipe';

type Sort = NonNullable<ListingReportFilter['sort']>;

/**
 * "إدارة البلاغات": the moderation queue for listing reports. Filters, sort and paging are
 * sent to the server (the list never loads everything). The stat cards double as quick filters.
 * A report count is only a signal: nothing here hides or deletes a listing by itself.
 */
@Component({
  selector: 'app-admin-listing-reports-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ LocalizedDatePipe, LocalizedNumberPipe,CommonModule, FormsModule, RouterLink, TranslateModule, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <section class="page">
      <header class="page-header">
        <h1>{{ 'ADMIN_REPORTS.TITLE' | translate }}</h1>
        <p>{{ 'ADMIN_REPORTS.SUBTITLE' | translate }}</p>
      </header>

      <div class="stats" *ngIf="stats() as s" data-testid="report-stats">
        <button type="button" class="stat" [class.on]="quick() === 'open'" (click)="setQuick('open')">
          <strong>{{ s.open }}</strong><span>{{ 'ADMIN_REPORTS.STAT_OPEN' | translate }}</span>
        </button>
        <button type="button" class="stat" [class.on]="quick() === 'New'" (click)="setQuick('New')">
          <strong>{{ s.new }}</strong><span>{{ 'ADMIN_REPORTS.STATUS.New' | translate }}</span>
        </button>
        <button type="button" class="stat" [class.on]="quick() === 'UnderReview'" (click)="setQuick('UnderReview')">
          <strong>{{ s.underReview }}</strong><span>{{ 'ADMIN_REPORTS.STATUS.UnderReview' | translate }}</span>
        </button>
        <button type="button" class="stat" [class.on]="quick() === 'WaitingForInformation'" (click)="setQuick('WaitingForInformation')">
          <strong>{{ s.waitingForInformation }}</strong><span>{{ 'ADMIN_REPORTS.STATUS.WaitingForInformation' | translate }}</span>
        </button>
        <button type="button" class="stat stat--warn" [class.on]="quick() === 'overdue'" (click)="setQuick('overdue')">
          <strong>{{ s.overdue }}</strong><span>{{ 'ADMIN_REPORTS.STAT_OVERDUE' | translate }}</span>
        </button>
        <button type="button" class="stat stat--warn" [class.on]="quick() === 'high'" (click)="setQuick('high')">
          <strong>{{ s.highPriorityOpen }}</strong><span>{{ 'ADMIN_REPORTS.STAT_HIGH' | translate }}</span>
        </button>
        <button type="button" class="stat" [class.on]="quick() === 'Resolved'" (click)="setQuick('Resolved')">
          <strong>{{ s.resolved }}</strong><span>{{ 'ADMIN_REPORTS.STATUS.Resolved' | translate }}</span>
        </button>
        <button type="button" class="stat" [class.on]="quick() === 'Dismissed'" (click)="setQuick('Dismissed')">
          <strong>{{ s.dismissed }}</strong><span>{{ 'ADMIN_REPORTS.STATUS.Dismissed' | translate }}</span>
        </button>
        <div class="stat stat--static" *ngIf="s.averageResolutionHours !== null">
          <strong>{{ s.averageResolutionHours | localNumber:'1.0-1' }}</strong>
          <span>{{ 'ADMIN_REPORTS.STAT_AVG_HOURS' | translate:{ n: s.resolvedSampleSize } }}</span>
        </div>
      </div>

      <div class="filters">
        <input type="search" class="search-input" name="search" [(ngModel)]="search" (ngModelChange)="search$.next($event)"
               [placeholder]="'ADMIN_REPORTS.SEARCH' | translate" [attr.aria-label]="'COMMON.SEARCH' | translate">
        <select name="status" [(ngModel)]="status" (change)="applyFilters()" [attr.aria-label]="'ADMIN_REPORTS.F_STATUS' | translate">
          <option value="">{{ 'ADMIN_REPORTS.ALL_STATUSES' | translate }}</option>
          <option *ngFor="let s of statuses" [value]="s">{{ 'ADMIN_REPORTS.STATUS.' + s | translate }}</option>
        </select>
        <select name="reason" [(ngModel)]="reason" (change)="applyFilters()" [attr.aria-label]="'ADMIN_REPORTS.F_REASON' | translate">
          <option value="">{{ 'ADMIN_REPORTS.ALL_REASONS' | translate }}</option>
          <option *ngFor="let r of reasons" [value]="r">{{ 'REPORT.REASON.' + r | translate }}</option>
        </select>
        <select name="priority" [(ngModel)]="priority" (change)="applyFilters()" [attr.aria-label]="'ADMIN_REPORTS.F_PRIORITY' | translate">
          <option value="">{{ 'ADMIN_REPORTS.ALL_PRIORITIES' | translate }}</option>
          <option *ngFor="let p of priorities" [value]="p">{{ 'ADMIN_REPORTS.PRIORITY.' + p | translate }}</option>
        </select>
        <select name="assignee" [(ngModel)]="assignee" (change)="applyFilters()" [attr.aria-label]="'ADMIN_REPORTS.F_ASSIGNEE' | translate">
          <option value="">{{ 'ADMIN_REPORTS.ALL_ASSIGNEES' | translate }}</option>
          <option value="__none">{{ 'ADMIN_REPORTS.UNASSIGNED' | translate }}</option>
          <option *ngFor="let a of assignees()" [value]="a.id">{{ a.name }}</option>
        </select>
        <label class="date"><span>{{ 'ADMIN_REPORTS.F_FROM' | translate }}</span>
          <input type="date" name="from" [(ngModel)]="from" (change)="applyFilters()"></label>
        <label class="date"><span>{{ 'ADMIN_REPORTS.F_TO' | translate }}</span>
          <input type="date" name="to" [(ngModel)]="to" (change)="applyFilters()"></label>
        <select name="sort" [(ngModel)]="sort" (change)="applyFilters()" [attr.aria-label]="'ADMIN_REPORTS.F_SORT' | translate">
          <option *ngFor="let o of sorts" [value]="o">{{ 'ADMIN_REPORTS.SORT.' + o | translate }}</option>
        </select>
      </div>

      <app-loading-spinner *ngIf="loading()" [label]="'COMMON.LOADING' | translate"></app-loading-spinner>

      <div class="state error" *ngIf="!loading() && failed()" role="alert">
        <p>{{ 'ADMIN_REPORTS.LOAD_ERROR' | translate }}</p>
        <button type="button" class="btn" (click)="load()">{{ 'COMMON.RETRY' | translate }}</button>
      </div>

      <ng-container *ngIf="!loading() && !failed()">
        <app-empty-state *ngIf="items().length === 0" icon="🚩"
                         [title]="'ADMIN_REPORTS.EMPTY' | translate" [message]="'ADMIN_REPORTS.EMPTY_TEXT' | translate"></app-empty-state>

        <div class="rows" *ngIf="items().length > 0">
          <a class="row" *ngFor="let r of items(); trackBy: trackById" [routerLink]="['/admin/listing-reports', r.id]"
             [attr.data-testid]="'report-row-' + r.referenceNumber">
            <div class="cell cell--main">
              <strong>{{ r.listingTitle }}</strong>
              <span class="muted" dir="ltr">{{ r.referenceNumber }}</span>
              <span class="tag tag--warn" *ngIf="r.listingTakenDown">{{ 'ADMIN_REPORTS.TAKEN_DOWN' | translate }}</span>
              <span class="tag tag--warn" *ngIf="r.listingDeleted">{{ 'ADMIN_REPORTS.LISTING_DELETED' | translate }}</span>
              <span class="preview" *ngIf="r.detailsPreview" data-testid="report-preview">{{ r.detailsPreview }}</span>
            </div>
            <div class="cell">{{ 'REPORT.REASON.' + r.reason | translate }}</div>
            <div class="cell muted">{{ r.reporterName }}</div>
            <div class="cell">
              <span class="chip" [attr.data-status]="r.status">{{ 'ADMIN_REPORTS.STATUS.' + r.status | translate }}</span>
              <span class="chip chip--overdue" *ngIf="r.isOverdue">{{ 'ADMIN_REPORTS.OVERDUE' | translate }}</span>
            </div>
            <div class="cell"><span class="chip" [attr.data-priority]="r.priority">{{ 'ADMIN_REPORTS.PRIORITY.' + r.priority | translate }}</span></div>
            <div class="cell muted">{{ r.assignedAdminName || ('ADMIN_REPORTS.UNASSIGNED' | translate) }}</div>
            <div class="cell muted">{{ r.createdAt | localDate:'mediumDate' }}</div>
          </a>
        </div>

        <nav class="pagination" *ngIf="totalPages() > 1" [attr.aria-label]="'COMMON.PAGINATION' | translate">
          <button type="button" (click)="goTo(page() - 1)" [disabled]="page() <= 1" [attr.aria-label]="'COMMON.PREVIOUS' | translate">‹</button>
          <span>{{ page() }} / {{ totalPages() }}</span>
          <button type="button" (click)="goTo(page() + 1)" [disabled]="page() >= totalPages()" [attr.aria-label]="'COMMON.NEXT' | translate">›</button>
        </nav>
      </ng-container>
    </section>
  `,
  styles: [`
    .preview { display:block; flex-basis:100%; color:var(--gray-600, #52606d); font-size:var(--text-sm); line-height:1.5; overflow-wrap:anywhere; }
    .page{padding:clamp(1rem,3vw,2rem);max-width:1300px;margin:0 auto}
    .page-header h1{margin:0 0 .3rem;color: var(--text-strong);font-family:var(--font-display);font-size:clamp(1.5rem,2.6vw,2rem)}
    .page-header p{margin:0 0 1rem;color:var(--gray-500)}
    .stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:.6rem;margin-bottom:1rem}
    .stat{display:grid;gap:.1rem;text-align:start;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:.7rem .85rem;cursor:pointer;font:inherit;color:inherit}
    .stat strong{font-size:1.4rem;color: var(--text-strong)}
    .stat span{font-size:var(--text-sm);color:var(--gray-600)}
    .stat.on{border-color:var(--primary);background:var(--primary-soft)}
    .stat--warn strong{color:var(--danger-text)}
    .stat--static{cursor:default}
    .filters{display:flex;flex-wrap:wrap;gap:.6rem;margin-bottom:1rem;align-items:end}
    .filters select,.filters input{width:auto;min-width:150px}
    .filters select,.filters input,.search-input{border:1px solid var(--border);border-radius:var(--r-md);padding:.5rem .8rem;background:var(--surface);font-size:16px}
    .filters .search-input{flex:1 1 260px;min-width:200px;width:auto}
    .date{display:grid;gap:.15rem;font-size:var(--text-sm);color:var(--gray-600)}
    .rows{display:flex;flex-direction:column;gap:.5rem}
    .row{display:grid;grid-template-columns:2fr 1.4fr 1.2fr 1.3fr .8fr 1fr .9fr;gap:1rem;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:.85rem 1rem;text-decoration:none;color:inherit}
    .row:hover,.row:focus-visible{border-color:var(--primary);outline:none}
    .cell{min-width:0;overflow-wrap:anywhere}
    .cell--main{display:grid;gap:.15rem}
    .muted{color:var(--gray-500);font-size:var(--text-sm)}
    .tag{display:inline-block;width:fit-content;border-radius:999px;padding:.1rem .5rem;font-size:.75rem;background:var(--gray-100)}
    .tag--warn{background:var(--danger-soft);color:var(--danger-text)}
    .chip{font-size:.78rem;font-weight:700;border-radius:999px;padding:.25rem .6rem;background:var(--gray-100);color:var(--gray-700);white-space:nowrap;margin-inline-end:.25rem}
    .chip[data-status='New']{background:var(--primary-soft);color:var(--primary-text)}
    .chip[data-status='WaitingForInformation'],.chip[data-status='ActionRequired']{background:var(--warning-soft,#fef3c7);color:var(--warning-text)}
    .chip[data-status='Resolved']{background:var(--success-soft);color:var(--success-text)}
    .chip[data-priority='High'],.chip[data-priority='Urgent'],.chip--overdue{background:var(--danger-soft);color:var(--danger-text)}
    .state{padding:2rem;text-align:center;background:var(--surface);border:1px dashed var(--gray-300);border-radius:16px}
    .state.error{color:var(--danger-text)}
    .btn{border:0;border-radius:10px;padding:.55rem 1rem;font-weight:700;cursor:pointer;background:var(--gray-100)}
    .pagination{display:flex;justify-content:center;align-items:center;gap:1rem;margin-top:1.25rem}
    .pagination button{border:1px solid var(--border);background:var(--surface);border-radius:var(--r-sm);width:34px;height:34px;cursor:pointer}
    .pagination button:disabled{opacity:.4;cursor:not-allowed}
    @media (max-width:768px){.row{grid-template-columns:1fr;gap:.4rem}}
  `]
})
export class AdminListingReportsPage implements OnInit {
  private readonly api = inject(AdminListingReportsService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageSize = 20;
  readonly statuses = REPORT_STATUSES;
  readonly reasons = LISTING_REPORT_REASONS;
  readonly priorities = REPORT_PRIORITIES;
  readonly sorts: Sort[] = ['Newest', 'Oldest', 'Priority', 'RecentlyUpdated'];

  readonly items = signal<AdminListingReportSummaryDto[]>([]);
  readonly stats = signal<AdminListingReportStatsDto | null>(null);
  readonly assignees = signal<AdminAssigneeDto[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(false);
  readonly failed = signal(false);
  /** Which stat card is active. Cards only set the ordinary filters below, they are not a separate mode. */
  readonly quick = signal<string>('open');
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  search = '';
  status: ListingReportStatus | '' = '';
  reason: ListingReportReason | '' = '';
  priority: ListingReportPriority | '' = '';
  assignee = '';
  from = '';
  to = '';
  sort: Sort = 'Priority';
  private open = true;
  private overdue = false;
  private propertyId = '';

  readonly search$ = new Subject<string>();
  private seq = 0;

  ngOnInit(): void {
    this.propertyId = this.route.snapshot.queryParamMap.get('propertyId') ?? '';
    if (this.propertyId) { this.open = false; this.quick.set(''); this.sort = 'Newest'; }
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => { this.page.set(1); this.load(); });
    this.api.assignees().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: a => this.assignees.set(a), error: () => {} });
    this.load();
  }

  setQuick(key: string): void {
    this.quick.set(key);
    this.status = '';
    this.open = false;
    this.overdue = false;
    this.priority = '';
    if (key === 'open') this.open = true;
    else if (key === 'overdue') { this.open = true; this.overdue = true; }
    else if (key === 'high') { this.open = true; this.priority = 'High'; }
    else this.status = key as ListingReportStatus;
    this.page.set(1);
    this.load();
  }

  applyFilters(): void {
    // A manual status choice replaces the quick card; clearing it falls back to "open".
    if (this.status) { this.open = false; this.overdue = false; this.quick.set(this.status); }
    else if (this.quick() !== 'overdue' && this.quick() !== 'high') { this.open = this.quick() === 'open' || this.quick() === ''; }
    this.page.set(1);
    this.load();
  }

  goTo(p: number): void {
    if (p < 1 || p > this.totalPages()) return;
    this.page.set(p);
    this.load();
  }

  load(): void {
    const seq = ++this.seq;
    this.loading.set(true);
    this.failed.set(false);
    const filter = this.buildFilter();
    this.api.search(filter).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        if (seq !== this.seq) return;
        this.items.set(res.items);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: () => { if (seq === this.seq) { this.failed.set(true); this.loading.set(false); } }
    });
    this.api.stats(filter).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: s => { if (seq === this.seq) this.stats.set(s); },
      error: () => {}
    });
  }

  private buildFilter(): ListingReportFilter {
    return {
      search: this.search,
      status: this.status,
      open: this.open,
      overdue: this.overdue,
      reason: this.reason,
      priority: this.priority,
      assignedAdminId: this.assignee && this.assignee !== '__none' ? this.assignee : '',
      unassigned: this.assignee === '__none',
      propertyId: this.propertyId || undefined,
      from: this.from,
      to: this.to,
      sort: this.sort,
      page: this.page(),
      pageSize: this.pageSize
    };
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}

