import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { AdminOfferDto } from '../api/admin-marketing.service';
import { OfferShareService, lookup } from './offer-share.service';
import { PropertyShareUrlService } from './property-share-url.service';
import { SharePlatform } from './share.model';

const DICTIONARIES: Record<string, object> = {
  ar: { OFFER_COMMON: { DISCOUNT_PERCENT: 'خصم {{value}}%', DISCOUNT_FIXED_USD: 'خصم {{value}}$', DISCOUNT_FREE_MONTH: 'شهر مجاني', DISCOUNT_FREE_MONTHS: '{{value}} أشهر مجانية' },
        OFFER_SHARE: { DEADLINE: 'ينتهي العرض في {{date}}.', SLOTS_LEFT: 'المقاعد المتبقية: {{count}}.', CTA: 'سجّل اهتمامك الآن:' } },
  en: { OFFER_COMMON: { DISCOUNT_PERCENT: '{{value}}% off', DISCOUNT_FIXED_USD: '${{value}} off', DISCOUNT_FREE_MONTH: '1 free month', DISCOUNT_FREE_MONTHS: '{{value}} free months' },
        OFFER_SHARE: { DEADLINE: 'Offer ends on {{date}}.', SLOTS_LEFT: 'Spots left: {{count}}.', CTA: 'Register your interest now:' } },
  de: { OFFER_COMMON: { DISCOUNT_PERCENT: '{{value}} % Rabatt', DISCOUNT_FIXED_USD: '{{value}} $ Rabatt', DISCOUNT_FREE_MONTH: '1 Monat gratis', DISCOUNT_FREE_MONTHS: '{{value}} Monate gratis' },
        OFFER_SHARE: { DEADLINE: 'Angebot endet am {{date}}.', SLOTS_LEFT: 'Verbleibende Plätze: {{count}}.', CTA: 'Jetzt Interesse anmelden:' } },
  tr: { OFFER_COMMON: { DISCOUNT_PERCENT: '%{{value}} indirim', DISCOUNT_FIXED_USD: '{{value}} $ indirim', DISCOUNT_FREE_MONTH: '1 ay ücretsiz', DISCOUNT_FREE_MONTHS: '{{value}} ay ücretsiz' },
        OFFER_SHARE: { DEADLINE: 'Teklif {{date}} tarihinde sona eriyor.', SLOTS_LEFT: 'Kalan kontenjan: {{count}}.', CTA: 'İlginizi şimdi kaydedin:' } },
};

function offer(over: Partial<AdminOfferDto> = {}): AdminOfferDto {
  return {
    id: 'o-1', name: 'أول 100 مكتب', description: 'وصف قصير', discountType: 'Percentage', discountValue: 25,
    targetPlanTier: null, startsAtUtc: '2026-10-01T00:00:00Z', endsAtUtc: '2026-12-31T00:00:00Z', maxRedemptions: 100,
    redeemedCount: 40, status: 'Active', terms: null, createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z', isPubliclyVisible: true, ...over,
  };
}

describe('OfferShareService', () => {
  let service: OfferShareService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: PropertyShareUrlService, useValue: { getSiteOrigin: () => 'https://hudhudnest.com' } },
      ],
    });
    service = TestBed.inject(OfferShareService);
    httpMock = TestBed.inject(HttpTestingController);
    expect(TestBed.inject(HttpClient)).toBeTruthy();
  });

  afterEach(() => httpMock.verify());

  async function build(o: AdminOfferDto, lang: 'ar' | 'en' | 'de' | 'tr', platform?: SharePlatform) {
    const pending = service.buildContent(o, lang, platform);
    await Promise.resolve();
    // The service caches each dictionary after the first download, so later calls send no request.
    httpMock.match(`/i18n/${lang}.json`).forEach(req => req.flush(DICTIONARIES[lang]));
    return pending;
  }

  it('only an offer visitors can see is shareable (no draft, paused, not-started or exhausted offer)', async () => {
    expect(service.canShare(offer())).toBeTrue();
    expect(service.canShare(offer({ status: 'Draft', isPubliclyVisible: false }))).toBeFalse();
    expect(service.canShare(offer({ status: 'Active', isPubliclyVisible: false }))).toBeFalse();
    expect(service.canShare(null)).toBeFalse();

    await expectAsync(service.buildContent(offer({ isPubliclyVisible: false }), 'ar')).toBeRejectedWithError('OFFER_NOT_SHAREABLE');
  });

  it('builds the text in Arabic, English, German and Turkish from the translation files', async () => {
    const ar = await build(offer(), 'ar');
    expect(ar.text).toContain('أول 100 مكتب');
    expect(ar.text).toContain('خصم 25%');
    expect(ar.text).toContain('المقاعد المتبقية: 60.');
    expect(ar.text).toContain('سجّل اهتمامك الآن:');

    const en = await build(offer(), 'en');
    expect(en.text).toContain('25% off');
    expect(en.text).toContain('Offer ends on Dec 31, 2026.');
    expect(en.text).toContain('Spots left: 60.');

    const de = await build(offer({ discountType: 'FreeMonths', discountValue: 3 }), 'de');
    expect(de.text).toContain('3 Monate gratis');

    const tr = await build(offer(), 'tr');
    expect(tr.text).toContain('%25 indirim');
    expect(tr.text).toContain('Teklif 31 Ara 2026 tarihinde sona eriyor.');
    expect(tr.text).toContain('Kalan kontenjan: 60.');
    expect(tr.text).toContain('İlginizi şimdi kaydedin:');
  });

  it('omits the optional lines (description, end date, remaining spots) when the offer has none', async () => {
    const content = await build(offer({ description: null, endsAtUtc: null, maxRedemptions: null }), 'en');

    expect(content.text.split('\n')).toEqual([
      'أول 100 مكتب',
      '25% off',
      `Register your interest now: ${content.url}`,
    ]);
  });

  it('links to the public landing page, with UTM attribution per platform and no internal ids', async () => {
    const plain = await build(offer(), 'en');
    expect(plain.url).toBe('https://hudhudnest.com/landing');

    const facebook = await build(offer(), 'en', SharePlatform.Facebook);
    expect(facebook.url).toBe('https://hudhudnest.com/landing?utm_source=facebook&utm_medium=social&utm_campaign=marketing_offer');
    expect(facebook.url).not.toContain('o-1');
  });

  it('lookup: substitutes params and refuses a missing key instead of leaking it into a post', () => {
    expect(lookup({ A: { B: 'x {{n}} y' } }, 'A.B', { n: 3 })).toBe('x 3 y');
    expect(() => lookup({ A: {} }, 'A.B')).toThrowError('Missing translation key: A.B');
  });
});
