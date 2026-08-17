// =============================================================
// src/app/admin/users/admin-users.page.ts
//
// لوحة إدارة المستخدمين — تكمّل admin/messages الموجودة أصلاً.
// تغطي كل نقاط AdminController: عرض المستخدمين، عرض الأدوار المتاحة،
// تعيين/إضافة/إزالة دور، وتعطيل حساب (وليس حذفاً نهائياً — الخادم ينفّذ
// Soft-disable عبر DisableUserAsync رغم أن الفعل HTTP هو DELETE).
// =============================================================

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AdminUserDto, AdminUsersService } from '../../core/api/admin-users.service';
import { LookupsApiService } from '../../core/api/lookups-api.service';
import { ToastService } from '../../shared/services/toast.service';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, FormsModule, TranslateModule, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <section class="page">
      <header class="page-header">
        <div>
          <h1>{{ 'ADMIN_USERS.TITLE' | translate }}</h1>
          <p>{{ 'ADMIN_USERS.SUBTITLE' | translate }}</p>
        </div>
        <button type="button" class="link-btn" (click)="goBack()">{{ 'COMMON.BACK' | translate }}</button>
      </header>

      <div class="filters">
        <select [(ngModel)]="roleFilter" (change)="load()">
          <option value="">{{ 'ADMIN_USERS.ALL_ROLES' | translate }}</option>
          <option *ngFor="let role of roles()" [value]="role">{{ role }}</option>
        </select>

        <!-- ✅ إضافة: يستهلك POST /api/lookups/refresh (Admin فقط) — كان غير
             مستخدَم إطلاقاً؛ يفرّغ كاش المدن/المرافق/الفئات فوراً (10 دقائق
             صلاحية افتراضية) دون انتظار انتهائها من تلقاء نفسه. -->
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
          <span>{{ 'ADMIN_USERS.EMAIL' | translate }}</span>
          <span>{{ 'ADMIN_USERS.ROLES' | translate }}</span>
          <span>{{ 'ADMIN_USERS.ACTIONS' | translate }}</span>
        </div>

        <div class="row" *ngFor="let user of users(); trackBy: trackById">
          <span data-label="Name">
            {{ user.displayName || (user.firstName + ' ' + user.lastName) || '—' }}
          </span>
          <span data-label="Email" class="muted">{{ user.email || '—' }}</span>
          <span data-label="Roles" class="roles">
            <span class="role-chip" *ngFor="let role of user.roles">
              {{ role }}
              <button
                type="button"
                class="role-chip__remove"
                *ngIf="user.roles.length > 1"
                (click)="removeRole(user, role)"
                [attr.aria-label]="'ADMIN_USERS.REMOVE_ROLE' | translate"
              >×</button>
            </span>
            <span *ngIf="user.roles.length === 0" class="muted">—</span>
          </span>
          <span data-label="Actions" class="actions">
            <select #roleSelect class="role-select">
              <option *ngFor="let role of roles()" [value]="role">{{ role }}</option>
            </select>
            <button type="button" class="btn btn--outline" (click)="assignRole(user, roleSelect.value)">
              {{ 'ADMIN_USERS.ADD_ROLE' | translate }}
            </button>
            <button
              type="button"
              class="btn btn--danger"
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
    .page-header h1 { margin:0 0 .3rem; color:var(--navy); font-family:var(--font-display); font-size:clamp(1.5rem,2.6vw,2rem); }
    .page-header p { margin:0; color:var(--gray-500); }
    .link-btn { background:none; border:0; color:var(--primary); cursor:pointer; font-weight:600; }

    .filters { margin-bottom:1rem; }
    .filters select { border:1px solid var(--border); border-radius:var(--r-md); padding:.5rem .8rem; background:var(--surface); }

    .users-table { display:flex; flex-direction:column; gap:.5rem; }
    .row {
      display:grid; grid-template-columns: 1.2fr 1.6fr 1.6fr 2fr; gap:1rem; align-items:center;
      background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md);
      padding:.85rem 1rem;
    }
    .row--head { background:transparent; border:0; color:var(--gray-500); font-size:var(--text-sm); font-weight:600; padding:0 1rem; }
    .muted { color:var(--gray-400); }

    .roles { display:flex; flex-wrap:wrap; gap:.35rem; }
    .role-chip {
      display:inline-flex; align-items:center; gap:.3rem; background:var(--gold-soft); color:var(--navy);
      border-radius:var(--r-pill); padding:.15rem .6rem; font-size:var(--text-xs); font-weight:600;
    }
    .role-chip__remove { border:0; background:none; cursor:pointer; color:var(--danger); font-size:1rem; line-height:1; padding:0; }

    .actions { display:flex; gap:.4rem; align-items:center; flex-wrap:wrap; }
    .role-select { border:1px solid var(--border); border-radius:var(--r-sm); padding:.35rem .5rem; font-size:var(--text-sm); }
    .btn { border-radius:var(--r-sm); padding:.4rem .75rem; font-size:var(--text-sm); cursor:pointer; border:1px solid transparent; }
    .btn--outline { background:var(--surface); border-color:var(--border); color:var(--navy); }
    .btn--danger { background:var(--danger-soft); color:var(--danger); border-color:#fecaca; }
    .btn--danger:disabled { opacity:.6; cursor:not-allowed; }

    .pagination { display:flex; justify-content:center; align-items:center; gap:1rem; margin-top:1.25rem; }
    .pagination button { border:1px solid var(--border); background:var(--surface); border-radius:var(--r-sm); width:34px; height:34px; cursor:pointer; }
    .pagination button:disabled { opacity:.4; cursor:not-allowed; }

    @media (max-width: 820px) {
      .row { grid-template-columns: 1fr; }
      .row--head { display:none; }
      .row span[data-label]::before { content: attr(data-label) ": "; font-weight:700; color:var(--gray-500); }
    }
  `]
})
export class AdminUsersPage implements OnInit {
  private readonly adminUsers = inject(AdminUsersService);
  private readonly lookupsApi = inject(LookupsApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly users = signal<AdminUserDto[]>([]);
  readonly roles = signal<string[]>([]);
  readonly loading = signal(true);
  readonly page = signal(1);
  readonly totalPages = signal(1);
  readonly disablingId = signal<string | null>(null);
  readonly refreshingLookups = signal(false);

  roleFilter = '';
  private readonly pageSize = 20;

  ngOnInit(): void {
    this.adminUsers
      .getRoles()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: roles => this.roles.set(roles ?? []),
        error: () => this.roles.set([])
      });

    this.load();
  }

  load(): void {
    this.loading.set(true);

    this.adminUsers
      .getUsers(this.page(), this.pageSize, this.roleFilter || undefined)
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

  assignRole(user: AdminUserDto, role: string): void {
    if (!role || user.roles.includes(role)) return;

    this.adminUsers
      .assignRole(user.id, role)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.users.update(items =>
            items.map(u => (u.id === user.id ? { ...u, roles: [...u.roles, role] } : u))
          );
          this.toast.success(this.translate.instant('ADMIN_USERS.ROLE_ADDED'));
        },
        error: () => this.toast.error(this.translate.instant('ADMIN_USERS.ROLE_ERROR'))
      });
  }

  removeRole(user: AdminUserDto, role: string): void {
    this.adminUsers
      .removeRole(user.id, role)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.users.update(items =>
            items.map(u => (u.id === user.id ? { ...u, roles: u.roles.filter(r => r !== role) } : u))
          );
          this.toast.success(this.translate.instant('ADMIN_USERS.ROLE_REMOVED'));
        },
        error: () => this.toast.error(this.translate.instant('ADMIN_USERS.ROLE_ERROR'))
      });
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
          this.users.update(items => items.filter(u => u.id !== userId));
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

  goBack(): void {
    this.router.navigate(['/admin/messages']);
  }

  trackById(_: number, user: AdminUserDto): string {
    return user.id;
  }
}
