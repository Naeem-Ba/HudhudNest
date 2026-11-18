// =====================================================================
// ✅ Unit Tests – valuation-request.page.spec.ts
// Stage 7 — the two required flows spelled out for this stage:
//   1. Automatic estimate available → an immediate result: a range of asking prices in one currency.
//   2. Office Path: no automatic estimate → the request is sent to matched
//      offices, including the Nearby-Governorate disclosure flag, then a
//      manual "check status" refresh surfaces any estimates received so far.
//
// No E2E framework (Cypress/Playwright/Protractor) exists anywhere in this
// repository (confirmed before writing this file) — introducing one would be
// a repo-wide infrastructure change well beyond this stage's scope. These
// are therefore full-flow tests written in this codebase's own existing
// Karma/Jasmine convention instead: constructing the real component via
// TestBed with spied dependencies and driving its public API exactly as the
// template does (form.patchValue → submit() → result()/statusResult()
// signals), the same "call ngOnInit() directly, assert on the class's own
// state rather than the rendered DOM" style property-form.page.spec.ts
// already established for a comparably form-heavy page — not a placeholder
// for real E2E coverage, but the closest equivalent this project has.
// =====================================================================
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { ValuationRequestPage } from './valuation-request.page';
import { ValuationApiService } from '../../core/api/valuation-api.service';
import { LookupsApiService, StructuredLocationLookup } from '../../core/api/lookups-api.service';
import { CreateValuationInquiryResultDto, ValuationInquiryStatusDto } from '../../core/models/valuation.model';
import { LanguageService } from '../../core/services/language.service';
import { PlaceProposalService } from '../../core/api/place-proposal.service';
import { ToastService } from '../../shared/services/toast.service';
import { PreferencesService } from '../../core/services/preferences.service';
import { PriceEstimate } from '../../core/api/price-estimate-api.service';

function estimate(available: boolean): PriceEstimate {
  return available
    ? {
        available: true, reason: null, kind: 'Sale', currencyCode: 'USD', low: 96000, mid: 120000, high: 150000,
        lowPerSqm: 800, midPerSqm: 1000, highPerSqm: 1250, sampleCount: 12, basis: 'DistrictAndType', confidence: 'Low',
        dataComputedAt: '2026-11-18T06:00:00', oldestListingAt: '2026-09-01T00:00:00', newestListingAt: '2026-11-17T00:00:00'
      }
    : {
        available: false, reason: 'not_enough_data', kind: 'Sale', currencyCode: 'USD', low: null, mid: null, high: null,
        lowPerSqm: null, midPerSqm: null, highPerSqm: null, sampleCount: 0, basis: null, confidence: null,
        dataComputedAt: null, oldestListingAt: null, newestListingAt: null
      };
}

const GOVERNORATES: StructuredLocationLookup[] = [
  { id: 1, nameAr: 'دمشق', nameEn: 'Damascus' }
];

describe('ValuationRequestPage', () => {
  let valuationApiSpy: jasmine.SpyObj<ValuationApiService>;
  let toastSpy: jasmine.SpyObj<ToastService>;

  function createComponent(preferredCurrency: string | null = null): ValuationRequestPage {
    valuationApiSpy = jasmine.createSpyObj('ValuationApiService', ['create', 'getStatus']);

    const lookupsApiSpy = jasmine.createSpyObj('LookupsApiService', [
      'getGovernorates', 'getDistricts', 'getNeighborhoods', 'getPropertyTypeCatalog'
    ]);
    lookupsApiSpy.getGovernorates.and.returnValue(of(GOVERNORATES));
    lookupsApiSpy.getDistricts.and.returnValue(of([]));
    lookupsApiSpy.getNeighborhoods.and.returnValue(of([]));
    lookupsApiSpy.getPropertyTypeCatalog.and.returnValue(of([]));

    toastSpy = jasmine.createSpyObj('ToastService', ['show']);

    TestBed.configureTestingModule({
      imports: [ValuationRequestPage],
      providers: [
        provideRouter([]),
        { provide: ValuationApiService, useValue: valuationApiSpy },
        { provide: LookupsApiService, useValue: lookupsApiSpy },
        { provide: LanguageService, useValue: { getCurrent: () => 'ar', currentLang$: of('ar') } },
        { provide: ToastService, useValue: toastSpy },
        { provide: PreferencesService, useValue: { currency: preferredCurrency } },
        {
          provide: TranslateService,
          // `stream` is what PageMetaService (SEO meta for the page) subscribes to on ngOnInit.
          useValue: Object.assign(
            jasmine.createSpyObj('TranslateService', ['instant', 'get'], {
              onLangChange: of({}), onTranslationChange: of({}), onDefaultLangChange: of({})
            }),
            { stream: () => of({}) }
          )
        }
      ]
    });

    const fixture = TestBed.createComponent(ValuationRequestPage);
    const instance = fixture.componentInstance;
    instance.ngOnInit(); // same deliberate "no fixture.detectChanges()" style as property-form.page.spec.ts
    return instance;
  }

  function fillMinimalValidForm(component: ValuationRequestPage): void {
    component.form.patchValue({ governorateId: 1, propertyTypeId: 2, area: 120, requestType: 'ForSale' });
  }

  // ── Flow 1: Fast Path ───────────────────────────────────────────

  describe('Flow 1 — automatic estimate available', () => {
    it('✅ submit() with an available estimate completes immediately with no office-path fields set', () => {
      const component = createComponent();
      fillMinimalValidForm(component);

      const completed: CreateValuationInquiryResultDto = {
        inquiryId: 'inq-1',
        status: 'Completed',
        expiresAt: '2026-03-02T12:00:00Z',
        estimate: estimate(true),
        requiresOfficeValuation: false,
        officeMatchCount: 0,
        hasMinimumOfficeCoverage: false,
        insufficientOfficeCoverage: false,
        matchedNeighboringGovernorate: false,
        officePathAvailable: true
      };
      valuationApiSpy.create.and.returnValue(of(completed));

      component.submit();

      expect(component.submitting()).toBeFalse();
      expect(component.result()).toEqual(completed);
      expect(component.result()!.requiresOfficeValuation).toBeFalse();
      expect(component.result()!.estimate.currencyCode).toBe('USD');
      expect(valuationApiSpy.create).toHaveBeenCalledWith(jasmine.objectContaining({
        governorateId: 1, propertyTypeId: 2, area: 120, requestType: 'ForSale', currencyCode: 'USD'
      }));
    });

    it('❌ a request without a property type or an area never reaches the API (valuation audit P0)', () => {
      const component = createComponent();
      component.form.patchValue({ governorateId: 1, propertyTypeId: null, area: 120 });
      component.submit();
      component.form.patchValue({ propertyTypeId: 2, area: null });
      component.submit();

      expect(valuationApiSpy.create).not.toHaveBeenCalled();
    });

    it('✅ only sale or rent can be asked, never both together', () => {
      expect(createComponent().requestTypes).toEqual(['ForSale', 'ForRent']);
    });

    it('✅ the currency starts at the person\'s display currency when the estimate supports it, else USD', () => {
      expect(createComponent('SYP').form.controls.currencyCode.value).toBe('SYP');
      TestBed.resetTestingModule();
      expect(createComponent('TRY').form.controls.currencyCode.value).toBe('USD');
    });

    it('✅ money() always names the currency', () => {
      const text = createComponent().money(120000, 'EUR');
      expect(text).toMatch(/EUR|€/);
    });

    it('❌ submit() with an invalid form (no governorate) never calls the API', () => {
      const component = createComponent();
      // governorateId left null -> form.invalid

      component.submit();

      expect(valuationApiSpy.create).not.toHaveBeenCalled();
      expect(component.result()).toBeNull();
    });

    it('❌ submit() surfaces a toast and resets submitting() on a backend error', () => {
      const component = createComponent();
      fillMinimalValidForm(component);
      valuationApiSpy.create.and.returnValue(throwError(() => new Error('network error')));

      component.submit();

      expect(component.submitting()).toBeFalse();
      expect(component.result()).toBeNull();
      expect(toastSpy.show).toHaveBeenCalled();
    });
  });

  // ── Flow 2: Office Path + Nearby-Governorate disclosure ─────────

  describe('Flow 2 — Office Path (no automatic estimate) + Nearby-Governorate disclosure', () => {
    it('✅ submit() without an automatic estimate surfaces the office-match summary and the disclosure flag', () => {
      const component = createComponent();
      fillMinimalValidForm(component);

      const officePath: CreateValuationInquiryResultDto = {
        inquiryId: 'inq-2',
        status: 'AwaitingOfficeResponses',
        expiresAt: '2026-03-02T12:00:00Z',
        estimate: estimate(false),
        requiresOfficeValuation: true,
        officeMatchCount: 2,
        hasMinimumOfficeCoverage: false,
        insufficientOfficeCoverage: true,
        matchedNeighboringGovernorate: true,
        officePathAvailable: true
      };
      valuationApiSpy.create.and.returnValue(of(officePath));

      component.submit();

      const result = component.result();
      expect(result).not.toBeNull();
      expect(result!.requiresOfficeValuation).toBeTrue();
      expect(result!.officeMatchCount).toBe(2);
      expect(result!.insufficientOfficeCoverage).toBeTrue();
      // The Nearby-Governorate disclosure rule — the template's *ngIf for the
      // disclosure banner is bound directly to this flag.
      expect(result!.matchedNeighboringGovernorate).toBeTrue();
    });

    it('✅ checkStatus() after submit() surfaces estimates received so far (manual refresh, no polling)', () => {
      const component = createComponent();
      fillMinimalValidForm(component);

      valuationApiSpy.create.and.returnValue(of({
        inquiryId: 'inq-3',
        status: 'AwaitingOfficeResponses',
        expiresAt: '2026-03-02T12:00:00Z',
        estimate: estimate(false),
        requiresOfficeValuation: true,
        officeMatchCount: 1,
        hasMinimumOfficeCoverage: false,
        insufficientOfficeCoverage: true,
        matchedNeighboringGovernorate: false,
        officePathAvailable: true
      } satisfies CreateValuationInquiryResultDto));
      component.submit();

      const statusWithEstimate: ValuationInquiryStatusDto = {
        inquiryId: 'inq-3',
        status: 'AwaitingOfficeResponses',
        expiresAt: '2026-03-02T12:00:00Z',
        estimates: [{ estimatedPrice: 175000, notes: 'تقدير أولي', submittedAt: '2026-03-01T20:00:00Z', matchLevel: 'District' }]
      };
      valuationApiSpy.getStatus.and.returnValue(of(statusWithEstimate));

      component.checkStatus();

      expect(valuationApiSpy.getStatus).toHaveBeenCalledWith('inq-3');
      expect(component.checkingStatus()).toBeFalse();
      expect(component.statusResult()?.estimates.length).toBe(1);
      expect(component.statusResult()?.estimates[0].estimatedPrice).toBe(175000);
    });

    it('reset() clears the result so the form reappears for a new request', () => {
      const component = createComponent();
      fillMinimalValidForm(component);
      valuationApiSpy.create.and.returnValue(of({
        inquiryId: 'inq-4',
        status: 'Completed',
        expiresAt: '2026-03-02T12:00:00Z',
        estimate: estimate(true),
        requiresOfficeValuation: false,
        officeMatchCount: 0,
        hasMinimumOfficeCoverage: false,
        insufficientOfficeCoverage: false,
        matchedNeighboringGovernorate: false,
        officePathAvailable: true
      } satisfies CreateValuationInquiryResultDto));
      component.submit();

      expect(component.result()).not.toBeNull();

      component.reset();

      expect(component.result()).toBeNull();
      expect(component.statusResult()).toBeNull();
      expect(component.form.value.governorateId).toBeNull();
    });
  });

  // ── A district / neighborhood typed because it is not in the lists ──
  describe('place typed by hand', () => {
    function withProposals(component: ValuationRequestPage, canPropose: boolean) {
      const proposals = jasmine.createSpyObj<PlaceProposalService>('PlaceProposalService', ['propose', 'canPropose']);
      proposals.canPropose.and.returnValue(canPropose);
      proposals.propose.and.returnValue(of(true));
      (component as unknown as { injector: unknown }).injector = { get: () => proposals };
      return proposals;
    }

    it('✅ the typed names become proposals once the request is accepted, and the request still goes out', () => {
      const component = createComponent();
      const proposals = withProposals(component, true);
      valuationApiSpy.create.and.returnValue(of({ inquiryId: 'i1', status: 'Completed' } as unknown as CreateValuationInquiryResultDto));
      fillMinimalValidForm(component);
      component.onDistrictTyped('الشعلان');
      component.onNeighborhoodTyped('حارة جديدة');

      component.submit();

      expect(valuationApiSpy.create).toHaveBeenCalledTimes(1);
      expect(proposals.propose).toHaveBeenCalledWith({ governorateId: 1, type: 'District', name: 'الشعلان' });
      expect(proposals.propose).toHaveBeenCalledWith({ governorateId: 1, districtId: null, type: 'Neighborhood', name: 'حارة جديدة' });
    });

    it('✅ nothing is proposed when nothing was typed, or when the request fails', () => {
      const component = createComponent();
      const proposals = withProposals(component, true);
      valuationApiSpy.create.and.returnValue(throwError(() => new Error('boom')));
      fillMinimalValidForm(component);
      component.onDistrictTyped('الشعلان');
      component.submit();
      expect(proposals.propose).not.toHaveBeenCalled();

      valuationApiSpy.create.and.returnValue(of({ inquiryId: 'i2' } as unknown as CreateValuationInquiryResultDto));
      component.onDistrictTyped(null);
      component.submit();
      expect(proposals.propose).not.toHaveBeenCalled();
    });

    it('✅ changing the governorate clears the typed names, which belonged to the previous one', () => {
      const component = createComponent();
      component.onDistrictTyped('الشعلان');
      component.form.controls.governorateId.setValue(1);
      expect(component.districtText).toBe('');
    });

    it('✅ the lists are shown in the page language', () => {
      const component = createComponent();
      component.districts.set([{ id: 5, nameAr: 'المزة', nameEn: 'Mazzeh' }]);
      expect(component.districtOptions()).toEqual([{ value: 5, label: 'المزة' }]);
    });
  });

});
