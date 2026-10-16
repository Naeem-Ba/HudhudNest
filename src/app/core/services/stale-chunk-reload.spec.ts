import {
  isChunkLoadError,
  RELOAD_WINDOW_MS,
  reloadForStaleChunk,
  StaleChunkReloadDeps
} from './stale-chunk-reload';

describe('stale chunk reload', () => {
  const chunkError = new TypeError('Failed to fetch dynamically imported module: https://hudhudnest.com/chunk-AB12.js');

  function makeDeps(last: number | null = null, now = 1_000_000) {
    const state = { last, loaded: [] as string[] };
    const deps: StaleChunkReloadDeps = {
      now: () => now,
      readLastReloadAt: () => state.last,
      writeLastReloadAt: value => (state.last = value),
      load: url => state.loaded.push(url)
    };
    return { deps, state };
  }

  it('recognises the chunk-loading failures of Chrome, Safari, Firefox and webpack-style loaders', () => {
    expect(isChunkLoadError(chunkError)).toBeTrue();
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: x'))).toBeTrue();
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBeTrue();
    expect(isChunkLoadError(new Error('Loading chunk 7 failed.'))).toBeTrue();
    const named = new Error('x');
    named.name = 'ChunkLoadError';
    expect(isChunkLoadError(named)).toBeTrue();
  });

  it('ignores every other error, including HTTP and non-error values', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBeFalse();
    expect(isChunkLoadError({ message: 'Failed to fetch dynamically imported module' })).toBeFalse();
    expect(isChunkLoadError(null)).toBeFalse();
    expect(isChunkLoadError(undefined)).toBeFalse();
  });

  it('loads the target url fresh once and remembers when', () => {
    const { deps, state } = makeDeps();

    expect(reloadForStaleChunk(chunkError, '/properties/42', deps)).toBeTrue();

    expect(state.loaded).toEqual(['/properties/42']);
    expect(state.last).toBe(1_000_000);
  });

  it('does not reload again inside the window, so a really missing chunk cannot loop', () => {
    const { deps, state } = makeDeps(1_000_000 - (RELOAD_WINDOW_MS - 1));

    expect(reloadForStaleChunk(chunkError, '/x', deps)).toBeFalse();
    expect(state.loaded).toEqual([]);
  });

  it('reloads again once the window has passed', () => {
    const { deps, state } = makeDeps(1_000_000 - RELOAD_WINDOW_MS);

    expect(reloadForStaleChunk(chunkError, '/x', deps)).toBeTrue();
    expect(state.loaded).toEqual(['/x']);
  });

  it('never reloads for an unrelated error', () => {
    const { deps, state } = makeDeps();

    expect(reloadForStaleChunk(new Error('boom'), '/x', deps)).toBeFalse();
    expect(state.loaded).toEqual([]);
    expect(state.last).toBeNull();
  });
});
