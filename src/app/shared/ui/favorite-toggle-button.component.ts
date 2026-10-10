// =============================================================
// src/app/shared/ui/favorite-toggle-button.component.ts
//
// زر مفضلة قابل لإعادة الاستخدام. قبل هذا الملف كانت FavoritesApiService
// مستخدَمة فقط داخل صفحة المفضلة نفسها — أي أن المستخدم لم يكن يملك أي
// وسيلة لإضافة عقار للمفضلة من مكان تصفحه الطبيعي (القائمة أو التفاصيل).
// =============================================================

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { FavoritesApiService } from '../../core/api/favorites-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../services/toast.service';

/**
 * The heart. It owns no favorite state of its own: whether it is filled (red) comes from
 * FavoritesApiService, the one shared set, so the same property shows the same heart on the
 * list card, the detail page and the favorites page, and a change made in one place shows
 * up everywhere at once.
 */
@Component({
  selector: 'app-favorite-toggle-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule],
  template: `
    <button
      type="button"
      class="fav-btn"
      [class.fav-btn--active]="isFavorite()"
      [disabled]="busy() || loadingState()"
      (click)="toggle($event)"
      [attr.aria-pressed]="isFavorite()"
      [attr.aria-label]="(isFavorite() ? 'FAVORITE_TOGGLE.REMOVE' : 'FAVORITE_TOGGLE.ADD') | translate"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" [attr.fill]="isFavorite() ? 'currentColor' : 'none'" aria-hidden="true">
        <path d="M9 15.5S2 11 2 6.5a4 4 0 018-1.36A4 4 0 0118 6.5c0 4.5-7 9-9 9z" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    </button>
  `,
  styles: [`
    .fav-btn {
      width: var(--icon-btn-size, 36px); height: var(--icon-btn-size, 36px); border-radius: var(--r-pill, 9999px);
      border: 1px solid var(--border, transparent); padding: 0; flex: none; background: rgba(255,255,255,.92); color: var(--gray-500, #64748b);
      display: grid; place-items: center; cursor: pointer;
      box-shadow: var(--shadow-sm, 0 2px 8px rgba(15,23,42,.08));
      transition: color .15s, transform .1s;
    }
    .fav-btn:active { transform: scale(.92); }
    .fav-btn--active { color: var(--danger, #dc2626); }
    .fav-btn:focus-visible { outline: 2px solid var(--navy, #0f2742); outline-offset: 2px; }
    .fav-btn:disabled { opacity: .6; cursor: default; }
  `]
})
export class FavoriteToggleButtonComponent {
  private readonly favoritesApi = inject(FavoritesApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  readonly propertyId = input.required<string>();
  /** Emits the new favorited state after the server confirmed the change. */
  readonly changed = output<boolean>();

  readonly busy = signal(false);
  readonly isFavorite = computed(() => this.favoritesApi.favoriteIds().has(this.propertyId()));
  /** While the user's favorites are still loading the heart cannot know its state yet. */
  readonly loadingState = computed(() => this.favoritesApi.loadState() === 'loading');

  toggle(event: Event): void {
    event.stopPropagation();
    event.preventDefault();

    if (!this.auth.getAccessToken()) {
      this.toast.info(this.translate.instant('FAVORITE_TOGGLE.LOGIN_REQUIRED'));
      this.router.navigate(['/auth/login']);
      return;
    }

    const propertyId = this.propertyId();
    if (this.busy() || !propertyId) return;

    this.busy.set(true);
    this.favoritesApi.toggleFavorite(propertyId).subscribe({
      next: nowFavorite => {
        this.changed.emit(nowFavorite);
        this.busy.set(false);
      },
      error: () => {
        this.toast.error(this.translate.instant('FAVORITE_TOGGLE.ERROR'));
        this.busy.set(false);
      }
    });
  }
}
