/**
 * What the profile shows about the account's login phone.
 *
 * The phone is a recovery credential: only a number the owner proved with a one-time code may reset a
 * password, so "has a number" and "number is confirmed" are different states and the page must say which
 * one applies. The number is never edited as plain text in the profile; it is added or changed only through
 * the verified flow (code + current password).
 */
export type PhoneStatusKind = 'confirmed' | 'unconfirmed' | 'none';

export interface PhoneStatus {
  kind: PhoneStatusKind;
  /** The stored number, trimmed; null when the account has none. */
  phone: string | null;
  /** The code flow can add or confirm a number only for an account that has a password to re-enter. */
  canConfirm: boolean;
  /** Not confirmed and no password on the account (social sign-in): confirming is not available yet. */
  needsPassword: boolean;
}

export function phoneStatus(
  user: { Phone?: string | null; PhoneConfirmed?: boolean; HasPassword?: boolean } | null | undefined
): PhoneStatus {
  const phone = user?.Phone?.trim() || null;
  const kind: PhoneStatusKind = !phone ? 'none' : user?.PhoneConfirmed ? 'confirmed' : 'unconfirmed';
  const hasPassword = !!user?.HasPassword;
  return {
    kind,
    phone,
    canConfirm: kind !== 'confirmed' && hasPassword,
    needsPassword: kind !== 'confirmed' && !hasPassword
  };
}
