/**
 * The version identifier for each policy document — must exactly match the "آخر تحديث"
 * date shown on that page (privacy-policy.page.ts / terms-of-service.page.ts).
 * Registration forms send this exact string when recording consent (ConsentApiService),
 * so a user who agreed to an older version can be told apart from one who agreed to the
 * current one. Bump the constant here AND the date on the corresponding page together
 * whenever the legal text changes materially — they must never drift apart.
 */
export const PRIVACY_POLICY_VERSION = '2026-09-05';
export const TERMS_OF_SERVICE_VERSION = '2026-08-31';
