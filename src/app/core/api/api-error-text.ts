import { HttpErrorResponse } from '@angular/common/http';

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
  if (typeof body === 'string') return body.trim() || null;
  if (!body || typeof body !== 'object') return null;

  const record = body as Record<string, unknown>;
  const message = record['message'] ?? record['Message'];
  return typeof message === 'string' && message.trim() ? message.trim() : null;
}
