// A page that stays open across a deploy still points at JavaScript chunks whose names changed (Netlify
// replaces the whole deploy, and the app has no service worker caching the old files). The next lazy route
// then fails with "Failed to fetch dynamically imported module" and the user sees a navigation that silently
// does nothing. Loading the target URL fresh fetches the new index.html and its chunks.
//
// Guard: at most one automatic reload per RELOAD_WINDOW_MS, so a chunk that is really missing (a broken
// deploy) cannot put the page into a reload loop.

const STORAGE_KEY = 'hn.staleChunkReloadAt';
export const RELOAD_WINDOW_MS = 60_000;

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Loading chunk [\w-]+ failed/i,
  /ChunkLoadError/i
];

export function isChunkLoadError(error: unknown): boolean {
  const text =
    error instanceof Error ? `${error.name} ${error.message}` : typeof error === 'string' ? error : '';
  return CHUNK_ERROR_PATTERNS.some(pattern => pattern.test(text));
}

export interface StaleChunkReloadDeps {
  now: () => number;
  readLastReloadAt: () => number | null;
  writeLastReloadAt: (value: number) => void;
  load: (url: string) => void;
  /**
   * False while the device has no connection. A chunk that fails to load OFFLINE is not stale, it is
   * unreachable; reloading would replace the whole app with the browser's "no internet" page
   * (QA Phase 26, P26-D07). Omitted = assume online.
   */
  isOnline?: () => boolean;
}

/** @returns true when the page was sent to `url` for a fresh load, false when the error was left alone. */
export function reloadForStaleChunk(error: unknown, url: string, deps: StaleChunkReloadDeps): boolean {
  if (!isChunkLoadError(error)) {
    return false;
  }

  if (deps.isOnline && !deps.isOnline()) {
    return false;
  }

  const now = deps.now();
  const last = deps.readLastReloadAt();
  if (last !== null && now - last < RELOAD_WINDOW_MS) {
    return false;
  }

  deps.writeLastReloadAt(now);
  deps.load(url);
  return true;
}

export function browserStaleChunkReloadDeps(): StaleChunkReloadDeps {
  return {
    now: () => Date.now(),
    readLastReloadAt: () => {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        const value = raw === null ? Number.NaN : Number(raw);
        return Number.isFinite(value) ? value : null;
      } catch {
        return null;
      }
    },
    writeLastReloadAt: value => {
      try {
        sessionStorage.setItem(STORAGE_KEY, String(value));
      } catch {
        // Without storage the loop guard is gone; the browser still reloads at most once per error.
      }
    },
    load: url => window.location.assign(url),
    isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)
  };
}
