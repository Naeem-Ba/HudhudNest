import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ShortStayListingApiService } from '../../../core/api/short-stay-listing-api.service';
import { ToastService } from '../../../shared/services/toast.service';
import { ShortStayListingSummary, canPublishShortStay } from '../../../core/models/short-stay.model';
import { apiErrorText } from '../../../core/api/api-error-text';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';

@Component({
  selector: 'app-my-short-stay-listings-page',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, EmptyStateComponent, ImageFallbackDirective],
  templateUrl: './my-short-stay-listings.page.html',
  styleUrls: ['./my-short-stay-listings.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyShortStayListingsPage implements OnInit {
  private readonly api = inject(ShortStayListingApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly listings = signal<ShortStayListingSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly togglingId = signal<string | null>(null);
  readonly fallbackImage = '/images/no-image.svg';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.getMine().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: listings => { this.listings.set(listings); this.loading.set(false); },
      error: () => { this.error.set('SHORTSTAY.MY_LISTINGS.LOAD_ERROR'); this.loading.set(false); }
    });
  }

  create(): void {
    this.router.navigate(['/short-stay/manage/new']);
  }

  edit(id: string): void {
    this.router.navigate(['/short-stay/manage', id]);
  }

  /** Publishing is refused (409) for a listing an administrator took down; the owner sees the notice instead. */
  canPublish(listing: ShortStayListingSummary): boolean {
    return canPublishShortStay(listing);
  }

  /** The button flips publication: unpublishing is always possible, publishing only when not taken down. */
  canToggle(listing: ShortStayListingSummary): boolean {
    return listing.isPublished || this.canPublish(listing);
  }

  togglePublish(listing: ShortStayListingSummary): void {
    if (!this.canToggle(listing)) return;
    this.togglingId.set(listing.id);
    const action$ = listing.isPublished ? this.api.unpublish(listing.id) : this.api.publish(listing.id);

    action$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.listings.update(items =>
          items.map(item => item.id === listing.id ? { ...item, isPublished: !item.isPublished } : item));
        this.togglingId.set(null);
        this.toast.show(this.translate.instant('SHORTSTAY.MY_LISTINGS.TOGGLE_SUCCESS'), 'success');
      },
      error: err => {
        this.togglingId.set(null);
        this.toast.show(apiErrorText(err) ?? this.translate.instant('SHORTSTAY.MY_LISTINGS.TOGGLE_ERROR'), 'error');
      }
    });
  }

  trackById(_: number, listing: ShortStayListingSummary): string {
    return listing.id;
  }
}
