import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { fetchLiveBuildInfo, main } from '../check-live-environment.mjs';
import { createBuildInfo, parseBuildInfo, resolveEnvironmentName, validateBuildInfo } from './build-info.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const stamp = join(root, 'tools', 'stamp-build-info.mjs');

const productionInfo = {
  schema: 1,
  environment: 'production',
  apiUrl: 'https://api.hudhudnest.com/api',
  netlifyContext: 'production',
  branch: 'main',
  commit: 'a60ca463dabd0b37e58debdb50f7eca577d71762',
  builtAt: '2026-10-05T08:30:00.000Z'
};

function fakeFetch(body, { status = 200 } = {}) {
  return async () => ({ ok: status >= 200 && status < 300, status, text: async () => body });
}

function capture() {
  const lines = [];
  return { lines, log: (line) => lines.push(line), error: (line) => lines.push(line) };
}

test('the real angular.json maps each build configuration to the right environment', () => {
  const angularJson = JSON.parse(readFileSync(join(root, 'angular.json'), 'utf8'));
  const read = (path) => readFileSync(join(root, path), 'utf8');
  assert.equal(resolveEnvironmentName(angularJson, 'production', read), 'production');
  assert.equal(resolveEnvironmentName(angularJson, 'staging', read), 'staging');
  assert.throws(() => resolveEnvironmentName(angularJson, 'nope', read), /no build configuration/);
});

test('stamp-build-info writes the marker for production and staging builds', () => {
  const dir = mkdtempSync(join(tmpdir(), 'build-info-'));
  try {
    const env = { ...process.env, CONTEXT: 'production', BRANCH: 'main', COMMIT_REF: 'abc1234def', API_URL: '' };
    execFileSync(process.execPath, [stamp, 'production', '--out', dir], { env, stdio: 'pipe' });
    const prod = parseBuildInfo(readFileSync(join(dir, 'build-info.json'), 'utf8'));
    assert.equal(prod.environment, 'production');
    assert.equal(prod.netlifyContext, 'production');
    assert.equal(prod.commit, 'abc1234def');
    assert.equal(prod.apiUrl, null);

    execFileSync(process.execPath, [stamp, 'staging', '--out', dir], {
      env: { ...env, CONTEXT: 'deploy-preview', API_URL: 'https://staging-api.hudhudnest.com/api' },
      stdio: 'pipe'
    });
    const staging = parseBuildInfo(readFileSync(join(dir, 'build-info.json'), 'utf8'));
    assert.equal(staging.environment, 'staging');
    assert.equal(staging.apiUrl, 'https://staging-api.hudhudnest.com/api');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createBuildInfo leaves out what the build did not provide', () => {
  const info = createBuildInfo({ environment: 'production', env: {}, now: new Date('2026-10-05T00:00:00Z') });
  assert.deepEqual(info, {
    schema: 1,
    environment: 'production',
    apiUrl: null,
    netlifyContext: null,
    branch: null,
    commit: null,
    builtAt: '2026-10-05T00:00:00.000Z'
  });
});

test('a production marker with a production context is accepted', () => {
  assert.deepEqual(validateBuildInfo(productionInfo, { expectedEnvironment: 'production' }), []);
});

test('a Staging build live where production is expected is rejected (the 2026-10-05 incident)', () => {
  const staging = { ...productionInfo, environment: 'staging', apiUrl: 'https://staging-api.hudhudnest.com/api', netlifyContext: 'branch-deploy', branch: 'staging' };
  const problems = validateBuildInfo(staging, { expectedEnvironment: 'production' });
  assert.ok(problems.some((problem) => /"staging" build but "production" was expected/.test(problem)));
  assert.ok(problems.some((problem) => /points at Staging/.test(problem)));
  assert.ok(problems.some((problem) => /branch-deploy/.test(problem)));
});

test('a deploy preview published as production is rejected even if it claims production', () => {
  const problems = validateBuildInfo({ ...productionInfo, netlifyContext: 'deploy-preview', branch: 'claude/x' }, { expectedEnvironment: 'production' });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /deploy-preview/);
});

test('a missing marker is a failure, not a pass', () => {
  assert.equal(validateBuildInfo(null, { expectedEnvironment: 'production' }).length, 1);
});

test('a staging site must not be built against the Production API', () => {
  const info = { ...productionInfo, environment: 'staging', apiUrl: 'https://api.hudhudnest.com/api', netlifyContext: 'branch-deploy' };
  assert.equal(validateBuildInfo(info, { expectedEnvironment: 'staging' }).length, 1);
  assert.deepEqual(validateBuildInfo({ ...info, apiUrl: 'https://staging-api.hudhudnest.com/api' }, { expectedEnvironment: 'staging' }), []);
});

test('parseBuildInfo rejects the SPA fallback page and other documents', () => {
  assert.equal(parseBuildInfo('<!doctype html><html></html>'), null);
  assert.equal(parseBuildInfo('{"schema":2}'), null);
  assert.equal(parseBuildInfo('null'), null);
  assert.equal(parseBuildInfo(JSON.stringify(productionInfo)).environment, 'production');
});

test('the checker passes for production and fails for Staging, with distinct exit codes', async () => {
  const ok = capture();
  const original = globalThis.fetch;
  try {
    globalThis.fetch = fakeFetch(JSON.stringify(productionInfo));
    assert.equal(await main(['node', 'check'], ok), 0);
    assert.match(ok.lines[0], /OK https:\/\/hudhudnest\.com is a production build/);

    const bad = capture();
    globalThis.fetch = fakeFetch(JSON.stringify({ ...productionInfo, environment: 'staging' }));
    assert.equal(await main(['node', 'check', 'https://hudhudnest.com', '--expect', 'production'], bad), 1);
    assert.match(bad.lines[0], /FAIL/);

    const missing = capture();
    globalThis.fetch = fakeFetch('<!doctype html>');
    assert.equal(await main(['node', 'check'], missing), 1);

    const badArg = capture();
    assert.equal(await main(['node', 'check', '--expect', 'preview'], badArg), 2);
  } finally {
    globalThis.fetch = original;
  }
});

test('fetchLiveBuildInfo retries a transient failure and reports an unreachable site as an error', async () => {
  let calls = 0;
  const flaky = async () => {
    calls += 1;
    if (calls < 2) throw new Error('socket hang up');
    return { ok: true, status: 200, text: async () => JSON.stringify(productionInfo) };
  };
  const info = await fetchLiveBuildInfo('https://hudhudnest.com/', { fetchImpl: flaky, retryDelayMs: 0 });
  assert.equal(info.environment, 'production');
  assert.equal(calls, 2);

  const down = async () => ({ ok: false, status: 503, text: async () => '' });
  await assert.rejects(fetchLiveBuildInfo('https://hudhudnest.com', { fetchImpl: down, attempts: 2, retryDelayMs: 0 }), /could not reach/);
});

test('fetchLiveBuildInfo asks for a fresh copy', async () => {
  let requested;
  await fetchLiveBuildInfo('https://hudhudnest.com', {
    now: () => 42,
    fetchImpl: async (url) => {
      requested = url;
      return { ok: true, status: 200, text: async () => '{}' };
    }
  });
  assert.equal(requested, 'https://hudhudnest.com/build-info.json?cb=42');
});
