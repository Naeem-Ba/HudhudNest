import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';

import { PropertyApiService } from '../../core/api/property-api.service';
import type { Property } from '../../core/models/property.model';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';
import { UrlService } from '../../core/services/url.service';
import {
  LookupsApiService,
  LookupItem,
  PropertyTypeLookup,
  pickLocalizedName
} from '../../core/api/lookups-api.service';
import { LanguageService } from '../../core/services/language.service';
import { MetaService } from '../../core/services/meta.service';
import { PropertyShareUrlService } from '../../core/sharing/property-share-url.service';
import { formatListingPrice, primaryListingPrice } from '../../shared/utils/listing-price';
import { isReservedListing } from '../../shared/utils/listing-status';
import { ListingViewCountComponent } from '../../shared/ui/listing-view-count.component';

/** خيارات سقف السعر بحقل البحث — تُرسَل كـ maxPrice لصفحة النتائج. */
interface HeroPriceOption {
  value: number | null;
  labelKey: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    ListingViewCountComponent,
    CommonModule,
    RouterLink,
    FormsModule,
    TranslateModule,
    ImageFallbackDirective
  ],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

  /** A reserved listing stays on the page, tagged and drawn lighter (P7-D08). */
  readonly isReserved = isReservedListing;

  private readonly propertyApiService = inject(PropertyApiService);
  private readonly lookupsApi = inject(LookupsApiService);
  private readonly langService = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly urlService = inject(UrlService);
  private readonly meta = inject(MetaService);
  private readonly shareUrl = inject(PropertyShareUrlService);

  private readonly propertyImageWidths = [320, 480, 640, 800] as const;

  properties: Property[] = [];

  // ── Hero Search — يطابق تخطيط الموك-اب المرجعي (Location / Type / Price / Rent-Sale) ──
  cities: LookupItem[] = [];
  propertyTypes: PropertyTypeLookup[] = [];

  readonly priceOptions: HeroPriceOption[] = [
    { value: null, labelKey: 'HOME.search.price_any' },
    { value: 500, labelKey: 'HOME.search.price_500' },
    { value: 1000, labelKey: 'HOME.search.price_1000' },
    { value: 2500, labelKey: 'HOME.search.price_2500' },
    { value: 5000, labelKey: 'HOME.search.price_5000' }
  ];

  searchCity = '';
  searchPropertyTypeText = '';
  searchListingType: '' | 'ForRent' | 'ForSale' = '';
  searchMaxPrice: number | null = null;

  ngOnInit(): void {
    // Session audit (2026-10): this was the one gap missing from every other page -- '/home' is
    // what '/' actually redirects to, yet it set no title/description/canonical at all and
    // inherited whatever index.html's static shell happened to say.
    this.meta.setHomeMeta(`${this.shareUrl.getSiteOrigin()}/`);
    this.loadLatestProperties();
    this.loadHeroLookups();
  }

  localizedTypeName(item: { nameAr: string; nameEn: string }): string {
    return pickLocalizedName(item, this.langService.getCurrent());
  }

  /** يبني رابط البحث بنفس أسماء query params التي تقرأها property-list.page.ts فعليًا. */
  submitHeroSearch(): void {
    const queryParams: Record<string, string | number> = {};

    if (this.searchCity) queryParams['city'] = this.searchCity;

    const propertyTypeId = this.resolvePropertyTypeId(this.searchPropertyTypeText);
    if (propertyTypeId) queryParams['propertyTypeId'] = propertyTypeId;

    if (this.searchListingType) queryParams['listingType'] = this.searchListingType;
    if (this.searchMaxPrice) queryParams['maxPrice'] = this.searchMaxPrice;

    this.router.navigate(['/properties'], { queryParams });
  }

  /**
   * يحوّل النص المكتوب في حقل "نوع العقار" (datalist حرّ) إلى الـ id الذي يتوقعه
   * الباك اند — مطابقة غير حسّاسة لحالة الأحرف مع الاسم المُترجَم الحالي، حتى لا
   * يُرسَل propertyTypeId خاطئ لو كتب المستخدم نصًا لا يطابق أي خيار فعليًا.
   */
  private resolvePropertyTypeId(text: string): number | null {
    const trimmed = text.trim().toLowerCase();
    if (!trimmed) return null;

    const match = this.propertyTypes.find(
      t => this.localizedTypeName(t).trim().toLowerCase() === trimmed
    );

    return match?.id ?? null;
  }

  private loadHeroLookups(): void {
    this.lookupsApi
      .getCities()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: items => this.cities = items, error: () => this.cities = [] });

    this.lookupsApi
      .getPropertyTypeCatalog()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: items => this.propertyTypes = items, error: () => this.propertyTypes = [] });
  }

  private loadLatestProperties(): void {
    this.propertyApiService
      .getProperties()
      .pipe(
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: data => {
          this.properties = [...data]
            .sort(
              (a, b) =>
                this.dateValue(b.createdAt) -
                this.dateValue(a.createdAt)
            )
            .slice(0, 6);
        },
        error: err => {
          console.error(
            'Error fetching latest properties',
            err
          );

          this.properties = [];
        }
      });
  }

  /** Same price rule and format as the list and detail pages (see shared/utils/listing-price.ts). */
  getPrice(property: Property): string {
    return formatListingPrice(primaryListingPrice(property), property.currencyCode);
  }

  propertyImageUrl(property: Property, width = 640): string {
    const source = this.propertyImageSource(property);

    return (
      this.urlService.buildResponsiveUrl(source, width) ??
      '/images/no-image.svg'
    );
  }

  propertyImageSrcSet(property: Property): string | null {
    return this.urlService.buildResponsiveSrcSet(
      this.propertyImageSource(property),
      this.propertyImageWidths
    );
  }

  private propertyImageSource(property: Property): string | undefined {
    return property.images?.[0]?.url || property.mainImageUrl;
  }

  private dateValue(value?: string): number {
    if (!value) {
      return 0;
    }

    const time = new Date(value).getTime();

    return Number.isFinite(time) ? time : 0;
  }
}