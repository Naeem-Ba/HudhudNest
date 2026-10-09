// =============================================================
// src/app/admin/location-suggestions/location-suggestions.page.ts
//
// لوحة إدارة اقتراحات المواقع — تُكمّل admin/users بنفس النمط.
// المستخدمون يكتبون اسم منطقة/حي يدوياً بنموذج العقار عندما لا يجدونه
// بالقائمة (property-form)، وهذا يُنشئ اقتراحاً هنا تلقائياً بالباك اند
// (LocationSuggestionService). هذه الصفحة تعرض الاقتراحات المعلّقة فقط
// وتتيح الموافقة (فتُنشئ صفاً حقيقياً بجدول Districts/Neighborhoods) أو
// الرفض.
// =============================================================

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { LocationSuggestionsApiService } from '../../core/api/location-suggestions-api.service';
import { LocationSuggestion } from '../../core/models/location-suggestion.model';
import { ToastService } from '../../shared/services/toast.service';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';

@Component({
  selector: 'app-admin-location-suggestions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, TranslateModule, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <section class="page">
      <header class="page-header">
        <div>
          <h1>{{ 'ADMIN_LOCATIONS.TITLE' | translate }}</h1>
          <p>{{ 'ADMIN_LOCATIONS.SUBTITLE' | translate }}</p>
        </div>
        <button type="button" class="link-btn" (click)="goBack()">{{ 'COMMON.BACK' | translate }}</button>
      </header>

      <app-loading-spinner *ngIf="loading()" [label]="'COMMON.LOADING' | translate"></app-loading-spinner>

      <app-empty-state
        *ngIf="!loading() && suggestions().length === 0"
        icon="📍"
        [title]="'ADMIN_LOCATIONS.EMPTY_TITLE' | translate"
        [message]="'ADMIN_LOCATIONS.EMPTY_MESSAGE' | translate"
      ></app-empty-state>

      <div class="suggestions-table" *ngIf="!loading() && suggestions().length > 0">
        <div class="row row--head">
          <span>{{ 'ADMIN_LOCATIONS.TYPE' | translate }}</span>
          <span>{{ 'ADMIN_LOCATIONS.NAME' | translate }}</span>
          <span>{{ 'ADMIN_LOCATIONS.PARENT' | translate }}</span>
          <span>{{ 'ADMIN_LOCATIONS.SUBMITTED_BY' | translate }}</span>
          <span>{{ 'ADMIN_LOCATIONS.ACTIONS' | translate }}</span>
        </div>

        <div class="row" *ngFor="let s of suggestions(); trackBy: trackById">
          <span [attr.data-label]="'ADMIN_LOCATIONS.TYPE' | translate">
            <span class="type-chip" [class.type-chip--district]="s.type === 'District'">
              {{ (s.type === 'District' ? 'ADMIN_LOCATIONS.TYPE_DISTRICT' : 'ADMIN_LOCATIONS.TYPE_NEIGHBORHOOD') | translate }}
            </span>
          </span>
          <span [attr.data-label]="'ADMIN_LOCATIONS.NAME' | translate"><strong>{{ s.name }}</strong></span>
          <span [attr.data-label]="'ADMIN_LOCATIONS.PARENT' | translate" class="muted">{{ s.parentName }}</span>
          <span [attr.data-label]="'ADMIN_LOCATIONS.SUBMITTED_BY' | translate" class="muted">
            {{ s.submittedByUserName || s.submittedByUserId }}
            <a *ngIf="s.propertyId" [routerLink]="['/properties', s.propertyId]" class="property-link">
              {{ 'ADMIN_LOCATIONS.VIEW_LISTING' | translate }}
            </a>
          </span>
          <span [attr.data-label]="'ADMIN_LOCATIONS.ACTIONS' | translate" class="actions">
            <button
              type="button"
              class="btn btn--primary"
              [disabled]="busyId() === s.id"
              (click)="approve(s)"
            >
              {{ busyId() === s.id ? ('COMMON.SAVING' | translate) : ('ADMIN_LOCATIONS.APPROVE' | translate) }}
            </button>
            <button
              type="button"
              class="btn btn--danger"
              [disabled]="busyId() === s.id"
              (click)="reject(s)"
            >
              {{ 'ADMIN_LOCATIONS.REJECT' | translate }}
            </button>
          </span>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: clamp(1rem, 3vw, 2rem); }
    .page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; margin-bottom:1.25rem; flex-wrap:wrap; }
    .page-header h1 { margin:0 0 .3rem; color:var(--navy); font-family:var(--font-display); font-size:clamp(1.5rem,2.6vw,2rem); }
    .page-header p { margin:0; color:var(--gray-500); }
    .link-btn { background:none; border:0; color:var(--primary-text); cursor:pointer; font-weight:600; }

    .suggestions-table { display:flex; flex-direction:column; gap:.5rem; }
    .row {
      display:grid; grid-template-columns: .9fr 1.3fr 1.3fr 1.8fr 2fr; gap:1rem; align-items:center;
      background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md);
      padding:.85rem 1rem;
    }
    .row--head { background:transparent; border:0; color:var(--gray-500); font-size:var(--text-sm); font-weight:600; padding:0 1rem; }
    .muted { color:var(--gray-400); }

    .type-chip {
      display:inline-flex; align-items:center; background:var(--gold-soft); color:var(--navy);
      border-radius:var(--r-pill); padding:.15rem .6rem; font-size:var(--text-xs); font-weight:600;
    }
    .type-chip--district { background:var(--primary-soft, var(--gold-soft)); }

    .property-link { margin-inline-start:.5rem; font-size:var(--text-xs); }

    .actions { display:flex; gap:.4rem; align-items:center; flex-wrap:wrap; }
    .btn { border-radius:var(--r-sm); padding:.4rem .75rem; font-size:var(--text-sm); cursor:pointer; border:1px solid transparent; }
    .btn--primary { background:var(--primary); color: var(--on-primary); }
    .btn--danger { background:var(--danger-soft); color:var(--danger); border-color:rgba(220,38,38,.2); }
    .btn:disabled { opacity:.6; cursor:not-allowed; }

    @media (max-width: 900px) {
      .row { grid-template-columns: 1fr; }
      .row--head { display:none; }
      .row span[data-label]::before { content: attr(data-label) ": "; font-weight:700; color:var(--gray-500); }
    }
  `]
})
export class AdminLocationSuggestionsPage implements OnInit {
  private readonly suggestionsApi = inject(LocationSuggestionsApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly suggestions = signal<LocationSuggestion[]>([]);
  readonly loading = signal(true);
  readonly busyId = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);

    this.suggestionsApi
      .getPending()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => {
          this.suggestions.set(items);
          this.loading.set(false);
        },
        error: () => {
          this.toast.error(this.translate.instant('ADMIN_LOCATIONS.LOAD_ERROR'));
          this.loading.set(false);
        }
      });
  }

  approve(suggestion: LocationSuggestion): void {
    const confirmed = confirm(
      this.translate.instant('ADMIN_LOCATIONS.CONFIRM_APPROVE', { name: suggestion.name })
    );
    if (!confirmed) return;

    this.busyId.set(suggestion.id);

    this.suggestionsApi
      .approve(suggestion.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.suggestions.update(items => items.filter(s => s.id !== suggestion.id));
          this.toast.success(this.translate.instant('ADMIN_LOCATIONS.APPROVED'));
          this.busyId.set(null);
        },
        error: () => {
          this.toast.error(this.translate.instant('ADMIN_LOCATIONS.APPROVE_ERROR'));
          this.busyId.set(null);
        }
      });
  }

  reject(suggestion: LocationSuggestion): void {
    const confirmed = confirm(
      this.translate.instant('ADMIN_LOCATIONS.CONFIRM_REJECT', { name: suggestion.name })
    );
    if (!confirmed) return;

    this.busyId.set(suggestion.id);

    this.suggestionsApi
      .reject(suggestion.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.suggestions.update(items => items.filter(s => s.id !== suggestion.id));
          this.toast.success(this.translate.instant('ADMIN_LOCATIONS.REJECTED'));
          this.busyId.set(null);
        },
        error: () => {
          this.toast.error(this.translate.instant('ADMIN_LOCATIONS.REJECT_ERROR'));
          this.busyId.set(null);
        }
      });
  }

  goBack(): void {
    this.router.navigate(['/admin/messages']);
  }

  trackById(_: number, item: LocationSuggestion): string {
    return item.id;
  }
}
