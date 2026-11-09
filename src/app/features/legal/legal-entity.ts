/**
 * Who operates HudhudNest, for the Impressum (/imprint) that German law (DDG §5, MStV §18) requires of a commercial
 * site aimed at Germany, Austria and Switzerland. The repository deliberately holds NO real values: a legal name and
 * address are the owner's to give, and an invented or half-filled imprint is worse than none.
 *
 * To switch it on: fill the fields of LEGAL_ENTITY below (everything marked required), have a lawyer check the page
 * (docs/legal/LEGAL-REVIEW-REQUIRED.md), and ship. Until then /imprint shows a neutral "not available yet" note
 * and no footer or settings link points to it. The same name and address belong in the privacy policy, section
 * "Who we are" (Art. 13 GDPR), which is a text change in public/i18n/legal/{ar,en,de}/privacy.json.
 */
export interface LegalEntity {
  /** Required. Full legal name of the provider (person or company, with the legal form for a company). */
  name: string;
  /** Required. Street and number. */
  street: string;
  /** Required. */
  postalCode: string;
  /** Required. */
  city: string;
  /** Required. */
  country: string;
  /** Required. A mailbox that is read (DDG §5: quick electronic contact). */
  email: string;
  /** Optional. */
  phone?: string;
  /** Companies: register court and number (e.g. "Amtsgericht Berlin" and "HRB 12345"). */
  registerCourt?: string;
  registerNumber?: string;
  /** Optional. VAT id (USt-IdNr.) if one exists. */
  vatId?: string;
  /** Optional. Person responsible for editorial content (MStV §18), if different from the provider. */
  responsiblePerson?: string;
}

/** Owner: replace `null` with the filled object. Nothing else needs to change. */
export const LEGAL_ENTITY: LegalEntity | null = null;

const REQUIRED: ReadonlyArray<keyof LegalEntity> = ['name', 'street', 'postalCode', 'city', 'country', 'email'];

/** True only when every required field has text, so a half-filled entry never goes live. */
export function isImprintComplete(entity: LegalEntity | null): entity is LegalEntity {
  return entity !== null && REQUIRED.every(key => (entity[key] ?? '').trim().length > 0);
}

export function imprintEntity(): LegalEntity | null {
  return isImprintComplete(LEGAL_ENTITY) ? LEGAL_ENTITY : null;
}
