import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, of } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ListingReportsService } from '../../core/api/listing-reports.service';
import { MyListingReportDto } from '../../core/models/listing-report.model';
import { isRateLimited } from '../../core/api/rate-limited';
import { ToastService } from '../../shared/services/toast.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';

/**
 * "بلاغاتي": the reports the signed-in person sent, their general state, the question an admin
 * asked (if any) with a box to answer it, and the general result once closed. It never shows who
 * reviewed a report, internal notes, or what exactly was done: only "action taken" or "no
 * violation found". The server filters all of that; this page just renders what it receives.
 */
@Component({
  selector: 'app-my-listing-reports-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, TranslateModule, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <section class="page">
      <header class="page-header">
        <h1>{{ 'MY_REPORTS.TITLE' | translate }}</h1>
        <p>{{ 'MY_REPORTS.SUBTITLE' | translate }}</p>
      </header>

      <div class="banner" *ngIf="!loading() && !failed() && waitingCount() > 0" role="status" data-testid="my-reports-waiting">
        {{ 'MY_REPORTS.WAITING_BANNER' | translate: { count: waitingCount() } }}
      </div>

      <app-loading-spinner *ngIf="loading()" [label]="'COMMON.LOADING' | translate"></app-loading-spinner>

      <div class="state error" *ngIf="!loading() && failed()" role="alert">
        <p>{{ 'MY_REPORTS.LOAD_ERROR' | translate }}</p>
        <button type="button" class="btn" (click)="load()">{{ 'COMMON.RETRY' | translate }}</button>
      </div>

      <app-empty-state *ngIf="!loading() && !failed() && reports().length === 0" icon="🚩"
                       [title]="'MY_REPORTS.EMPTY' | translate" [message]="'MY_REPORTS.EMPTY_TEXT' | translate"></app-empty-state>

      <ul class="list" *ngIf="!loading() && !failed() && reports().length > 0">
        <li class="card" *ngFor="let r of reports(); trackBy: trackById" [attr.data-testid]="'my-report-' + r.referenceNumber"
            [attr.id]="'report-' + r.id" [class.card--focus]="r.id === focusId">
          <div class="card__head">
            <div>
              <span class="ref" dir="ltr">{{ r.referenceNumber }}</span>
              <h2><a [routerLink]="['/properties', r.propertyId]">{{ r.listingTitle }}</a></h2>
            </div>
            <span class="chip" [attr.data-status]="r.status">{{ 'MY_REPORTS.STATUS.' + r.status | translate }}</span>
          </div>
          <p class="muted">{{ 'REPORT.REASON.' + r.reason | translate }} · {{ r.createdAt | date:'mediumDate' }}</p>
          <p class="pre" *ngIf="r.details">{{ r.details }}</p>

          <p class="result" *ngIf="r.status === 'Closed' && r.outcome">
            {{ 'MY_REPORTS.OUTCOME.' + r.outcome | translate }}
          </p>

          <div class="ask" *ngIf="r.status === 'NeedsYourInfo' && r.infoRequest">
            <strong>{{ 'MY_REPORTS.QUESTION' | translate }}</strong>
            <p class="pre">{{ r.infoRequest }}</p>
            <label [attr.for]="'ans-' + r.id">{{ 'MY_REPORTS.YOUR_ANSWER' | translate }}</label>
            <textarea [id]="'ans-' + r.id" rows="3" maxlength="2000" [ngModel]="answers()[r.id] ?? ''"
                      (ngModelChange)="setAnswer(r.id, $event)" [disabled]="busyId() === r.id"></textarea>
            <button type="button" class="btn primary" (click)="send(r)"
                    [disabled]="busyId() === r.id || !(answers()[r.id] ?? '').trim()">
              {{ (busyId() === r.id ? 'REPORT.SENDING' : 'MY_REPORTS.SEND_ANSWER') | translate }}
            </button>
          </div>

          <ul class="thread" *ngIf="r.timeline.length > 0">
            <li *ngFor="let e of r.timeline">
              <span class="when">{{ e.createdAt | date:'medium' }} · {{ 'MY_REPORTS.EVENT.' + e.type | translate }}</span>
              <span class="pre">{{ e.note }}</span>
            </li>
          </ul>
        </li>
      </ul>

      <div class="pagination" *ngIf="!loading() && !failed() && totalPages() > 1">
        <button type="button" [disabled]="page() <= 1" (click)="goTo(page() - 1)" [attr.aria-label]="'COMMON.PREVIOUS' | translate">‹</button>
        <span>{{ page() }} / {{ totalPages() }}</span>
        <button type="button" [disabled]="page() >= totalPages()" (click)="goTo(page() + 1)" [attr.aria-label]="'COMMON.NEXT' | translate">›</button>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: clamp(1rem, 3vw, 2rem); max-width: 860px; margin: 0 auto; }
    .page-header h1 { margin: 0 0 .3rem; color: var(--text-strong); font-family: var(--font-display); font-size: clamp(1.5rem, 2.6vw, 2rem); }
    .page-header p { margin: 0 0 1rem; color: var(--gray-500); }
    .list { list-style: none; margin: 0; padding: 0; display: grid; gap: .8rem; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 1rem; display: grid; gap: .5rem; }
    .banner { margin: 0 0 1rem; padding: .7rem .9rem; border-radius: 12px; font-weight: 700; background: var(--warning-soft, #fef3c7); color: var(--warning, #92400e); }
    .card--focus { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft, rgba(99,102,241,.25)); }
    .card__head { display: flex; justify-content: space-between; gap: .8rem; align-items: flex-start; }
    .card h2 { margin: .1rem 0 0; font-size: 1.05rem; overflow-wrap: anywhere; }
    .card h2 a { color: var(--text-strong); text-decoration: none; }
    .ref { font-size: .8rem; color: var(--gray-500); }
    .muted { margin: 0; color: var(--gray-500); font-size: var(--text-sm, .875rem); }
    .pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; color: var(--gray-700); }
    .chip { font-size: .78rem; font-weight: 700; border-radius: 999px; padding: .3rem .65rem; background: var(--gray-100); color: var(--gray-700); white-space: nowrap; }
    .chip[data-status='NeedsYourInfo'] { background: var(--warning-soft, #fef3c7); color: var(--warning, #92400e); }
    .chip[data-status='Closed'] { background: var(--success-soft); color: var(--success); }
    .result { margin: 0; padding: .6rem .8rem; border-radius: 12px; background: var(--gray-100); color: var(--gray-800, inherit); }
    .ask { display: grid; gap: .45rem; border-top: 1px solid var(--border); padding-top: .7rem; }
    .ask textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--border); border-radius: 10px; padding: .55rem; font: inherit; font-size: 16px; background: var(--surface); color: var(--gray-900, inherit); }
    .thread { list-style: none; margin: 0; padding: 0; display: grid; gap: .5rem; }
    .thread li { border-inline-start: 3px solid var(--border); padding-inline-start: .7rem; display: grid; gap: .1rem; }
    .when { font-size: .78rem; color: var(--gray-500); }
    .btn { border: 0; border-radius: 10px; padding: .6rem 1rem; font: inherit; font-weight: 700; cursor: pointer; background: var(--gray-100); min-height: 44px; justify-self: start; }
    .btn.primary { background: var(--primary); color: var(--on-primary); }
    .btn:disabled { opacity: .5; cursor: not-allowed; }
    .state { padding: 2rem; text-align: center; background: var(--surface); border: 1px dashed var(--gray-300); border-radius: 16px; }
    .state.error { color: var(--danger); }
    .pagination { display: flex; justify-content: center; align-items: center; gap: 1rem; margin-top: 1.25rem; }
    .pagination button { border: 1px solid var(--border); background: var(--surface); border-radius: var(--r-sm); width: 36px; height: 36px; cursor: pointer; }
    .pagination button:disabled { opacity: .4; cursor: not-allowed; }
  `]
})
export class MyListingReportsPage implements OnInit {
  private readonly api = inject(ListingReportsService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  /** The report a notification opened this page on; shown first even if it is not on page 1. */
  readonly focusId = this.route.snapshot.paramMap.get('id');

  readonly pageSize = 10;
  readonly reports = signal<MyListingReportDto[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly answers = signal<Record<string, string>>({});
  readonly waitingCount = computed(() => this.reports().filter(r => r.status === 'NeedsYourInfo').length);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    const focus$ = this.focusId && this.page() === 1
      ? this.api.get(this.focusId).pipe(catchError(() => of(null)))
      : of(null);
    forkJoin({ list: this.api.mine(this.page(), this.pageSize), focus: focus$ })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: ({ list, focus }) => {
          // Waiting-for-answer reports come first, then the one the notification opened, then the rest.
          const rest = focus ? list.items.filter(r => r.id !== focus.id) : list.items;
          const items = focus ? [focus, ...rest] : [...rest];
          this.reports.set(items.sort((a, b) => Number(b.id === this.focusId) - Number(a.id === this.focusId)
            || Number(b.status === 'NeedsYourInfo') - Number(a.status === 'NeedsYourInfo')));
          this.total.set(list.total);
          this.loading.set(false);
          this.scrollToFocus();
        },
        error: () => { this.loading.set(false); this.failed.set(true); }
      });
  }

  /** After render: bring the opened report into view and put the cursor in its answer box. */
  private scrollToFocus(): void {
    if (!this.focusId) return;
    setTimeout(() => {
      const card = document.getElementById('report-' + this.focusId);
      card?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
      (document.getElementById('ans-' + this.focusId) as HTMLTextAreaElement | null)?.focus({ preventScroll: true });
    }, 0);
  }

  goTo(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.totalPages()));
    this.load();
  }

  setAnswer(id: string, value: string): void {
    this.answers.update(a => ({ ...a, [id]: value }));
  }

  send(report: MyListingReportDto): void {
    const message = (this.answers()[report.id] ?? '').trim();
    if (!message || this.busyId()) return;

    this.busyId.set(report.id);
    this.api.respond(report.id, message).subscribe({
      next: updated => {
        this.reports.update(list => list.map(r => (r.id === updated.id ? updated : r)));
        this.answers.update(a => ({ ...a, [report.id]: '' }));
        this.busyId.set(null);
        this.toast.success(this.translate.instant('MY_REPORTS.ANSWER_SENT'));
      },
      error: err => {
        this.busyId.set(null);
        this.toast.error(this.translate.instant(isRateLimited(err) ? 'REPORT.ERR_RATE' : 'MY_REPORTS.ANSWER_FAILED'));
      }
    });
  }

  trackById(_: number, r: { id: string }): string { return r.id; }
}
