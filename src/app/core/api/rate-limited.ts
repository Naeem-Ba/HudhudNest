/**
 * True when the API refused the request because a rate limit was reached (HTTP 429).
 *
 * A limit is an answer the person can act on ("not now, later"), unlike a failure, so every page
 * that is limited names the limit instead of its generic "could not ..." text. Pages decide the
 * wording themselves because each limit has its own size and window.
 */
export function isRateLimited(error: unknown): boolean {
  return (error as { status?: unknown } | null | undefined)?.status === 429;
}
