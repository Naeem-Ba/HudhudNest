// src/app/features/valuation-request/valuation-request.page.ts
//
// Stage 7 (Valuation module) — customer-facing "what is my property worth?" flow:
//   1. Submit governorate/district/neighborhood + property type/area (both required)/rooms + sale-or-rent + currency.
//   2. The backend answers with the automatic estimate (the same area price statistics as /price-estimate: a range of
//      asking prices in one currency, or "not enough data") and, only when there is none and offices can receive
//      requests, matches nearby offices in the same call — see CreateValuationInquiryCommandHandler. This page shows
//      whichever happened, with the Nearby-Governorate disclosure banner when matching widened beyond the governorate.
//   3. For the Office Path, a manual "check for responses" refresh — same convention this
//      codebase's other async-status views (my-service-requests, visits) already use; no
//      polling anywhere in this app.
//
// Anonymous by design (ValuationInquiry.RequesterId is nullable for a guest visitor on the
// backend) — this route carries no AuthGuard.

import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, DestroyRef, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ValuationApiService } from '../../core/api/valuation-api.service';
import {
  LookupsApiService,
  PropertyTypeLookup,
  StructuredLocationLookup,
  pickLocalizedName
} from '../../core/api/lookups-api.service';
import {
  CreateValuationInquiryPayload,
  CreateValuationInquiryResultDto,
  ValuationInquiryStatusDto,
  ValuationRequestType,
  validateCreateValuationInquiry
} from '../../core/models/valuation.model';
import { LanguageService, LangCode } from '../../core/services/language.service';
import { ToastService } from '../../shared/services/toast.service';
import { PageMetaService } from '../../core/services/page-meta.service';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';
import { LocalizedNumberPipe } from '../../shared/pipes/localized-number.pipe';
import { ComboBoxComponent, ComboOption } from '../../shared/ui/combo-box.component';
import { PlaceProposalService } from '../../core/api/place-proposal.service';
import { MARKET_CURRENCY_CODES, isMarketCurrency } from '../../core/pricing/market-currencies';
import { PreferencesService } from '../../core/services/preferences.service';
import { formatListingPrice } from '../../shared/utils/listing-price';

@Component({
  selector: 'app-valuation-request-page',
  standalone: true,
  imports: [LocalizedDatePipe, LocalizedNumberPipe, ComboBoxComponent, CommonModule, ReactiveFormsModule, TranslateModule, RouterLink],
  templateUrl: './valuation-request.page.html',
  styleUrls: ['./valuation-request.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ValuationRequestPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly valuationApi = inject(ValuationApiService);
  private readonly lookupsApi = inject(LookupsApiService);
  private readonly language = inject(LanguageService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pageMeta = inject(PageMetaService);
  private readonly preferences = inject(PreferencesService);

  readonly currentLang = signal<LangCode>(this.language.getCurrent());

  readonly governorates = signal<StructuredLocationLookup[]>([]);
  readonly districts = signal<StructuredLocationLookup[]>([]);
  readonly neighborhoods = signal<StructuredLocationLookup[]>([]);
  readonly propertyTypes = signal<PropertyTypeLookup[]>([]);

  /** Resolved on first use: only a typed place needs it, and the page renders without the catalog otherwise. */
  private readonly injector = inject(Injector);
  private get placeProposals(): PlaceProposalService {
    return this.injector.get(PlaceProposalService);
  }
  readonly districtOptions = computed<ComboOption[]>(() =>
    this.districts().map(d => ({ value: d.id, label: pickLocalizedName(d, this.currentLang()) })));
  readonly neighborhoodOptions = computed<ComboOption[]>(() =>
    this.neighborhoods().map(n => ({ value: n.id, label: pickLocalizedName(n, this.currentLang()) })));
  /**
   * A district / neighborhood typed because it is not in the lists. The request itself only holds ids, so the name
   * is proposed to the administrators (signed-in people) and the request keeps the nearest known area.
   */
  districtText = '';
  neighborhoodText = '';

  readonly submitting = signal(false);
  readonly result = signal<CreateValuationInquiryResultDto | null>(null);

  readonly checkingStatus = signal(false);
  readonly statusResult = signal<ValuationInquiryStatusDto | null>(null);

  readonly requestTypes: ValuationRequestType[] = ['ForSale', 'ForRent'];
  readonly currencies = MARKET_CURRENCY_CODES;

  /** The person's display currency when it is one the estimate supports, otherwise USD. */
  private defaultCurrency(): string {
    const preferred = this.preferences.currency;
    return preferred && isMarketCurrency(preferred) ? preferred : 'USD';
  }

  readonly form = this.fb.nonNullable.group({
    governorateId: this.fb.control<number | null>(null, Validators.required),
    districtId: this.fb.control<number | null>(null),
    neighborhoodId: this.fb.control<number | null>(null),
    propertyTypeId: this.fb.control<number | null>(null, Validators.required),
    area: this.fb.control<number | null>(null, [Validators.required, Validators.min(1), Validators.max(100000)]),
    rooms: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(50)]),
    requestType: this.fb.nonNullable.control<ValuationRequestType>('ForSale', Validators.required),
    currencyCode: this.fb.nonNullable.control<string>(this.defaultCurrency())
  });

  ngOnInit(): void {
    this.pageMeta.applyTranslated('SEO.VALUATION', '/valuation', this.destroyRef);
    this.language.currentLang$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(lang => this.currentLang.set(lang));

    this.lookupsApi.getGovernorates().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: items => this.governorates.set(items),
      error: () => this.toast.show(this.translate.instant('VALUATION.LOOKUP_ERROR'), 'error')
    });

    this.lookupsApi.getPropertyTypeCatalog().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: items => this.propertyTypes.set(items),
      error: () => this.toast.show(this.translate.instant('VALUATION.LOOKUP_ERROR'), 'error')
    });

    this.bindCascadingLocationChanges();
  }

  localizedName(item: { nameAr: string; nameEn: string }): string {
    return pickLocalizedName(item, this.currentLang());
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const payload: CreateValuationInquiryPayload = {
      governorateId: raw.governorateId!,
      districtId: raw.districtId,
      neighborhoodId: raw.neighborhoodId,
      propertyTypeId: raw.propertyTypeId,
      area: raw.area,
      rooms: raw.rooms,
      requestType: raw.requestType,
      currencyCode: raw.currencyCode
    };

    const validationError = validateCreateValuationInquiry(payload);
    if (validationError) {
      this.toast.show(this.translate.instant(validationError), 'error');
      return;
    }

    this.submitting.set(true);
    this.result.set(null);
    this.statusResult.set(null);

    this.valuationApi.create(payload).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: created => {
        this.proposeTypedPlaces(payload.governorateId, payload.districtId ?? null);
        this.result.set(created);
        this.submitting.set(false);
      },
      error: () => {
        this.submitting.set(false);
        this.toast.show(this.translate.instant('VALUATION.SUBMIT_ERROR'), 'error');
      }
    });
  }

  checkStatus(): void {
    const inquiryId = this.result()?.inquiryId;
    if (!inquiryId) {
      return;
    }

    this.checkingStatus.set(true);
    this.valuationApi.getStatus(inquiryId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: status => {
        this.statusResult.set(status);
        this.checkingStatus.set(false);
      },
      error: () => {
        this.checkingStatus.set(false);
        this.toast.show(this.translate.instant('VALUATION.STATUS_ERROR'), 'error');
      }
    });
  }

  /** Start over — clears the result so the form reappears. */
  reset(): void {
    this.result.set(null);
    this.statusResult.set(null);
    this.form.reset({ requestType: 'ForSale', currencyCode: this.defaultCurrency() });
    this.districtText = '';
    this.neighborhoodText = '';
    this.districts.set([]);
    this.neighborhoods.set([]);
  }

  money(value: number | null, currency: string): string {
    return formatListingPrice(value, currency);
  }

  /** yyyy-mm-dd of an API timestamp (UTC), the same short form /price-estimate shows. */
  date(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }

  get canProposePlaces(): boolean {
    return this.placeProposals.canPropose();
  }

  onDistrictTyped(text: string | null): void {
    this.districtText = text ?? '';
  }

  onNeighborhoodTyped(text: string | null): void {
    this.neighborhoodText = text ?? '';
  }

  private proposeTypedPlaces(governorateId: number, districtId: number | null): void {
    const district = this.districtText.trim();
    const neighborhood = this.neighborhoodText.trim();
    if (district) {
      this.placeProposals.propose({ governorateId, type: 'District', name: district }).subscribe();
    }
    if (neighborhood) {
      this.placeProposals.propose({ governorateId, districtId, type: 'Neighborhood', name: neighborhood }).subscribe();
    }
  }

  private bindCascadingLocationChanges(): void {
    this.form.controls.governorateId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(governorateId => {
      this.districts.set([]);
      this.neighborhoods.set([]);
      this.districtText = '';
      this.neighborhoodText = '';
      this.form.patchValue({ districtId: null, neighborhoodId: null }, { emitEvent: false });

      if (governorateId) {
        this.lookupsApi.getDistricts(governorateId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: items => this.districts.set(items)
        });
      }
    });

    this.form.controls.districtId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(districtId => {
      this.neighborhoods.set([]);
      this.form.patchValue({ neighborhoodId: null }, { emitEvent: false });

      if (districtId) {
        this.lookupsApi.getNeighborhoods(districtId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: items => this.neighborhoods.set(items)
        });
      }
    });
  }
}
