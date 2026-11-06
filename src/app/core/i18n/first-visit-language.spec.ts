import { toSupportedLanguage } from './first-visit-language';

describe('toSupportedLanguage', () => {
  it('reads the primary subtag', () => {
    expect(toSupportedLanguage('ar-SY')).toBe('ar');
    expect(toSupportedLanguage('DE_ch')).toBe('de');
    expect(toSupportedLanguage('en')).toBe('en');
    expect(toSupportedLanguage('fr-CA')).toBeNull();
    expect(toSupportedLanguage(undefined)).toBeNull();
  });
});
