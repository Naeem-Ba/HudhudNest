/**
 * The version identifier + dates for each policy document. Single source of truth: the legal
 * page (features/legal/legal-document.page.ts) renders these exact values, and registration
 * forms send the version string when recording consent (ConsentApiService), so a user who
 * agreed to an older version can be told apart from one who agreed to the current one.
 *
 * Bump the version AND the dates here whenever the legal text in
 * public/i18n/legal/{ar,en,de,tr}/*.json changes materially — the four languages share one
 * version, so they must always be updated together.
 */
export interface LegalDocumentMeta {
  /** Sent to the backend as ConsentRecord.PolicyVersion (max 64 chars). */
  readonly version: string;
  /**
   * ISO date (yyyy-MM-dd) the version was published, and the date it takes effect. Null until the owner actually
   * publishes the version: a date is never back-dated or guessed (legal review 2026-11-13). The page then says
   * "set on publication", and `npm run check:legal` fails, so a production deploy needs both dates first.
   */
  readonly publishedDate: string | null;
  readonly effectiveDate: string | null;
  /** ISO date (yyyy-MM-dd) of the last edit to the text. */
  readonly lastUpdated: string;
  /**
   * 'material' when the change needs users to accept again (ReconsentPromptComponent asks signed-in users whose
   * recorded version is older); 'editorial' for wording-only fixes that keep the previous acceptance valid. Only the
   * version string of a material change goes into the consent records; an editorial fix keeps the version.
   */
  readonly changeType: 'material' | 'editorial';
}

/** Versions of 2026-11-08 / 2026-10-01 are superseded; their texts stay in git history for proof of past consent. */
export const PRIVACY_POLICY_META: LegalDocumentMeta = {
  version: '2026-11-13',
  publishedDate: null,
  effectiveDate: null,
  lastUpdated: '2026-11-13',
  changeType: 'material'
};

export const TERMS_OF_SERVICE_META: LegalDocumentMeta = {
  version: '2026-11-13',
  publishedDate: null,
  effectiveDate: null,
  lastUpdated: '2026-11-13',
  changeType: 'material'
};

/** Impressum metadata (not a consent document; shown on the page). */
export const IMPRESSUM_META = {
  lastUpdated: '2026-11-13'
} as const;

export const PRIVACY_POLICY_VERSION = PRIVACY_POLICY_META.version;
export const TERMS_OF_SERVICE_VERSION = TERMS_OF_SERVICE_META.version;
