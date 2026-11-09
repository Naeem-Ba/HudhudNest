import { SESSION_HINT_KEY, readSessionHint, writeSessionHint } from './session-hint';

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
