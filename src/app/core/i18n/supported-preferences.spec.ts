import { SUPPORTED_CURRENCIES, numberLocaleFor, toSupportedCurrency } from './supported-preferences';

describe('supported-preferences', () => {
  it('accepts supported currencies in any case and rejects the rest', () => {
    expect(toSupportedCurrency('eur')).toBe('EUR');
    expect(toSupportedCurrency(' syp ')).toBe('SYP');
    expect(toSupportedCurrency('JPY')).toBeNull();
    expect(toSupportedCurrency(null)).toBeNull();
    expect(SUPPORTED_CURRENCIES.length).toBe(6);
  });

  it('formats money with the locale of the language on screen', () => {
    expect(new Intl.NumberFormat(numberLocaleFor('de'), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(1234))
      .toContain('1.234');
    expect(new Intl.NumberFormat(numberLocaleFor('en'), { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(1234))
      .toBe('$1,234');
    // Arabic with Latin digits (QA Phase 16, D11): the site writes numbers in Latin digits everywhere.
    expect(numberLocaleFor('ar')).toBe('ar-u-nu-latn');
    expect(numberLocaleFor(null)).toBe('ar-u-nu-latn');
  });
});
