/** The `code` the API puts next to the English `message` of a registration 409 for a taken address. */
export const EMAIL_ALREADY_REGISTERED_CODE = 'EMAIL_ALREADY_REGISTERED';

/**
 * True when a failed registration means "this email address already has an account".
 *
 * Why this exists: the 409 body is `{ message: "Email already registered.", code }` and the message
 * is always English. Mappers that printed `error.message` before looking at the status showed it
 * to Arabic and German visitors (seen on POST /api/auth/register, 2026-10-07). The code is the
 * contract (docs/password-policy.md in the API repo); the bare 409 covers an API build that
 * predates the code. Check this BEFORE reading `error.message`, and show
 * `AUTH.ERRORS.EMAIL_ALREADY_EXISTS` instead.
 */
export function isEmailAlreadyRegistered(error: unknown): boolean {
  const failure = error as { status?: unknown; error?: { code?: unknown } | string | null } | null | undefined;

  if (failure?.status === 409) {
    return true;
  }

  const body = failure?.error;

  return typeof body === 'object' && body !== null && body.code === EMAIL_ALREADY_REGISTERED_CODE;
}
