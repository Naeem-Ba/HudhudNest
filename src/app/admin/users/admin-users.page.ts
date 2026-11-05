// =============================================================
// src/app/admin/users/admin-users.page.ts
//
// لوحة إدارة المستخدمين — قسم مستقل بالكامل في تنقّل المدير (انظر navbar.component.html
// و app.routes.ts)، لم يعد جزءاً من صفحة الرسائل. تغطي: البحث والفلاتر، جدول موجز
// (الخطة/الحالة/عدد الإعلانات)، إدارة الأدوار وتعطيل الحساب (كما كانت)، والانتقال إلى
// صفحة تفاصيل المستخدم (admin-user-detail.page.ts) لإدارة الخطة والإعلانات.
// =============================================================

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AdminUserDto, AdminUsersService } from '../../core/api/admin-users.service';
import { LookupsApiService } from '../../core/api/lookups-api.service';
import { PlansApiService } from '../../core/api/plans-api.service';
import { SubscriptionPlan } from '../../core/models/subscription-plan.model';
import { ToastService } from '../../shared/services/toast.service';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ LocalizedDatePipe,CommonModule, RouterModule, FormsModule, TranslateModule, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <section class="page">
      <header class="page-header">
        <div>
          <h1>{{ 'ADMIN_USERS.TITLE' | translate }}</h1>
          <p>{{ 'ADMIN_USERS.SUBTITLE' | translate }}</p>
        </div>
      </header>

      <div class="filters">
        <input
          type="search"
          class="search-input"
          [placeholder]="'ADMIN_USERS.SEARCH_PLACEHOLDER' | translate"
          [(ngModel)]="searchTerm"
          (ngModelChange)="onSearchChange($event)"
        />

        <select [(ngModel)]="roleFilter" (change)="load()" [attr.aria-label]="'ADMIN_USERS.ALL_ROLES' | translate">
          <option value="">{{ 'ADMIN_USERS.ALL_ROLES' | translate }}</option>
          <option *ngFor="let role of roles()" [value]="role">{{ role }}</option>
        </select>

        <select [(ngModel)]="planFilter" (change)="load()" [attr.aria-label]="'ADMIN_USERS.ALL_PLANS' | translate">
          <option value="">{{ 'ADMIN_USERS.ALL_PLANS' | translate }}</option>
          <option *ngFor="let plan of plans()" [value]="plan.tier">{{ plan.nameKey | translate }}</option>
        </select>

        <select [(ngModel)]="accountStatusFilter" (change)="load()" [attr.aria-label]="'ADMIN_USERS.ALL_STATUSES' | translate">
          <option value="">{{ 'ADMIN_USERS.ALL_STATUSES' | translate }}</option>
          <option value="Active">{{ 'ADMIN_USERS.STATUS_ACTIVE' | translate }}</option>
          <option value="Disabled">{{ 'ADMIN_USERS.STATUS_DISABLED' | translate }}</option>
        </select>

        <!-- ✅ إضافة: يستهلك POST /api/lookups/refresh (Admin فقط) — كان غير
             مستخدَم إطلاقاً؛ يفرّغ كاش المدن/المرافق/الفئات فوراً (10 دقائق
             صلاحية افتراضية) دون انتظار انتهائها من تلقاء نفسها. -->
        <button
          type="button"
          class="btn btn--outline"
          [disabled]="refreshingLookups()"
          (click)="refreshLookupsCache()"
        >
          {{ refreshingLookups()
              ? ('COMMON.SAVING' | translate)
              : ('ADMIN_USERS.REFRESH_LOOKUPS' | translate) }}
        </button>
      </div>

      <app-loading-spinner *ngIf="loading()" [label]="'COMMON.LOADING' | translate"></app-loading-spinner>

      <app-empty-state
        *ngIf="!loading() && users().length === 0"
        icon="👤"
        [title]="'ADMIN_USERS.EMPTY_TITLE' | translate"
        [message]="'ADMIN_USERS.EMPTY_MESSAGE' | translate"
      ></app-empty-state>

      <div class="users-table" *ngIf="!loading() && users().length > 0">
        <div class="row row--head">
          <span>{{ 'ADMIN_USERS.NAME' | translate }}</span>
          <span>{{ 'ADMIN_USERS.CONTACT' | translate }}</span>
          <span>{{ 'ADMIN_USERS.PLAN' | translate }}</span>
          <span>{{ 'ADMIN_USERS.ADS' | translate }}</span>
          <span>{{ 'ADMIN_USERS.STATUS' | translate }}</span>
          <span>{{ 'ADMIN_USERS.ACTIONS' | translate }}</span>
        </div>

        <div class="row" *ngFor="let user of users(); trackBy: trackById">
          <span [attr.data-label]="'ADMIN_USERS.NAME' | translate">
            {{ user.displayName || (user.firstName + ' ' + user.lastName) || '—' }}
            <code class="user-id">{{ user.id }}</code>
          </span>
          <span [attr.data-label]="'ADMIN_USERS.CONTACT' | translate" class="muted">
            <div>{{ user.email || '—' }}</div>
            <div *ngIf="user.phoneNumber">{{ user.phoneNumber }}</div>
          </span>
          <span [attr.data-label]="'ADMIN_USERS.PLAN' | translate">
            <span class="plan-chip" [class]="'plan-chip--' + user.planStatus.toLowerCase()">
              {{ user.planTier ? (planNameKey(user.planTier) | translate) : ('ADMIN_USERS.NO_PLAN' | translate) }}
            </span>
            <div class="plan-meta" *ngIf="user.planTier">
              {{ ('ADMIN_USERS.PLAN_STATUS.' + user.planStatus) | translate }}
              <span *ngIf="user.planExpiresAt"> · {{ user.planExpiresAt | localDate:'mediumDate' }}</span>
            </div>
          </span>
          <span [attr.data-label]="'ADMIN_USERS.ADS' | translate" class="ads-counts">
            {{ 'ADMIN_USERS.ADS_SUMMARY' | translate:{ total: user.totalListings, active: user.activeListings, featured: user.featuredListings } }}
          </span>
          <span [attr.data-label]="'ADMIN_USERS.STATUS' | translate">
            <span class="status-chip" [class.status-chip--disabled]="user.accountStatus === 'Disabled'">
              {{ ('ADMIN_USERS.STATUS_' + user.accountStatus.toUpperCase()) | translate }}
            </span>
          </span>
          <span [attr.data-label]="'ADMIN_USERS.ACTIONS' | translate" class="actions">
            <button type="button" class="btn btn--primary" (click)="openDetails(user)">
              {{ 'ADMIN_USERS.VIEW_DETAILS' | translate }}
            </button>
            <button
              type="button"
              class="btn btn--danger"
              *ngIf="user.accountStatus !== 'Disabled'"
              [disabled]="disablingId() === user.id"
              (click)="confirmDisable(user)"
            >
              {{ disablingId() === user.id
                  ? ('COMMON.SAVING' | translate)
                  : ('ADMIN_USERS.DISABLE' | translate) }}
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
    .page { padding: clamp(1rem, 3vw, 2rem); }
    .page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; margin-bottom:1.25rem; flex-wrap:wrap; }
    .page-header h1 { margin:0 0 .3rem; color: var(--text-strong); font-family:var(--font-display); font-size:clamp(1.5rem,2.6vw,2rem); }
    .page-header p { margin:0; color:var(--gray-500); }

    .filters { display:flex; flex-wrap:wrap; gap:.6rem; margin-bottom:1rem; }
    .filters select, .search-input {
      /* 16px صريح — خط input[type=search] الافتراضي بالمتصفح أقل من 16px، ما يُشغّل
         تكبير iOS Safari التلقائي عند التركيز (مؤكَّد حيّاً). */
      border:1px solid var(--border); border-radius:var(--r-md); padding:.5rem .8rem; background:var(--surface); font-size:16px;
    }
    .search-input { flex: 1 1 220px; min-width: 180px; }

    .users-table { display:flex; flex-direction:column; gap:.5rem; }
    .row {
      display:grid; grid-template-columns: 1.3fr 1.5fr 1.4fr 1.1fr .9fr 1.8fr; gap:1rem; align-items:center;
      background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md);
      padding:.85rem 1rem;
    }
    .row--head { background:transparent; border:0; color:var(--gray-500); font-size:var(--text-sm); font-weight:600; padding:0 1rem; }
    .muted { color:var(--text-muted); font-size: var(--text-sm); }
    .user-id { display:block; font-size: .7rem; color: var(--text-muted); margin-top: .15rem; }

    .plan-chip {
      display:inline-flex; align-items:center; background:var(--gold-soft); color: var(--text-strong);
      border-radius:var(--r-pill); padding:.15rem .6rem; font-size:var(--text-xs); font-weight:600;
    }
    .plan-chip--expired, .plan-chip--cancelled { background: var(--danger-soft); color: var(--danger-text); }
    .plan-chip--noplan { background: var(--gray-100); color: var(--gray-500); }
    .plan-meta { font-size: .72rem; color: var(--gray-500); margin-top:.2rem; }

    .ads-counts { font-size: var(--text-sm); color: var(--gray-700); }

    .status-chip {
      display:inline-flex; align-items:center; background: var(--success-soft, #dcfce7); color: var(--success-text);
      border-radius:var(--r-pill); padding:.15rem .6rem; font-size:var(--text-xs); font-weight:600;
    }
    .status-chip--disabled { background: var(--danger-soft); color: var(--danger-text); }

    .actions { display:flex; gap:.4rem; align-items:center; flex-wrap:wrap; }
    .btn { border-radius:var(--r-sm); padding:.4rem .75rem; font-size:var(--text-sm); cursor:pointer; border:1px solid transparent; font-weight:600; }
    .btn--outline { background:var(--surface); border-color:var(--border); color: var(--text-strong); }
    .btn--primary { background: var(--primary); color: var(--on-primary); }
    .btn--danger { background:var(--danger-soft); color:var(--danger-text); border-color:rgba(220,38,38,.2); }
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
export class AdminUsersPage implements OnInit {
  private readonly adminUsers = inject(AdminUsersService);
  private readonly lookupsApi = inject(LookupsApiService);
  private readonly plansApi = inject(PlansApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly users = signal<AdminUserDto[]>([]);
  readonly roles = signal<string[]>([]);
  readonly plans = signal<SubscriptionPlan[]>([]);
  readonly loading = signal(true);
  readonly page = signal(1);
  readonly totalPages = signal(1);
  readonly disablingId = signal<string | null>(null);
  readonly refreshingLookups = signal(false);

  roleFilter = '';
  planFilter = '';
  accountStatusFilter = '';
  searchTerm = '';

  private readonly pageSize = 20;
  private readonly searchChanges = new Subject<string>();

  ngOnInit(): void {
    this.adminUsers
      .getRoles()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: roles => this.roles.set(roles ?? []),
        error: () => this.roles.set([])
      });

    this.plansApi
      .getPlans()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: plans => this.plans.set(plans ?? []),
        error: () => this.plans.set([])
      });

    this.searchChanges
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.page.set(1);
        this.load();
      });

    this.load();
  }

  onSearchChange(value: string): void {
    this.searchChanges.next(value);
  }

  planNameKey(tier: string): string {
    return this.plans().find(p => p.tier === tier)?.nameKey ?? tier;
  }

  load(): void {
    this.loading.set(true);

    this.adminUsers
      .getUsers(this.page(), this.pageSize, {
        role: this.roleFilter || undefined,
        search: this.searchTerm || undefined,
        planTier: this.planFilter || undefined,
        accountStatus: this.accountStatusFilter || undefined
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.users.set(result.items);
          this.totalPages.set(result.totalPages);
          this.loading.set(false);
        },
        error: () => {
          this.toast.error(this.translate.instant('ADMIN_USERS.LOAD_ERROR'));
          this.loading.set(false);
        }
      });
  }

  goToPage(page: number): void {
    this.page.set(page);
    this.load();
  }

  openDetails(user: AdminUserDto): void {
    this.router.navigate(['/admin/users', user.id]);
  }

  confirmDisable(user: AdminUserDto): void {
    const confirmed = confirm(
      this.translate.instant('ADMIN_USERS.CONFIRM_DISABLE', {
        name: user.displayName || user.email || user.id
      })
    );

    if (confirmed) {
      this.disableUser(user.id);
    }
  }

  private disableUser(userId: string): void {
    this.disablingId.set(userId);

    this.adminUsers
      .disableUser(userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.users.update(items =>
            items.map(u => (u.id === userId ? { ...u, accountStatus: 'Disabled' as const } : u))
          );
          this.toast.success(this.translate.instant('ADMIN_USERS.DISABLED'));
          this.disablingId.set(null);
        },
        error: () => {
          this.toast.error(this.translate.instant('ADMIN_USERS.DISABLE_ERROR'));
          this.disablingId.set(null);
        }
      });
  }

  refreshLookupsCache(): void {
    this.refreshingLookups.set(true);

    this.lookupsApi
      .refresh()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success(this.translate.instant('ADMIN_USERS.REFRESH_LOOKUPS_SUCCESS'));
          this.refreshingLookups.set(false);
        },
        error: () => {
          this.toast.error(this.translate.instant('ADMIN_USERS.REFRESH_LOOKUPS_ERROR'));
          this.refreshingLookups.set(false);
        }
      });
  }

  trackById(_: number, user: AdminUserDto): string {
    return user.id;
  }
}
