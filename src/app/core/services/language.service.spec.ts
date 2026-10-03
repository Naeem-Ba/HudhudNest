import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';

import { resolveInitialLanguage } from '../../app.config';
import { GeoCountryService } from './geo-country.service';
import { LanguageService } from './language.service';

describe('LanguageService first-visit behaviour', () => {
  let translate: jasmine.SpyObj<TranslateService>;
  let deviceLanguages: string[];

  beforeEach(() => {
    localStorage.removeItem('lang');
    localStorage.removeItem('lang_auto');
    deviceLanguages = ['en-US'];

    translate = jasmine.createSpyObj<TranslateService>('TranslateService', ['addLangs', 'use', 'setFallbackLang', 'setDefaultLang']);
    TestBed.configureTestingModule({ providers: [{ provide: TranslateService, useValue: translate }] });
    spyOnProperty(navigator, 'languages', 'get').and.callFake(() => deviceLanguages);
  });

  afterEach(() => {
    localStorage.removeItem('lang');
    localStorage.removeItem('lang_auto');
    document.documentElement.dir = '';
  });

  function geo(country: string | null): GeoCountryService {
    return { fetchCountryCode: () => Promise.resolve(country) } as unknown as GeoCountryService;
  }

  function geoSpy(country: string | null): { service: GeoCountryService; fetchCountryCode: jasmine.Spy } {
    const fetchCountryCode = jasmine.createSpy('fetchCountryCode').and.resolveTo(country);
    return { service: { fetchCountryCode } as unknown as GeoCountryService, fetchCountryCode };
  }

  it('shows the device language at once on a first visit without remembering it', () => {
    deviceLanguages = ['de-DE'];
    const service = TestBed.inject(LanguageService);

    expect(service.getCurrent()).toBe('de');
    expect(localStorage.getItem('lang')).toBeNull();
    expect(localStorage.getItem('lang_auto')).toBeNull();
    expect(service.hasStoredPreference()).toBeFalse();
  });

  it('defaults to Arabic when the device language is not supported', () => {
    deviceLanguages = ['fr-FR'];

    expect(TestBed.inject(LanguageService).getCurrent()).toBe('ar');
  });

  it('the device language wins over the country and no lookup is made', async () => {
    deviceLanguages = ['en-US'];
    const { service: geoService, fetchCountryCode } = geoSpy('SY');
    const service = TestBed.inject(LanguageService);

    await resolveInitialLanguage(service, geoService)();

    expect(service.getCurrent()).toBe('en');
    expect(fetchCountryCode).not.toHaveBeenCalled();
    expect(localStorage.getItem('lang_auto')).toBeNull();
  });

  it('an Arabic device in a German-speaking country stays Arabic', async () => {
    deviceLanguages = ['ar-SY'];
    const { service: geoService, fetchCountryCode } = geoSpy('DE');
    const service = TestBed.inject(LanguageService);

    await resolveInitialLanguage(service, geoService)();

    expect(service.getCurrent()).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(fetchCountryCode).not.toHaveBeenCalled();
  });

  it('an unsupported device language falls back to the country and remembers it as an automatic choice', async () => {
    deviceLanguages = ['fr-FR'];
    const service = TestBed.inject(LanguageService);

    await resolveInitialLanguage(service, geo('SY'))();

    expect(service.getCurrent()).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(localStorage.getItem('lang_auto')).toBe('ar');
    expect(localStorage.getItem('lang')).toBeNull();
  });

  it('uses German for a German-speaking country when the device language is unsupported', async () => {
    deviceLanguages = ['fr-FR'];
    const service = TestBed.inject(LanguageService);

    await resolveInitialLanguage(service, geo('CH'))();

    expect(service.getCurrent()).toBe('de');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('English for an unsupported device language in a country with no special rule', async () => {
    deviceLanguages = ['tr-TR'];
    const service = TestBed.inject(LanguageService);

    await resolveInitialLanguage(service, geo('US'))();

    expect(service.getCurrent()).toBe('en');
    expect(localStorage.getItem('lang_auto')).toBe('en');
  });

  it('does not remember the result when the country is unknown, so the lookup is retried next time', async () => {
    deviceLanguages = ['fr-FR'];
    const service = TestBed.inject(LanguageService);

    await resolveInitialLanguage(service, geo(null))();

    expect(service.getCurrent()).toBe('ar');
    expect(localStorage.getItem('lang_auto')).toBeNull();
  });

  it('never overrides a language the user chose earlier, and does not even look up the country', async () => {
    deviceLanguages = ['fr-FR'];
    localStorage.setItem('lang', 'en');
    const { service: geoService, fetchCountryCode } = geoSpy('SY');
    const service = TestBed.inject(LanguageService);

    await resolveInitialLanguage(service, geoService)();

    expect(service.getCurrent()).toBe('en');
    expect(fetchCountryCode).not.toHaveBeenCalled();
  });

  it('reuses an earlier automatic choice without another lookup', async () => {
    deviceLanguages = ['fr-FR'];
    localStorage.setItem('lang_auto', 'de');
    const { service: geoService, fetchCountryCode } = geoSpy('SY');
    const service = TestBed.inject(LanguageService);

    await resolveInitialLanguage(service, geoService)();

    expect(service.getCurrent()).toBe('de');
    expect(fetchCountryCode).not.toHaveBeenCalled();
  });

  it('an explicit choice is stored as the user choice and replaces the automatic one', () => {
    localStorage.setItem('lang_auto', 'de');
    const service = TestBed.inject(LanguageService);

    service.use('ar');

    expect(localStorage.getItem('lang')).toBe('ar');
    expect(localStorage.getItem('lang_auto')).toBeNull();
  });
});
