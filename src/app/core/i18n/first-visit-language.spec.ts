import {
  ARAB_COUNTRY_CODES,
  GERMAN_SPEAKING_COUNTRY_CODES,
  needsCountryLookup,
  pickDeviceLanguage,
  resolveFirstVisitLanguage,
  toSupportedLanguage
} from './first-visit-language';

describe('first-visit language', () => {
  describe('device language wins whenever it is Arabic, English or German', () => {
    it('beats an Arab country', () => {
      for (const country of ARAB_COUNTRY_CODES) {
        expect(resolveFirstVisitLanguage({ country, deviceLanguages: ['en-US'] })).withContext(country).toBe('en');
        expect(resolveFirstVisitLanguage({ country, deviceLanguages: ['de-DE'] })).withContext(country).toBe('de');
      }
    });

    it('beats a German-speaking country, so an Arabic phone in Germany stays Arabic', () => {
      expect([...GERMAN_SPEAKING_COUNTRY_CODES].sort()).toEqual(['AT', 'CH', 'DE', 'LI']);

      for (const country of GERMAN_SPEAKING_COUNTRY_CODES) {
        expect(resolveFirstVisitLanguage({ country, deviceLanguages: ['ar-SY'] })).withContext(country).toBe('ar');
        expect(resolveFirstVisitLanguage({ country, deviceLanguages: ['en-GB'] })).withContext(country).toBe('en');
      }
    });

    it('beats any other country, and works with no country at all', () => {
      expect(resolveFirstVisitLanguage({ country: 'TR', deviceLanguages: ['ar-SY'] })).toBe('ar');
      expect(resolveFirstVisitLanguage({ country: 'US', deviceLanguages: ['de-AT'] })).toBe('de');
      expect(resolveFirstVisitLanguage({ country: null, deviceLanguages: ['en-US'] })).toBe('en');
      expect(resolveFirstVisitLanguage({ country: null, deviceLanguages: ['ar'] })).toBe('ar');
    });

    it('uses the first supported language in the preference list, skipping unsupported ones', () => {
      expect(resolveFirstVisitLanguage({ country: 'SY', deviceLanguages: ['fr-FR', 'de-DE', 'en-US'] })).toBe('de');
    });
  });

  describe('device language unsupported: the country decides', () => {
    const french = ['fr-FR'];

    it('Arab countries -> Arabic', () => {
      for (const country of ARAB_COUNTRY_CODES) {
        expect(resolveFirstVisitLanguage({ country, deviceLanguages: french })).withContext(country).toBe('ar');
      }
    });

    it('German-speaking countries -> German', () => {
      for (const country of GERMAN_SPEAKING_COUNTRY_CODES) {
        expect(resolveFirstVisitLanguage({ country, deviceLanguages: french })).withContext(country).toBe('de');
      }
    });

    it('every other country -> English', () => {
      expect(resolveFirstVisitLanguage({ country: 'FR', deviceLanguages: french })).toBe('en');
      expect(resolveFirstVisitLanguage({ country: 'JP', deviceLanguages: [] })).toBe('en');
      expect(resolveFirstVisitLanguage({ country: 'TR', deviceLanguages: ['tr-TR'] })).toBe('en');
    });

    it('accepts a lower-case or padded country code', () => {
      expect(resolveFirstVisitLanguage({ country: ' sy ', deviceLanguages: french })).toBe('ar');
      expect(resolveFirstVisitLanguage({ country: 'de', deviceLanguages: french })).toBe('de');
    });

    it('no usable country -> Arabic, the app default', () => {
      expect(resolveFirstVisitLanguage({ country: null, deviceLanguages: french })).toBe('ar');
      expect(resolveFirstVisitLanguage({ country: '', deviceLanguages: [] })).toBe('ar');
      expect(resolveFirstVisitLanguage({ country: 'XXX', deviceLanguages: french })).toBe('ar');
    });
  });

  describe('needsCountryLookup', () => {
    it('is false when the device language already decides, so no request is made', () => {
      expect(needsCountryLookup(['ar-SY'])).toBeFalse();
      expect(needsCountryLookup(['fr-FR', 'en-US'])).toBeFalse();
    });

    it('is true only when nothing the device prefers is supported', () => {
      expect(needsCountryLookup(['fr-FR', 'tr'])).toBeTrue();
      expect(needsCountryLookup([])).toBeTrue();
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

    it('picks the first supported language in the preference list', () => {
      expect(pickDeviceLanguage(['fr-FR', 'de-DE', 'en-US'])).toBe('de');
      expect(pickDeviceLanguage(['fr-FR'])).toBeNull();
    });
  });
});
