// Short-stay detail page: type name, photo alt, place, check-in/out, house rules, fees, cancellation, office.
// The template is rendered with the real en/ar/de/tr files so a missing or technical text shows up here.
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { NEVER, map, of, timer } from 'rxjs';

import ar from '../../../../../public/i18n/ar.json';
import de from '../../../../../public/i18n/de.json';
import en from '../../../../../public/i18n/en.json';
import tr from '../../../../../public/i18n/tr.json';
import { ShortStayDetailPage } from './short-stay-detail.page';
import { ShortStayListingApiService } from '../../../core/api/short-stay-listing-api.service';
import { ShortStayBookingApiService } from '../../../core/api/short-stay-booking-api.service';
import { LookupsApiService } from '../../../core/api/lookups-api.service';
import { LocationsApiService } from '../../../core/api/locations-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import { PageMetaService } from '../../../core/services/page-meta.service';
import { ListingViewTrackingService } from '../../../core/listing-views/listing-view-tracking.service';
import { ListingTranslationService } from '../../../core/api/listing-translation.service';
import { ShortStayListing } from '../../../core/models/short-stay.model';

const base = {
  id: 'l1', ownerId: 'o1', propertyId: null, accommodationTypeId: 6, accommodationTypeCode: 'chalet', currencyCode: 'USD',
  title: 'Sea chalet', description: 'Nice', capacity: 4, bedrooms: 2, bathrooms: 1,
  checkInTime: '14:00:00', checkOutTime: '11:00:00', selfCheckInEnabled: true, instantBookingEnabled: false,
  requestBookingEnabled: true, latitude: 35.5, longitude: 35.8, governorateId: 6, districtId: null, neighborhoodId: null,
  locationId: 901, city: 'اللاذقية', locationVisibility: 'Exact', poolType: null, poolLocation: null,
  poolIsSeasonal: null, poolIsHeated: null, cleaningFee: 0, extraGuestFee: 0, extraBedFee: 0, allowsSmoking: false,
  allowsParties: false, allowsPets: true, petsPolicy: 'Conditional', quietHoursStart: '22:00:00', quietHoursEnd: '07:00:00',
  customRulesText: 'Small dogs only', cancellationFreeCancellationDays: 0, cancellationDepositRefundable: false,
  cancellationCustomTermsText: 'Message us first', depositPercentage: 20, isPublished: true, publishedAt: null,
  roomTypes: [], photoUrls: ['/a.jpg'], amenityIds: [],
  agency: { name: 'Sham Estates', slug: 'sham-estates', logoUrl: null, isVerified: true }
} as unknown as ShortStayListing;

describe('ShortStayDetailPage (rendered)', () => {
  let translate: TranslateService;

  async function render(listing: ShortStayListing, lang = 'en') {
    TestBed.configureTestingModule({
      imports: [ShortStayDetailPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ShortStayListingApiService, useValue: { getById: () => of(listing), getReviews: () => NEVER } },
        { provide: ShortStayBookingApiService, useValue: { getUnitAvailability: () => of([]) } },
        { provide: LookupsApiService, useValue: { getAmenities: () => of([]), getGovernorates: () => timer(0).pipe(map(() => [{ id: 6, nameAr: 'اللاذقية', nameEn: 'Latakia' }])), getDistricts: () => timer(0).pipe(map(() => [])) } },
        {
          provide: LocationsApiService,
          useValue: {
            getHierarchy: () => of([
              { id: 1, type: 'Country', nameAr: 'سوريا', nameEn: 'Syria' },
              { id: 6, type: 'Governorate', nameAr: 'اللاذقية', nameEn: 'Latakia', nameDe: 'Latakia' },
              { id: 901, type: 'City', nameAr: 'جبلة', nameEn: 'Jableh', nameDe: null }
            ])
          }
        },
        { provide: AuthService, useValue: { getCurrentUserId: () => null } },
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: PageMetaService, useValue: { clear: () => undefined, applyDynamic: () => undefined, markNotFound: () => undefined } },
        { provide: ListingViewTrackingService, useValue: { record: () => of(null) } },
        { provide: ListingTranslationService, useValue: { ensure: () => of({ targetLanguage: 'en', status: 'same_language', title: { state: 'same_language' }, description: { state: 'same_language' } }) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'l1' }), queryParamMap: convertToParamMap({}) } } }
      ]
    });
    translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', en as never);
    translate.setTranslation('ar', ar as never);
    translate.setTranslation('de', de as never);
    translate.setTranslation('tr', tr as never);
    translate.use(lang);

    const fixture = TestBed.createComponent(ShortStayDetailPage);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(resolve => setTimeout(resolve, 20));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (el: HTMLElement, sel: string) => (el.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('shows the translated type name, never the code', async () => {
    const el = await render(base, 'en');
    expect(text(el, '.ssd__type')).toBe('Chalet');
  });

  for (const [lang, expected] of [['ar', 'شاليه'], ['de', 'Chalet'], ['tr', 'Şale']] as const) {
    it(`names the type in ${lang}`, async () => {
      const el = await render(base, lang);
      expect(text(el, '.ssd__type')).toBe(expected);
    });
  }

  it('puts the translated place path on its own line', async () => {
    const el = await render(base, 'en');
    expect(text(el, '[data-testid="place-line"]')).toContain('Latakia › Jableh');
    expect(text(el, '.ssd__meta')).not.toContain('Latakia');
  });

  it('translates the photo alt text', async () => {
    const el = await render(base, 'de');
    expect(el.querySelector('.pg__img')?.getAttribute('alt')).toBe('Sea chalet - Foto 1 von 1');
  });

  it('has a separate check-in/out section with the self check-in note', async () => {
    const el = await render(base, 'en');
    const section = text(el, '[data-testid="stay-times"]');
    expect(section).toContain('Check-in from 14:00');
    expect(section).toContain('Check-out by 11:00');
    expect(section).toContain('Self check-in available');
    expect(text(el, '[data-testid="house-rules"]')).not.toContain('14:00');
  });

  it('shows conditional pets, quiet hours and the host notes in the rules', async () => {
    const el = await render(base, 'en');
    expect(text(el, '[data-testid="pets-rule"]')).toBe('Pets allowed on the host’s conditions');
    const rules = text(el, '[data-testid="house-rules"]');
    expect(rules).toContain('Quiet hours: 22:00 – 07:00');
    expect(rules).toContain('Small dogs only');
  });

  it('omits quiet hours when the host did not set both ends', async () => {
    const el = await render({ ...base, quietHoursEnd: null } as ShortStayListing, 'en');
    expect(text(el, '[data-testid="house-rules"]')).not.toContain('Quiet hours');
  });

  it('always shows the fees, saying "None" instead of hiding them', async () => {
    const el = await render(base, 'en');
    const fees = text(el, '[data-testid="fees"]');
    expect(fees).toContain('Cleaning fee: None');
    expect(fees).toContain('Extra guest fee: None');
    expect(fees).toContain('Deposit: 20% of the total');
  });

  it('shows a fee with its unit when there is one', async () => {
    const el = await render({ ...base, cleaningFee: 15, extraGuestFee: 5 } as ShortStayListing, 'en');
    const fees = text(el, '[data-testid="fees"]');
    expect(fees).toContain('Cleaning fee: 15');
    expect(fees).toContain('USD (per stay)');
    expect(fees).toContain('(per extra guest, per night)');
  });

  it('spells out the cancellation policy including a no-free-cancellation listing', async () => {
    const el = await render(base, 'en');
    const policy = text(el, '[data-testid="cancellation"]');
    expect(policy).toContain('Free cancellation is not offered.');
    expect(policy).toContain('The deposit is non-refundable.');
    expect(policy).toContain('Message us first');
  });

  it('links the office when the listing has one, and shows none otherwise', async () => {
    const el = await render(base, 'en');
    expect(text(el, '[data-testid="host-section"]')).toContain('Sham Estates');
    expect(el.querySelector('[data-testid="host-section"] a')?.getAttribute('href')).toBe('/offices/sham-estates');

    TestBed.resetTestingModule();
    const el2 = await render({ ...base, agency: null } as ShortStayListing, 'en');
    expect(el2.querySelector('[data-testid="host-section"]')).toBeNull();
  });

  it('falls back to the governorate name for an older listing without a catalog place', async () => {
    const el = await render({ ...base, locationId: undefined } as unknown as ShortStayListing, 'en');
    expect(text(el, '[data-testid="place-line"]')).toContain('Latakia');
  });
});
