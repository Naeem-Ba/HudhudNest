// src/app/features/valuation-request/valuation-request.page.ts
//
// Stage 7 (Valuation module) — customer-facing "what is my property worth?" flow:
//   1. Submit governorate/district/neighborhood + property type/area/rooms + sale-or-rent.
//   2. The backend runs the Fast Path (comparable listings) synchronously and, only if that
//      alone was not enough, matches nearby offices in the same call — see
//      CreateValuationInquiryCommandHandler on the backend. This page shows whichever
//      happened, with the Nearby-Governorate disclosure banner when Stage 4's matching had to
//      widen beyond the customer's own governorate.
//   3. For the Office Path, a manual "check for responses" refresh — same convention this
//      codebase's other async-status views (my-service-requests, visits) already use; no
//      polling anywhere in this app.
//
// Anonymous by design (ValuationInquiry.RequesterId is nullable for a guest visitor on the
// backend) — this route carries no AuthGuard.

import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
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

@Component({
  selector: 'app-valuation-request-page',
  standalone: true,
  imports: [LocalizedDatePipe, LocalizedNumberPipe, CommonModule, ReactiveFormsModule, TranslateModule, RouterLink],
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

  readonly currentLang = signal<LangCode>(this.language.getCurrent());

  readonly governorates = signal<StructuredLocationLookup[]>([]);
  readonly districts = signal<StructuredLocationLookup[]>([]);
  readonly neighborhoods = signal<StructuredLocationLookup[]>([]);
  readonly propertyTypes = signal<PropertyTypeLookup[]>([]);

  readonly submitting = signal(false);
  readonly result = signal<CreateValuationInquiryResultDto | null>(null);

  readonly checkingStatus = signal(false);
  readonly statusResult = signal<ValuationInquiryStatusDto | null>(null);

  readonly requestTypes: ValuationRequestType[] = ['ForSale', 'ForRent', 'ForRentAndSale'];

  readonly form = this.fb.nonNullable.group({
    governorateId: this.fb.control<number | null>(null, Validators.required),
    districtId: this.fb.control<number | null>(null),
    neighborhoodId: this.fb.control<number | null>(null),
    propertyTypeId: this.fb.control<number | null>(null),
    area: this.fb.control<number | null>(null, [Validators.min(1)]),
    rooms: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(50)]),
    requestType: this.fb.nonNullable.control<ValuationRequestType>('ForSale', Validators.required)
  });

  ngOnInit(): void {
    this.pageMeta.applyTranslated('SEO.VALUATION', '/valuation', this.destroyRef);
    this.language.currentLang$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(lang => this.currentLang.set(lang));

    this.lookupsApi.getGovernorates().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: items => this.governorates.set(items),
      error: () => this.toast.show(this.translate.instant('VALUATION.LOOKUP_ERROR'), 'error')
    });

    this.lookupsApi.getPropertyTypeCatalog().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: items => this.propertyTypes.set(items)
      // Non-fatal if this one fails — property type is optional on the request.
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
      requestType: raw.requestType
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
    this.form.reset({ requestType: 'ForSale' });
    this.districts.set([]);
    this.neighborhoods.set([]);
  }

  private bindCascadingLocationChanges(): void {
    this.form.controls.governorateId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(governorateId => {
      this.districts.set([]);
      this.neighborhoods.set([]);
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
