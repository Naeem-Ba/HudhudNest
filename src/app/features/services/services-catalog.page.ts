import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';

import { GovernorateDirectory } from '../../core/api/governorate-directory.service';
import { ServiceOfferingService } from '../../core/api/service-offering.service';
import { AuthService } from '../../core/auth/auth.service';
import { ServiceCategoryAvailabilityDto } from '../../core/models/provider-onboarding.model';
import { SERVICE_CATEGORIES, ServiceCategory, ServiceOfferingDto } from '../../core/models/service.model';

/**
 * "خدمات هدهد نيست" — الكتالوج العام لعروض الخدمات (GET /api/ServiceOfferings?category=…،
 * AllowAnonymous). الطلب نفسه يُرسَل من صفحة العقار لأن ServiceRequest يتطلب propertyId؛
 * هذه الصفحة للتصفح فقط. تُحمَّل الفئة المختارة عند الطلب وتُخزَّن نتيجتها، بدل 13 طلباً
 * دفعة واحدة على حد public-read.
 */
@Component({
  selector: 'app-services-catalog-page',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule],
  templateUrl: './services-catalog.page.html',
  styleUrls: ['./services-catalog.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServicesCatalogPage implements OnInit {
  private readonly offeringsApi = inject(ServiceOfferingService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  readonly governorates = inject(GovernorateDirectory);
  private readonly cache = new Map<ServiceCategory, ServiceOfferingDto[]>();

  readonly categories = SERVICE_CATEGORIES;
  readonly selectedCategory = signal<ServiceCategory>('Verification');
  readonly offerings = signal<ServiceOfferingDto[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly isLoggedIn = this.auth.isLoggedIn$;
  /** Offering count per category, from what is really bookable; unknown until it loads. */
  readonly counts = signal<Partial<Record<ServiceCategory, number>>>({});

  ngOnInit(): void {
    this.governorates.ensureLoaded();
    this.load();
    this.offeringsApi.getAvailability()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => this.counts.set(this.toCounts(items)),
        // The pills still work without counts; each category loads its own offerings.
        error: () => this.counts.set({})
      });
  }

  private toCounts(items: ServiceCategoryAvailabilityDto[]): Partial<Record<ServiceCategory, number>> {
    const counts: Partial<Record<ServiceCategory, number>> = {};
    for (const item of items) counts[item.category] = item.offeringCount;
    return counts;
  }

  countFor(category: ServiceCategory): number | null {
    const value = this.counts()[category];
    return value === undefined ? null : value;
  }

  coverageOf(offering: ServiceOfferingDto): string {
    const ids = offering.providerCoverageGovernorateIds ?? [];
    return ids.length > 0 ? this.governorates.names(ids) : '';
  }

  selectCategory(category: ServiceCategory): void {
    if (category === this.selectedCategory() && !this.error()) return;
    this.selectedCategory.set(category);
    this.load();
  }

  load(): void {
    const category = this.selectedCategory();
    const cached = this.cache.get(category);
    if (cached) {
      this.offerings.set(cached);
      this.error.set(false);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(false);
    this.offerings.set([]);
    this.offeringsApi.getByCategory(category)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => {
          this.cache.set(category, items);
          // A slow response for a category the user already left must not overwrite the current one.
          if (this.selectedCategory() !== category) return;
          this.offerings.set(items);
          this.loading.set(false);
        },
        error: () => {
          if (this.selectedCategory() !== category) return;
          this.error.set(true);
          this.loading.set(false);
        }
      });
  }

  isVerified(offering: ServiceOfferingDto): boolean {
    return offering.serviceProviderVerificationLevel !== 'None';
  }

  trackById(_: number, offering: ServiceOfferingDto): string { return offering.id; }
}
