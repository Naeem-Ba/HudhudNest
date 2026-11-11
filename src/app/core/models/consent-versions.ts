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
  /** ISO date (yyyy-MM-dd) the version takes effect. */
  readonly effectiveDate: string;
  /** ISO date (yyyy-MM-dd) of the last edit to the text. */
  readonly lastUpdated: string;
}

export const PRIVACY_POLICY_META: LegalDocumentMeta = {
  version: '2026-11-08',
  effectiveDate: '2026-11-08',
  lastUpdated: '2026-11-08'
};

export const TERMS_OF_SERVICE_META: LegalDocumentMeta = {
  version: '2026-10-01',
  effectiveDate: '2026-10-01',
  lastUpdated: '2026-10-01'
};

export const PRIVACY_POLICY_VERSION = PRIVACY_POLICY_META.version;
export const TERMS_OF_SERVICE_VERSION = TERMS_OF_SERVICE_META.version;
