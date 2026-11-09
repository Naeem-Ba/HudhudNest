import { currentUiLanguage, listSeparator, withUiLanguage } from './ui-language';

describe('ui-language', () => {
  let original: string;

  beforeEach(() => {
    original = document.documentElement.lang;
  });

  afterEach(() => {
    document.documentElement.lang = original;
  });

  const showing = (lang: string) => {
    document.documentElement.lang = lang;
  };

  describe('currentUiLanguage', () => {
    for (const lang of ['ar', 'en', 'de'] as const) {
      it(`reads "${lang}" from the page`, () => {
        showing(lang);

        expect(currentUiLanguage()).toBe(lang);
      });
    }

    it('drops a regional suffix', () => {
      showing('ar-SA');

      expect(currentUiLanguage()).toBe('ar');
    });

    it('is null for a language the app does not ship, or none at all', () => {
      showing('fr');
      expect(currentUiLanguage()).toBeNull();

      showing('');
      expect(currentUiLanguage()).toBeNull();
    });
  });

  describe('withUiLanguage', () => {
    it('adds the page language to the body', () => {
      showing('de');

      expect(withUiLanguage({ email: 'a@b.co' })).toEqual({ email: 'a@b.co', language: 'de' });
    });

    it('leaves the body exactly as it was when the language is unknown', () => {
      showing('');

      expect(withUiLanguage({ email: 'a@b.co' })).toEqual({ email: 'a@b.co' });
    });

    it('keeps a language the caller set explicitly', () => {
      showing('de');

      expect(withUiLanguage({ email: 'a@b.co', language: 'en' })).toEqual({ email: 'a@b.co', language: 'en' });
    });
  });

  describe('listSeparator', () => {
    it('is the Arabic comma only on an Arabic page', () => {
      showing('ar');
      expect(listSeparator()).toBe('، ');

      showing('de');
      expect(listSeparator()).toBe(', ');

      showing('en');
      expect(listSeparator()).toBe(', ');

      showing('');
      expect(listSeparator()).toBe(', ');
    });
  });
});
