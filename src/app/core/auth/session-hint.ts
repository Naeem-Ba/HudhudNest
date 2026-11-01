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
