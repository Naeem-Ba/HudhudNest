/**
 * True when the request failed on the server's side (any 5xx), as opposed to something the
 * person typed wrong or the network dropping (status 0, which has no body to show anyway).
 *
 * Why this exists: the API answers every unhandled exception with
 * `{ "message": "An unexpected error occurred. Please try again later." }`, always in English.
 * Error mappers that print `error.message` before looking at the status therefore showed that
 * English sentence to Arabic and German users (seen on POST /api/auth/register, 2026-10-05).
 * A 5xx carries nothing the reader can act on, so every mapper must prefer its own translated
 * "server error" text over whatever the body says.
 */
export function isServerFailure(error: unknown): boolean {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  return typeof status === 'number' && status >= 500;
}
