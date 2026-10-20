// Which https://hudhudnest.com/... links the native apps are allowed to open, and how one is turned into an
// in-app route.
//
// The lists below mirror deep-links.config.json (the source of truth for the AndroidManifest intent-filter and
// the iOS apple-app-site-association file); tools/lib/deep-links.test.mjs fails the build if they drift.
//
// This is also the security boundary. A deep link is input from outside the app (any web page, QR code or
// message can produce one), so it is never navigated to as-is: only https, only our own hosts, only paths on
// the allow-list, and never the owner-only edit screens. Anything else is ignored.

export const DEEP_LINK_HOSTS: readonly string[] = ['hudhudnest.com', 'www.hudhudnest.com'];

export const DEEP_LINK_EXACT_PATHS: readonly string[] = ['/'];

export const DEEP_LINK_PATH_PREFIXES: readonly string[] = [
  '/properties',
  '/short-stay',
  '/investments',
  '/users',
  '/wohnungen',
  '/kontakt',
  '/valuation',
  '/pricing'
];

/** Allowed prefixes that still contain screens a shared link must never open (a pathPrefix cannot express this natively). */
export const DEEP_LINK_EXCLUDED_PREFIXES: readonly string[] = ['/properties/edit'];

function startsWithSegment(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Returns the in-app URL (path + query + fragment) for an incoming link, or null when the link must be ignored.
 * The query string is kept on purpose: shared listing links carry UTM attribution (AttributionContextService).
 */
export function resolveDeepLink(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' || url.username || url.password) {
    return null;
  }

  if (!DEEP_LINK_HOSTS.includes(url.hostname.toLowerCase())) {
    return null;
  }

  const path = url.pathname.replace(/\/+$/, '') || '/';

  // Defence in depth: the URL parser already collapses "." and ".." segments, but a path that still carries
  // an empty segment or an encoded separator is not one we generate, so it is not one we open.
  if (path.includes('//') || /%2f|%5c/i.test(path)) {
    return null;
  }

  if (DEEP_LINK_EXCLUDED_PREFIXES.some(prefix => startsWithSegment(path, prefix))) {
    return null;
  }

  const allowed =
    DEEP_LINK_EXACT_PATHS.includes(path) || DEEP_LINK_PATH_PREFIXES.some(prefix => startsWithSegment(path, prefix));

  if (!allowed) {
    return null;
  }

  // The site root is the landing route; '/' alone would work too, but /home is what the app navigates to itself.
  return `${path === '/' ? '/home' : path}${url.search}${url.hash}`;
}
