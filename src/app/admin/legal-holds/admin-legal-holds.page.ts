// Consistency audit P2-1: admin screen for legal holds (the endpoints existed with no UI, only Swagger/curl).
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { LEGAL_HOLD_REASON_MAX, LegalHold, LegalHoldsApiService } from '../../core/api/legal-holds-api.service';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';
import { ToastService } from '../../shared/services/toast.service';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Component({
  selector: 'app-admin-legal-holds',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LocalizedDatePipe, CommonModule, FormsModule, RouterModule, TranslateModule],
  template: `
    <section class="admin-holds">
      <h1>{{ 'ADMIN_LEGAL_HOLDS.TITLE' | translate }}</h1>
      <p class="muted">{{ 'ADMIN_LEGAL_HOLDS.SUBTITLE' | translate }}</p>

      <form class="card place" (ngSubmit)="place()" data-testid="hold-form">
        <h2>{{ 'ADMIN_LEGAL_HOLDS.PLACE_TITLE' | translate }}</h2>
        <label>
          <span>{{ 'ADMIN_LEGAL_HOLDS.ACCOUNT_ID' | translate }}</span>
          <input name="userAccountId" dir="ltr" autocomplete="off" [(ngModel)]="userAccountId" required />
        </label>
        <label>
          <span>{{ 'ADMIN_LEGAL_HOLDS.REASON' | translate }}</span>
          <textarea name="reason" rows="3" [maxlength]="reasonMax" [(ngModel)]="reason" required></textarea>
          <small class="muted">{{ reason.length }} / {{ reasonMax }}</small>
        </label>
        <p *ngIf="formError()" role="alert" class="error">{{ formError()! | translate }}</p>
        <button type="submit" class="btn btn--primary" [disabled]="saving()">{{ 'ADMIN_LEGAL_HOLDS.PLACE' | translate }}</button>
      </form>

      <div class="filters">
        <label>
          <span>{{ 'ADMIN_LEGAL_HOLDS.FILTER_ACCOUNT' | translate }}</span>
          <input name="filter" dir="ltr" autocomplete="off" [(ngModel)]="filterAccount" (keyup.enter)="load()" />
        </label>
        <label class="check">
          <input type="checkbox" name="activeOnly" [(ngModel)]="activeOnly" (ngModelChange)="load()" />
          <span>{{ 'ADMIN_LEGAL_HOLDS.ACTIVE_ONLY' | translate }}</span>
        </label>
        <button type="button" class="btn btn--secondary" (click)="load()">{{ 'ADMIN_LEGAL_HOLDS.SEARCH' | translate }}</button>
      </div>

      <p *ngIf="loadError()" role="alert" class="error">{{ 'ADMIN_LEGAL_HOLDS.LOAD_ERROR' | translate }}</p>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ 'ADMIN_LEGAL_HOLDS.ACCOUNT' | translate }}</th>
              <th>{{ 'ADMIN_LEGAL_HOLDS.REASON' | translate }}</th>
              <th>{{ 'ADMIN_LEGAL_HOLDS.PLACED_AT' | translate }}</th>
              <th>{{ 'ADMIN_LEGAL_HOLDS.STATE' | translate }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let h of items(); trackBy: trackById" data-testid="hold-row">
              <td><a dir="ltr" [routerLink]="['/admin/users', h.userAccountId]">{{ h.userAccountId.slice(0, 8) }}…</a></td>
              <td class="reason">{{ h.reason }}</td>
              <td>{{ h.placedAtUtc | localDate:'dd/MM/yyyy HH:mm' }}</td>
              <td>
                <span *ngIf="h.isActive" class="active">{{ 'ADMIN_LEGAL_HOLDS.ACTIVE' | translate }}</span>
                <span *ngIf="!h.isActive" class="muted">
                  {{ 'ADMIN_LEGAL_HOLDS.RELEASED' | translate }} · {{ h.releasedAtUtc | localDate:'dd/MM/yyyy' }}
                </span>
              </td>
              <td>
                <button type="button" class="btn btn--danger" *ngIf="h.isActive" data-testid="release"
                  [disabled]="busy() === h.id" (click)="release(h)">
                  {{ 'ADMIN_LEGAL_HOLDS.RELEASE' | translate }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p *ngIf="!loadError() && items().length === 0" class="muted">{{ 'ADMIN_LEGAL_HOLDS.EMPTY' | translate }}</p>
    </section>
  `,
  styles: [`
    .admin-holds { width: min(1100px, 100%); margin-inline: auto; padding: clamp(1rem, 3vw, 2rem); display: grid; gap: .75rem; }
    h1 { margin: 0; font-size: clamp(1.3rem, 3vw, 1.8rem); color: var(--gray-900); }
    h2 { margin: 0; font-size: 1.05rem; }
    .muted { color: var(--gray-500); margin: 0; }
    .card { border: 1px solid var(--gray-200); border-radius: var(--r-sm, 8px); padding: 1rem; display: grid; gap: .6rem; }
    label { display: grid; gap: .25rem; min-width: 0; }
    input, textarea { width: 100%; max-width: 100%; box-sizing: border-box; }
    .filters { display: flex; flex-wrap: wrap; gap: .75rem; align-items: end; }
    .filters label:first-child { flex: 1 1 16rem; }
    .check { display: inline-flex; gap: .4rem; align-items: center; }
    .check input { width: auto; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: .9rem; }
    th, td { padding: .5rem; border-bottom: 1px solid var(--gray-200); text-align: start; vertical-align: top; }
    .reason { white-space: pre-wrap; overflow-wrap: anywhere; max-width: 28rem; }
    .active { color: var(--danger-text, #b91c1c); font-weight: 600; }
    .error { color: var(--red-600, #dc2626); margin: 0; }
  `]
})
export class AdminLegalHoldsPage implements OnInit {
  private readonly api = inject(LegalHoldsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly reasonMax = LEGAL_HOLD_REASON_MAX;
  userAccountId = '';
  reason = '';
  filterAccount = '';
  activeOnly = true;

  readonly items = signal<LegalHold[]>([]);
  readonly loadError = signal(false);
  readonly formError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly busy = signal<string | null>(null);

  ngOnInit(): void {
    // Opened from an account's page: ?user=<id> fills the form and narrows the list to that account.
    const user = this.route.snapshot.queryParamMap.get('user')?.trim() ?? '';
    if (GUID.test(user)) {
      this.userAccountId = user;
      this.filterAccount = user;
    }
    this.load();
  }

  load(): void {
    const filter = this.filterAccount.trim();
    if (filter && !GUID.test(filter)) {
      this.loadError.set(false);
      this.items.set([]);
      this.toast.error(this.translate.instant('ADMIN_LEGAL_HOLDS.INVALID_ID'));
      return;
    }
    this.loadError.set(false);
    this.api.list(filter || null, this.activeOnly).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: holds => this.items.set(holds),
      error: () => this.loadError.set(true)
    });
  }

  place(): void {
    const id = this.userAccountId.trim();
    const reason = this.reason.trim();
    if (!GUID.test(id)) { this.formError.set('ADMIN_LEGAL_HOLDS.INVALID_ID'); return; }
    if (!reason) { this.formError.set('ADMIN_LEGAL_HOLDS.REASON_REQUIRED'); return; }
    if (!confirm(this.translate.instant('ADMIN_LEGAL_HOLDS.CONFIRM_PLACE'))) return;

    this.formError.set(null);
    this.saving.set(true);
    this.api.place(id, reason.slice(0, this.reasonMax)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.reason = '';
        this.toast.success(this.translate.instant('ADMIN_LEGAL_HOLDS.PLACED'));
        this.filterAccount = id;
        this.load();
      },
      error: err => {
        this.saving.set(false);
        this.formError.set(err?.status === 422 ? 'ADMIN_LEGAL_HOLDS.UNKNOWN_ACCOUNT' : 'ADMIN_LEGAL_HOLDS.SAVE_ERROR');
      }
    });
  }

  release(hold: LegalHold): void {
    if (!confirm(this.translate.instant('ADMIN_LEGAL_HOLDS.CONFIRM_RELEASE'))) return;
    this.busy.set(hold.id);
    this.api.release(hold.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.busy.set(null);
        this.toast.success(this.translate.instant('ADMIN_LEGAL_HOLDS.RELEASED_OK'));
        this.load();
      },
      error: () => {
        this.busy.set(null);
        this.toast.error(this.translate.instant('ADMIN_LEGAL_HOLDS.SAVE_ERROR'));
      }
    });
  }

  trackById(_: number, hold: LegalHold): string {
    return hold.id;
  }
}
