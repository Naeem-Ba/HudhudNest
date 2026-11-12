export type WaitlistContactType = 'email' | 'whatsapp';
export type WaitlistInterest = 'kaufen' | 'mieten' | 'kurz';

export const WAITLIST_INTERESTS: readonly WaitlistInterest[] = ['kaufen', 'mieten', 'kurz'];

export interface NormalizedContact {
  type: WaitlistContactType;
  /** Email: trimmed. WhatsApp: "+" followed by 8-15 digits, no spaces or punctuation. */
  value: string;
}

// Same shape the database enforces (supabase/migrations/*_waitlist.sql), so a value the browser accepts is never rejected there.
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const E164 = /^\+[1-9][0-9]{7,14}$/;

/** Arabic-Indic and Persian digits to ASCII, so a number typed on an Arabic keyboard is accepted. */
function asciiDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Decides whether the input is an email address or a WhatsApp number and returns it in storage form, or null when it
 * is neither. A number must carry its country code ("+49 157 ..." or "0049 157 ..."): a national number without it
 * is ambiguous for a diaspora audience, so it is rejected rather than guessed.
 */
export function normalizeContact(input: string): NormalizedContact | null {
  const raw = asciiDigits((input ?? '').trim());
  if (raw.length === 0 || raw.length > 254) {
    return null;
  }
  if (raw.includes('@')) {
    return EMAIL.test(raw) ? { type: 'email', value: raw } : null;
  }
  const compact = raw.replace(/[\s\-().‎‏]/g, '');
  const international = compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
  return E164.test(international) ? { type: 'whatsapp', value: international } : null;
}
