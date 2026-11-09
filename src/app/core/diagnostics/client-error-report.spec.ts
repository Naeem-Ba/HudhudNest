import { describeError, fingerprint, kindOf, routeOf } from './client-error-report';

describe('client error report helpers', () => {
  it('routeOf keeps the path only', () => {
    expect(routeOf('/auth/reset-password?token=SECRET#x')).toBe('/auth/reset-password');
    expect(routeOf('/properties/12')).toBe('/properties/12');
    expect(routeOf('')).toBe('/');
    expect(routeOf('?only=query')).toBe('/');
  });

  it('describeError reads an Error with its first frame', () => {
    const error = new TypeError('x is undefined');
    error.stack = 'TypeError: x is undefined\n    at f (https://hudhudnest.com/main-ABC.js?v=1:10:5)';

    const described = describeError(error);

    expect(described.name).toBe('TypeError');
    expect(described.message).toBe('x is undefined');
    expect(described.source).toBe('/main-ABC.js');
    expect(described.line).toBe(10);
    expect(described.column).toBe(5);
  });

  it('describeError accepts strings, plain objects and nothing at all', () => {
    expect(describeError('boom').message).toBe('boom');
    expect(describeError({ name: 'Custom', message: 'm', stack: 'at a (chunk-1.js:3:4)' })).toEqual(
      jasmine.objectContaining({ name: 'Custom', message: 'm', source: 'chunk-1.js', line: 3, column: 4 })
    );
    expect(describeError({}).name).toBe('Object');
    expect(describeError(undefined)).toEqual(jasmine.objectContaining({ name: 'Error', message: '', line: null }));
    expect(describeError(42).message).toBe('42');
  });

  it('describeError cuts very long text', () => {
    const described = describeError(new Error('m'.repeat(5000)));
    expect(described.message.length).toBe(500);
  });

  it('kindOf separates stale-chunk failures, promises and everything else', () => {
    expect(kindOf(new Error('Failed to fetch dynamically imported module: x'), false)).toBe('chunk');
    expect(kindOf(new Error('boom'), true)).toBe('promise');
    expect(kindOf(new Error('boom'), false)).toBe('js');
  });

  it('fingerprint ignores the digits in the message so counters do not make each error new', () => {
    const base = { kind: 'js' as const, name: 'Error', route: '/p' };
    expect(fingerprint({ ...base, message: 'item 12 missing' })).toBe(fingerprint({ ...base, message: 'item 13 missing' }));
    expect(fingerprint({ ...base, message: 'a' })).not.toBe(fingerprint({ ...base, message: 'b' }));
  });
});
