/**
 * Who is behind HudhudNest, in ONE place. The legal texts (public/i18n/legal/{lang}/*.json) never repeat these values:
 * they carry tokens such as {{PRIVACY_EMAIL}} that the legal page replaces from here (interpolateLegalText), and the
 * Impressum page and the newsletter screens read the same object. Change a value here and every language follows.
 *
 * Only facts the owner has confirmed are filled in (decision of 2026-11-13). The legal person or entity that
 * operates the platform, its legal form, representative, full street address and any register or tax number are
 * NOT known yet and are deliberately null: nothing here may be invented. While any of them is missing,
 * missingOperatorFields() is not empty, the Impressum shows the gap openly, and `npm run check:legal` fails, so the
 * legal pages cannot be declared complete for a production launch.
 */
import type { LangCode } from '../../core/services/language.service';

export interface LocalizedText {
  ar: string;
  en: string;
  de: string;
  tr: string;
}

export interface ControllerIdentity {
  /** Trading name used in every legal text, in every language. */
  readonly displayName: string;
  readonly website: string;
  /** Correspondence city and country only; no street or postal code has been given. */
  readonly correspondenceAddress: LocalizedText;
  readonly emails: {
    readonly support: string;
    readonly privacy: string;
    readonly legal: string;
    readonly security: string;
  };
  /** Unknown until the owner provides them. Never fill with a guess. */
  readonly operatorLegalName: string | null;
  readonly legalForm: string | null;
  readonly authorisedRepresentative: string | null;
  readonly streetAddress: string | null;
  readonly postalCode: string | null;
  readonly registerCourt: string | null;
  readonly registerNumber: string | null;
  readonly vatId: string | null;
  /** GDPR Art. 27 representative in the EU, if one is required and appointed. */
  readonly euRepresentative: string | null;
  /** GDPR Art. 37 data protection officer, if one is required and appointed. */
  readonly dataProtectionOfficer: string | null;
}

export const CONTROLLER_IDENTITY: ControllerIdentity = {
  displayName: 'HudhudNest (هدهد نيست)',
  website: 'https://hudhudnest.com',
  correspondenceAddress: {
    ar: 'دمشق، الجمهورية العربية السورية',
    en: 'Damascus, Syrian Arab Republic',
    de: 'Damaskus, Arabische Republik Syrien',
    tr: 'Şam, Suriye Arap Cumhuriyeti'
  },
  emails: {
    support: 'support@hudhudnest.com',
    privacy: 'privacy@hudhudnest.com',
    legal: 'legal@hudhudnest.com',
    security: 'security@hudhudnest.com'
  },
  operatorLegalName: null,
  legalForm: null,
  authorisedRepresentative: null,
  streetAddress: null,
  postalCode: null,
  registerCourt: null,
  registerNumber: null,
  vatId: null,
  euRepresentative: null,
  dataProtectionOfficer: null
};

/** Fields an Impressum (DDG §5) and a privacy notice (GDPR Art. 13(1)(a)) need and that are still unknown. */
export type OperatorField =
  | 'operatorLegalName'
  | 'legalForm'
  | 'authorisedRepresentative'
  | 'streetAddress'
  | 'postalCode';

const MANDATORY_OPERATOR_FIELDS: readonly OperatorField[] = [
  'operatorLegalName',
  'legalForm',
  'authorisedRepresentative',
  'streetAddress',
  'postalCode'
];

export function missingOperatorFields(identity: ControllerIdentity = CONTROLLER_IDENTITY): OperatorField[] {
  return MANDATORY_OPERATOR_FIELDS.filter(field => !(identity[field] ?? '').trim());
}

export function isOperatorIdentityComplete(identity: ControllerIdentity = CONTROLLER_IDENTITY): boolean {
  return missingOperatorFields(identity).length === 0;
}

function mail(address: string): string {
  return `[${address}](mailto:${address})`;
}

/** Token -> value for one language. Tokens are written {{NAME}} in the legal JSON files. */
export function legalTokens(lang: LangCode, identity: ControllerIdentity = CONTROLLER_IDENTITY): Record<string, string> {
  return {
    CONTROLLER_NAME: identity.displayName,
    CORRESPONDENCE_ADDRESS: identity.correspondenceAddress[lang],
    WEBSITE: identity.website,
    SUPPORT_EMAIL: mail(identity.emails.support),
    PRIVACY_EMAIL: mail(identity.emails.privacy),
    LEGAL_EMAIL: mail(identity.emails.legal),
    SECURITY_EMAIL: mail(identity.emails.security)
  };
}

const TOKEN = /\{\{([A-Z_]+)\}\}/g;

/** Replaces every {{TOKEN}}. An unknown token is left as is, so the content test catches it. */
export function interpolateLegalText(text: string, lang: LangCode, identity: ControllerIdentity = CONTROLLER_IDENTITY): string {
  const tokens = legalTokens(lang, identity);
  return text.replace(TOKEN, (whole, name: string) => tokens[name] ?? whole);
}
