import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';

import { resolveInitialLanguage } from '../../app.config';
import { LanguageService } from './language.service';

describe('LanguageService first-visit behaviour (Arabic is the default display language)', () => {
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

  for (const device of [['de-DE'], ['en-US'], ['fr-FR'], []]) {
    it(`shows Arabic on a first visit whatever the device language (${device.join(',') || 'none'}), without storing it`, async () => {
      deviceLanguages = device;
      const service = TestBed.inject(LanguageService);

      await resolveInitialLanguage(service)();

      expect(service.getCurrent()).toBe('ar');
      expect(document.documentElement.dir).toBe('rtl');
      expect(document.documentElement.lang).toBe('ar');
      expect(localStorage.getItem('lang')).toBeNull();
      expect(service.hasStoredPreference()).toBeFalse();
    });
  }

  it('never overrides a language the user chose earlier', async () => {
    localStorage.setItem('lang', 'en');
    const service = TestBed.inject(LanguageService);

    await resolveInitialLanguage(service)();

    expect(service.getCurrent()).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(service.hasUserChoice()).toBeTrue();
  });

  it('ignores and removes a language that an earlier build detected automatically (lang_auto)', async () => {
    localStorage.setItem('lang_auto', 'de');
    const service = TestBed.inject(LanguageService);

    await resolveInitialLanguage(service)();

    expect(service.getCurrent()).toBe('ar');
    expect(localStorage.getItem('lang_auto')).toBeNull();
    expect(service.hasStoredPreference()).toBeFalse();
  });

  it('an explicit choice is stored and survives the next start', () => {
    TestBed.inject(LanguageService).use('de');

    expect(localStorage.getItem('lang')).toBe('de');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: TranslateService, useValue: translate }] });
    expect(TestBed.inject(LanguageService).getCurrent()).toBe('de');
  });

  describe('a shared link with ?lang= (QA Phase 16, D10)', () => {
    afterEach(() => history.replaceState(null, '', location.pathname));

    it('decides the language of a visitor who never chose one, without storing it', async () => {
      history.replaceState(null, '', `${location.pathname}?lang=de`);
      const service = TestBed.inject(LanguageService);

      await resolveInitialLanguage(service)();

      expect(service.getCurrent()).toBe('de');
      expect(localStorage.getItem('lang')).toBeNull();
    });

    it('never overrides a language the visitor picked themselves', async () => {
      localStorage.setItem('lang', 'ar');
      history.replaceState(null, '', `${location.pathname}?lang=de`);
      const service = TestBed.inject(LanguageService);

      await resolveInitialLanguage(service)();

      expect(service.getCurrent()).toBe('ar');
    });

    it('ignores a value that is not a supported language and keeps Arabic', async () => {
      history.replaceState(null, '', `${location.pathname}?lang=xx`);
      const service = TestBed.inject(LanguageService);

      await resolveInitialLanguage(service)();

      expect(service.getCurrent()).toBe('ar');
    });
  });
});
