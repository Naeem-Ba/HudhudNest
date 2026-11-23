/**
 * A browser-side hint about whether this browser has a session worth restoring at start-up.
 *
 * The refresh cookie is HttpOnly, so the page cannot see it. Without a hint every anonymous visit
 * (a search engine click, a shared link) spent two requests asking the server "am I signed in?",
 * got a 401 (console error, a rate-limit slot, and a 429 in bad moments), and learned nothing new.
 *
 * Only an explicit "no" skips the check, so nobody who is signed in is ever signed out by this:
 *  - no value (a browser that has not run this version yet): ask the server, exactly as before;
 *  - "yes": written whenever a sign-in succeeds;
 *  - "no": written at sign-out and when the server answered that there is no session (401 / 400).
 * Storage can be unavailable (private mode, blocked site data); then every visit asks, as before.
 */
export const SESSION_HINT_KEY = 'hudhudnest-session-hint';

export type SessionHint = 'yes' | 'no';

export function readSessionHint(): SessionHint | null {
  try {
    const value = localStorage.getItem(SESSION_HINT_KEY);
    return value === 'yes' || value === 'no' ? value : null;
  } catch {
    return null;
  }
}

export function writeSessionHint(value: SessionHint): void {
  try {
    localStorage.setItem(SESSION_HINT_KEY, value);
  } catch {
    // Unavailable storage only costs the optimisation.
  }
}

/**
 * Readable companion of the HttpOnly refresh cookie, set and cleared with it by the API (RefreshTokenCookie.MarkerName).
 * It holds no secret, only "1".
 */
export const SESSION_MARKER_COOKIE = 'hn_session';

export function hasSessionMarker(cookie: string = typeof document === 'undefined' ? '' : document.cookie): boolean {
  return cookie.split(';').some(part => part.trim().startsWith(`${SESSION_MARKER_COOKIE}=`));
}

/**
 * True when the start-up "am I signed in?" check can be skipped for a browser that has never told us anything
 * (UI performance audit 2026-11-17: the check cost a first-time visitor ~0.3 s before the first paint).
 *
 * Only on the deployed web app, where auth calls go through the same-origin proxy (`authApiBaseUrl` is relative):
 * only there does the marker cookie land where the page can read it. A "yes" hint, or the marker, always means ask;
 * the native app and local development always ask, exactly as before.
 */
export function canSkipSessionCheck(hint: SessionHint | null, authApiBaseUrl: string, markerPresent: boolean): boolean {
  if (hint === 'no') return true;
  if (hint === 'yes' || markerPresent) return false;
  return authApiBaseUrl.startsWith('/');
}
