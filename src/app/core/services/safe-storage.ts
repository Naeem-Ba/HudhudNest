// Browser storage that never throws. `localStorage` / `sessionStorage` can throw on access (Chrome with
// "block all site data", some WebViews, old Safari private mode: SecurityError) or on write (QuotaExceededError).
// Code that runs at start-up must not depend on it: an uncaught exception there leaves a blank page
// (QA Phase 26, P26-D01). These helpers fall back to a per-page-load memory map, so a choice made during
// the visit (for example the language) still holds until the page is closed.

type StorageKind = 'local' | 'session';

const memory: Record<StorageKind, Map<string, string>> = {
  local: new Map<string, string>(),
  session: new Map<string, string>()
};

function backing(kind: StorageKind): Storage | null {
  try {
    return kind === 'local' ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}

export function safeGetItem(key: string, kind: StorageKind = 'local'): string | null {
  try {
    const value = backing(kind)?.getItem(key);
    if (value !== undefined) {
      return value;
    }
  } catch {
    // fall through to memory
  }

  return memory[kind].get(key) ?? null;
}

export function safeSetItem(key: string, value: string, kind: StorageKind = 'local'): void {
  memory[kind].set(key, value);
  try {
    backing(kind)?.setItem(key, value);
  } catch {
    // Blocked or full: the in-memory copy above keeps the value for this page load.
  }
}

export function safeRemoveItem(key: string, kind: StorageKind = 'local'): void {
  memory[kind].delete(key);
  try {
    backing(kind)?.removeItem(key);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

/** Test hook: forget the in-memory fallback so specs do not leak values into each other. */
export function resetSafeStorageMemory(): void {
  memory.local.clear();
  memory.session.clear();
}
