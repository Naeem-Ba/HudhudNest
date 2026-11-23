import { SESSION_HINT_KEY, canSkipSessionCheck, hasSessionMarker, readSessionHint, writeSessionHint } from './session-hint';

describe('session hint', () => {
  beforeEach(() => localStorage.removeItem(SESSION_HINT_KEY));
  afterEach(() => localStorage.removeItem(SESSION_HINT_KEY));

  it('is unknown in a browser that has never written it, so the server is still asked', () => {
    expect(readSessionHint()).toBeNull();
  });

  it('round-trips yes and no', () => {
    writeSessionHint('yes');
    expect(readSessionHint()).toBe('yes');
    writeSessionHint('no');
    expect(readSessionHint()).toBe('no');
  });

  it('ignores anything else a person or an old build left in that key', () => {
    localStorage.setItem(SESSION_HINT_KEY, 'maybe');
    expect(readSessionHint()).toBeNull();
  });

  it('does not throw when storage is unavailable', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('blocked');
    spyOn(Storage.prototype, 'setItem').and.throwError('blocked');

    expect(readSessionHint()).toBeNull();
    expect(() => writeSessionHint('yes')).not.toThrow();
  });
});

// UI performance audit 2026-11-17: a first visit to the web app skips the start-up refresh unless something says a
// session may exist.
describe('canSkipSessionCheck', () => {
  it('skips for a known "no" anywhere', () => {
    expect(canSkipSessionCheck('no', '/api', false)).toBeTrue();
    expect(canSkipSessionCheck('no', 'https://api.example.com/api', false)).toBeTrue();
  });

  it('always asks for a "yes" hint or when the session marker is present', () => {
    expect(canSkipSessionCheck('yes', '/api', false)).toBeFalse();
    expect(canSkipSessionCheck(null, '/api', true)).toBeFalse();
  });

  it('skips a first visit only on the proxied web app (relative auth URL)', () => {
    expect(canSkipSessionCheck(null, '/api', false)).toBeTrue();
    // Native app, local development and staging call the API directly: the marker cannot be read there.
    expect(canSkipSessionCheck(null, 'https://api.example.com/api', false)).toBeFalse();
  });
});

describe('hasSessionMarker', () => {
  it('finds hn_session among other cookies, and only that name', () => {
    expect(hasSessionMarker('a=1; hn_session=1; b=2')).toBeTrue();
    expect(hasSessionMarker('hn_session=1')).toBeTrue();
    expect(hasSessionMarker('xhn_session=1; hn_sessions=1')).toBeFalse();
    expect(hasSessionMarker('')).toBeFalse();
  });
});
