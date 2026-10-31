// =============================================================
// src/app/admin/audit-logs/admin-audit-logs.page.ts
//
// سجل التدقيق للمشرف (المرحلة 14، D06): من فعل ماذا ومتى، مع فلتر بالفعل والمدة
// وبحث نصي. قراءة فقط. الخادم يقنّع عنوان IP ويقصّ القيم الطويلة، فلا يُعرض هنا
// إلا ما وصل منه. الأفعال الإدارية التي لا تملك سطراً خاصاً تُسجَّل باسم
// «Admin.<Controller>.<Action>».
// =============================================================

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AdminAuditLogEntry, AdminAuditLogsService } from '../../core/api/admin-audit-logs.service';
import { ToastService } from '../../shared/services/toast.service';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';

@Component({
  selector: 'app-admin-audit-logs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, FormsModule, TranslateModule, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <section class="page">
      <header class="page-header">
        <h1>{{ 'ADMIN_AUDIT.TITLE' | translate }}</h1>
        <p>{{ 'ADMIN_AUDIT.SUBTITLE' | translate }}</p>
      </header>

      <form class="filters" (ngSubmit)="applyFilters()">
        <input type="search" name="search" class="field" [(ngModel)]="search" [placeholder]="'ADMIN_AUDIT.SEARCH' | translate" maxlength="100" />
        <input type="text" name="action" class="field" [(ngModel)]="action" [placeholder]="'ADMIN_AUDIT.ACTION' | translate" maxlength="100" />
        <label class="date-field">{{ 'ADMIN_AUDIT.FROM' | translate }}
          <input type="date" name="from" class="field" [(ngModel)]="from" />
        </label>
        <label class="date-field">{{ 'ADMIN_AUDIT.TO' | translate }}
          <input type="date" name="to" class="field" [(ngModel)]="to" />
        </label>
        <button type="submit" class="btn btn--primary">{{ 'ADMIN_AUDIT.APPLY' | translate }}</button>
      </form>

      <app-loading-spinner *ngIf="loading()" [label]="'COMMON.LOADING' | translate"></app-loading-spinner>

      <app-empty-state
        *ngIf="!loading() && !error() && items().length === 0"
        [title]="'ADMIN_AUDIT.EMPTY' | translate"
      ></app-empty-state>

      <p class="error" *ngIf="error()" role="alert">{{ 'ADMIN_AUDIT.LOAD_ERROR' | translate }}</p>

      <div class="rows" *ngIf="!loading() && items().length > 0" data-testid="audit-rows">
        <article class="row" *ngFor="let e of items(); trackBy: trackById">
          <div class="row__main">
            <strong class="action">{{ e.action }}</strong>
            <span class="muted">{{ e.timestamp | date:'medium' }}</span>
          </div>
          <div class="row__meta">
            <span>{{ 'ADMIN_AUDIT.BY' | translate }}: <strong>{{ e.userName || e.userId || '—' }}</strong></span>
            <span class="muted" *ngIf="e.ipAddress">IP {{ e.ipAddress }}</span>
          </div>
          <details *ngIf="e.newValue || e.oldValue">
            <summary>{{ 'ADMIN_AUDIT.DETAILS' | translate }}</summary>
            <pre *ngIf="e.oldValue"><span class="muted">{{ 'ADMIN_AUDIT.BEFORE' | translate }}</span>{{ '\n' + e.oldValue }}</pre>
            <pre *ngIf="e.newValue"><span class="muted">{{ 'ADMIN_AUDIT.AFTER' | translate }}</span>{{ '\n' + e.newValue }}</pre>
          </details>
        </article>
      </div>

      <div class="pagination" *ngIf="!loading() && totalPages() > 1">
        <button type="button" [disabled]="page() <= 1" (click)="goToPage(page() - 1)">‹</button>
        <span>{{ page() }} / {{ totalPages() }}</span>
        <button type="button" [disabled]="page() >= totalPages()" (click)="goToPage(page() + 1)">›</button>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: clamp(1rem, 3vw, 2rem); max-width: 1000px; margin: 0 auto; }
    .page-header h1 { margin: 0 0 .3rem; color: var(--navy); font-family: var(--font-display); font-size: clamp(1.5rem, 2.6vw, 2rem); }
    .page-header p { margin: 0 0 1rem; color: var(--gray-500); }
    .filters { display: flex; flex-wrap: wrap; gap: .6rem; margin-bottom: 1rem; align-items: flex-end; }
    .field { border: 1px solid var(--border); border-radius: var(--r-md); padding: .5rem .8rem; background: var(--surface); font-size: 16px; }
    .date-field { display: grid; gap: .15rem; font-size: var(--text-xs); color: var(--gray-500); }
    .rows { display: grid; gap: .5rem; }
    .row { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md); padding: .8rem 1rem; display: grid; gap: .3rem; }
    .row__main, .row__meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .5rem 1rem; }
    .action { color: var(--navy); word-break: break-all; }
    .muted { color: var(--gray-400); font-size: var(--text-sm); }
    pre { margin: .3rem 0 0; white-space: pre-wrap; word-break: break-word; font-size: var(--text-xs); background: var(--gray-100); padding: .5rem; border-radius: var(--r-sm); }
    .error { color: var(--danger); }
    .btn { border-radius: var(--r-sm); padding: .5rem .9rem; font-size: var(--text-sm); cursor: pointer; border: 1px solid transparent; font-weight: 600; }
    .btn--primary { background: var(--primary); color: var(--on-primary); }
    .pagination { display: flex; justify-content: center; align-items: center; gap: 1rem; margin-top: 1.25rem; }
    .pagination button { border: 1px solid var(--border); background: var(--surface); border-radius: var(--r-sm); width: 34px; height: 34px; cursor: pointer; }
    .pagination button:disabled { opacity: .4; cursor: not-allowed; }
  `]
})
export class AdminAuditLogsPage implements OnInit {
  private readonly logs = inject(AdminAuditLogsService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly items = signal<AdminAuditLogEntry[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly page = signal(1);
  readonly totalPages = signal(1);

  search = '';
  action = '';
  from = '';
  to = '';

  private readonly pageSize = 50;

  ngOnInit(): void {
    this.load();
  }

  trackById = (_: number, e: AdminAuditLogEntry) => e.id;

  applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  goToPage(page: number): void {
    this.page.set(page);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);

    this.logs
      .search(this.page(), this.pageSize, {
        search: this.search.trim() || undefined,
        action: this.action.trim() || undefined,
        // التاريخ يوم كامل: من بداية يوم «من» إلى نهاية يوم «إلى» (UTC).
        from: this.from ? `${this.from}T00:00:00Z` : undefined,
        to: this.to ? `${this.to}T23:59:59Z` : undefined
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.items.set(result.items);
          this.totalPages.set(result.totalPages);
          this.loading.set(false);
        },
        error: () => {
          this.items.set([]);
          this.error.set(true);
          this.loading.set(false);
          this.toast.error(this.translate.instant('ADMIN_AUDIT.LOAD_ERROR'));
        }
      });
  }
}
