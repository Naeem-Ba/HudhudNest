// Pins the shape of the security headers in netlify.toml (security audit 2026-10-03, F-05).
// Plain-text parsing on purpose: the repo has no TOML dependency and this only needs to read one block.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const toml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'netlify.toml'), 'utf8');

function headersBlockFor(path) {
  const blocks = toml.split('[[headers]]').slice(1);
  const block = blocks.find((b) => b.split('\n').some((line) => line.trim() === `for = "${path}"`));
  assert.ok(block, `netlify.toml has no [[headers]] block for ${path}`);
  return block;
}

function headerValue(block, name) {
  const line = block.split('\n').map((l) => l.trim()).find((l) => l.startsWith(`${name} =`));
  if (!line) return undefined;
  const first = line.indexOf('"');
  const last = line.lastIndexOf('"');
  return first === -1 || last <= first ? undefined : line.slice(first + 1, last);
}

const block = headersBlockFor('/*');

test('every page is served with clickjacking, sniffing and referrer protection', () => {
  assert.equal(headerValue(block, 'X-Frame-Options'), 'DENY');
  assert.equal(headerValue(block, 'X-Content-Type-Options'), 'nosniff');
  assert.equal(headerValue(block, 'Referrer-Policy'), 'strict-origin-when-cross-origin');
  assert.ok((headerValue(block, 'Permissions-Policy') ?? '').includes('camera=()'));
});

test('the CSP is report-only and cannot silently become enforcing', () => {
  assert.equal(headerValue(block, 'Content-Security-Policy'), undefined, 'enforcing CSP must be introduced deliberately');
  assert.ok(headerValue(block, 'Content-Security-Policy-Report-Only'));
});

test('the CSP keeps its hard guarantees', () => {
  const csp = headerValue(block, 'Content-Security-Policy-Report-Only');
  assert.ok(!csp.includes('unsafe-eval'));
  for (const directive of ["object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "default-src 'self'"]) {
    assert.ok(csp.includes(directive), `CSP lost ${directive}`);
  }
});

test('no Cross-Origin-Opener-Policy is set: Google Sign-In needs window.opener', () => {
  assert.equal(headerValue(block, 'Cross-Origin-Opener-Policy'), undefined);
});
