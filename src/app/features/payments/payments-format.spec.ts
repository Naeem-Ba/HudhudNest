import { formatMoney, intlLocale, newIdempotencyKey, orderTone } from './payments-format';

describe('payments-format', () => {
  it('formats money in the reader\'s locale and never throws on an unknown currency', () => {
    expect(formatMoney(12.5, 'USD', 'en-US')).toContain('12.50');
    expect(formatMoney(12.5, 'XXXX', 'en-US')).toBe('12.50 XXXX');
    expect(formatMoney(null, 'USD', 'en-US')).toContain('0.00');
    expect(formatMoney(5, '', 'en-US')).toBe('5');
  });

  it('keeps Latin digits for Arabic so amounts match the invoice', () => {
    expect(intlLocale('ar')).toContain('latn');
    expect(intlLocale('de')).toBe('de-DE');
    expect(intlLocale('tr')).toBe('tr-TR');
    expect(intlLocale(undefined)).toBe('en-US');
  });

  it('colours only a confirmed payment as success', () => {
    expect(orderTone('Succeeded')).toBe('ok');
    expect(orderTone('Pending')).toBe('warn');
    expect(orderTone('Created')).toBe('warn');
    expect(orderTone('Failed')).toBe('bad');
    expect(orderTone('Cancelled')).toBe('');
  });

  it('creates keys long enough for the API (8-100 characters) and different each time', () => {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(a.length).toBeLessThanOrEqual(100);
    expect(a).not.toBe(b);
  });
});
