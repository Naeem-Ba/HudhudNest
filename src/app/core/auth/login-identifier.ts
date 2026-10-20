/** How the current session was signed in — see AuthService.rememberLoginMethod(). */
export type LoginMethod = 'email' | 'phone';

export const LOGIN_METHOD_STORAGE_KEY = 'auth.loginMethod';

export interface LoginIdentifier {
  kind: LoginMethod;
  value: string;
}

/**
 * The identifier the account menu shows next to the avatar: the e-mail address for an
 * e-mail/Google/Apple sign-in, the phone number for a phone sign-in — never both.
 *
 * `method` is what the login screen recorded. When it is unknown (a session restored
 * from before it was recorded, or storage blocked) the account itself decides: a
 * phone-only account has no e-mail at all (PhoneAuthenticationWorkflow creates it with
 * UserName = phone and no Email), so an empty e-mail means a phone sign-in. The recorded
 * method also yields to the account when that half is missing, so a stale value can
 * never produce an empty label.
 */
export function resolveLoginIdentifier(
  method: LoginMethod | null,
  email: string | null | undefined,
  phone: string | null | undefined
): LoginIdentifier | null {
  const cleanEmail = (email ?? '').trim();
  const cleanPhone = (phone ?? '').trim();

  const preferred: LoginMethod = method ?? (cleanEmail ? 'email' : 'phone');

  if (preferred === 'phone' && cleanPhone) {
    return { kind: 'phone', value: cleanPhone };
  }

  if (cleanEmail) {
    return { kind: 'email', value: cleanEmail };
  }

  return cleanPhone ? { kind: 'phone', value: cleanPhone } : null;
}
