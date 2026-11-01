// =============================================================
// src/app/admin/user-detail/admin-user-detail.page.ts
//
// تفاصيل مستخدم واحد من لوحة الإدارة — القسم الذي يتيح للمدير:
//   - الاطلاع على الهوية وحالة الحساب وإدارة الأدوار (منقولة من admin-users.page.ts).
//   - قسم «الخطة والاشتراك»: عرض الخطة الحالية، تفعيل خطة مدفوعة يدوياً (بلا دفع
//     فعلي)، تمديد الاشتراك، إلغاؤه — كل إجراء عبر نافذة تأكيد تعرض التاريخ الناتج
//     قبل الحفظ (مطابق تماماً لحساب الخادم، انظر admin-subscription-date.util.ts).
//   - رابط إلى صفحة إعلانات المستخدم (admin-user-properties.page.ts).
// =============================================================

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AdminUserDetailDto, AdminUsersService } from '../../core/api/admin-users.service';
import { PlansApiService } from '../../core/api/plans-api.service';
import { PlanTier, SubscriptionPlan } from '../../core/models/subscription-plan.model';
import { computeExtendedExpiry } from '../../core/services/admin-subscription-date.util';
import { ToastService } from '../../shared/services/toast.service';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { ConfirmModalComponent } from '../../shared/ui/confirm-modal.component';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';

const DURATION_PRESETS = [30, 90, 180, 365];

type ModalKind = 'activate' | 'extend' | 'cancel' | 'disable' | 'enable' | null;

@Component({
  selector: 'app-admin-user-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ LocalizedDatePipe,CommonModule, RouterModule, FormsModule, TranslateModule, LoadingSpinnerComponent, ConfirmModalComponent],
  template: `
    <section class="page">
      <header class="page-header">
        <button type="button" class="link-btn" (click)="goBack()">← {{ 'COMMON.BACK' | translate }}</button>
        <h1>{{ 'ADMIN_USER_DETAIL.TITLE' | translate }}</h1>
      </header>

      <app-loading-spinner *ngIf="loading()" [label]="'COMMON.LOADING' | translate"></app-loading-spinner>

      <ng-container *ngIf="!loading() && user() as u">
        <!-- بطاقة الهوية -->
        <div class="card">
          <div class="identity-grid">
            <div><span class="field-label">{{ 'ADMIN_USERS.NAME' | translate }}</span><strong>{{ u.displayName || (u.firstName + ' ' + u.lastName) || '—' }}</strong></div>
            <div><span class="field-label">{{ 'ADMIN_USERS.EMAIL' | translate }}</span><strong>{{ u.email || '—' }}</strong></div>
            <div><span class="field-label">{{ 'ADMIN_USER_DETAIL.PHONE' | translate }}</span><strong>{{ u.phoneNumber || '—' }}</strong></div>
            <div><span class="field-label">{{ 'ADMIN_USER_DETAIL.USER_ID' | translate }}</span><code>{{ u.id }}</code></div>
            <div><span class="field-label">{{ 'ADMIN_USER_DETAIL.REGISTERED_AT' | translate }}</span><strong>{{ u.createdAt | localDate:'medium' }}</strong></div>
            <div>
              <span class="field-label">{{ 'ADMIN_USERS.STATUS' | translate }}</span>
              <span class="status-chip" [class.status-chip--disabled]="u.accountStatus === 'Disabled'">
                {{ ('ADMIN_USERS.STATUS_' + u.accountStatus.toUpperCase()) | translate }}
              </span>
            </div>
          </div>

          <!-- حالة الحساب: تعطيل مع إخفاء الإعلانات، وإعادة تفعيل بسبب (المرحلة 14) -->
          <div class="plan-actions" data-testid="account-actions">
            <button type="button" class="btn btn--danger" *ngIf="u.accountStatus !== 'Disabled'" (click)="openDisableModal()">
              {{ 'ADMIN_USER_DETAIL.DISABLE_ACCOUNT' | translate }}
            </button>
            <button type="button" class="btn btn--primary" *ngIf="u.accountStatus === 'Disabled'" (click)="openEnableModal()">
              {{ 'ADMIN_USER_DETAIL.ENABLE_ACCOUNT' | translate }}
            </button>
          </div>
        </div>

        <!-- الأدوار -->
        <div class="card">
          <h2>{{ 'ADMIN_USERS.ROLES' | translate }}</h2>
          <div class="roles">
            <span class="role-chip" *ngFor="let role of u.roles">
              {{ role }}
              <button
                type="button"
                class="role-chip__remove"
                *ngIf="u.roles.length > 1"
                (click)="removeRole(role)"
                [attr.aria-label]="'ADMIN_USERS.REMOVE_ROLE' | translate"
              >×</button>
            </span>
            <span *ngIf="u.roles.length === 0" class="muted">—</span>
          </div>
          <div class="role-add">
            <select #roleSelect class="role-select">
              <option *ngFor="let role of roles()" [value]="role">{{ role }}</option>
            </select>
            <button type="button" class="btn btn--outline" (click)="assignRole(roleSelect.value)">
              {{ 'ADMIN_USERS.ADD_ROLE' | translate }}
            </button>
          </div>
        </div>

        <!-- الخطة والاشتراك -->
        <div class="card">
          <h2>{{ 'ADMIN_USER_DETAIL.PLAN_SECTION_TITLE' | translate }}</h2>

          <div class="plan-summary" *ngIf="u.planTier; else noPlan">
            <div class="plan-summary__row">
              <span class="field-label">{{ 'ADMIN_USERS.PLAN' | translate }}</span>
              <strong>{{ u.planNameKey ? (u.planNameKey | translate) : u.planTier }}</strong>
            </div>
            <div class="plan-summary__row">
              <span class="field-label">{{ 'ADMIN_USER_DETAIL.PLAN_STATUS' | translate }}</span>
              <span class="plan-chip" [class]="'plan-chip--' + u.planStatus.toLowerCase()">
                {{ ('ADMIN_USERS.PLAN_STATUS.' + u.planStatus) | translate }}
              </span>
            </div>
            <div class="plan-summary__row">
              <span class="field-label">{{ 'ADMIN_USER_DETAIL.PLAN_STARTED_AT' | translate }}</span>
              <strong>{{ u.planStartedAt ? (u.planStartedAt | localDate:'medium') : '—' }}</strong>
            </div>
            <div class="plan-summary__row">
              <span class="field-label">{{ 'ADMIN_USER_DETAIL.PLAN_EXPIRES_AT' | translate }}</span>
              <strong>{{ u.planExpiresAt ? (u.planExpiresAt | localDate:'medium') : ('ADMIN_USER_DETAIL.NO_EXPIRY' | translate) }}</strong>
            </div>
            <div class="plan-summary__row" *ngIf="remainingDays() !== null">
              <span class="field-label">{{ 'ADMIN_USER_DETAIL.REMAINING' | translate }}</span>
              <strong>{{ 'ADMIN_USER_DETAIL.REMAINING_DAYS' | translate:{ days: remainingDays() } }}</strong>
            </div>
            <div class="plan-summary__row">
              <span class="field-label">{{ 'ADMIN_USER_DETAIL.LISTING_LIMIT' | translate }}</span>
              <strong>{{ u.listingLimit === null ? ('ADMIN_USER_DETAIL.UNLIMITED' | translate) : u.listingLimit }}</strong>
            </div>
            <div class="plan-summary__row" *ngIf="u.planActivationSource">
              <span class="field-label">{{ 'ADMIN_USER_DETAIL.ACTIVATION_SOURCE' | translate }}</span>
              <strong>{{ ('ADMIN_USER_DETAIL.ACTIVATION_SOURCE_' + u.planActivationSource.toUpperCase()) | translate }}</strong>
            </div>
            <div class="plan-summary__row" *ngIf="u.planCancelledAt">
              <span class="field-label">{{ 'ADMIN_USER_DETAIL.CANCELLED_AT' | translate }}</span>
              <strong>{{ u.planCancelledAt | localDate:'medium' }}</strong>
            </div>
          </div>
          <ng-template #noPlan>
            <p class="muted">{{ 'ADMIN_USER_DETAIL.NO_PLAN_SELECTED' | translate }}</p>
          </ng-template>

          <div class="plan-actions">
            <button type="button" class="btn btn--primary" (click)="openActivateModal()">
              {{ 'ADMIN_USER_DETAIL.ACTIVATE_PLAN' | translate }}
            </button>
            <button type="button" class="btn btn--outline" [disabled]="!u.planTier" (click)="openExtendModal()">
              {{ 'ADMIN_USER_DETAIL.EXTEND_PLAN' | translate }}
            </button>
            <button
              type="button"
              class="btn btn--danger"
              [disabled]="!u.planTier || u.planStatus === 'Cancelled'"
              (click)="openCancelModal()"
            >
              {{ 'ADMIN_USER_DETAIL.CANCEL_PLAN' | translate }}
            </button>
          </div>
        </div>

        <!-- إعلانات المستخدم -->
        <div class="card">
          <h2>{{ 'ADMIN_USER_DETAIL.LISTINGS_SECTION_TITLE' | translate }}</h2>
          <p class="ads-summary">
            {{ 'ADMIN_USERS.ADS_SUMMARY' | translate:{ total: u.totalListings, active: u.activeListings, featured: u.featuredListings } }}
          </p>
          <a class="btn btn--primary" [routerLink]="['/admin/users', u.id, 'properties']">
            {{ 'ADMIN_USER_DETAIL.VIEW_LISTINGS' | translate }}
          </a>
        </div>
      </ng-container>
    </section>

    <!-- نافذة تعطيل الحساب -->
    <app-confirm-modal
      [open]="activeModal() === 'disable'"
      [title]="'ADMIN_USER_DETAIL.DISABLE_MODAL_TITLE' | translate"
      [confirmLabel]="'ADMIN_USER_DETAIL.DISABLE_ACCOUNT' | translate"
      [danger]="true"
      [loading]="saving()"
      (confirmed)="submitDisable()"
      (cancelled)="closeModal()"
    >
      <div class="modal-form">
        <p>{{ 'ADMIN_USER_DETAIL.DISABLE_EXPLANATION' | translate }}</p>
      </div>
    </app-confirm-modal>

    <!-- نافذة إعادة تفعيل الحساب -->
    <app-confirm-modal
      [open]="activeModal() === 'enable'"
      [title]="'ADMIN_USER_DETAIL.ENABLE_MODAL_TITLE' | translate"
      [confirmLabel]="'ADMIN_USER_DETAIL.ENABLE_ACCOUNT' | translate"
      [confirmDisabled]="!enableReason.trim()"
      [loading]="saving()"
      (confirmed)="submitEnable()"
      (cancelled)="closeModal()"
    >
      <div class="modal-form">
        <p>{{ 'ADMIN_USER_DETAIL.ENABLE_EXPLANATION' | translate }}</p>
        <textarea
          rows="2"
          maxlength="500"
          [placeholder]="'ADMIN_USER_DETAIL.ENABLE_REASON' | translate"
          [(ngModel)]="enableReason"
        ></textarea>
      </div>
    </app-confirm-modal>

    <!-- نافذة تفعيل خطة -->
    <app-confirm-modal
      [open]="activeModal() === 'activate'"
      [title]="'ADMIN_USER_DETAIL.ACTIVATE_MODAL_TITLE' | translate"
      [confirmLabel]="'ADMIN_USER_DETAIL.ACTIVATE_PLAN' | translate"
      [confirmDisabled]="!activateTier || activateDays < 1"
      [loading]="saving()"
      (confirmed)="submitActivate()"
      (cancelled)="closeModal()"
    >
      <div class="modal-form">
        <label>
          {{ 'ADMIN_USER_DETAIL.SELECT_PLAN' | translate }}
          <select [(ngModel)]="activateTier">
            <option value="" disabled>{{ 'COMMON.PLEASE_SELECT' | translate }}</option>
            <option *ngFor="let plan of paidPlans()" [value]="plan.tier">{{ plan.nameKey | translate }}</option>
          </select>
        </label>

        <label>
          {{ 'ADMIN_USER_DETAIL.DURATION_DAYS' | translate }}
          <div class="preset-row">
            <button
              type="button"
              *ngFor="let preset of durationPresets"
              class="preset-chip"
              [class.preset-chip--active]="activateDays === preset"
              (click)="activateDays = preset"
            >{{ preset }}</button>
          </div>
          <input type="number" min="1" max="3650" [(ngModel)]="activateDays" />
        </label>

        <textarea
          rows="2"
          [placeholder]="'ADMIN_USER_DETAIL.REASON_OPTIONAL' | translate"
          [(ngModel)]="activateReason"
        ></textarea>

        <p class="preview" *ngIf="activateTier && activateDays > 0">
          {{ 'ADMIN_USER_DETAIL.ACTIVATE_PREVIEW' | translate:{
              user: userDisplayName(),
              plan: (planNameKey(activateTier) | translate),
              start: (today | localDate:'mediumDate'),
              end: (activateEndPreview() | localDate:'mediumDate')
            } }}
        </p>
      </div>
    </app-confirm-modal>

    <!-- نافذة تمديد الاشتراك -->
    <app-confirm-modal
      [open]="activeModal() === 'extend'"
      [title]="'ADMIN_USER_DETAIL.EXTEND_MODAL_TITLE' | translate"
      [confirmLabel]="'ADMIN_USER_DETAIL.EXTEND_PLAN' | translate"
      [confirmDisabled]="extendDays < 1"
      [loading]="saving()"
      (confirmed)="submitExtend()"
      (cancelled)="closeModal()"
    >
      <div class="modal-form">
        <label>
          {{ 'ADMIN_USER_DETAIL.DURATION_DAYS' | translate }}
          <div class="preset-row">
            <button
              type="button"
              *ngFor="let preset of durationPresets"
              class="preset-chip"
              [class.preset-chip--active]="extendDays === preset"
              (click)="extendDays = preset"
            >{{ preset }}</button>
          </div>
          <input type="number" min="1" max="3650" [(ngModel)]="extendDays" />
        </label>

        <textarea
          rows="2"
          [placeholder]="'ADMIN_USER_DETAIL.REASON_OPTIONAL' | translate"
          [(ngModel)]="extendReason"
        ></textarea>

        <p class="preview" *ngIf="extendDays > 0">
          {{ 'ADMIN_USER_DETAIL.EXTEND_PREVIEW' | translate:{ end: (extendEndPreview() | localDate:'mediumDate') } }}
        </p>
      </div>
    </app-confirm-modal>

    <!-- نافذة إلغاء الاشتراك -->
    <app-confirm-modal
      [open]="activeModal() === 'cancel'"
      [title]="'ADMIN_USER_DETAIL.CANCEL_MODAL_TITLE' | translate"
      [confirmLabel]="'ADMIN_USER_DETAIL.CANCEL_PLAN' | translate"
      [danger]="true"
      [loading]="saving()"
      (confirmed)="submitCancel()"
      (cancelled)="closeModal()"
    >
      <div class="modal-form">
        <p>{{ 'ADMIN_USER_DETAIL.CANCEL_EXPLANATION' | translate }}</p>
        <textarea
          rows="2"
          [placeholder]="'ADMIN_USER_DETAIL.REASON_OPTIONAL' | translate"
          [(ngModel)]="cancelReason"
        ></textarea>
      </div>
    </app-confirm-modal>
  `,
  styles: [`
    .page { padding: clamp(1rem, 3vw, 2rem); max-width: 860px; margin: 0 auto; }
    .page-header { margin-bottom: 1rem; }
    .page-header h1 { margin: .4rem 0 0; color: var(--text-strong); font-family:var(--font-display); font-size:clamp(1.4rem,2.4vw,1.9rem); }
    .link-btn { background:none; border:0; color:var(--primary-text); cursor:pointer; font-weight:600; padding:0; }

    .card {
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg, 14px);
      padding: 1.1rem 1.25rem; margin-bottom: 1rem;
    }
    .card h2 { margin: 0 0 .75rem; font-size: 1.05rem; color: var(--text-strong); }

    .identity-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: .8rem; }
    .field-label { display:block; font-size: .72rem; color: var(--gray-500); margin-bottom: .15rem; }

    .roles { display:flex; flex-wrap:wrap; gap:.35rem; margin-bottom: .6rem; }
    .role-chip {
      display:inline-flex; align-items:center; gap:.3rem; background:var(--gold-soft); color: var(--text-strong);
      border-radius:var(--r-pill); padding:.15rem .6rem; font-size:var(--text-xs); font-weight:600;
    }
    .role-chip__remove { border:0; background:none; cursor:pointer; color:var(--danger); font-size:1rem; line-height:1; padding:0; }
    .role-add { display:flex; gap:.5rem; align-items:center; }
    .role-select { border:1px solid var(--border); border-radius:var(--r-sm); padding:.35rem .5rem; font-size:var(--text-sm); }

    .plan-summary__row { display:flex; justify-content:space-between; gap:1rem; padding:.3rem 0; border-bottom: 1px dashed var(--border); }
    .plan-summary__row:last-child { border-bottom: 0; }
    .plan-actions { display:flex; flex-wrap:wrap; gap:.6rem; margin-top: 1rem; }

    .status-chip {
      display:inline-flex; align-items:center; background: var(--success-soft, #dcfce7); color: var(--success, #16a34a);
      border-radius:var(--r-pill); padding:.15rem .6rem; font-size:var(--text-xs); font-weight:600;
    }
    .status-chip--disabled { background: var(--danger-soft); color: var(--danger); }

    .plan-chip {
      display:inline-flex; align-items:center; background:var(--gold-soft); color: var(--text-strong);
      border-radius:var(--r-pill); padding:.15rem .6rem; font-size:var(--text-xs); font-weight:600;
    }
    .plan-chip--expired, .plan-chip--cancelled { background: var(--danger-soft); color: var(--danger); }

    .ads-summary { color: var(--gray-700); margin: 0 0 .8rem; }

    .btn { border-radius:var(--r-sm); padding:.5rem .9rem; font-size:var(--text-sm); cursor:pointer; border:1px solid transparent; font-weight:600; text-decoration:none; display:inline-block; }
    .btn--outline { background:var(--surface); border-color:var(--border); color: var(--text-strong); }
    .btn--primary { background: var(--primary); color: var(--on-primary); }
    .btn--danger { background:var(--danger-soft); color:var(--danger); border-color:rgba(220,38,38,.2); }
    .btn:disabled { opacity:.6; cursor:not-allowed; }
    .muted { color: var(--gray-400); }

    .modal-form { display:flex; flex-direction:column; gap:.8rem; }
    .modal-form label { display:flex; flex-direction:column; gap:.35rem; font-size: var(--text-sm); font-weight:600; color: var(--text-strong); }
    .modal-form select, .modal-form input, .modal-form textarea {
      /* font-size مضبوط صراحة بـ 16px (لا inherit من .modal-form label الأصغر) — أقل من
         16px يُشغّل تكبير iOS Safari التلقائي عند تركيز أي حقل إدخال، مؤكَّد حيّاً على
         محاكي iPhone (375px) بهذه النافذة تحديداً. */
      border:1px solid var(--border); border-radius:var(--r-sm); padding:.5rem .6rem; font: inherit; font-size: 16px;
    }
    .preset-row { display:flex; gap:.4rem; flex-wrap:wrap; }
    .preset-chip {
      border:1px solid var(--border); background:var(--surface); border-radius:var(--r-pill);
      padding:.25rem .7rem; font-size:var(--text-xs); cursor:pointer;
    }
    .preset-chip--active { background: var(--primary); color: var(--on-primary); border-color: var(--primary); }
    .preview { background: var(--gold-soft); border-radius: var(--r-sm); padding: .6rem .75rem; font-size: var(--text-sm); color: var(--text-strong); margin:0; }
  `]
})
export class AdminUserDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly adminUsers = inject(AdminUsersService);
  private readonly plansApi = inject(PlansApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly today = new Date();
  readonly durationPresets = DURATION_PRESETS;

  readonly user = signal<AdminUserDetailDto | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly roles = signal<string[]>([]);
  readonly plans = signal<SubscriptionPlan[]>([]);
  readonly activeModal = signal<ModalKind>(null);

  readonly paidPlans = computed(() => this.plans().filter(p => p.priceKind !== 'free'));

  readonly remainingDays = computed(() => {
    const u = this.user();
    if (!u?.planExpiresAt || u.planStatus !== 'Active') return null;
    const diffMs = new Date(u.planExpiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  });

  activateTier: PlanTier | '' = '';
  activateDays = 30;
  activateReason = '';

  extendDays = 30;
  extendReason = '';

  cancelReason = '';

  enableReason = '';

  private userId = '';

  ngOnInit(): void {
    this.userId = this.route.snapshot.paramMap.get('id') ?? '';

    this.adminUsers.getRoles().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: roles => this.roles.set(roles ?? []),
      error: () => this.roles.set([])
    });

    this.plansApi.getPlans().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: plans => this.plans.set(plans ?? []),
      error: () => this.plans.set([])
    });

    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.adminUsers.getUserDetail(this.userId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: detail => {
        this.user.set(detail);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error(this.translate.instant('ADMIN_USERS.LOAD_ERROR'));
        this.loading.set(false);
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/admin/users']);
  }

  userDisplayName(): string {
    const u = this.user();
    return u ? (u.displayName || `${u.firstName} ${u.lastName}`.trim() || u.email || u.id) : '';
  }

  planNameKey(tier: string): string {
    return this.plans().find(p => p.tier === tier)?.nameKey ?? tier;
  }

  // -- الأدوار ------------------------------------------------

  assignRole(role: string): void {
    const u = this.user();
    if (!u || !role || u.roles.includes(role)) return;

    this.adminUsers.assignRole(u.id, role).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.user.update(current => current && { ...current, roles: [...current.roles, role] });
        this.toast.success(this.translate.instant('ADMIN_USERS.ROLE_ADDED'));
      },
      error: () => this.toast.error(this.translate.instant('ADMIN_USERS.ROLE_ERROR'))
    });
  }

  removeRole(role: string): void {
    const u = this.user();
    if (!u) return;

    this.adminUsers.removeRole(u.id, role).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.user.update(current => current && { ...current, roles: current.roles.filter(r => r !== role) });
        this.toast.success(this.translate.instant('ADMIN_USERS.ROLE_REMOVED'));
      },
      // 409: لا يُسحب دور Admin من النفس ولا من آخر مشرف فعّال.
      error: err => this.toast.error(this.translate.instant(
        err?.status === 409 ? 'ADMIN_USERS.ROLE_LAST_ADMIN' : 'ADMIN_USERS.ROLE_ERROR'))
    });
  }

  // -- الخطة والاشتراك -----------------------------------------

  openActivateModal(): void {
    this.activateTier = (this.paidPlans()[0]?.tier as PlanTier) ?? '';
    this.activateDays = 30;
    this.activateReason = '';
    this.activeModal.set('activate');
  }

  openExtendModal(): void {
    this.extendDays = 30;
    this.extendReason = '';
    this.activeModal.set('extend');
  }

  openCancelModal(): void {
    this.cancelReason = '';
    this.activeModal.set('cancel');
  }

  closeModal(): void {
    if (this.saving()) return;
    this.activeModal.set(null);
  }

  // -- حالة الحساب (المرحلة 14) --------------------------------

  openDisableModal(): void {
    this.activeModal.set('disable');
  }

  openEnableModal(): void {
    this.enableReason = '';
    this.activeModal.set('enable');
  }

  submitDisable(): void {
    const u = this.user();
    if (!u) return;

    this.saving.set(true);
    this.adminUsers
      .disableUser(u.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success(this.translate.instant('ADMIN_USER_DETAIL.DISABLE_SUCCESS'));
          this.saving.set(false);
          this.activeModal.set(null);
          this.load();
        },
        error: err => {
          this.saving.set(false);
          // 409: آخر مشرف فعّال لا يُعطَّل.
          this.toast.error(this.translate.instant(err?.status === 409
            ? 'ADMIN_USER_DETAIL.DISABLE_LAST_ADMIN'
            : 'ADMIN_USER_DETAIL.ACTION_ERROR'));
        }
      });
  }

  submitEnable(): void {
    const u = this.user();
    const reason = this.enableReason.trim();
    if (!u || !reason) return;

    this.saving.set(true);
    this.adminUsers
      .enableUser(u.id, reason)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success(this.translate.instant('ADMIN_USER_DETAIL.ENABLE_SUCCESS'));
          this.saving.set(false);
          this.activeModal.set(null);
          this.load();
        },
        error: err => {
          this.saving.set(false);
          // 409: الحساب حذفه صاحبه (لا رجعة) أو ليس معطّلاً.
          this.toast.error(this.translate.instant(err?.status === 409
            ? 'ADMIN_USER_DETAIL.ENABLE_NOT_POSSIBLE'
            : 'ADMIN_USER_DETAIL.ACTION_ERROR'));
        }
      });
  }

  activateEndPreview(): Date {
    return computeExtendedExpiry('NoPlan', null, this.activateDays, this.today);
  }

  extendEndPreview(): Date {
    const u = this.user();
    if (!u) return this.today;
    return computeExtendedExpiry(u.planStatus, u.planExpiresAt, this.extendDays, new Date());
  }

  submitActivate(): void {
    const u = this.user();
    if (!u || !this.activateTier || this.activateDays < 1) return;

    this.saving.set(true);
    this.adminUsers
      .activatePlan(u.id, this.activateTier, this.activateDays, this.activateReason)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success(this.translate.instant('ADMIN_USER_DETAIL.ACTIVATE_SUCCESS'));
          this.saving.set(false);
          this.activeModal.set(null);
          this.load();
        },
        error: err => {
          this.saving.set(false);
          this.toast.error(err?.error?.message || this.translate.instant('ADMIN_USER_DETAIL.ACTION_ERROR'));
        }
      });
  }

  submitExtend(): void {
    const u = this.user();
    if (!u || this.extendDays < 1) return;

    this.saving.set(true);
    this.adminUsers
      .extendSubscription(u.id, this.extendDays, this.extendReason)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success(this.translate.instant('ADMIN_USER_DETAIL.EXTEND_SUCCESS'));
          this.saving.set(false);
          this.activeModal.set(null);
          this.load();
        },
        error: err => {
          this.saving.set(false);
          this.toast.error(err?.error?.message || this.translate.instant('ADMIN_USER_DETAIL.ACTION_ERROR'));
        }
      });
  }

  submitCancel(): void {
    const u = this.user();
    if (!u) return;

    this.saving.set(true);
    this.adminUsers
      .cancelSubscription(u.id, this.cancelReason)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success(this.translate.instant('ADMIN_USER_DETAIL.CANCEL_SUCCESS'));
          this.saving.set(false);
          this.activeModal.set(null);
          this.load();
        },
        error: err => {
          this.saving.set(false);
          this.toast.error(err?.error?.message || this.translate.instant('ADMIN_USER_DETAIL.ACTION_ERROR'));
        }
      });
  }
}
