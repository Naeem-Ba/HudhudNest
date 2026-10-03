// Run with: node --test tools/lib/redirects-routes.test.mjs
//
// Drift guard between src/app/app.routes.ts and public/_redirects. The latter answers 200 (the app
// shell) only for the first path segments the app really routes, and a real 404 (same shell) for
// everything else, so a route missing from it would answer 404 to crawlers and drop out of the
// index. This fails CI in both directions: a route without a rewrite, and a rewrite without a route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = relative => readFileSync(join(root, relative), 'utf8');

/** Every first path segment declared in src/app/app.routes.ts (flat paths like 'provider/requests'). */
function routeFirstSegments() {
  const source = read('src/app/app.routes.ts');
  return [
    ...new Set(
      [...source.matchAll(/path:\s*'([^']*)'/g)]
        .map(match => match[1].split('/')[0])
        .filter(segment => segment && segment !== '**')
    )
  ].sort();
}

function redirectRules() {
  return read('public/_redirects')
    .split(/\r?\n/)
    .filter(line => line.trim() && !line.trim().startsWith('#'))
    .map(line => line.trim().split(/\s+/));
}

test('app.routes.ts yields a plausible set of segments (guards against the regex matching nothing)', () => {
  assert.ok(routeFirstSegments().length >= 25);
  assert.ok(routeFirstSegments().includes('properties'));
});

test('_redirects answers 200 for exactly the first segments of app.routes.ts, each as page + subtree', () => {
  const rewritten = redirectRules().filter(([, to, status]) => to === '/index.html' && status === '200');
  const fromSet = new Set(rewritten.map(([from]) => from));
  const expected = routeFirstSegments();

  const missing = expected.filter(segment => !fromSet.has(`/${segment}`) || !fromSet.has(`/${segment}/*`));
  assert.deepEqual(missing, [], 'a real route would answer 404 to crawlers -- add it to public/_redirects');

  const expectedFrom = new Set(expected.flatMap(segment => [`/${segment}`, `/${segment}/*`]));
  const stale = [...fromSet].filter(from => !expectedFrom.has(from));
  assert.deepEqual(stale, [], 'a rewrite for a route that no longer exists -- remove it from public/_redirects');
});

test('_redirects ends with the single 404 catch-all, after every known-route rewrite', () => {
  const rules = redirectRules();

  assert.deepEqual(rules[rules.length - 1], ['/*', '/index.html', '404']);
  assert.equal(rules.filter(([from]) => from === '/*').length, 1);
});

test('the public sections the sitemap lists are all rewritten with 200', () => {
  const fromSet = new Set(redirectRules().filter(([, , status]) => status === '200').map(([from]) => from));

  for (const path of ['/home', '/properties', '/properties/*', '/short-stay/*', '/investments/*', '/pricing', '/kontakt', '/valuation']) {
    assert.ok(fromSet.has(path), `${path} must be rewritten with 200`);
  }
});
