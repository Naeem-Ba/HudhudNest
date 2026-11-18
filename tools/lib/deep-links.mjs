// Pure helpers for native deep links. No file or network access here; tools/generate-deep-links.mjs does the I/O
// and tools/lib/deep-links.test.mjs checks the hand-written native files against the same config.

const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const TEAM_ID = /^[0-9A-Z]{10}$/;

/** Accepts "7d:30:..." / "7D30..." (as printed by keytool or Play Console) and returns "7D:30:...". */
export function normalizeFingerprint(raw) {
  const hex = String(raw ?? '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length !== 64) {
    return null;
  }
  const withColons = hex.match(/.{2}/g).join(':');
  return FINGERPRINT.test(withColons) ? withColons : null;
}

function splitList(value) {
  return String(value ?? '')
    .split(/[\s,;]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

/** Config fingerprints plus any from ANDROID_SHA256_CERT_FINGERPRINTS (e.g. the Play App Signing certificate), de-duplicated. */
export function resolveAndroidFingerprints(config, env = {}) {
  const merged = [...(config.android?.sha256CertFingerprints ?? []), ...splitList(env.ANDROID_SHA256_CERT_FINGERPRINTS)];
  const seen = new Set();
  const result = [];

  for (const raw of merged) {
    const normalized = normalizeFingerprint(raw);
    if (!normalized) {
      throw new Error(`Invalid Android SHA-256 certificate fingerprint: "${raw}" (expected 32 hex bytes, e.g. 7D:30:...:50).`);
    }
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result;
}

/** APPLE_TEAM_ID overrides the config value. Returns "" when none is set. */
export function resolveAppleTeamId(config, env = {}) {
  const teamId = String(env.APPLE_TEAM_ID || config.ios?.teamId || '').trim().toUpperCase();

  if (teamId && !TEAM_ID.test(teamId)) {
    throw new Error(`Invalid Apple Team ID: "${teamId}" (expected 10 letters/digits, e.g. A1B2C3D4E5).`);
  }

  return teamId;
}

/** public/.well-known/assetlinks.json */
export function buildAssetLinks(config, env = {}) {
  const fingerprints = resolveAndroidFingerprints(config, env);

  if (fingerprints.length === 0) {
    return null;
  }

  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: config.android.package,
        sha256_cert_fingerprints: fingerprints
      }
    }
  ];
}

/**
 * public/.well-known/apple-app-site-association. Returns null while no Team ID is known: a file with a made-up
 * Team ID would be served to Apple and silently never match, which is worse than no file.
 */
export function buildAppleSiteAssociation(config, env = {}) {
  const teamId = resolveAppleTeamId(config, env);

  if (!teamId) {
    return null;
  }

  const { exact, prefixes, excludePrefixes = [] } = config.paths;

  // Apple evaluates components in order and the first match wins, so the exclusions come first.
  const components = [
    ...excludePrefixes.flatMap(prefix => [{ '/': prefix, exclude: true }, { '/': `${prefix}/*`, exclude: true }]),
    ...exact.map(path => ({ '/': path })),
    ...prefixes.flatMap(prefix => [{ '/': prefix }, { '/': `${prefix}/*` }])
  ];

  return {
    applinks: {
      details: [{ appIDs: [`${teamId}.${config.ios.bundleId}`], components }]
    }
  };
}

/** The <data> elements the Android intent-filter must contain, as comparable strings. */
export function expectedAndroidDataElements(config) {
  return [
    `scheme=https host=${config.host}`,
    ...config.paths.exact.map(path => `path=${path}`),
    // A bare pathPrefix is a string prefix, not a path segment: "/o" would also claim "/onboarding" and "/users"
    // "/usersettings", opening the app on links it then refuses. Each prefix is therefore the exact path plus
    // everything below it, the same pair the apple-app-site-association file lists (prefix and prefix/*).
    ...config.paths.prefixes.flatMap(prefix => [`path=${prefix}`, `pathPrefix=${prefix}/`])
  ];
}

/** Reads every <data .../> element of the https/host intent-filter out of AndroidManifest.xml. */
export function parseAndroidManifestDeepLinks(manifestXml) {
  const filters = [...manifestXml.matchAll(/<intent-filter\b([^>]*)>([\s\S]*?)<\/intent-filter>/g)];

  for (const [, attributes, body] of filters) {
    if (!/android\.intent\.action\.VIEW/.test(body)) {
      continue;
    }

    const data = [...body.matchAll(/<data\b([^>]*?)\/?>/g)].map(match => {
      const read = name => match[1].match(new RegExp(`android:${name}="([^"]*)"`))?.[1];
      return { scheme: read('scheme'), host: read('host'), path: read('path'), pathPrefix: read('pathPrefix') };
    });

    return {
      autoVerify: /android:autoVerify="true"/.test(attributes),
      browsable: /android\.intent\.category\.BROWSABLE/.test(body),
      defaultCategory: /android\.intent\.category\.DEFAULT/.test(body),
      data
    };
  }

  return null;
}

/** Normalises parsed manifest <data> elements into the same strings expectedAndroidDataElements produces. */
export function describeAndroidData(data) {
  return data.map(item => {
    if (item.scheme && item.host) return `scheme=${item.scheme} host=${item.host}`;
    if (item.path) return `path=${item.path}`;
    if (item.pathPrefix) return `pathPrefix=${item.pathPrefix}`;
    return 'unknown';
  });
}
