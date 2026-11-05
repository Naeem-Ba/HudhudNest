import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable } from 'rxjs';

import { AdminListingReportsService } from '../../core/api/admin-listing-reports.service';
import {
  AdminAssigneeDto,
  AdminListingReportDetailDto,
  AdminListingReportEventDto,
  ListingReportOutcome,
  ListingReportPriority,
  REPORT_OUTCOMES,
  REPORT_PRIORITIES,
  isReportOpen
} from '../../core/models/listing-report.model';
import { ToastService } from '../../shared/services/toast.service';
import { ConfirmModalComponent } from '../../shared/ui/confirm-modal.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';
import { LocalizedNumberPipe } from '../../shared/pipes/localized-number.pipe';

type Mode = 'note' | 'info' | 'action' | 'close' | 'takedown' | 'restore' | 'reopen' | null;

/**
 * One listing report for a moderator: the report, the listing as it is now, the reporter's track
 * record, other reports on the same listing, and the full timeline (internal entries marked).
 * The report and the action on the listing are separate on purpose: closing a report never
 * touches the listing, and taking a listing down is its own confirmed step with a reason the
 * owner will see. The reporter never learns more than "action taken / no violation found".
 */
@Component({
  selector: 'app-admin-listing-report-detail-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ LocalizedDatePipe, LocalizedNumberPipe,CommonModule, FormsModule, RouterLink, TranslateModule, ConfirmModalComponent, LoadingSpinnerComponent],
  template: `
    <section class="page">
      <a class="back" routerLink="/admin/listing-reports">{{ 'ADMIN_REPORTS.BACK' | translate }}</a>

      <app-loading-spinner *ngIf="loading()" [label]="'COMMON.LOADING' | translate"></app-loading-spinner>
      <div class="state error" *ngIf="!loading() && failed()" role="alert">
        <p>{{ 'ADMIN_REPORTS.LOAD_ERROR' | translate }}</p>
        <button type="button" class="btn" (click)="load()">{{ 'COMMON.RETRY' | translate }}</button>
      </div>

      <ng-container *ngIf="detail() as d">
        <header class="head">
          <div>
            <span class="muted" dir="ltr">{{ d.summary.referenceNumber }}</span>
            <h1>{{ d.summary.listingTitle }}</h1>
            <p class="muted">{{ 'REPORT.REASON.' + d.summary.reason | translate }} · {{ d.summary.createdAt | localDate:'medium' }}</p>
          </div>
          <div class="chips">
            <span class="chip" [attr.data-status]="d.summary.status">{{ 'ADMIN_REPORTS.STATUS.' + d.summary.status | translate }}</span>
            <span class="chip" [attr.data-priority]="d.summary.priority">{{ 'ADMIN_REPORTS.PRIORITY.' + d.summary.priority | translate }}</span>
            <span class="chip chip--overdue" *ngIf="d.summary.isOverdue">{{ 'ADMIN_REPORTS.OVERDUE' | translate }}</span>
          </div>
        </header>

        <div class="signal" *ngIf="d.distinctOpenReportersOnListing > 1" data-testid="multi-reporter-signal">
          {{ 'ADMIN_REPORTS.SIGNAL' | translate:{ reporters: d.distinctOpenReportersOnListing, reports: d.openReportsOnListing } }}
        </div>

        <div class="grid">
          <div class="col">
            <section class="card">
              <h2>{{ 'ADMIN_REPORTS.REPORT' | translate }}</h2>
              <dl>
                <dt>{{ 'ADMIN_REPORTS.REASON' | translate }}</dt><dd>{{ 'REPORT.REASON.' + d.summary.reason | translate }}</dd>
                <dt>{{ 'ADMIN_REPORTS.DETAILS' | translate }}</dt>
                <dd class="pre">{{ d.details || ('ADMIN_REPORTS.NO_DETAILS' | translate) }}</dd>
                <dt>{{ 'ADMIN_REPORTS.TITLE_AT_REPORT' | translate }}</dt><dd>{{ d.listingTitleAtReport }}</dd>
                <dt>{{ 'ADMIN_REPORTS.REVIEW_DUE' | translate }}</dt><dd>{{ d.reviewDueAt | localDate:'medium' }}</dd>
                <ng-container *ngIf="d.infoRequest"><dt>{{ 'ADMIN_REPORTS.INFO_ASKED' | translate }}</dt><dd class="pre">{{ d.infoRequest }}</dd></ng-container>
                <ng-container *ngIf="d.reopenCount > 0"><dt>{{ 'ADMIN_REPORTS.REOPENED' | translate }}</dt><dd>{{ d.reopenCount }}</dd></ng-container>
              </dl>
              <div class="reply" *ngIf="latestReply(d) as reply" data-testid="reporter-reply">
                <strong>{{ 'ADMIN_REPORTS.REPORTER_REPLY' | translate }}</strong>
                <span class="muted">{{ reply.createdAt | localDate:'medium' }}</span>
                <p class="pre">{{ reply.note }}</p>
              </div>
              <div class="decision" *ngIf="d.outcome" data-testid="decision">
                <strong>{{ 'ADMIN_REPORTS.OUTCOME.' + d.outcome | translate }}</strong>
                <p class="pre" *ngIf="d.resolutionNote">{{ d.resolutionNote }}</p>
                <span class="muted" *ngIf="d.resolvedByName">{{ d.resolvedByName }} · {{ d.resolvedAt | localDate:'medium' }}</span>
              </div>
            </section>

            <section class="card" *ngIf="d.listing as l">
              <h2>{{ 'ADMIN_REPORTS.LISTING' | translate }}</h2>
              <dl>
                <dt>{{ 'ADMIN_REPORTS.CURRENT_TITLE' | translate }}</dt>
                <dd><a *ngIf="!l.isDeleted" [routerLink]="['/properties', l.id]">{{ l.currentTitle }}</a><span *ngIf="l.isDeleted">{{ l.currentTitle }}</span></dd>
                <dt>{{ 'ADMIN_REPORTS.OWNER' | translate }}</dt>
                <dd><a [routerLink]="['/admin/users', l.ownerId]">{{ l.ownerName }}</a></dd>
                <dt>{{ 'ADMIN_REPORTS.VISIBILITY' | translate }}</dt>
                <dd>
                  <span class="tag tag--ok" *ngIf="l.isPubliclyVisible">{{ 'ADMIN_REPORTS.VISIBLE' | translate }}</span>
                  <span class="tag tag--warn" *ngIf="!l.isPubliclyVisible">{{ 'ADMIN_REPORTS.NOT_VISIBLE' | translate }}</span>
                  <span class="tag tag--warn" *ngIf="l.isTakenDown">{{ 'ADMIN_REPORTS.TAKEN_DOWN' | translate }}</span>
                  <span class="tag tag--warn" *ngIf="l.isDeleted">{{ 'ADMIN_REPORTS.LISTING_DELETED' | translate }}</span>
                </dd>
                <ng-container *ngIf="l.takenDownReason"><dt>{{ 'ADMIN_REPORTS.TAKEDOWN_REASON' | translate }}</dt><dd class="pre">{{ l.takenDownReason }}</dd></ng-container>
                <ng-container *ngIf="l.price !== null"><dt>{{ 'ADMIN_REPORTS.PRICE' | translate }}</dt><dd dir="ltr">{{ l.price | localNumber }} {{ l.currencyCode }}</dd></ng-container>
                <ng-container *ngIf="l.city"><dt>{{ 'ADMIN_REPORTS.CITY' | translate }}</dt><dd>{{ l.city }}</dd></ng-container>
                <ng-container *ngIf="l.publishedAt"><dt>{{ 'ADMIN_REPORTS.PUBLISHED' | translate }}</dt><dd>{{ l.publishedAt | localDate:'mediumDate' }}</dd></ng-container>
              </dl>
            </section>
            <section class="card" *ngIf="!d.listing">
              <h2>{{ 'ADMIN_REPORTS.LISTING' | translate }}</h2>
              <p class="muted">{{ 'ADMIN_REPORTS.LISTING_GONE' | translate }}</p>
            </section>

            <section class="card">
              <h2>{{ 'ADMIN_REPORTS.REPORTER' | translate }}</h2>
              <p><a [routerLink]="['/admin/users', d.reporter.id]">{{ d.reporter.name }}</a></p>
              <p class="muted">{{ 'ADMIN_REPORTS.REPORTER_STATS' | translate:{ total: d.reporter.totalReports, dismissed: d.reporter.dismissedReports } }}</p>
              <small class="muted">{{ 'ADMIN_REPORTS.REPORTER_PRIVATE' | translate }}</small>
            </section>

            <section class="card" *ngIf="d.relatedReports.length > 0">
              <h2>{{ 'ADMIN_REPORTS.RELATED' | translate }}</h2>
              <ul class="related">
                <li *ngFor="let r of d.relatedReports; trackBy: trackById">
                  <a [routerLink]="['/admin/listing-reports', r.id]" dir="ltr">{{ r.referenceNumber }}</a>
                  <span>{{ 'REPORT.REASON.' + r.reason | translate }}</span>
                  <span class="muted">{{ 'ADMIN_REPORTS.STATUS.' + r.status | translate }}</span>
                  <span class="tag" *ngIf="r.sameReporter">{{ 'ADMIN_REPORTS.SAME_REPORTER' | translate }}</span>
                </li>
              </ul>
            </section>
          </div>

          <div class="col">
            <section class="card actions" data-testid="actions">
              <h2>{{ 'ADMIN_REPORTS.ACTIONS' | translate }}</h2>

              <div class="row-ctl">
                <label for="rp-assignee">{{ 'ADMIN_REPORTS.ASSIGNEE' | translate }}</label>
                <select id="rp-assignee" [ngModel]="d.summary.assignedAdminId || ''" (ngModelChange)="assign($event)" [disabled]="busy()">
                  <option value="">{{ 'ADMIN_REPORTS.UNASSIGNED' | translate }}</option>
                  <option *ngFor="let a of assignees()" [value]="a.id">{{ a.name }}</option>
                </select>
              </div>
              <div class="row-ctl">
                <label for="rp-priority">{{ 'ADMIN_REPORTS.F_PRIORITY' | translate }}</label>
                <select id="rp-priority" [ngModel]="d.summary.priority" (ngModelChange)="changePriority($event)" [disabled]="busy()">
                  <option *ngFor="let p of priorities" [value]="p">{{ 'ADMIN_REPORTS.PRIORITY.' + p | translate }}</option>
                </select>
              </div>

              <div class="btns">
                <button type="button" class="btn primary" *ngIf="d.summary.status === 'New'" [disabled]="busy()" (click)="startReview()">{{ 'ADMIN_REPORTS.A_START' | translate }}</button>
                <button type="button" class="btn" (click)="open('note')">{{ 'ADMIN_REPORTS.A_NOTE' | translate }}</button>
                <ng-container *ngIf="isOpen()">
                  <button type="button" class="btn" (click)="open('info')">{{ 'ADMIN_REPORTS.A_INFO' | translate }}</button>
                  <button type="button" class="btn" (click)="open('action')">{{ 'ADMIN_REPORTS.A_ACTION_REQUIRED' | translate }}</button>
                  <button type="button" class="btn primary" (click)="open('close')">{{ 'ADMIN_REPORTS.A_CLOSE' | translate }}</button>
                </ng-container>
                <button type="button" class="btn" *ngIf="!isOpen()" (click)="open('reopen')">{{ 'ADMIN_REPORTS.A_REOPEN' | translate }}</button>
              </div>

              <div class="btns btns--danger" *ngIf="d.listing as l">
                <button type="button" class="btn danger" *ngIf="!l.isTakenDown && !l.isDeleted" (click)="open('takedown')">{{ 'ADMIN_REPORTS.A_TAKEDOWN' | translate }}</button>
                <button type="button" class="btn" *ngIf="l.isTakenDown && !l.isDeleted" (click)="open('restore')">{{ 'ADMIN_REPORTS.A_RESTORE' | translate }}</button>
              </div>

              <form class="panel" *ngIf="mode() === 'note'" (ngSubmit)="submit()">
                <label for="rp-note">{{ 'ADMIN_REPORTS.NOTE_LABEL' | translate }}</label>
                <textarea id="rp-note" name="note" rows="3" maxlength="2000" [(ngModel)]="text"></textarea>
                <small class="muted">{{ 'ADMIN_REPORTS.NOTE_HINT' | translate }}</small>
                <button type="submit" class="btn primary" [disabled]="busy() || !text.trim()">{{ 'COMMON.SAVE' | translate }}</button>
              </form>

              <form class="panel" *ngIf="mode() === 'info'" (ngSubmit)="submit()">
                <label for="rp-info">{{ 'ADMIN_REPORTS.INFO_LABEL' | translate }}</label>
                <textarea id="rp-info" name="info" rows="3" maxlength="2000" [(ngModel)]="text"></textarea>
                <small class="muted">{{ 'ADMIN_REPORTS.INFO_HINT' | translate }}</small>
                <button type="submit" class="btn primary" [disabled]="busy() || !text.trim()">{{ 'ADMIN_REPORTS.SEND' | translate }}</button>
              </form>

              <form class="panel" *ngIf="mode() === 'action'" (ngSubmit)="submit()">
                <label for="rp-action">{{ 'ADMIN_REPORTS.ACTION_LABEL' | translate }}</label>
                <textarea id="rp-action" name="action" rows="3" maxlength="2000" [(ngModel)]="text"></textarea>
                <button type="submit" class="btn primary" [disabled]="busy() || !text.trim()">{{ 'COMMON.SAVE' | translate }}</button>
              </form>

              <form class="panel" *ngIf="mode() === 'close'" (ngSubmit)="confirming.set(true)">
                <label for="rp-outcome">{{ 'ADMIN_REPORTS.OUTCOME_LABEL' | translate }}</label>
                <select id="rp-outcome" name="outcome" [(ngModel)]="outcome">
                  <option value="" disabled>{{ 'ADMIN_REPORTS.OUTCOME_PICK' | translate }}</option>
                  <option *ngFor="let o of outcomes" [value]="o">{{ 'ADMIN_REPORTS.OUTCOME.' + o | translate }}</option>
                </select>
                <label for="rp-close-note">{{ 'ADMIN_REPORTS.CLOSE_NOTE' | translate }}</label>
                <textarea id="rp-close-note" name="closeNote" rows="3" maxlength="2000" [(ngModel)]="text"></textarea>
                <small class="muted">{{ 'ADMIN_REPORTS.CLOSE_HINT' | translate }}</small>
                <button type="submit" class="btn primary" [disabled]="busy() || !outcome || !text.trim()">{{ 'ADMIN_REPORTS.A_CLOSE' | translate }}</button>
              </form>

              <form class="panel" *ngIf="mode() === 'takedown'" (ngSubmit)="confirming.set(true)">
                <label for="rp-td">{{ 'ADMIN_REPORTS.TAKEDOWN_LABEL' | translate }}</label>
                <textarea id="rp-td" name="td" rows="3" maxlength="1000" [(ngModel)]="text"></textarea>
                <small class="muted">{{ 'ADMIN_REPORTS.TAKEDOWN_HINT' | translate }}</small>
                <button type="submit" class="btn danger" [disabled]="busy() || !text.trim()">{{ 'ADMIN_REPORTS.A_TAKEDOWN' | translate }}</button>
              </form>

              <form class="panel" *ngIf="mode() === 'restore'" (ngSubmit)="confirming.set(true)">
                <label for="rp-rs">{{ 'ADMIN_REPORTS.RESTORE_LABEL' | translate }}</label>
                <textarea id="rp-rs" name="rs" rows="3" maxlength="1000" [(ngModel)]="text"></textarea>
                <button type="submit" class="btn primary" [disabled]="busy() || !text.trim()">{{ 'ADMIN_REPORTS.A_RESTORE' | translate }}</button>
              </form>

              <form class="panel" *ngIf="mode() === 'reopen'" (ngSubmit)="submit()">
                <label for="rp-ro">{{ 'ADMIN_REPORTS.REOPEN_LABEL' | translate }}</label>
                <textarea id="rp-ro" name="ro" rows="3" maxlength="2000" [(ngModel)]="text"></textarea>
                <button type="submit" class="btn primary" [disabled]="busy() || !text.trim()">{{ 'ADMIN_REPORTS.A_REOPEN' | translate }}</button>
              </form>
            </section>

            <section class="card">
              <h2>{{ 'ADMIN_REPORTS.TIMELINE' | translate }}</h2>
              <ol class="timeline">
                <li *ngFor="let e of d.timeline; trackBy: trackById" [class.internal]="e.isInternal">
                  <span class="when">{{ e.createdAt | localDate:'medium' }}</span>
                  <strong>{{ 'ADMIN_REPORTS.EVENT.' + e.type | translate }}</strong>
                  <span class="tag tag--internal" *ngIf="e.isInternal">{{ 'ADMIN_REPORTS.INTERNAL' | translate }}</span>
                  <span class="muted" *ngIf="e.actorName">{{ e.actorName }}</span>
                  <span class="muted" *ngIf="e.fromValue || e.toValue">{{ eventValue(e.type, e.fromValue) }} → {{ eventValue(e.type, e.toValue) }}</span>
                  <span class="pre" *ngIf="e.note">{{ e.note }}</span>
                </li>
              </ol>
            </section>
          </div>
        </div>
      </ng-container>

      <app-confirm-modal [open]="confirming()" [danger]="mode() === 'takedown'" [loading]="busy()"
                         [title]="confirmTitleKey() | translate" [confirmLabel]="confirmLabelKey() | translate"
                         (confirmed)="submit()" (cancelled)="confirming.set(false)">
        {{ confirmTextKey() | translate }}
      </app-confirm-modal>
    </section>
  `,
  styles: [`
    .reply{margin-top:.8rem;padding:.7rem .9rem;border-inline-start:4px solid var(--primary);background:var(--gold-soft,#fef3c7);border-radius:var(--r-sm)}
    .reply p{margin:.3rem 0 0}
    .page{padding:clamp(1rem,3vw,2rem);max-width:1200px;margin:0 auto}
    .back{display:inline-block;margin-bottom:.75rem;color:var(--primary-text);text-decoration:none;font-weight:700}
    .head{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1rem}
    .head h1{margin:.1rem 0;color: var(--text-strong);font-family:var(--font-display);font-size:clamp(1.4rem,2.4vw,1.9rem)}
    .head p{margin:0}
    .chips{display:flex;gap:.4rem;align-items:start;flex-wrap:wrap}
    .signal{background:var(--warning-soft,#fef3c7);color:var(--warning-text);border-radius:var(--r-md);padding:.7rem 1rem;margin-bottom:1rem;font-weight:700}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;align-items:start}
    .col{display:grid;gap:1rem;min-width:0}
    .card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:1rem 1.15rem;min-width:0}
    .card h2{margin:0 0 .6rem;font-size:1.05rem;color: var(--text-strong)}
    dl{display:grid;grid-template-columns:max-content 1fr;gap:.35rem .9rem;margin:0}
    dt{color:var(--gray-500);font-size:var(--text-sm)}
    dd{margin:0;overflow-wrap:anywhere}
    .pre{white-space:pre-wrap;overflow-wrap:anywhere}
    .muted{color:var(--gray-500);font-size:var(--text-sm)}
    .decision{margin-top:.8rem;padding:.7rem .9rem;background:var(--gray-100);border-radius:var(--r-sm)}
    .chip{font-size:.78rem;font-weight:700;border-radius:999px;padding:.25rem .6rem;background:var(--gray-100);color:var(--gray-700);white-space:nowrap}
    .chip[data-status='New']{background:var(--primary-soft);color:var(--primary-text)}
    .chip[data-status='WaitingForInformation'],.chip[data-status='ActionRequired']{background:var(--warning-soft,#fef3c7);color:var(--warning-text)}
    .chip[data-status='Resolved']{background:var(--success-soft);color:var(--success-text)}
    .chip[data-priority='High'],.chip[data-priority='Urgent'],.chip--overdue{background:var(--danger-soft);color:var(--danger-text)}
    .tag{display:inline-block;border-radius:999px;padding:.1rem .5rem;font-size:.75rem;background:var(--gray-100);margin-inline-end:.3rem}
    .tag--ok{background:var(--success-soft);color:var(--success-text)}
    .tag--warn{background:var(--danger-soft);color:var(--danger-text)}
    .tag--internal{background:var(--warning-soft,#fef3c7);color:var(--warning-text)}
    .row-ctl{display:grid;gap:.25rem;margin-bottom:.7rem}
    .row-ctl label,.panel label{font-weight:700;font-size:var(--text-sm)}
    select,textarea{border:1px solid var(--border);border-radius:var(--r-md);padding:.5rem .8rem;background:var(--surface);font:inherit;font-size:16px;width:100%}
    .btns{display:flex;flex-wrap:wrap;gap:.5rem;margin:.6rem 0}
    .btns--danger{border-top:1px dashed var(--border);padding-top:.8rem}
    .btn{border:0;border-radius:10px;padding:.55rem 1rem;font-weight:700;cursor:pointer;background:var(--gray-100);color:var(--gray-800)}
    .btn.primary{background:var(--primary);color:var(--on-primary)}
    .btn.danger{background: var(--danger-solid);color: #fff}
    .btn:disabled{opacity:.5;cursor:not-allowed}
    .panel{display:grid;gap:.5rem;margin-top:.8rem;padding:.9rem;background:var(--gray-50,var(--gray-100));border-radius:var(--r-md)}
    .related{list-style:none;margin:0;padding:0;display:grid;gap:.45rem}
    .related li{display:flex;gap:.7rem;flex-wrap:wrap;align-items:center}
    .timeline{list-style:none;margin:0;padding:0;display:grid;gap:.7rem}
    .timeline li{display:grid;gap:.15rem;padding-inline-start:.8rem;border-inline-start:3px solid var(--border)}
    .timeline li.internal{border-inline-start-color:var(--warning,#f59e0b)}
    .when{font-size:.78rem;color:var(--gray-500)}
    .state{padding:2rem;text-align:center;background:var(--surface);border:1px dashed var(--gray-300);border-radius:16px}
    .state.error{color:var(--danger-text)}
    @media (max-width:900px){.grid{grid-template-columns:1fr}dl{grid-template-columns:1fr}}
  `]
})
export class AdminListingReportDetailPage implements OnInit {
  private readonly api = inject(AdminListingReportsService);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly priorities = REPORT_PRIORITIES;
  readonly outcomes = REPORT_OUTCOMES;

  readonly detail = signal<AdminListingReportDetailDto | null>(null);
  readonly assignees = signal<AdminAssigneeDto[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly busy = signal(false);
  readonly mode = signal<Mode>(null);
  readonly confirming = signal(false);
  readonly isOpen = computed(() => {
    const d = this.detail();
    return !!d && isReportOpen(d.summary.status);
  });

  text = '';
  outcome: ListingReportOutcome | '' = '';

  ngOnInit(): void {
    this.api.assignees().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: a => this.assignees.set(a), error: () => {} });
    this.load();
  }

  load(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.failed.set(true); this.loading.set(false); return; }
    this.loading.set(true);
    this.failed.set(false);
    this.api.get(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: d => { this.detail.set(d); this.loading.set(false); },
      error: () => { this.failed.set(true); this.loading.set(false); }
    });
  }

  open(mode: Exclude<Mode, null>): void {
    this.text = '';
    this.outcome = '';
    this.mode.set(this.mode() === mode ? null : mode);
  }

  startReview(): void { this.run(id => this.api.startReview(id), 'ADMIN_REPORTS.DONE_START'); }

  assign(adminId: string): void {
    this.run(id => this.api.assign(id, adminId || null), 'ADMIN_REPORTS.DONE_ASSIGN');
  }

  changePriority(priority: ListingReportPriority): void {
    if (priority === this.detail()?.summary.priority) return;
    this.run(id => this.api.changePriority(id, priority), 'ADMIN_REPORTS.DONE_PRIORITY');
  }

  /** Runs the action behind the currently open panel. Take-down, restore and close come through a confirm modal first. */
  submit(): void {
    const text = this.text.trim();
    switch (this.mode()) {
      case 'note': if (text) this.run(id => this.api.addNote(id, text), 'ADMIN_REPORTS.DONE_NOTE'); break;
      case 'info': if (text) this.run(id => this.api.requestInfo(id, text), 'ADMIN_REPORTS.DONE_INFO'); break;
      case 'action': if (text) this.run(id => this.api.markActionRequired(id, text), 'ADMIN_REPORTS.DONE_ACTION'); break;
      case 'reopen': if (text) this.run(id => this.api.reopen(id, text), 'ADMIN_REPORTS.DONE_REOPEN'); break;
      case 'takedown': if (text) this.run(id => this.api.takeDownListing(id, text), 'ADMIN_REPORTS.DONE_TAKEDOWN'); break;
      case 'restore': if (text) this.run(id => this.api.restoreListing(id, text), 'ADMIN_REPORTS.DONE_RESTORE'); break;
      case 'close': {
        const outcome = this.outcome;
        if (text && outcome) this.run(id => this.api.close(id, outcome, text), 'ADMIN_REPORTS.DONE_CLOSE');
        break;
      }
      default: break;
    }
  }

  confirmTitleKey(): string { return `ADMIN_REPORTS.CONFIRM.${this.confirmKey()}_TITLE`; }
  confirmTextKey(): string { return `ADMIN_REPORTS.CONFIRM.${this.confirmKey()}_TEXT`; }
  confirmLabelKey(): string {
    const m = this.mode();
    return m === 'takedown' ? 'ADMIN_REPORTS.A_TAKEDOWN' : m === 'restore' ? 'ADMIN_REPORTS.A_RESTORE' : 'ADMIN_REPORTS.A_CLOSE';
  }
  private confirmKey(): string {
    const m = this.mode();
    return m === 'takedown' ? 'TAKEDOWN' : m === 'restore' ? 'RESTORE' : 'CLOSE';
  }

  private run(call: (id: string) => Observable<AdminListingReportDetailDto>, successKey: string): void {
    const id = this.detail()?.summary.id;
    if (!id || this.busy()) return;
    this.busy.set(true);
    call(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: d => {
        this.detail.set(d);
        this.busy.set(false);
        this.confirming.set(false);
        this.mode.set(null);
        this.text = '';
        this.outcome = '';
        this.toast.success(this.translate.instant(successKey));
      },
      // The error interceptor shows the server's reason (stale state, already taken down, ...).
      error: () => { this.busy.set(false); this.confirming.set(false); }
    });
  }

  /** Status and priority changes carry stable codes: show them translated. Other values are shown as stored. */
  eventValue(type: string, value: string | null): string {
    if (!value) return '–';
    if (type === 'StatusChanged') return this.translate.instant(`ADMIN_REPORTS.STATUS.${value}`);
    if (type === 'PriorityChanged') return this.translate.instant(`ADMIN_REPORTS.PRIORITY.${value}`);
    return value;
  }

  /** The reporter's most recent answer to the admin's question: shown above the timeline so it is not missed. */
  latestReply(d: AdminListingReportDetailDto): AdminListingReportEventDto | null {
    for (let i = d.timeline.length - 1; i >= 0; i--) {
      const e = d.timeline[i]!;
      if (e.type === 'ReporterResponded' && e.note) return e;
    }
    return null;
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
