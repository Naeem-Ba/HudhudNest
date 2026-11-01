// Growth engine P5: admin list of referrals with reject and "reward given" actions.
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AdminReferral, AdminReferralApiService, ReferralStatus } from '../../core/api/referral-api.service';
import { ToastService } from '../../shared/services/toast.service';

@Component({
  selector: 'app-admin-referrals',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterModule, TranslateModule],
  template: `
    <section class="admin-referrals">
      <h1>{{ 'ADMIN_REFERRALS.TITLE' | translate }}</h1>
      <p class="muted">{{ 'ADMIN_REFERRALS.SUBTITLE' | translate }}</p>

      <label class="filter">
        <span>{{ 'ADMIN_REFERRALS.FILTER' | translate }}</span>
        <select name="status" [(ngModel)]="status" (ngModelChange)="load(1)">
          <option [ngValue]="null">{{ 'ADMIN_REFERRALS.ALL' | translate }}</option>
          <option *ngFor="let s of statuses" [ngValue]="s">{{ ('REFERRALS.STATUS.' + s) | translate }}</option>
        </select>
      </label>

      <p *ngIf="error()" role="alert" class="error">{{ 'ADMIN_REFERRALS.LOAD_ERROR' | translate }}</p>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ 'ADMIN_REFERRALS.DATE' | translate }}</th>
              <th>{{ 'ADMIN_REFERRALS.REFERRER' | translate }}</th>
              <th>{{ 'ADMIN_REFERRALS.INVITED' | translate }}</th>
              <th>{{ 'ADMIN_REFERRALS.STATUS' | translate }}</th>
              <th>{{ 'ADMIN_REFERRALS.ACTIONS' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of items()" data-testid="admin-ref-row">
              <td>{{ r.createdAt | date:'dd/MM/yyyy' }}</td>
              <td><a [routerLink]="['/admin/users', r.referrerUserId]">{{ r.referrerName || '—' }}</a></td>
              <td><a [routerLink]="['/admin/users', r.referredUserId]">{{ r.referredName || '—' }}</a></td>
              <td>
                {{ ('REFERRALS.STATUS.' + r.status) | translate }}
                <small *ngIf="r.reason" class="muted" dir="ltr">({{ r.reason }})</small>
                <small *ngIf="r.rewardedAt" class="ok">· {{ 'REFERRALS.REWARDED' | translate }}</small>
              </td>
              <td class="actions">
                <button type="button" class="btn btn--secondary" *ngIf="r.status === 'Qualified' && !r.rewardedAt" [disabled]="busy() === r.id" (click)="markRewarded(r)">
                  {{ 'ADMIN_REFERRALS.MARK_REWARDED' | translate }}
                </button>
                <button type="button" class="btn btn--danger" *ngIf="(r.status === 'Pending' || r.status === 'Qualified') && !r.rewardedAt" [disabled]="busy() === r.id" (click)="reject(r)">
                  {{ 'ADMIN_REFERRALS.REJECT' | translate }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p *ngIf="!error() && items().length === 0" class="muted">{{ 'ADMIN_REFERRALS.EMPTY' | translate }}</p>

      <div class="pager" *ngIf="total() > 20">
        <button type="button" class="btn btn--secondary" [disabled]="page() <= 1" (click)="load(page() - 1)">‹</button>
        <span>{{ page() }}</span>
        <button type="button" class="btn btn--secondary" [disabled]="page() * 20 >= total()" (click)="load(page() + 1)">›</button>
      </div>
    </section>
  `,
  styles: [`
    .admin-referrals { width: min(1100px, 100%); margin-inline: auto; padding: clamp(1rem, 3vw, 2rem); display: grid; gap: .75rem; }
    h1 { margin: 0; font-size: clamp(1.3rem, 3vw, 1.8rem); color: var(--gray-900); }
    .muted { color: var(--gray-500); margin: 0; }
    .filter { display: inline-flex; gap: .5rem; align-items: center; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: .9rem; }
    th, td { padding: .5rem; border-bottom: 1px solid var(--gray-200); text-align: start; vertical-align: top; }
    .actions { display: flex; gap: .4rem; flex-wrap: wrap; }
    .ok { color: var(--green-700, #15803d); }
    .error { color: var(--red-600, #dc2626); }
    .pager { display: flex; gap: .5rem; align-items: center; }
  `]
})
export class AdminReferralsPage implements OnInit {
  private readonly api = inject(AdminReferralApiService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly statuses: ReferralStatus[] = ['Pending', 'Qualified', 'Rejected', 'Expired'];
  status: ReferralStatus | null = 'Qualified';
  readonly items = signal<AdminReferral[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly busy = signal<string | null>(null);
  readonly error = signal(false);

  ngOnInit(): void {
    this.load(1);
  }

  load(page: number): void {
    this.error.set(false);
    this.api.list(this.status, page).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: p => { this.items.set(p.items); this.total.set(p.total); this.page.set(page); },
      error: () => this.error.set(true)
    });
  }

  markRewarded(r: AdminReferral): void {
    if (!confirm(this.translate.instant('ADMIN_REFERRALS.CONFIRM_REWARDED'))) return;
    this.busy.set(r.id);
    this.api.markRewarded(r.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.busy.set(null); this.toast.success(this.translate.instant('ADMIN_REFERRALS.SAVED')); this.load(this.page()); },
      error: () => { this.busy.set(null); this.toast.error(this.translate.instant('ADMIN_REFERRALS.SAVE_ERROR')); }
    });
  }

  reject(r: AdminReferral): void {
    const reason = prompt(this.translate.instant('ADMIN_REFERRALS.REJECT_REASON'))?.trim();
    if (!reason) return;
    this.busy.set(r.id);
    this.api.reject(r.id, reason.slice(0, 200)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.busy.set(null); this.toast.success(this.translate.instant('ADMIN_REFERRALS.SAVED')); this.load(this.page()); },
      error: () => { this.busy.set(null); this.toast.error(this.translate.instant('ADMIN_REFERRALS.SAVE_ERROR')); }
    });
  }
}
