// Pins the cache split in netlify.toml (performance audit 2026-10-03, B7): content-hashed build
// output is immutable, everything that keeps its name across deploys is not.
// Plain-text parsing on purpose, like security-headers.test.mjs: no TOML dependency in the repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const toml = readFileSync(join(root, 'netlify.toml'), 'utf8').replace(/\r\n/g, '\n');
const blocks = toml.split('[[headers]]').slice(1);

function cacheControlFor(path) {
  const block = blocks.find((b) => b.split('\n').some((line) => line.trim() === `for = "${path}"`));
  const line = block?.split('\n').map((l) => l.trim()).find((l) => l.startsWith('Cache-Control ='));
  return line === undefined ? undefined : line.slice(line.indexOf('"') + 1, line.lastIndexOf('"'));
}

const HASHED = ['/main-*.js', '/chunk-*.js', '/polyfills-*.js', '/styles-*.css', '/media/*'];

test('content-hashed build output is cached for a year and immutable', () => {
  for (const path of HASHED) {
    assert.equal(cacheControlFor(path), 'public, max-age=31536000, immutable', path);
  }
});

test('files that keep their name across deploys are never immutable', () => {
  // Any block whose pattern is not one of the hashed ones (or "/images/*") must not set immutable.
  for (const block of blocks) {
    const path = block.split('\n').map((l) => l.trim()).find((l) => l.startsWith('for ='))?.split('"')[1];
    if (HASHED.includes(path)) continue;
    const cacheLine = block.split('\n').find((l) => l.trim().startsWith('Cache-Control ='));
    assert.ok(!/immutable/.test(cacheLine ?? ''), `${path} must not be immutable`);
  }
  assert.ok(!/max-age=31536000/.test(cacheControlFor('/images/*') ?? ''), '/images/* keeps a stable name, so it gets a bounded cache');
});

test('no rule gives index.html, the manifest or the i18n JSON a long cache', () => {
  for (const path of ['/', '/index.html', '/manifest.webmanifest', '/i18n/*', '/*']) {
    assert.ok(!/max-age=(?!0\b)\d{6,}/.test(cacheControlFor(path) ?? ''), `${path} must keep revalidating`);
  }
});

test('the hashed patterns match what the Angular build emits', () => {
  const angular = JSON.parse(readFileSync(join(root, 'angular.json'), 'utf8'));
  const configs = Object.values(angular.projects).flatMap((p) => Object.values(p.architect.build.configurations ?? {}));
  const deployed = ['production', 'staging'].map((n) => Object.values(angular.projects)[0].architect.build.configurations[n]);
  for (const c of deployed) assert.equal(c?.outputHashing, 'all', 'immutable caching depends on outputHashing: "all"');
  assert.ok(configs.length > 0);
});
