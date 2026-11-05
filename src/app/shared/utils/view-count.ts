// Formatting of a listing's view count. One place, so the card chip, the detail page and the
// owner statistics write the same number the same way, in the language on screen.

/** From this many views a card shows the short form ("1.2K"); the detail page always shows the full number. */
export const COMPACT_VIEW_COUNT_FROM = 1000;

/** A usable count, or null when the server did not send one (an older API) or sent nonsense. */
export function normalizeViewCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.floor(value);
}

/**
 * The number a detail page shows: the count in the loaded listing, raised to the server's newer
 * total when recording the view returned one. The listing response may come from a cache and be a
 * little old, so the answer to the POST only ever raises the number, never lowers it.
 */
export function mergeViewCount(loaded: unknown, live: number | null): number | null {
  const base = normalizeViewCount(loaded);
  if (live === null) {
    return base;
  }

  return Math.max(live, base ?? 0);
}

/** The full number with the locale's grouping, e.g. "1,248" (en), "1.248" (de), Arabic digits for ar. */
export function formatViewCountFull(count: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(count);
}

/**
 * The short form for crowded places: "999", then "1.2K" / "1,2 Tsd." / the Arabic equivalent.
 * Below the threshold it is the full number, so small counts are never rounded.
 */
export function formatViewCountCompact(count: number, locale: string): string {
  if (count < COMPACT_VIEW_COUNT_FROM) {
    return formatViewCountFull(count, locale);
  }

  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(count);
  // Some languages (German) have no short form for thousands and print a bare "1248": keep the grouped full number then.
  return /^\d+$/.test(compact) ? formatViewCountFull(count, locale) : compact;
}
