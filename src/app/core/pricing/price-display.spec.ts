import { ExchangeRate, describePrice } from './price-display';

describe('describePrice', () => {
  const eurToUsd: ExchangeRate = { rate: 1.1, from: 'EUR', to: 'USD', source: 'test', asOf: '2026-10-10T00:00:00Z' };

  it('shows the original price when no display currency was chosen', () => {
    const result = describePrice(1000, 'EUR', null, null, 'en-US');

    expect(result.converted).toBeFalse();
    expect(result.text).toBe('€1,000.00');
  });

  it('shows the original price, not a relabelled number, when there is no exchange rate', () => {
    const result = describePrice(1000, 'EUR', 'USD', null, 'en-US');

    expect(result.converted).toBeFalse();
    expect(result.text).toBe('€1,000.00');
    expect(result.text).not.toContain('$');
  });

  it('converts the number itself when there is a rate for exactly that pair', () => {
    const result = describePrice(1000, 'EUR', 'USD', eurToUsd, 'en-US');

    expect(result.converted).toBeTrue();
    expect(result.text).toBe('$1,100.00');
    expect(result.originalText).toBe('€1,000.00');
  });

  it('ignores a rate for a different pair', () => {
    expect(describePrice(1000, 'SYP', 'USD', eurToUsd, 'en-US').converted).toBeFalse();
  });

  it('ignores an invalid rate', () => {
    expect(describePrice(1000, 'EUR', 'USD', { ...eurToUsd, rate: 0 }, 'en-US').converted).toBeFalse();
    expect(describePrice(1000, 'EUR', 'USD', { ...eurToUsd, rate: NaN }, 'en-US').converted).toBeFalse();
  });

  it('does nothing when the display currency is the listing currency', () => {
    expect(describePrice(1000, 'EUR', 'EUR', eurToUsd, 'en-US').converted).toBeFalse();
  });

  it('uses each currency\'s own number of decimals', () => {
    const toJpy: ExchangeRate = { rate: 160.4, from: 'EUR', to: 'JPY', source: 'test', asOf: '2026-10-10T00:00:00Z' };

    expect(describePrice(10, 'EUR', 'JPY', toJpy, 'en-US').text).toBe('¥1,604');
  });

  it('formats with the locale it is given', () => {
    expect(describePrice(1234.5, 'EUR', null, null, 'de-DE').text).toContain('1.234,50');
  });
});
