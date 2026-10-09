// =============================================================
// src/app/admin/user-properties/admin-user-properties.page.ts
//
// "مساحة المستخدم" من لوحة الإدارة — كل إعلانات مستخدم محدد (أي حالة، لا يقتصر على
// المنشور/النشط)، مع أدوات تمييز/إلغاء تمييز/تمديد لكل إعلان. القاعدة الصريحة
// المطبَّقة هنا: التمديد يعمل حتى لو كان صاحب الإعلان على الخطة المجانية —
// admin-properties.service.ts لا يرسل أي معامل متعلق بالخطة إطلاقاً.
// =============================================================

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AdminPropertiesService } from '../../core/api/admin-properties.service';
import { AdminUsersService } from '../../core/api/admin-users.service';
import { AdminPropertyStatus, AdminPropertySummary } from '../../core/models/admin-property.model';
import { computeExtendedExpiry } from '../../core/services/admin-subscription-date.util';
import { ToastService } from '../../shared/services/toast.service';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ConfirmModalComponent } from '../../shared/ui/confirm-modal.component';

const DURATION_PRESETS = [30, 90, 180, 365];

type ModalKind = 'feature' | 'unfeature' | 'extend' | null;

@Component({
  selector: 'app-admin-user-properties',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, FormsModule, TranslateModule, LoadingSpinnerComponent, EmptyStateComponent, ConfirmModalComponent],
  template: `
    <section class="page">
      <header class="page-header">
        <button type="button" class="link-btn" (click)="goBack()">← {{ 'COMMON.BACK' | translate }}</button>
        <h1>{{ 'ADMIN_USER_PROPERTIES.TITLE' | translate:{ name: userName() || '…' } }}</h1>
      </header>

      <div class="filters">
        <select [(ngModel)]="statusFilter" (change)="load()">
          <option value="">{{ 'ADMIN_USERS.ALL_STATUSES' | translate }}</option>
          <option *ngFor="let status of statuses" [value]="status">{{ ('ADMIN_USER_PROPERTIES.STATUS.' + status) | translate }}</option>
        </select>
      </div>

      <app-loading-spinner *ngIf="loading()" [label]="'COMMON.LOADING' | translate"></app-loading-spinner>

      <app-empty-state
        *ngIf="!loading() && properties().length === 0"
        icon="🏠"
        [title]="'ADMIN_USER_PROPERTIES.EMPTY_TITLE' | translate"
        [message]="'ADMIN_USER_PROPERTIES.EMPTY_MESSAGE' | translate"
      ></app-empty-state>

      <div class="listings" *ngIf="!loading() && properties().length > 0">
        <div class="listing-card" *ngFor="let p of properties(); trackBy: trackById">
          <div class="listing-card__main">
            <strong>{{ p.title }}</strong>
            <div class="badges">
              <span class="badge" [class]="'badge--' + p.status.toLowerCase()">{{ ('ADMIN_USER_PROPERTIES.STATUS.' + p.status) | translate }}</span>
              <span class="badge badge--featured" *ngIf="p.isFeatured">
                {{ 'ADMIN_USER_PROPERTIES.FEATURED_UNTIL' | translate:{ date: (p.featuredUntil | date:'mediumDate') } }}
              </span>
            </div>
            <div class="meta">
              <span *ngIf="p.expiresAt">{{ 'ADMIN_USER_PROPERTIES.EXPIRES_AT' | translate:{ date: (p.expiresAt | date:'mediumDate') } }}</span>
              <span>{{ 'ADMIN_USER_PROPERTIES.CREATED_AT' | translate:{ date: (p.createdAt | date:'mediumDate') } }}</span>
            </div>
          </div>

          <div class="listing-card__actions">
            <a class="btn btn--outline" [routerLink]="['/properties', p.id]" target="_blank">
              {{ 'ADMIN_USER_PROPERTIES.PREVIEW' | translate }}
            </a>
            <button type="button" class="btn btn--outline" *ngIf="!p.isFeatured" (click)="openFeatureModal(p)">
              {{ 'ADMIN_USER_PROPERTIES.FEATURE' | translate }}
            </button>
            <button type="button" class="btn btn--outline" *ngIf="p.isFeatured" (click)="openUnfeatureModal(p)">
              {{ 'ADMIN_USER_PROPERTIES.UNFEATURE' | translate }}
            </button>
            <!-- يبقى مفعَّلاً بصرف النظر عن خطة صاحب الإعلان — انظر تعليق الملف أعلاه -->
            <button type="button" class="btn btn--primary" (click)="openExtendModal(p)">
              {{ 'ADMIN_USER_PROPERTIES.EXTEND' | translate }}
            </button>
          </div>
        </div>
      </div>

      <div class="pagination" *ngIf="!loading() && totalPages() > 1">
        <button type="button" [disabled]="page() <= 1" (click)="goToPage(page() - 1)">‹</button>
        <span>{{ page() }} / {{ totalPages() }}</span>
        <button type="button" [disabled]="page() >= totalPages()" (click)="goToPage(page() + 1)">›</button>
      </div>
    </section>

    <!-- نافذة تمييز الإعلان -->
    <app-confirm-modal
      [open]="activeModal() === 'feature'"
      [title]="'ADMIN_USER_PROPERTIES.FEATURE_MODAL_TITLE' | translate"
      [confirmLabel]="'ADMIN_USER_PROPERTIES.FEATURE' | translate"
      [confirmDisabled]="featureDays < 1"
      [loading]="saving()"
      (confirmed)="submitFeature()"
      (cancelled)="closeModal()"
    >
      <div class="modal-form" *ngIf="selected() as p">
        <label>
          {{ 'ADMIN_USER_DETAIL.DURATION_DAYS' | translate }}
          <div class="preset-row">
            <button type="button" *ngFor="let preset of durationPresets" class="preset-chip"
              [class.preset-chip--active]="featureDays === preset" (click)="featureDays = preset">{{ preset }}</button>
          </div>
          <input type="number" min="1" max="730" [(ngModel)]="featureDays" />
        </label>
        <textarea rows="2" [placeholder]="'ADMIN_USER_DETAIL.REASON_OPTIONAL' | translate" [(ngModel)]="actionReason"></textarea>
        <p class="preview">
          {{ 'ADMIN_USER_PROPERTIES.FEATURE_PREVIEW' | translate:{ title: p.title, end: (featureEndPreview() | date:'mediumDate') } }}
        </p>
      </div>
    </app-confirm-modal>

    <!-- نافذة إلغاء تمييز الإعلان -->
    <app-confirm-modal
      [open]="activeModal() === 'unfeature'"
      [title]="'ADMIN_USER_PROPERTIES.UNFEATURE_MODAL_TITLE' | translate"
      [confirmLabel]="'ADMIN_USER_PROPERTIES.UNFEATURE' | translate"
      [loading]="saving()"
      (confirmed)="submitUnfeature()"
      (cancelled)="closeModal()"
    >
      <div class="modal-form">
        <textarea rows="2" [placeholder]="'ADMIN_USER_DETAIL.REASON_OPTIONAL' | translate" [(ngModel)]="actionReason"></textarea>
      </div>
    </app-confirm-modal>

    <!-- نافذة تمديد الإعلان -->
    <app-confirm-modal
      [open]="activeModal() === 'extend'"
      [title]="'ADMIN_USER_PROPERTIES.EXTEND_MODAL_TITLE' | translate"
      [confirmLabel]="'ADMIN_USER_PROPERTIES.EXTEND' | translate"
      [confirmDisabled]="extendDays < 1"
      [loading]="saving()"
      (confirmed)="submitExtend()"
      (cancelled)="closeModal()"
    >
      <div class="modal-form" *ngIf="selected() as p">
        <label>
          {{ 'ADMIN_USER_DETAIL.DURATION_DAYS' | translate }}
          <div class="preset-row">
            <button type="button" *ngFor="let preset of durationPresets" class="preset-chip"
              [class.preset-chip--active]="extendDays === preset" (click)="extendDays = preset">{{ preset }}</button>
          </div>
          <input type="number" min="1" max="730" [(ngModel)]="extendDays" />
        </label>
        <textarea rows="2" [placeholder]="'ADMIN_USER_DETAIL.REASON_OPTIONAL' | translate" [(ngModel)]="actionReason"></textarea>
        <p class="preview">
          {{ 'ADMIN_USER_PROPERTIES.EXTEND_PREVIEW' | translate:{ title: p.title, end: (extendEndPreview() | date:'mediumDate') } }}
        </p>
      </div>
    </app-confirm-modal>
  `,
  styles: [`
    .page { padding: clamp(1rem, 3vw, 2rem); max-width: 920px; margin: 0 auto; }
    .page-header { margin-bottom: 1rem; }
    .page-header h1 { margin: .4rem 0 0; color:var(--navy); font-family:var(--font-display); font-size:clamp(1.3rem,2.2vw,1.7rem); }
    .link-btn { background:none; border:0; color:var(--primary-text); cursor:pointer; font-weight:600; padding:0; }

    .filters { margin-bottom: 1rem; }
    .filters select { border:1px solid var(--border); border-radius:var(--r-md); padding:.5rem .8rem; background:var(--surface); }

    .listings { display:flex; flex-direction:column; gap:.75rem; }
    .listing-card {
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg, 14px);
      padding: 1rem 1.15rem; display:flex; justify-content:space-between; gap:1rem; flex-wrap:wrap;
    }
    .listing-card__main { flex: 1 1 260px; }
    .listing-card__main strong { display:block; color: var(--navy); margin-bottom:.35rem; }
    .badges { display:flex; gap:.4rem; flex-wrap:wrap; margin-bottom:.35rem; }
    .badge {
      display:inline-flex; align-items:center; background: var(--gray-100); color: var(--gray-700);
      border-radius:var(--r-pill); padding:.15rem .6rem; font-size:var(--text-xs); font-weight:600;
    }
    .badge--expired, .badge--archived { background: var(--danger-soft); color: var(--danger); }
    .badge--available { background: var(--success-soft, #dcfce7); color: var(--success, #16a34a); }
    .badge--featured { background: var(--gold-soft); color: var(--navy); }
    .meta { display:flex; gap:.8rem; flex-wrap:wrap; font-size: .78rem; color: var(--gray-500); }

    .listing-card__actions { display:flex; align-items:flex-start; gap:.4rem; flex-wrap:wrap; }
    .btn { border-radius:var(--r-sm); padding:.4rem .75rem; font-size:var(--text-sm); cursor:pointer; border:1px solid transparent; font-weight:600; text-decoration:none; }
    .btn--outline { background:var(--surface); border-color:var(--border); color:var(--navy); }
    .btn--primary { background: var(--primary); color: var(--on-primary); }

    .pagination { display:flex; justify-content:center; align-items:center; gap:1rem; margin-top:1.25rem; }
    .pagination button { border:1px solid var(--border); background:var(--surface); border-radius:var(--r-sm); width:34px; height:34px; cursor:pointer; }
    .pagination button:disabled { opacity:.4; cursor:not-allowed; }

    .modal-form { display:flex; flex-direction:column; gap:.8rem; }
    .modal-form label { display:flex; flex-direction:column; gap:.35rem; font-size: var(--text-sm); font-weight:600; color: var(--navy); }
    .modal-form input, .modal-form textarea {
      /* 16px صريح — أقل من ذلك يُشغّل تكبير iOS Safari التلقائي عند التركيز، انظر نفس
         الإصلاح في admin-user-detail.page.ts. */
      border:1px solid var(--border); border-radius:var(--r-sm); padding:.5rem .6rem; font: inherit; font-size: 16px;
    }
    .preset-row { display:flex; gap:.4rem; flex-wrap:wrap; }
    .preset-chip {
      border:1px solid var(--border); background:var(--surface); border-radius:var(--r-pill);
      padding:.25rem .7rem; font-size:var(--text-xs); cursor:pointer;
    }
    .preset-chip--active { background: var(--primary); color: var(--on-primary); border-color: var(--primary); }
    .preview { background: var(--gold-soft); border-radius: var(--r-sm); padding: .6rem .75rem; font-size: var(--text-sm); color: var(--navy); margin:0; }
  `]
})
export class AdminUserPropertiesPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly adminProperties = inject(AdminPropertiesService);
  private readonly adminUsers = inject(AdminUsersService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly statuses: AdminPropertyStatus[] = ['Available', 'Reserved', 'Sold', 'Rented', 'Archived', 'Expired'];
  readonly durationPresets = DURATION_PRESETS;

  readonly properties = signal<AdminPropertySummary[]>([]);
  readonly userName = signal('');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly page = signal(1);
  readonly totalPages = signal(1);
  readonly activeModal = signal<ModalKind>(null);
  readonly selected = signal<AdminPropertySummary | null>(null);

  statusFilter: AdminPropertyStatus | '' = '';

  featureDays = 30;
  extendDays = 30;
  actionReason = '';

  private userId = '';
  private readonly pageSize = 20;

  ngOnInit(): void {
    this.userId = this.route.snapshot.paramMap.get('id') ?? '';

    this.adminUsers.getUserDetail(this.userId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: u => this.userName.set(u.displayName || `${u.firstName} ${u.lastName}`.trim() || u.email || u.id),
      error: () => this.userName.set('')
    });

    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.adminProperties
      .getUserProperties(this.userId, this.page(), this.pageSize, this.statusFilter || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.properties.set(result.items);
          this.totalPages.set(result.totalPages);
          this.loading.set(false);
        },
        error: () => {
          this.toast.error(this.translate.instant('ADMIN_USER_PROPERTIES.LOAD_ERROR'));
          this.loading.set(false);
        }
      });
  }

  goToPage(page: number): void {
    this.page.set(page);
    this.load();
  }

  goBack(): void {
    this.router.navigate(['/admin/users', this.userId]);
  }

  trackById(_: number, p: AdminPropertySummary): string {
    return p.id;
  }

  openFeatureModal(p: AdminPropertySummary): void {
    this.selected.set(p);
    this.featureDays = 30;
    this.actionReason = '';
    this.activeModal.set('feature');
  }

  openUnfeatureModal(p: AdminPropertySummary): void {
    this.selected.set(p);
    this.actionReason = '';
    this.activeModal.set('unfeature');
  }

  openExtendModal(p: AdminPropertySummary): void {
    this.selected.set(p);
    this.extendDays = 30;
    this.actionReason = '';
    this.activeModal.set('extend');
  }

  closeModal(): void {
    if (this.saving()) return;
    this.activeModal.set(null);
    this.selected.set(null);
  }

  featureEndPreview(): Date {
    const p = this.selected();
    if (!p) return new Date();
    // إعلان مميَّز مسبقاً يُضيف المدة فوق تاريخ الانتهاء الحالي (property.MarkFeatured
    // على الخادم)، وإلا تبدأ المدة من الآن — نفس منطق computeExtendedExpiry.
    return computeExtendedExpiry(p.isFeatured ? 'Active' : 'NoPlan', p.featuredUntil, this.featureDays, new Date());
  }

  extendEndPreview(): Date {
    const p = this.selected();
    if (!p) return new Date();
    return computeExtendedExpiry('Active', p.expiresAt, this.extendDays, new Date());
  }

  submitFeature(): void {
    const p = this.selected();
    if (!p || this.featureDays < 1) return;

    this.saving.set(true);
    this.adminProperties.featureListing(p.id, this.featureDays, this.actionReason).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.toast.success(this.translate.instant('ADMIN_USER_PROPERTIES.FEATURE_SUCCESS'));
        this.saving.set(false);
        this.activeModal.set(null);
        this.load();
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || this.translate.instant('ADMIN_USER_PROPERTIES.ACTION_ERROR'));
      }
    });
  }

  submitUnfeature(): void {
    const p = this.selected();
    if (!p) return;

    this.saving.set(true);
    this.adminProperties.unfeatureListing(p.id, this.actionReason).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.toast.success(this.translate.instant('ADMIN_USER_PROPERTIES.UNFEATURE_SUCCESS'));
        this.saving.set(false);
        this.activeModal.set(null);
        this.load();
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || this.translate.instant('ADMIN_USER_PROPERTIES.ACTION_ERROR'));
      }
    });
  }

  submitExtend(): void {
    const p = this.selected();
    if (!p || this.extendDays < 1) return;

    this.saving.set(true);
    this.adminProperties.extendListing(p.id, this.extendDays, this.actionReason).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.toast.success(this.translate.instant('ADMIN_USER_PROPERTIES.EXTEND_SUCCESS'));
        this.saving.set(false);
        this.activeModal.set(null);
        this.load();
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || this.translate.instant('ADMIN_USER_PROPERTIES.ACTION_ERROR'));
      }
    });
  }
}
