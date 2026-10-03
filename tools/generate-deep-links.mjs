// Generates the two files that make native deep links verifiable, before `ng build` copies `public/` into
// the bundle:
//
//   public/.well-known/assetlinks.json              (Android App Links)
//   public/.well-known/apple-app-site-association   (iOS Universal Links)
//
// Inputs: deep-links.config.json plus two optional environment variables, so secrets-adjacent or per-account
// values never have to be committed:
//   ANDROID_SHA256_CERT_FINGERPRINTS  extra signing-certificate fingerprints, comma/space separated - e.g. the
//                                     "App signing key certificate" shown in Play Console once Play App Signing
//                                     is on (it differs from the upload key committed in the config)
//   APPLE_TEAM_ID                     the 10-character Apple Team ID (overrides ios.teamId in the config)
//
// Like generate-env.mjs, a missing value never fails the build: the file that cannot be generated yet is simply
// not written (and a stale one from an earlier build is removed), with a clear notice. A wrong file would be
// worse than none. Output is git-ignored; it is derived data.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAppleSiteAssociation, buildAssetLinks } from './lib/deep-links.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wellKnownDir = join(root, 'public', '.well-known');
const config = JSON.parse(readFileSync(join(root, 'deep-links.config.json'), 'utf8'));

mkdirSync(wellKnownDir, { recursive: true });

function emit(fileName, document, missingNotice) {
  const target = join(wellKnownDir, fileName);

  if (document === null) {
    rmSync(target, { force: true });
    console.warn(`[generate-deep-links] ${fileName} NOT written: ${missingNotice}`);
    return;
  }

  writeFileSync(target, JSON.stringify(document, null, 2) + '\n');
  console.log(`[generate-deep-links] wrote public/.well-known/${fileName}`);
}

emit(
  'assetlinks.json',
  buildAssetLinks(config, process.env),
  'no Android signing-certificate fingerprint (deep-links.config.json android.sha256CertFingerprints / ANDROID_SHA256_CERT_FINGERPRINTS).'
);

emit(
  'apple-app-site-association',
  buildAppleSiteAssociation(config, process.env),
  'no Apple Team ID yet. Set APPLE_TEAM_ID (Netlify environment variable) or ios.teamId in deep-links.config.json - iOS Universal Links stay inactive until then. See docs/DEEP-LINKS.md.'
);
