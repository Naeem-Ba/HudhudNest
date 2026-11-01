import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { PriceEstimate, PriceEstimateApiService } from '../../core/api/price-estimate-api.service';
import { LookupsApiService } from '../../core/api/lookups-api.service';
import { PriceEstimatePage } from './price-estimate.page';

const estimate = (over: Partial<PriceEstimate> = {}): PriceEstimate => ({
  available: true, reason: null, kind: 'Sale', currencyCode: 'USD', low: 144000, mid: 168000, high: 192000,
  lowPerSqm: 1200, midPerSqm: 1400, highPerSqm: 1600, sampleCount: 9, basis: 'Governorate', confidence: 'Low',
  dataComputedAt: '2026-11-01T10:00:00Z', oldestListingAt: '2026-10-01T10:00:00Z', newestListingAt: '2026-10-30T10:00:00Z', ...over
});

describe('PriceEstimatePage', () => {
  let api: jasmine.SpyObj<PriceEstimateApiService>;

  function create() {
    api = jasmine.createSpyObj<PriceEstimateApiService>('PriceEstimateApiService', ['estimate', 'areas']);
    api.areas.and.returnValue(of([
      { governorateId: 1, districtId: null, propertyTypeId: null, kind: 'Sale', currencyCode: 'USD', p25PerSqm: 1200, medianPerSqm: 1400, p75PerSqm: 1600, sampleCount: 9, confidence: 'Low', computedAt: '' },
      { governorateId: 1, districtId: null, propertyTypeId: 3, kind: 'Sale', currencyCode: 'USD', p25PerSqm: 1, medianPerSqm: 2, p75PerSqm: 3, sampleCount: 8, confidence: 'Low', computedAt: '' }
    ]));
    const lookups = jasmine.createSpyObj<LookupsApiService>('LookupsApiService', ['getGovernorates', 'getPropertyTypeCatalog', 'getDistricts']);
    lookups.getGovernorates.and.returnValue(of([{ id: 1, nameAr: 'دمشق', nameEn: 'Damascus' }]));
    lookups.getPropertyTypeCatalog.and.returnValue(of([]));
    lookups.getDistricts.and.returnValue(of([]));
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: PriceEstimateApiService, useValue: api },
        { provide: LookupsApiService, useValue: lookups }
      ]
    });
    const fixture = TestBed.createComponent(PriceEstimatePage);
    fixture.detectChanges();
    return fixture;
  }

  it('does not ask before a governorate and an area are given', () => {
    const fixture = create();
    fixture.componentInstance.submit();
    expect(api.estimate).not.toHaveBeenCalled();
    const button = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="pe-submit"]') as HTMLButtonElement;
    expect(button.disabled).toBeTrue();
  });

  it('shows the range with the number of listings and only the all-types rows', () => {
    const fixture = create();
    api.estimate.and.returnValue(of(estimate()));
    const page = fixture.componentInstance;
    page.governorateId = 1;
    page.area = 120;
    page.submit();
    fixture.detectChanges();

    expect(api.estimate).toHaveBeenCalledWith(jasmine.objectContaining({ kind: 'Sale', governorateId: 1, area: 120, currency: 'USD' }));
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="pe-range"]')?.textContent).toContain('144');
    expect(el.querySelector('[data-testid="pe-sample"]')).not.toBeNull();
    expect(el.querySelectorAll('[data-testid="pe-areas"] tbody tr').length).toBe(1);
    expect(el.querySelector('[data-testid="pe-areas"] td')?.textContent).toContain('دمشق');
  });

  it('says why there is no number instead of showing zero', () => {
    const fixture = create();
    api.estimate.and.returnValue(of(estimate({ available: false, reason: 'not_enough_data', low: null, mid: null, high: null, sampleCount: 0 })));
    const page = fixture.componentInstance;
    page.governorateId = 1;
    page.area = 80;
    page.submit();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="pe-range"]')).toBeNull();
    expect(el.querySelector('[data-testid="pe-reason"]')?.textContent).toContain('PRICE_ESTIMATE.REASON.not_enough_data');
  });

  it('shows an error line when the request fails', () => {
    const fixture = create();
    api.estimate.and.returnValue(throwError(() => new Error('down')));
    const page = fixture.componentInstance;
    page.governorateId = 1;
    page.area = 80;
    page.submit();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();
    expect(page.result()).toBeNull();
  });
});
