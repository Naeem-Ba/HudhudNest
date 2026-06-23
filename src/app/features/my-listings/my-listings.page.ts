// =============================================================
// src/app/features/my-listings/my-listings.page.ts
//
// بديل عن: meine-anzeigen/meine-anzeigen.component.ts
//
// التحسينات:
//   ✅ TranslateModule — جميع النصوص مترجمة (لا نص ألماني ثابت)
//   ✅ Signals + OnPush
//   ✅ inject() الحديث
//   ✅ takeUntilDestroyed لمنع Memory Leaks
//   ✅ PropertyApiService بدل WohnungenService
//   ✅ SkeletonCardGrid أثناء التحميل
//   ✅ تأكيد قبل الحذف
//   ✅ عرض حالة النشر ودايز المتبقية
// =============================================================

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { PropertyApiService } from '../../core/services/property-api.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../shared/services/toast.service';
import { Property } from '../../core/models/property.model';
import { SkeletonCardGridComponent } from '../../shared/ui/skeleton-card-grid.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';

@Component({
  selector: 'app-my-listings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    SkeletonCardGridComponent,
    EmptyStateComponent,
    ImageFallbackDirective
  ],
  templateUrl: './my-listings.page.html',
  styleUrls: ['./my-listings.page.scss']
})
export class MyListingsPage implements OnInit {

  // ── DI ────────────────────────────────────────────────────────────────
  private readonly api        = inject(PropertyApiService);
  private readonly auth       = inject(AuthService);
  private readonly router     = inject(Router);
  private readonly toast      = inject(ToastService);
  private readonly translate  = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  // ── State ─────────────────────────────────────────────────────────────
  readonly listings     = signal<Property[]>([]);
  readonly loading      = signal(false);
  readonly error        = signal('');
  readonly deletingId   = signal<string | null>(null);

  readonly fallbackImage = '/images/no-image.svg';
  private readonly now = Date.now();

  ngOnInit(): void {
    this.loadMyListings();
  }

  loadMyListings(): void {
    this.loading.set(true);
    this.error.set('');

    // نحصل على الـ OwnerId من الـ AuthService ثم نفلتر به
    const currentUser = this.auth.getAccessToken()
      ? (this.auth as any).currentUserSubject?.value
      : null;

    const ownerId = currentUser?.id ?? currentUser?.Id ?? '';

    this.api
      .getProperties({ ownerId: ownerId || undefined, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.listings.set(data ?? []);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('MY_LISTINGS.LOAD_ERROR');
          this.loading.set(false);
        }
      });
  }

  edit(id: string | undefined): void {
    if (id) this.router.navigate(['/properties/edit', id]);
  }

  confirmDelete(id: string | undefined): void {
    if (!id) return;
    const confirmed = confirm(this.translate.instant('MY_LISTINGS.CONFIRM_DELETE'));
    if (confirmed) this.delete(id);
  }

  private delete(id: string): void {
    this.deletingId.set(id);
    this.api
      .deleteProperty(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.listings.update(prev => prev.filter(p => p.id !== id));
          this.toast.show(this.translate.instant('MY_LISTINGS.DELETE_SUCCESS'), 'success');
          this.deletingId.set(null);
        },
        error: () => {
          this.toast.show(this.translate.instant('MY_LISTINGS.DELETE_ERROR'), 'error');
          this.deletingId.set(null);
        }
      });
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  getMainImage(p: Property): string {
    return (
      p.mainImageUrl
      ?? p.images?.find(img => img.isMain)?.url
      ?? p.images?.[0]?.url
      ?? this.fallbackImage
    );
  }

  getPrice(p: Property): string {
    const price = p.purchasePrice ?? p.warmRent ?? p.coldRent;
    if (!price) return '—';
    const currency = p.currencyCode ?? 'EUR';
    try {
      return new Intl.NumberFormat('ar', {
        style: 'currency', currency, maximumFractionDigits: 0
      }).format(price);
    } catch {
      return `${price.toLocaleString('ar')} ${currency}`;
    }
  }

  daysLeft(expiresAt: string | undefined | null): number | null {
    if (!expiresAt) return null;
    const diff = new Date(expiresAt).getTime() - this.now;
    return Math.ceil(diff / 86_400_000);
  }

  isExpiringSoon(expiresAt: string | undefined | null): boolean {
    const days = this.daysLeft(expiresAt);
    return days !== null && days <= 7;
  }

  trackById(_: number, p: Property): string {
    return p.id ?? String(_);
  }
}