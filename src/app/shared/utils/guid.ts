const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a canonical GUID string — what every listing id in this app looks like. */
export function isGuid(value: string | null | undefined): boolean {
  return !!value && GUID_PATTERN.test(value);
}
