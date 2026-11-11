import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { LocationNamesService } from '../../core/api/location-names.service';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { catchError, of, switchMap, tap } from 'rxjs';

import { PropertyApiService } from '../../core/api/property-api.service';
import type { Property } from '../../core/models/property.model';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';
import { UrlService } from '../../core/services/url.service';
import { InterestAreasService } from '../../core/services/interest-areas.service';
import {
  LookupsApiService,
  PropertyTypeLookup,
  StructuredLocationLookup,
  pickLocalizedName
} from '../../core/api/lookups-api.service';
import { LanguageService } from '../../core/services/language.service';
import { PageMetaService } from '../../core/services/page-meta.service';
import { formatListingPrice, primaryListingPrice } from '../../shared/utils/listing-price';
import { isReservedListing } from '../../shared/utils/listing-status';
import { ListingTitlePipe } from '../../shared/pipes/listing-title.pipe';
import { ListingTitleTranslationBarComponent } from '../../shared/ui/listing-title-translation-bar.component';
import { ListingViewCountComponent } from '../../shared/ui/listing-view-count.component';
import { ComboBoxComponent, ComboOption } from '../../shared/ui/combo-box.component';

/** خيارات سقف السعر بحقل البحث — تُرسَل كـ maxPrice لصفحة النتائج. */
interface HeroPriceOption {
  value: number | null;
  labelKey: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    ListingTitlePipe,
    ListingTitleTranslationBarComponent,
    ListingViewCountComponent,
    ComboBoxComponent,
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
  readonly locations = inject(LocationNamesService);
  private readonly langService = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly urlService = inject(UrlService);
  private readonly pageMeta = inject(PageMetaService);
  private readonly interestAreas = inject(InterestAreasService);

  private readonly propertyImageWidths = [320, 480, 640, 800] as const;

  properties: Property[] = [];

  // ── Hero Search — يطابق تخطيط الموك-اب المرجعي (Location / Type / Price / Rent-Sale) ──
  // Both lists come from the catalog tables (not from the free-text city of existing listings, which holds
  // Arabic and English spellings side by side) and are shown in the visitor's language only.
  governorates: StructuredLocationLookup[] = [];
  propertyTypes: PropertyTypeLookup[] = [];
  governorateOptions: ComboOption[] = [];
  propertyTypeOptions: ComboOption[] = [];

  readonly priceOptions: HeroPriceOption[] = [
    { value: null, labelKey: 'HOME.search.price_any' },
    { value: 500, labelKey: 'HOME.search.price_500' },
    { value: 1000, labelKey: 'HOME.search.price_1000' },
    { value: 2500, labelKey: 'HOME.search.price_2500' },
    { value: 5000, labelKey: 'HOME.search.price_5000' }
  ];

  searchGovernorateId: number | null = null;
  searchPropertyTypeId: number | null = null;
  searchListingType: '' | 'ForRent' | 'ForSale' = '';
  searchMaxPrice: number | null = null;

  ngOnInit(): void {
    // Session audit (2026-10): this was the one gap missing from every other page -- '/home' is
    // what '/' actually redirects to, yet it set no title/description/canonical at all and
    // inherited whatever index.html's static shell happened to say.
    this.pageMeta.applyTranslated('SEO.HOME', '/', this.destroyRef);
    this.loadLatestProperties();
    this.loadHeroLookups();
    this.langService.currentLang$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.rebuildOptions());
  }

  localizedTypeName(item: { nameAr: string; nameEn: string }): string {
    return pickLocalizedName(item, this.langService.getCurrent());
  }

  /** يبني رابط البحث بنفس أسماء query params التي تقرأها property-list.page.ts فعليًا. */
  submitHeroSearch(): void {
    const queryParams: Record<string, string | number> = {};

    // Ids, not names: the results page then finds listings whichever language their owner typed the city in.
    if (this.searchGovernorateId) queryParams['governorateId'] = this.searchGovernorateId;
    if (this.searchPropertyTypeId) queryParams['propertyTypeId'] = this.searchPropertyTypeId;
    if (this.searchListingType) queryParams['listingType'] = this.searchListingType;
    if (this.searchMaxPrice) queryParams['maxPrice'] = this.searchMaxPrice;

    this.router.navigate(['/properties'], { queryParams });
  }

  private rebuildOptions(): void {
    const lang = this.langService.getCurrent();
    this.governorateOptions = this.governorates.map(g => ({ value: g.id, label: pickLocalizedName(g, lang) }));
    this.propertyTypeOptions = this.propertyTypes.map(t => ({ value: t.id, label: this.localizedTypeName(t) }));
  }

  private loadHeroLookups(): void {
    this.lookupsApi
      .getGovernorates()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => { this.governorates = items; this.rebuildOptions(); },
        error: () => { this.governorates = []; this.rebuildOptions(); }
      });

    this.lookupsApi
      .getPropertyTypeCatalog()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => { this.propertyTypes = items; this.rebuildOptions(); },
        error: () => { this.propertyTypes = []; this.rebuildOptions(); }
      });
  }

  private loadLatestProperties(): void {
    // The server decides the order and the six shown: featured ads of the visitor's own areas first, then
    // other featured ads (a few at most), then the newest listings. Re-sorting here by date threw the ads away.
    // The areas (profile, recent searches, saved searches) can arrive after the page, so the list follows them.
    this.interestAreas.param$
      .pipe(
        switchMap(interestGovernorateIds =>
          this.propertyApiService
            .getProperties({ page: 1, pageSize: 6, interestGovernorateIds })
            .pipe(
              catchError(err => {
                console.error('Error fetching latest properties', err);
                return of([] as Property[]);
              })
            )
        ),
        tap(data => (this.properties = data.slice(0, 6))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
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
}