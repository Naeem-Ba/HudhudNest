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

import { PropertyApiService } from '../../core/api/property-api.service';
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
  private readonly api = inject(PropertyApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly listings = signal<Property[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly deletingId = signal<string | null>(null);

  readonly fallbackImage = '/images/no-image.svg';
  private readonly now = Date.now();

  ngOnInit(): void {
    this.loadMyListings();
  }

  loadMyListings(): void {
    this.loading.set(true);
    this.error.set('');

    // Security boundary: the backend derives the owner from JWT.
    // The frontend must not request all properties and filter ownership locally.
    this.api
      .getMyProperties()
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
    if (id) {
      void this.router.navigate(['/properties/edit', id]);
    }
  }

  confirmDelete(id: string | undefined): void {
    if (!id) {
      return;
    }

    const confirmed = confirm(this.translate.instant('MY_LISTINGS.CONFIRM_DELETE'));
    if (confirmed) {
      this.delete(id);
    }
  }

  private delete(id: string): void {
    this.deletingId.set(id);

    this.api
      .deleteProperty(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.listings.update(prev => prev.filter(property => property.id !== id));
          this.toast.show(this.translate.instant('MY_LISTINGS.DELETE_SUCCESS'), 'success');
          this.deletingId.set(null);
        },
        error: () => {
          this.toast.show(this.translate.instant('MY_LISTINGS.DELETE_ERROR'), 'error');
          this.deletingId.set(null);
        }
      });
  }

  getMainImage(property: Property): string {
    return (
      property.mainImageUrl ||
      property.images?.find(image => image.isMain)?.url ||
      property.images?.[0]?.url ||
      property.imageUrls?.[0] ||
      this.fallbackImage
    );
  }

  isPublished(property: Property): boolean {
    return property.isPublished === true || property.status === 'Available';
  }

  getPrice(property: Property): string {
    const price = property.purchasePrice ?? property.warmRent ?? property.coldRent;

    if (!price) {
      return '—';
    }

    const currency = property.currencyCode ?? 'EUR';

    try {
      return new Intl.NumberFormat('ar', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0
      }).format(price);
    } catch {
      return `${price.toLocaleString('ar')} ${currency}`;
    }
  }

  daysLeft(expiresAt: string | undefined | null): number | null {
    if (!expiresAt) {
      return null;
    }

    const expiry = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiry)) {
      return null;
    }

    return Math.ceil((expiry - this.now) / 86_400_000);
  }

  isExpiringSoon(expiresAt: string | undefined | null): boolean {
    const days = this.daysLeft(expiresAt);
    return days !== null && days > 0 && days <= 7;
  }

  trackById(index: number, property: Property): string {
    return property.id || String(index);
  }
}