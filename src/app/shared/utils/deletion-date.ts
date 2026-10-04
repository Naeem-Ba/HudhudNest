/**
 * Formats UserProfile.DeletionScheduledFor (an ISO date from the API) as a long, localized
 * date for the account-deletion notices. The app registers no Angular locale data, so this
 * uses Intl directly with the UI language rather than DatePipe. Returns '' for a missing or
 * unparseable value so the surrounding sentence still reads.
 */
export function formatDeletionDate(value: string | null | undefined, lang?: string): string {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  try {
    return new Intl.DateTimeFormat(lang || 'ar', { dateStyle: 'long' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
