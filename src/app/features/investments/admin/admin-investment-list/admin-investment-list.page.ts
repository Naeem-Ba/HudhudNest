// =============================================================
// src/app/features/investments/admin/admin-investment-list/admin-investment-list.page.ts
//
// Admin Investment Portal — project list (Phase 2 §5). Server-side search/status/type
// filtering + pagination via GET /api/admin/investments/projects. Every row across every
// lifecycle status (the public list only ever shows Published).
// =============================================================

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AdminInvestmentApiService } from '../../../../core/api/admin-investment-api.service';
import { AdminInvestmentProjectListItem, InvestmentProjectStatus, InvestmentProjectType } from '../../../../core/models/investment.model';
import { ToastService } from '../../../../shared/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/ui/loading-spinner.component';
import { EmptyStateComponent } from '../../../../shared/ui/empty-state.component';

const ALL_STATUSES: InvestmentProjectStatus[] = [
  'Draft', 'UnderReview', 'Approved', 'Scheduled', 'Published', 'Closed', 'Rejected', 'Suspended'
];
const ALL_TYPES: InvestmentProjectType[] = [
  'Residential', 'Commercial', 'Mixed', 'Industrial', 'Land', 'Renovation', 'NewConstruction'
];

@Component({
  selector: 'app-admin-investment-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, FormsModule, TranslateModule, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <section class="page">
      <header class="page-header">
        <div>
          <h1>{{ 'ADMIN_INVESTMENTS.LIST.TITLE' | translate }}</h1>
          <p>{{ 'ADMIN_INVESTMENTS.LIST.SUBTITLE' | translate }}</p>
        </div>
        <button type="button" class="btn btn--primary" (click)="goToCreate()">
          {{ 'ADMIN_INVESTMENTS.LIST.NEW_PROJECT' | translate }}
        </button>
      </header>

      <div class="filters">
        <input
          type="search"
          class="search-input"
          [placeholder]="'ADMIN_INVESTMENTS.LIST.SEARCH_PLACEHOLDER' | translate"
          [(ngModel)]="searchTerm"
          (ngModelChange)="onSearchChange($event)"
        />

        <select [(ngModel)]="statusFilter" (change)="applyFilters()">
          <option value="">{{ 'ADMIN_INVESTMENTS.LIST.ALL_STATUSES' | translate }}</option>
          <option *ngFor="let status of statuses" [value]="status">
            {{ ('INVESTMENTS.STATUS.' + status.toUpperCase()) | translate }}
          </option>
        </select>

        <select [(ngModel)]="typeFilter" (change)="applyFilters()">
          <option value="">{{ 'ADMIN_INVESTMENTS.LIST.ALL_TYPES' | translate }}</option>
          <option *ngFor="let type of types" [value]="type">
            {{ ('INVESTMENTS.PROJECT_TYPE.' + type.toUpperCase()) | translate }}
          </option>
        </select>
      </div>

      <app-loading-spinner *ngIf="loading()" [label]="'COMMON.LOADING' | translate"></app-loading-spinner>

      <app-empty-state
        *ngIf="!loading() && projects().length === 0"
        icon="🏗️"
        [title]="'ADMIN_INVESTMENTS.LIST.EMPTY_TITLE' | translate"
        [message]="'ADMIN_INVESTMENTS.LIST.EMPTY_MESSAGE' | translate"
      ></app-empty-state>

      <div class="projects-table" *ngIf="!loading() && projects().length > 0">
        <div class="row row--head">
          <span>{{ 'ADMIN_INVESTMENTS.LIST.COL_TITLE' | translate }}</span>
          <span>{{ 'ADMIN_INVESTMENTS.LIST.COL_TYPE' | translate }}</span>
          <span>{{ 'ADMIN_INVESTMENTS.LIST.COL_STATUS' | translate }}</span>
          <span>{{ 'ADMIN_INVESTMENTS.LIST.COL_FUNDING' | translate }}</span>
          <span>{{ 'ADMIN_INVESTMENTS.LIST.COL_CREATED' | translate }}</span>
          <span>{{ 'ADMIN_INVESTMENTS.LIST.COL_ACTIONS' | translate }}</span>
        </div>

        <div class="row" *ngFor="let project of projects(); trackBy: trackById">
          <span [attr.data-label]="'ADMIN_INVESTMENTS.LIST.COL_TITLE' | translate">
            {{ project.title }}
            <code class="project-id">{{ project.id }}</code>
          </span>
          <span [attr.data-label]="'ADMIN_INVESTMENTS.LIST.COL_TYPE' | translate" class="muted">
            {{ ('INVESTMENTS.PROJECT_TYPE.' + project.projectType.toUpperCase()) | translate }}
          </span>
          <span [attr.data-label]="'ADMIN_INVESTMENTS.LIST.COL_STATUS' | translate">
            <span class="status-chip" [class]="'status-chip--' + project.status.toLowerCase()">
              {{ ('INVESTMENTS.STATUS.' + project.status.toUpperCase()) | translate }}
            </span>
          </span>
          <span [attr.data-label]="'ADMIN_INVESTMENTS.LIST.COL_FUNDING' | translate" class="muted">
            {{ formatAmount(project.raisedAmount) }} / {{ formatAmount(project.targetAmount) }}
          </span>
          <span [attr.data-label]="'ADMIN_INVESTMENTS.LIST.COL_CREATED' | translate" class="muted">
            {{ project.createdAt | date:'mediumDate' }}
          </span>
          <span [attr.data-label]="'ADMIN_INVESTMENTS.LIST.COL_ACTIONS' | translate" class="actions">
            <button type="button" class="btn btn--outline" (click)="openDetails(project)">
              {{ 'ADMIN_INVESTMENTS.LIST.VIEW' | translate }}
            </button>
          </span>
        </div>
      </div>

      <div class="pagination" *ngIf="!loading() && totalPages() > 1">
        <button type="button" [disabled]="page() <= 1" (click)="goToPage(page() - 1)">‹</button>
        <span>{{ page() }} / {{ totalPages() }}</span>
        <button type="button" [disabled]="page() >= totalPages()" (click)="goToPage(page() + 1)">›</button>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: clamp(1rem, 3vw, 2rem); max-width: 1280px; margin: 0 auto; }
    .page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; margin-bottom:1.25rem; flex-wrap:wrap; }
    .page-header h1 { margin:0 0 .3rem; color:var(--navy); font-family:var(--font-display); font-size:clamp(1.5rem,2.6vw,2rem); }
    .page-header p { margin:0; color:var(--gray-500); }

    .filters { display:flex; flex-wrap:wrap; gap:.6rem; margin-bottom:1rem; }
    .filters select, .search-input {
      /* 16px صريح — بدون هذا كانت ترث خط المتصفح الافتراضي لعناصر النموذج (أقل من
         16px)، فيُشغّل تكبير iOS Safari التلقائي عند التركيز على حقل البحث. */
      border:1px solid var(--border); border-radius:var(--r-md); padding:.5rem .8rem; background:var(--surface); font-size:16px;
    }
    .search-input { flex: 1 1 220px; min-width: 180px; }

    .projects-table { display:flex; flex-direction:column; gap:.5rem; }
    .row {
      display:grid; grid-template-columns: 1.8fr 1.1fr 1fr 1.3fr 1fr 1fr; gap:1rem; align-items:center;
      background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md);
      padding:.85rem 1rem;
    }
    .row--head { background:transparent; border:0; color:var(--gray-500); font-size:var(--text-sm); font-weight:600; padding:0 1rem; }
    .muted { color:var(--gray-400); font-size: var(--text-sm); }
    .project-id { display:block; font-size: .7rem; color: var(--gray-400); margin-top: .15rem; }

    .status-chip {
      display:inline-flex; align-items:center; border-radius:var(--r-pill); padding:.15rem .6rem;
      font-size:var(--text-xs); font-weight:600; background: var(--gray-100); color: var(--gray-600);
    }
    .status-chip--published { background: var(--success-soft, #dcfce7); color: var(--success, #16a34a); }
    .status-chip--draft { background: var(--gray-100); color: var(--gray-500); }
    .status-chip--underreview, .status-chip--scheduled { background: #fef3c7; color: #b45309; }
    .status-chip--approved { background: #dbeafe; color: #1d4ed8; }
    .status-chip--rejected, .status-chip--suspended { background: var(--danger-soft); color: var(--danger); }
    .status-chip--closed { background: var(--gray-200, #e5e7eb); color: var(--gray-600); }

    .actions { display:flex; gap:.4rem; align-items:center; flex-wrap:wrap; }
    .btn { border-radius:var(--r-sm); padding:.4rem .75rem; font-size:var(--text-sm); cursor:pointer; border:1px solid transparent; font-weight:600; }
    .btn--outline { background:var(--surface); border-color:var(--border); color:var(--navy); }
    .btn--primary { background: var(--primary); color: #fff; }
    .btn:disabled { opacity:.6; cursor:not-allowed; }

    .pagination { display:flex; justify-content:center; align-items:center; gap:1rem; margin-top:1.25rem; }
    .pagination button { border:1px solid var(--border); background:var(--surface); border-radius:var(--r-sm); width:34px; height:34px; cursor:pointer; }
    .pagination button:disabled { opacity:.4; cursor:not-allowed; }

    @media (max-width: 980px) {
      .row { grid-template-columns: 1fr; }
      .row--head { display:none; }
      .row span[data-label]::before { content: attr(data-label) ": "; font-weight:700; color:var(--gray-500); }
    }
  `]
})
export class AdminInvestmentListPage implements OnInit {
  private readonly api = inject(AdminInvestmentApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly statuses = ALL_STATUSES;
  readonly types = ALL_TYPES;

  readonly projects = signal<AdminInvestmentProjectListItem[]>([]);
  readonly loading = signal(true);
  readonly page = signal(1);
  readonly totalPages = signal(1);

  searchTerm = '';
  statusFilter = '';
  typeFilter = '';

  private readonly pageSize = 20;
  private readonly searchChanges = new Subject<string>();

  ngOnInit(): void {
    this.searchChanges
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyFilters());

    this.load();
  }

  onSearchChange(value: string): void {
    this.searchChanges.next(value);
  }

  applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  load(): void {
    this.loading.set(true);

    this.api
      .getProjects({
        search: this.searchTerm || undefined,
        status: (this.statusFilter || undefined) as InvestmentProjectStatus | undefined,
        projectType: (this.typeFilter || undefined) as InvestmentProjectType | undefined,
        page: this.page(),
        pageSize: this.pageSize
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.projects.set(result.items);
          this.totalPages.set(result.totalPages);
          this.loading.set(false);
        },
        error: () => {
          this.toast.error(this.translate.instant('ADMIN_INVESTMENTS.LIST.LOAD_ERROR'));
          this.loading.set(false);
        }
      });
  }

  goToPage(page: number): void {
    this.page.set(page);
    this.load();
  }

  goToCreate(): void {
    this.router.navigate(['/admin/investments/new']);
  }

  openDetails(project: AdminInvestmentProjectListItem): void {
    this.router.navigate(['/admin/investments', project.id]);
  }

  formatAmount(value: number): string {
    return new Intl.NumberFormat('en').format(value);
  }

  trackById(_: number, project: AdminInvestmentProjectListItem): string {
    return project.id;
  }
}
