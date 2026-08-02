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
  EventEmitter,
  Input,
  OnChanges,
  Output,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { FavoritesApiService } from '../../core/api/favorites-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-favorite-toggle-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <button
      type="button"
      class="fav-btn"
      [class.fav-btn--active]="isFavorite()"
      [disabled]="busy()"
      (click)="toggle($event)"
      [attr.aria-pressed]="isFavorite()"
      [attr.aria-label]="isFavorite() ? 'إزالة من المفضلة' : 'أضف للمفضلة'"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" [attr.fill]="isFavorite() ? 'currentColor' : 'none'">
        <path d="M9 15.5S2 11 2 6.5a4 4 0 018-1.36A4 4 0 0118 6.5c0 4.5-7 9-9 9z" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    </button>
  `,
  styles: [`
    .fav-btn {
      width: 36px; height: 36px; border-radius: var(--r-pill, 9999px);
      border: none; background: rgba(255,255,255,.92); color: var(--gray-500, #64748b);
      display: grid; place-items: center; cursor: pointer;
      box-shadow: var(--shadow-sm, 0 2px 8px rgba(15,23,42,.08));
      transition: color .15s, transform .1s;
    }
    .fav-btn:active { transform: scale(.92); }
    .fav-btn--active { color: var(--danger, #dc2626); }
    .fav-btn:disabled { opacity: .6; cursor: default; }
  `]
})
export class FavoriteToggleButtonComponent implements OnChanges {
  private readonly favoritesApi = inject(FavoritesApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  @Input({ required: true }) propertyId!: string;
  @Input() initialFavorite = false;
  @Output() readonly changed = new EventEmitter<boolean>();

  readonly isFavorite = signal(false);
  readonly busy = signal(false);

  ngOnChanges(): void {
    this.isFavorite.set(this.initialFavorite);
  }

  toggle(event: Event): void {
    event.stopPropagation();
    event.preventDefault();

    if (!this.auth.getAccessToken()) {
      this.toast.info('سجّل الدخول أولاً لإضافة عقارات إلى المفضلة.');
      this.router.navigate(['/auth/login']);
      return;
    }

    if (this.busy() || !this.propertyId) return;

    const nextState = !this.isFavorite();
    this.busy.set(true);

    const request$ = nextState
      ? this.favoritesApi.add(this.propertyId)
      : this.favoritesApi.remove(this.propertyId);

    request$.subscribe({
      next: () => {
        this.isFavorite.set(nextState);
        this.changed.emit(nextState);
        this.busy.set(false);
      },
      error: () => {
        this.toast.error('تعذر تحديث المفضلة، حاول مرة أخرى.');
        this.busy.set(false);
      }
    });
  }
}
