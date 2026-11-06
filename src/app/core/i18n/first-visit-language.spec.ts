import {
  ARAB_COUNTRY_CODES,
  GERMAN_SPEAKING_COUNTRY_CODES,
  pickDeviceLanguage,
  resolveFirstVisitLanguage,
  toSupportedLanguage
} from './first-visit-language';

describe('first-visit language', () => {
  describe('country known', () => {
    it('uses Arabic in every Arab country regardless of the device language', () => {
      for (const country of ARAB_COUNTRY_CODES) {
        expect(resolveFirstVisitLanguage({ country, deviceLanguages: ['en-US'] }))
          .withContext(country)
          .toBe('ar');
        expect(resolveFirstVisitLanguage({ country, deviceLanguages: ['de-DE'] }))
          .withContext(country)
          .toBe('ar');
      }
    });

    it('uses German in Germany, Austria, Switzerland and Liechtenstein', () => {
      expect([...GERMAN_SPEAKING_COUNTRY_CODES].sort()).toEqual(['AT', 'CH', 'DE', 'LI']);

      for (const country of GERMAN_SPEAKING_COUNTRY_CODES) {
        expect(resolveFirstVisitLanguage({ country, deviceLanguages: ['en-US'] }))
          .withContext(country)
          .toBe('de');
      }
    });

    it('elsewhere follows the device language when it is Arabic, English or German', () => {
      expect(resolveFirstVisitLanguage({ country: 'TR', deviceLanguages: ['ar-SY'] })).toBe('ar');
      expect(resolveFirstVisitLanguage({ country: 'TR', deviceLanguages: ['de-AT'] })).toBe('de');
      expect(resolveFirstVisitLanguage({ country: 'US', deviceLanguages: ['en-GB'] })).toBe('en');
    });

    it('elsewhere falls back to English when the device language is not one of the three', () => {
      expect(resolveFirstVisitLanguage({ country: 'FR', deviceLanguages: ['fr-FR'] })).toBe('en');
      expect(resolveFirstVisitLanguage({ country: 'JP', deviceLanguages: [] })).toBe('en');
    });

    it('accepts a lower-case or padded country code', () => {
      expect(resolveFirstVisitLanguage({ country: ' sy ', deviceLanguages: [] })).toBe('ar');
      expect(resolveFirstVisitLanguage({ country: 'de', deviceLanguages: [] })).toBe('de');
    });
  });

  describe('country unknown', () => {
    it('follows the device language when it is supported', () => {
      expect(resolveFirstVisitLanguage({ country: null, deviceLanguages: ['de-DE'] })).toBe('de');
      expect(resolveFirstVisitLanguage({ country: null, deviceLanguages: ['en-US'] })).toBe('en');
      expect(resolveFirstVisitLanguage({ country: null, deviceLanguages: ['ar'] })).toBe('ar');
    });

    it('falls back to Arabic, the app default, for any other device language', () => {
      expect(resolveFirstVisitLanguage({ country: null, deviceLanguages: ['fr-FR', 'tr'] })).toBe('ar');
      expect(resolveFirstVisitLanguage({ country: null, deviceLanguages: [] })).toBe('ar');
    });

    it('treats a malformed country like an unknown one', () => {
      expect(resolveFirstVisitLanguage({ country: 'XXX', deviceLanguages: ['en-US'] })).toBe('en');
      expect(resolveFirstVisitLanguage({ country: '', deviceLanguages: [] })).toBe('ar');
    });
  });

  describe('device language parsing', () => {
    it('reads the primary subtag', () => {
      expect(toSupportedLanguage('ar-SY')).toBe('ar');
      expect(toSupportedLanguage('DE_ch')).toBe('de');
      expect(toSupportedLanguage('en')).toBe('en');
      expect(toSupportedLanguage('fr-CA')).toBeNull();
      expect(toSupportedLanguage(undefined)).toBeNull();
    });

    it('picks the first supported language in the preference list, skipping unsupported ones', () => {
      expect(pickDeviceLanguage(['fr-FR', 'de-DE', 'en-US'])).toBe('de');
      expect(pickDeviceLanguage(['fr-FR'])).toBeNull();
    });
  });
});
