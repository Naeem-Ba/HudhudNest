// =============================================================
// src/app/admin/payment-requests/payment-requests.page.ts
//
// طابور المشرف: طلبات الخطط المدفوعة وطلبات تمييز الإعلانات وتمديدها وشراء إعلان إضافي. لا توجد بوابة دفع،
// فلا شيء يُفعَّل تلقائياً — المستخدم يقدّم الطلب، ويؤكد المشرف الدفع هنا فتُفعَّل
// الخطة أو يُميَّز الإعلان. الرفض يُغلق الطلب دون تفعيل.
// =============================================================

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AdminPaymentRequestsApiService } from '../../core/api/admin-payment-requests-api.service';
import {
  PendingExtensionPayment,
  PendingExtraListingPayment,
  PendingFeaturedPayment,
  PendingPlanRequest
} from '../../core/models/payment-request.model';
import { ToastService } from '../../shared/services/toast.service';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';

/** Default subscription length offered when approving a plan request. */
export const DEFAULT_PLAN_DURATION_DAYS = 30;

@Component({
  selector: 'app-admin-payment-requests',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ LocalizedDatePipe,CommonModule, RouterModule, TranslateModule, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <section class="page">
      <header class="page-header">
        <h1>{{ 'ADMIN_PAYMENTS.TITLE' | translate }}</h1>
        <p>{{ 'ADMIN_PAYMENTS.SUBTITLE' | translate }}</p>
      </header>

      <app-loading-spinner *ngIf="loading()" [label]="'COMMON.LOADING' | translate"></app-loading-spinner>

      <app-empty-state
        *ngIf="!loading() && plans().length === 0 && featured().length === 0 && extensions().length === 0 && extraListings().length === 0"
        icon="💳"
        [title]="'ADMIN_PAYMENTS.EMPTY_TITLE' | translate"
        [message]="'ADMIN_PAYMENTS.EMPTY_MESSAGE' | translate"
      ></app-empty-state>

      <ng-container *ngIf="!loading()">
        <h2 class="group-title" *ngIf="plans().length > 0">
          {{ 'ADMIN_PAYMENTS.PLANS_TITLE' | translate }} ({{ plans().length }})
        </h2>
        <div class="card" *ngFor="let p of plans(); trackBy: trackPlan" data-testid="plan-request">
          <div class="card__info">
            <strong>{{ p.userName }}</strong>
            <span class="muted" *ngIf="p.email">{{ p.email }}</span>
            <span class="chip">{{ 'PRICING.' + p.tier.toUpperCase() + '.NAME' | translate }}</span>
            <span class="muted" *ngIf="p.priceUsd !== null">{{ p.priceUsd }} USD</span>
            <span class="muted">{{ p.requestedAt | localDate: 'short' }}</span>
            <a class="link" [routerLink]="['/admin/users', p.userId]">{{ 'ADMIN_PAYMENTS.OPEN_USER' | translate }}</a>
          </div>
          <div class="card__actions">
            <label class="days">
              {{ 'ADMIN_PAYMENTS.DURATION_DAYS' | translate }}
              <input
                type="number"
                min="1"
                max="3650"
                [value]="durationFor(p.requestId)"
                (input)="setDuration(p.requestId, $any($event.target).value)"
              />
            </label>
            <button type="button" class="btn btn--primary" [disabled]="busyId() === p.requestId" (click)="approvePlan(p)">
              {{ 'ADMIN_PAYMENTS.APPROVE_PLAN' | translate }}
            </button>
            <button type="button" class="btn btn--danger" [disabled]="busyId() === p.requestId" (click)="rejectPlan(p)">
              {{ 'ADMIN_PAYMENTS.REJECT' | translate }}
            </button>
          </div>
        </div>

        <h2 class="group-title" *ngIf="featured().length > 0">
          {{ 'ADMIN_PAYMENTS.FEATURED_TITLE' | translate }} ({{ featured().length }})
        </h2>
        <div class="card" *ngFor="let f of featured(); trackBy: trackFeatured" data-testid="featured-request">
          <div class="card__info">
            <a class="link" [routerLink]="['/properties', f.propertyId]"><strong>{{ f.propertyTitle }}</strong></a>
            <span class="muted">{{ f.ownerName }}<ng-container *ngIf="f.ownerEmail"> · {{ f.ownerEmail }}</ng-container></span>
            <span class="chip">{{ f.amountUsd }} USD</span>
            <span class="muted">{{ f.requestedAt | localDate: 'short' }}</span>
          </div>
          <div class="card__actions">
            <button type="button" class="btn btn--primary" [disabled]="busyId() === f.transactionId" (click)="approveFeatured(f)">
              {{ 'ADMIN_PAYMENTS.APPROVE_FEATURED' | translate }}
            </button>
            <button type="button" class="btn btn--danger" [disabled]="busyId() === f.transactionId" (click)="rejectFeatured(f)">
              {{ 'ADMIN_PAYMENTS.REJECT' | translate }}
            </button>
          </div>
        </div>

        <h2 class="group-title" *ngIf="extensions().length > 0">
          {{ 'ADMIN_PAYMENTS.EXTENSIONS_TITLE' | translate }} ({{ extensions().length }})
        </h2>
        <div class="card" *ngFor="let e of extensions(); trackBy: trackExtension" data-testid="extension-request">
          <div class="card__info">
            <a class="link" [routerLink]="['/properties', e.propertyId]"><strong>{{ e.propertyTitle }}</strong></a>
            <span class="muted">{{ e.ownerName }}<ng-container *ngIf="e.ownerEmail"> · {{ e.ownerEmail }}</ng-container></span>
            <span class="chip">{{ e.amountUsd }} USD</span>
            <span class="muted">{{ e.requestedAt | localDate: 'short' }}</span>
            <span class="muted" dir="ltr">{{ 'ADMIN_PAYMENTS.REFERENCE' | translate }}: {{ e.transactionId }}</span>
          </div>
          <div class="card__actions">
            <button type="button" class="btn btn--primary" [disabled]="busyId() === e.transactionId" (click)="approveExtension(e)">
              {{ 'ADMIN_PAYMENTS.APPROVE_EXTENSION' | translate }}
            </button>
            <button type="button" class="btn btn--danger" [disabled]="busyId() === e.transactionId" (click)="rejectExtension(e)">
              {{ 'ADMIN_PAYMENTS.REJECT' | translate }}
            </button>
          </div>
        </div>

        <h2 class="group-title" *ngIf="extraListings().length > 0">
          {{ 'ADMIN_PAYMENTS.EXTRA_LISTINGS_TITLE' | translate }} ({{ extraListings().length }})
        </h2>
        <div class="card" *ngFor="let x of extraListings(); trackBy: trackExtraListing" data-testid="extra-listing-request">
          <div class="card__info">
            <strong>{{ x.userName }}</strong>
            <span class="muted" *ngIf="x.email">{{ x.email }}</span>
            <span class="chip">{{ x.amountUsd }} USD</span>
            <span class="muted">{{ x.requestedAt | localDate: 'short' }}</span>
            <span class="muted" dir="ltr">{{ 'ADMIN_PAYMENTS.REFERENCE' | translate }}: {{ x.requestId }}</span>
            <a class="link" [routerLink]="['/admin/users', x.userId]">{{ 'ADMIN_PAYMENTS.OPEN_USER' | translate }}</a>
          </div>
          <div class="card__actions">
            <button type="button" class="btn btn--primary" [disabled]="busyId() === x.requestId" (click)="approveExtraListing(x)">
              {{ 'ADMIN_PAYMENTS.APPROVE_EXTRA_LISTING' | translate }}
            </button>
            <button type="button" class="btn btn--danger" [disabled]="busyId() === x.requestId" (click)="rejectExtraListing(x)">
              {{ 'ADMIN_PAYMENTS.REJECT' | translate }}
            </button>
          </div>
        </div>
      </ng-container>
    </section>
  `,
  styles: [`
    .page { padding: clamp(1rem, 3vw, 2rem); }
    .page-header h1 { margin:0 0 .3rem; color: var(--text-strong); font-family:var(--font-display); font-size:clamp(1.5rem,2.6vw,2rem); }
    .page-header p { margin:0 0 1.25rem; color:var(--gray-500); }
    .group-title { margin:1.25rem 0 .6rem; font-size:1.1rem; color: var(--text-strong); }
    .card {
      display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;
      background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md);
      padding:.85rem 1rem; margin-bottom:.5rem;
    }
    .card__info { display:flex; gap:.6rem; align-items:center; flex-wrap:wrap; }
    .card__actions { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; }
    .muted { color:var(--gray-500); font-size:var(--text-sm); }
    .chip { background:var(--gold-soft); color: var(--text-strong); border-radius:var(--r-pill); padding:.15rem .6rem; font-size:var(--text-xs); font-weight:600; }
    .link { color:var(--primary-text); font-size:var(--text-sm); }
    .days { display:flex; align-items:center; gap:.4rem; font-size:var(--text-sm); color:var(--gray-500); }
    .days input { width:5rem; padding:.3rem .4rem; border:1px solid var(--border); border-radius:var(--r-sm); }
    .btn { border-radius:var(--r-sm); padding:.4rem .75rem; font-size:var(--text-sm); cursor:pointer; border:1px solid transparent; }
    .btn--primary { background: var(--primary); color: var(--on-primary); }
    .btn--danger { background:var(--danger-soft); color:var(--danger-text); border-color:rgba(220,38,38,.2); }
    .btn:disabled { opacity:.6; cursor:not-allowed; }
  `]
})
export class AdminPaymentRequestsPage implements OnInit {
  private readonly api = inject(AdminPaymentRequestsApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly plans = signal<PendingPlanRequest[]>([]);
  readonly featured = signal<PendingFeaturedPayment[]>([]);
  readonly extensions = signal<PendingExtensionPayment[]>([]);
  readonly extraListings = signal<PendingExtraListingPayment[]>([]);
  readonly loading = signal(true);
  readonly busyId = signal<string | null>(null);

  private readonly durations = new Map<string, number>();

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api
      .getPending()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: r => {
          this.plans.set(r.plans);
          this.featured.set(r.featured);
          this.extensions.set(r.extensions);
          this.extraListings.set(r.extraListings);
          this.loading.set(false);
        },
        error: () => {
          this.toast.error(this.translate.instant('ADMIN_PAYMENTS.LOAD_ERROR'));
          this.loading.set(false);
        }
      });
  }

  durationFor(requestId: string): number {
    return this.durations.get(requestId) ?? DEFAULT_PLAN_DURATION_DAYS;
  }

  setDuration(requestId: string, value: string | number): void {
    this.durations.set(requestId, Number(value));
  }

  approvePlan(p: PendingPlanRequest): void {
    const days = Math.trunc(this.durationFor(p.requestId));
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      this.toast.error(this.translate.instant('ADMIN_PAYMENTS.INVALID_DURATION'));
      return;
    }
    if (!confirm(this.translate.instant('ADMIN_PAYMENTS.CONFIRM_APPROVE_PLAN', { name: p.userName, days }))) return;

    this.run(p.requestId, this.api.approvePlan(p.requestId, days), 'ADMIN_PAYMENTS.PLAN_APPROVED',
      () => this.plans.update(list => list.filter(x => x.requestId !== p.requestId)));
  }

  rejectPlan(p: PendingPlanRequest): void {
    if (!confirm(this.translate.instant('ADMIN_PAYMENTS.CONFIRM_REJECT', { name: p.userName }))) return;

    this.run(p.requestId, this.api.rejectPlan(p.requestId), 'ADMIN_PAYMENTS.REJECTED',
      () => this.plans.update(list => list.filter(x => x.requestId !== p.requestId)));
  }

  approveFeatured(f: PendingFeaturedPayment): void {
    if (!confirm(this.translate.instant('ADMIN_PAYMENTS.CONFIRM_APPROVE_FEATURED', { title: f.propertyTitle }))) return;

    this.run(f.transactionId, this.api.approveFeatured(f.transactionId), 'ADMIN_PAYMENTS.FEATURED_APPROVED',
      () => this.featured.update(list => list.filter(x => x.transactionId !== f.transactionId)));
  }

  rejectFeatured(f: PendingFeaturedPayment): void {
    if (!confirm(this.translate.instant('ADMIN_PAYMENTS.CONFIRM_REJECT', { name: f.propertyTitle }))) return;

    this.run(f.transactionId, this.api.rejectFeatured(f.transactionId), 'ADMIN_PAYMENTS.REJECTED',
      () => this.featured.update(list => list.filter(x => x.transactionId !== f.transactionId)));
  }

  approveExtension(e: PendingExtensionPayment): void {
    if (!confirm(this.translate.instant('ADMIN_PAYMENTS.CONFIRM_APPROVE_EXTENSION', { title: e.propertyTitle }))) return;

    this.run(e.transactionId, this.api.approveExtension(e.transactionId), 'ADMIN_PAYMENTS.EXTENSION_APPROVED',
      () => this.extensions.update(list => list.filter(x => x.transactionId !== e.transactionId)));
  }

  rejectExtension(e: PendingExtensionPayment): void {
    if (!confirm(this.translate.instant('ADMIN_PAYMENTS.CONFIRM_REJECT', { name: e.propertyTitle }))) return;

    this.run(e.transactionId, this.api.rejectExtension(e.transactionId), 'ADMIN_PAYMENTS.REJECTED',
      () => this.extensions.update(list => list.filter(x => x.transactionId !== e.transactionId)));
  }

  approveExtraListing(x: PendingExtraListingPayment): void {
    if (!confirm(this.translate.instant('ADMIN_PAYMENTS.CONFIRM_APPROVE_EXTRA_LISTING', { name: x.userName }))) return;

    this.run(x.requestId, this.api.approveExtraListing(x.requestId), 'ADMIN_PAYMENTS.EXTRA_LISTING_APPROVED',
      () => this.extraListings.update(list => list.filter(y => y.requestId !== x.requestId)));
  }

  rejectExtraListing(x: PendingExtraListingPayment): void {
    if (!confirm(this.translate.instant('ADMIN_PAYMENTS.CONFIRM_REJECT', { name: x.userName }))) return;

    this.run(x.requestId, this.api.rejectExtraListing(x.requestId), 'ADMIN_PAYMENTS.REJECTED',
      () => this.extraListings.update(list => list.filter(y => y.requestId !== x.requestId)));
  }

  trackExtraListing(_: number, x: PendingExtraListingPayment): string { return x.requestId; }
  trackPlan(_: number, p: PendingPlanRequest): string { return p.requestId; }
  trackExtension(_: number, e: PendingExtensionPayment): string { return e.transactionId; }
  trackFeatured(_: number, f: PendingFeaturedPayment): string { return f.transactionId; }

  private run(id: string, call: ReturnType<AdminPaymentRequestsApiService['approvePlan']>, successKey: string, onDone: () => void): void {
    this.busyId.set(id);
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        onDone();
        this.toast.success(this.translate.instant(successKey));
        this.busyId.set(null);
      },
      error: () => {
        // The request may have been decided elsewhere meanwhile (409) — reload so the queue is true.
        this.toast.error(this.translate.instant('ADMIN_PAYMENTS.ACTION_ERROR'));
        this.busyId.set(null);
        this.load();
      }
    });
  }
}
