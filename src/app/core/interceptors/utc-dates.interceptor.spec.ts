import { normalizeUtcInstant, normalizeUtcInstants } from './utc-dates.interceptor';

describe('UtcDatesInterceptor helpers', () => {
  it('marks zone-less instants from the API as UTC', () => {
    expect(normalizeUtcInstant('2026-11-17T07:28:23.044876')).toBe('2026-11-17T07:28:23.044876Z');
    expect(normalizeUtcInstant('2026-11-17T07:28:23')).toBe('2026-11-17T07:28:23Z');
    expect(normalizeUtcInstant('2026-11-17T07:28')).toBe('2026-11-17T07:28Z');
  });

  it('reads the normalised value as the right instant regardless of the device zone', () => {
    expect(new Date(normalizeUtcInstant('2026-11-17T07:28:23')).toISOString()).toBe('2026-11-17T07:28:23.000Z');
  });

  it('leaves zoned values, calendar dates and plain text untouched', () => {
    for (const v of [
      '2026-11-17T07:28:23Z',
      '2026-11-17T07:28:23+03:00',
      '2026-12-01',
      '2026-12-01T00:00:00',
      '2026-12-01T00:00:00.000',
      '09:00:00',
      'Damascus 2026-11-17T07:28:23',
    ]) {
      expect(normalizeUtcInstant(v)).withContext(v).toBe(v);
    }
  });

  it('walks nested objects and arrays without mutating the input', () => {
    const body = {
      items: [{ id: 'a', createdAt: '2026-11-17T07:28:23.1', availableFrom: '2026-12-01T00:00:00', price: 5 }],
      rateUpdatedAt: '2026-11-17T01:00:00',
      title: 'x',
      nothing: null,
    };
    const out = normalizeUtcInstants(body);
    expect(out.items[0].createdAt).toBe('2026-11-17T07:28:23.1Z');
    expect(out.items[0].availableFrom).toBe('2026-12-01T00:00:00');
    expect(out.rateUpdatedAt).toBe('2026-11-17T01:00:00Z');
    expect(out.title).toBe('x');
    expect(body.items[0].createdAt).toBe('2026-11-17T07:28:23.1');
  });

  it('returns the same reference when nothing changes', () => {
    const body = { a: [1, 'b'], c: { d: '2026-12-01' } };
    expect(normalizeUtcInstants(body)).toBe(body);
  });
});
