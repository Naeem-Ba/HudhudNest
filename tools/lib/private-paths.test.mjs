// Run with: node --test tools/lib/private-paths.test.mjs
//
// Drift guards for the SEO plumbing that has no compile-time link to the rest of the app:
//   - every guarded route in app.routes.ts is covered by PRIVATE_PATHS (so robots.txt + the
//     X-Robots-Tag header actually protect it), because the list is hand-maintained;
//   - the committed public/_headers is exactly what the generator would write;
//   - the old-domain 301 rules sit ABOVE the SPA catch-all in public/_redirects (Netlify applies
//     the first match, so the same rule placed below it would be dead code).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRIVATE_PATHS, buildHeadersFile, headerPatternsFor } from './private-paths.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = relative => readFileSync(join(root, relative), 'utf8');

/** Every `path: '...'` in app.routes.ts whose route object also has a canActivate guard. */
function guardedRoutePaths() {
  const source = read('src/app/app.routes.ts');
  const matches = [...source.matchAll(/path:\s*'([^']+)'/g)];

  return matches
    .filter((match, index) => {
      const end = index + 1 < matches.length ? matches[index + 1].index : source.length;
      return /canActivate\s*:/.test(source.slice(match.index, end));
    })
    .map(match => `/${match[1]}`);
}

function isCovered(routePath) {
  return PRIVATE_PATHS.some(privatePath => routePath.startsWith(privatePath));
}

test('app.routes.ts has guarded routes to check (guards against the regex silently matching nothing)', () => {
  assert.ok(guardedRoutePaths().length >= 20);
});

test('every route behind AuthGuard/AdminGuard/ProviderGuard is covered by PRIVATE_PATHS', () => {
  const uncovered = guardedRoutePaths().filter(routePath => !isCovered(routePath));
  assert.deepEqual(uncovered, []);
});

test('the inbox itself, not only a conversation, is private', () => {
  assert.ok(isCovered('/messages'));
  assert.ok(isCovered('/messages/abc'));
});

test('public pages are not accidentally private', () => {
  for (const publicPath of ['/', '/home', '/properties', '/properties/123', '/short-stay', '/investments', '/pricing']) {
    assert.equal(isCovered(publicPath), false, `${publicPath} must stay indexable`);
  }
});

test('headerPatternsFor: prefix paths need the exact path and the subtree, slash paths just the subtree', () => {
  assert.deepEqual(headerPatternsFor('/profile'), ['/profile', '/profile/*']);
  assert.deepEqual(headerPatternsFor('/admin/'), ['/admin/*']);
});

test('public/_headers matches what the generator writes from PRIVATE_PATHS', () => {
  assert.equal(read('public/_headers').replace(/\r\n/g, '\n'), buildHeadersFile());
});

test('old-domain redirects come before the SPA catch-all in public/_redirects', () => {
  const rules = read('public/_redirects')
    .split(/\r?\n/)
    .filter(line => line.trim() && !line.trim().startsWith('#'));

  const catchAll = rules.findIndex(line => /^\/\*\s+\/index\.html\s+404/.test(line));
  const oldDomain = rules
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.includes('realestateworld.world'));

  assert.ok(catchAll >= 0, 'final catch-all (404) rule missing');
  assert.ok(oldDomain.length >= 4, 'expected http/https x apex/www old-domain rules');
  for (const { line, index } of oldDomain) {
    assert.ok(index < catchAll, `old-domain rule must precede the catch-all: ${line}`);
    assert.match(line, /https:\/\/hudhudnest\.com\/:splat\s+301!/);
  }
});
