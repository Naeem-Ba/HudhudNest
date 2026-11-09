import { HttpErrorResponse } from '@angular/common/http';

import { currentUiLanguage } from '../i18n/ui-language';

const ARABIC_SCRIPT = /[\u0600-\u06FF]/;

/**
 * QA phase 25 (P16-D04): most API refusals are written in Arabic only. Showing one to a visitor reading the site in
 * English or German is a sentence they cannot read, so for them the caller's translated generic text is better. This is
 * a stopgap on the client; the full fix is a stable code per refusal translated in public/i18n (or server-side
 * localisation), which is a separate phase.
 */
function unreadableForCurrentLanguage(message: string): boolean {
  const language = currentUiLanguage();
  return language !== null && language !== 'ar' && ARABIC_SCRIPT.test(message);
}

/**
 * The API's own sentence for a refusal (400/409/422 carry an Arabic `message`), or null when the
 * response has none. Screens show this instead of a generic "failed" line so the person learns why
 * (an instant-booking limit, an overlapping blocked period, a review that is not allowed yet).
 */
export function apiErrorText(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse) && (typeof error !== 'object' || error === null)) return null;

  // A 5xx body is the API's generic English sentence (or a proxy page), never something to show.
  const status = (error as { status?: unknown }).status;
  if (typeof status === 'number' && status >= 500) return null;

  const body = (error as { error?: unknown }).error;
  if (typeof body === 'string') return usable(body);
  if (!body || typeof body !== 'object') return null;

  const record = body as Record<string, unknown>;
  const message = record['message'] ?? record['Message'];
  return typeof message === 'string' ? usable(message) : null;
}

function usable(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || unreadableForCurrentLanguage(trimmed)) return null;
  return trimmed;
}
