import { accommodationTypeLabel } from './accommodation-type-label';
import ar from '../../../../public/i18n/ar.json';
import de from '../../../../public/i18n/de.json';
import en from '../../../../public/i18n/en.json';
import tr from '../../../../public/i18n/tr.json';

const files: Record<string, unknown> = { ar, en, de, tr };
const translateFor = (lang: string) => ({
  currentLang: lang,
  instant: (path: string): string => {
    let node: unknown = files[lang];
    for (const part of path.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
    return typeof node === 'string' ? node : path;
  }
});

describe('accommodationTypeLabel', () => {
  const codes = ['furnished-apartment', 'house', 'villa', 'country-house', 'farm', 'chalet', 'cabin', 'resort',
    'rest-house', 'hotel', 'hotel-room', 'aparthotel', 'guest-house', 'camp', 'caravan', 'rural-stay'];

  it('translates every seeded type in all four languages (never the raw code)', () => {
    for (const lang of ['ar', 'en', 'de', 'tr']) {
      for (const code of codes) {
        const label = accommodationTypeLabel(translateFor(lang), { code });
        expect(label).not.toBe(code);
        expect(label).not.toContain('SHORTSTAY.TYPE');
      }
    }
  });

  it('names a chalet per language', () => {
    expect(accommodationTypeLabel(translateFor('ar'), { code: 'chalet' })).toBe('شاليه');
    expect(accommodationTypeLabel(translateFor('tr'), { code: 'chalet' })).toBe('Şale');
  });

  it('shows the stored name for a type an admin added, never its code', () => {
    expect(accommodationTypeLabel(translateFor('en'), { code: 'treehouse', nameAr: 'بيت شجرة', nameEn: 'Treehouse' })).toBe('Treehouse');
    expect(accommodationTypeLabel(translateFor('ar'), { code: 'treehouse', nameAr: 'بيت شجرة', nameEn: 'Treehouse' })).toBe('بيت شجرة');
  });
});
