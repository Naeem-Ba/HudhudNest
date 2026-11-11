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

  it('shows the device language at once on a first visit without remembering it', () => {
    deviceLanguages = ['de-DE'];
    const service = TestBed.inject(LanguageService);

    expect(service.getCurrent()).toBe('de');
    expect(localStorage.getItem('lang')).toBeNull();
    expect(localStorage.getItem('lang_auto')).toBeNull();
    expect(service.hasStoredPreference()).toBeFalse();
  });

  it('shows Turkish (LTR) for a Turkish device and keeps the page direction left-to-right', () => {
    deviceLanguages = ['tr-TR'];
    const service = TestBed.inject(LanguageService);

    expect(service.getCurrent()).toBe('tr');
    expect(document.documentElement.lang).toBe('tr');
    expect(document.documentElement.dir).toBe('ltr');
    expect(service.hasStoredPreference()).toBeFalse();
  });

  it('lists Turkish with its native name and a left-to-right direction', () => {
    const service = TestBed.inject(LanguageService);

    expect(service.getLanguages().map(l => l.code)).toEqual(['ar', 'en', 'de', 'tr']);
    expect(service.getLanguages().find(l => l.code === 'tr')).toEqual(jasmine.objectContaining({ label: 'Türkçe', dir: 'ltr' }));
  });

  it('switching between Arabic and Turkish flips the direction both ways and stores each explicit choice', () => {
    const service = TestBed.inject(LanguageService);

    service.use('ar');
    expect(document.documentElement.dir).toBe('rtl');

    service.use('tr');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('tr');
    expect(localStorage.getItem('lang')).toBe('tr');

    service.use('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(localStorage.getItem('lang')).toBe('ar');
  });

  it('every ordered pair of the four languages can be switched to and reports the right direction', () => {
    const service = TestBed.inject(LanguageService);
    const codes = ['ar', 'en', 'de', 'tr'] as const;

    for (const from of codes) {
      for (const to of codes) {
        service.use(from, 'ephemeral');
        service.use(to, 'ephemeral');
        expect(service.getCurrent()).withContext(`${from} -> ${to}`).toBe(to);
        expect(document.documentElement.dir).withContext(`${from} -> ${to}`).toBe(to === 'ar' ? 'rtl' : 'ltr');
        expect(document.documentElement.lang).withContext(`${from} -> ${to}`).toBe(to);
      }
    }
  });

  it('a shared link with ?lang=tr opens in Turkish for a visitor who never chose', async () => {
    history.replaceState(null, '', `${location.pathname}?lang=tr`);
    try {
      const service = TestBed.inject(LanguageService);

      await resolveInitialLanguage(service, geo('SY'))();

      expect(service.getCurrent()).toBe('tr');
      expect(localStorage.getItem('lang')).toBeNull();
    } finally {
      history.replaceState(null, '', location.pathname);
    }
  });

  it('defaults to Arabic when the device language is not supported', () => {
    deviceLanguages = ['fr-FR'];

    expect(TestBed.inject(LanguageService).getCurrent()).toBe('ar');
  });

  it('applies the country-based language and remembers it as an automatic choice', async () => {
    const service = TestBed.inject(LanguageService);

    await resolveInitialLanguage(service, geo('SY'))();

    expect(service.getCurrent()).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(localStorage.getItem('lang_auto')).toBe('ar');
    expect(localStorage.getItem('lang')).toBeNull();
  });

  it('uses German for a German-speaking country', async () => {
    const service = TestBed.inject(LanguageService);

    await resolveInitialLanguage(service, geo('CH'))();

    expect(service.getCurrent()).toBe('de');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('does not remember the result when the country is unknown, so the lookup is retried next time', async () => {
    deviceLanguages = ['en-GB'];
    const service = TestBed.inject(LanguageService);

    await resolveInitialLanguage(service, geo(null))();

    expect(service.getCurrent()).toBe('en');
    expect(localStorage.getItem('lang_auto')).toBeNull();
  });

  it('never overrides a language the user chose earlier, and does not even look up the country', async () => {
    localStorage.setItem('lang', 'en');
    const fetchCountryCode = jasmine.createSpy('fetchCountryCode').and.resolveTo('SY');
    const service = TestBed.inject(LanguageService);

    await resolveInitialLanguage(service, { fetchCountryCode } as unknown as GeoCountryService)();

    expect(service.getCurrent()).toBe('en');
    expect(fetchCountryCode).not.toHaveBeenCalled();
  });

  describe('a shared link with ?lang= (QA Phase 16, D10)', () => {
    afterEach(() => history.replaceState(null, '', location.pathname));

    it('decides the language of a visitor who never chose one, without a lookup and without storing it', async () => {
      history.replaceState(null, '', `${location.pathname}?lang=de`);
      const fetchCountryCode = jasmine.createSpy('fetchCountryCode').and.resolveTo('SY');
      const service = TestBed.inject(LanguageService);

      await resolveInitialLanguage(service, { fetchCountryCode } as unknown as GeoCountryService)();

      expect(service.getCurrent()).toBe('de');
      expect(fetchCountryCode).not.toHaveBeenCalled();
      expect(localStorage.getItem('lang')).toBeNull();
      expect(localStorage.getItem('lang_auto')).toBeNull();
    });

    it('never overrides a language the visitor picked themselves', async () => {
      localStorage.setItem('lang', 'ar');
      history.replaceState(null, '', `${location.pathname}?lang=de`);
      const service = TestBed.inject(LanguageService);

      await resolveInitialLanguage(service, geo('SY'))();

      expect(service.getCurrent()).toBe('ar');
    });

    it('ignores a value that is not a supported language', async () => {
      history.replaceState(null, '', `${location.pathname}?lang=xx`);
      const service = TestBed.inject(LanguageService);

      await resolveInitialLanguage(service, geo('CH'))();

      expect(service.getCurrent()).toBe('de');
      expect(localStorage.getItem('lang_auto')).toBe('de');
    });
  });

  it('reuses an earlier automatic choice without another lookup', async () => {
    localStorage.setItem('lang_auto', 'de');
    const fetchCountryCode = jasmine.createSpy('fetchCountryCode').and.resolveTo('SY');
    const service = TestBed.inject(LanguageService);

    await resolveInitialLanguage(service, { fetchCountryCode } as unknown as GeoCountryService)();

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
