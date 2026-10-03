// Checks a DEPLOYED site against what the native apps need. Read-only: it only issues GET requests.
//
//   node tools/verify-deep-links.mjs                      -> https://hudhudnest.com
//   node tools/verify-deep-links.mjs https://staging...   -> another origin
//
// Exit code 1 when anything the apps rely on is missing. What this cannot prove (that Android has actually
// verified the link on a device, or that iOS accepted the association) is covered in docs/DEEP-LINKS.md.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'deep-links.config.json'), 'utf8'));
const origin = (process.argv[2] ?? `https://${config.host}`).replace(/\/+$/, '');

let failed = false;
const report = (ok, message) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${message}`);
  if (!ok) failed = true;
};

async function fetchJson(path) {
  // redirect: 'manual' because neither Android nor Apple follows redirects when fetching these files.
  const response = await fetch(origin + path, { redirect: 'manual', headers: { accept: 'application/json' } });
  const text = await response.text();
  return { response, text };
}

async function check(path, validate) {
  try {
    const { response, text } = await fetchJson(path);
    report(response.status === 200, `${path} -> HTTP ${response.status}${response.status >= 300 && response.status < 400 ? ' (redirects are not followed by Android/iOS)' : ''}`);
    if (response.status !== 200) return;

    report(/application\/json/i.test(response.headers.get('content-type') ?? ''), `${path} content-type is "${response.headers.get('content-type')}" (must be application/json)`);

    let body;
    try {
      body = JSON.parse(text);
    } catch {
      report(false, `${path} is not valid JSON (an SPA fallback page?)`);
      return;
    }
    validate(body);
  } catch (error) {
    report(false, `${path} could not be fetched: ${error.message}`);
  }
}

await check('/.well-known/assetlinks.json', body => {
  const target = body?.[0]?.target;
  report(target?.package_name === config.android.package, `assetlinks package_name is ${target?.package_name}`);
  const wanted = config.android.sha256CertFingerprints;
  report(wanted.every(fp => target?.sha256_cert_fingerprints?.includes(fp)), 'assetlinks lists the configured signing fingerprint(s)');
});

await check('/.well-known/apple-app-site-association', body => {
  const appIds = body?.applinks?.details?.flatMap(detail => detail.appIDs ?? []) ?? [];
  report(appIds.some(id => id.endsWith(`.${config.ios.bundleId}`)), `AASA appIDs: ${appIds.join(', ') || '(none)'}`);
  report(Array.isArray(body?.applinks?.details?.[0]?.components), 'AASA uses the modern "components" format');
});

process.exit(failed ? 1 : 0);
