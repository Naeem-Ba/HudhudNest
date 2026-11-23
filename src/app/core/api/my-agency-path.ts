/**
 * GET /api/agencies/me: the office the signed-in user owns or belongs to (204 = none).
 * One constant for AgenciesApiService.getMine() and the navbar, which calls it without loading
 * that whole service into the initial bundle (platform audit 2026-11-18, HN-18).
 */
export const MY_AGENCY_PATH = '/agencies/me';
