// Run with: node --test tools/lib/native-changes.test.mjs
//
// Pins how Frontend CI decides to spend macOS minutes: the iOS job runs only when a change can affect the
// native project, and every doubt resolves to "run it". The CLI is exercised against throw-away git
// repositories (a push, a pull request's test merge commit, and the failure cases); the workflow wiring is
// checked as text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { detectNative, isNativeFile } from './native-changes.mjs';
import { run } from '../ci-detect-native.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflow = readFileSync(join(root, '.github', 'workflows', 'frontend-ci.yml'), 'utf8').replace(/\r\n/g, '\n');

test('files that feed the iOS project count as native', () => {
  for (const file of [
    'ios/App/App/Info.plist',
    'ios/App/CapApp-SPM/Package.swift',
    'ios/debug.xcconfig',
    'resources/ios/PrivacyInfo.xcprivacy',
    'capacitor.config.ts',
    'capacitor.config.json',
    'package.json',
    'package-lock.json',
    'tools/setup-ios.mjs',
    'tools/fix-ios-spm-paths.mjs',
    'tools/validate-ios-config.mjs',
    '.github/workflows/frontend-ci.yml',
    './ios/App/App/Info.plist',
    'ios\\App\\App\\Info.plist',
  ]) {
    assert.equal(isNativeFile(file), true, file);
  }
});

test('web, Android, docs and other workflows do not', () => {
  for (const file of [
    'src/app/app.component.ts',
    'src/app/features/pricing/pricing.page.ts',
    'public/_redirects',
    'angular.json',
    'android/app/build.gradle',
    'docs/DEEP-LINKS.md',
    'deep-links.config.json',
    'netlify.toml',
    '.github/workflows/promote-release.yml',
    'tools/generate-download-page.mjs',
    'resources/android/icon.png',
    // look-alikes must not match
    'ios-notes.md',
    'src/ios/helper.ts',
    'docs/capacitor.config.md',
    'my-package.json',
  ]) {
    assert.equal(isNativeFile(file), false, file);
  }
});

test('a manual run, an unknown file list and an empty one all run the iOS job', () => {
  assert.deepEqual(detectNative({ eventName: 'workflow_dispatch', changedFiles: ['src/a.ts'] }).native, true);
  assert.deepEqual(detectNative({ eventName: 'push', changedFiles: null }).native, true);
  assert.deepEqual(detectNative({ eventName: 'push', changedFiles: [] }).native, true);
});

test('only web files changed: the iOS job is skipped; one native file among them is enough to run it', () => {
  assert.deepEqual(
    detectNative({ eventName: 'pull_request', changedFiles: ['src/a.ts', 'docs/x.md'] }),
    { native: false, reason: 'no native files changed', matched: [] },
  );
  assert.deepEqual(
    detectNative({ eventName: 'pull_request', changedFiles: ['src/a.ts', 'ios/App/App/Info.plist'] }),
    { native: true, reason: 'native files changed', matched: ['ios/App/App/Info.plist'] },
  );
});

// --- the CLI against real git history -------------------------------------------------------------

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'native-changes-'));
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const write = (file, text = 'x') => {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), `${text}\n${Math.random()}\n`);
  };
  const commit = (message, ...files) => {
    for (const file of files) write(file);
    git('add', '-A');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q', '-b', 'main');
  return { dir, git, commit, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function detect(sb, input) {
  const outputPath = join(sb.dir, '..', `out-${Math.random().toString(36).slice(2)}.txt`);
  writeFileSync(outputPath, '');
  const result = run({ ...input, cwd: sb.dir, outputPath, log: () => {} });
  const written = readFileSync(outputPath, 'utf8');
  rmSync(outputPath);
  assert.equal(written, `native=${result.native}\n`, 'the value written to $GITHUB_OUTPUT matches the decision');
  return result;
}

test('push: web-only commits skip iOS; a commit touching ios/ runs it', () => {
  const sb = sandbox();
  try {
    const base = sb.commit('base', 'package.json', 'src/a.ts', 'ios/App/App/Info.plist');
    sb.commit('web change', 'src/a.ts');
    const webOnly = detect(sb, { eventName: 'push', beforeSha: base });
    assert.equal(webOnly.native, false);

    sb.commit('native change', 'ios/App/App/Info.plist');
    const withNative = detect(sb, { eventName: 'push', beforeSha: base });
    assert.equal(withNative.native, true);
    assert.deepEqual(withNative.matched, ['ios/App/App/Info.plist']);
  } finally {
    sb.cleanup();
  }
});

test('push: a file moved out of ios/ still counts', () => {
  const sb = sandbox();
  try {
    const base = sb.commit('base', 'ios/App/App/Info.plist');
    sb.git('mv', 'ios/App/App/Info.plist', 'docs-copy.plist');
    sb.git('commit', '-q', '-m', 'move');
    assert.equal(detect(sb, { eventName: 'push', beforeSha: base }).native, true);
  } finally {
    sb.cleanup();
  }
});

test('pull request: reads the test merge commit against its first parent', () => {
  const sb = sandbox();
  try {
    sb.commit('base', 'package.json', 'src/a.ts');
    sb.git('switch', '-q', '-c', 'feature');
    sb.commit('feature work', 'src/b.ts');
    sb.git('switch', '-q', 'main');
    sb.commit('main moves on', 'ios/App/App/Info.plist'); // native change that is NOT part of the pull request
    sb.git('merge', '-q', '--no-ff', '-m', 'test merge', 'feature');

    const result = detect(sb, { eventName: 'pull_request' });
    assert.equal(result.native, false, 'only what the pull request adds is looked at');

    sb.git('switch', '-q', '-c', 'feature2', 'HEAD^1');
    sb.commit('touches capacitor config', 'capacitor.config.ts');
    sb.git('switch', '-q', 'main');
    sb.git('merge', '-q', '--no-ff', '-m', 'test merge 2', 'feature2');
    assert.equal(detect(sb, { eventName: 'pull_request' }).native, true);
  } finally {
    sb.cleanup();
  }
});

test('anything that cannot be worked out runs the iOS job', () => {
  const sb = sandbox();
  try {
    const first = sb.commit('base', 'src/a.ts');
    sb.commit('web change', 'src/a.ts');

    const cases = [
      { name: 'first push of a branch (all-zero before)', input: { eventName: 'push', beforeSha: '0'.repeat(40) } },
      { name: 'no before sha', input: { eventName: 'push', beforeSha: '' } },
      { name: 'before sha is not a sha', input: { eventName: 'push', beforeSha: '--output=/tmp/x' } },
      { name: 'force-push: before sha not in the clone and not fetchable', input: { eventName: 'push', beforeSha: 'f'.repeat(40) } },
      { name: 'unknown event', input: { eventName: 'schedule', beforeSha: first } },
      { name: 'no event', input: { eventName: undefined } },
      { name: 'manual run', input: { eventName: 'workflow_dispatch', beforeSha: first } },
    ];
    for (const { name, input } of cases) {
      assert.equal(detect(sb, input).native, true, name);
    }
  } finally {
    sb.cleanup();
  }
});

test('a pull request run outside a git checkout does not throw and runs iOS', () => {
  const dir = mkdtempSync(join(tmpdir(), 'native-changes-nogit-'));
  try {
    const result = run({ eventName: 'pull_request', cwd: dir, log: () => {} });
    assert.equal(result.native, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- the workflow wiring --------------------------------------------------------------------------

function job(name) {
  const lines = workflow.split('\n');
  const start = lines.findIndex((l) => l === `  ${name}:`);
  assert.ok(start >= 0, `job ${name} exists`);
  const end = lines.findIndex((l, i) => i > start && /^  [a-z0-9-]+:$/.test(l));
  return lines.slice(start, end === -1 ? lines.length : end).join('\n');
}

test('frontend-ci: the iOS job waits for the build and runs only when native files changed', () => {
  const ios = job('ios-build');
  assert.match(ios, /runs-on: macos-15/);
  assert.match(ios, /needs: build\b/, 'a red web build must not cost macOS minutes');
  assert.match(ios, /if: needs\.build\.outputs\.native == 'true'/);
});

test('frontend-ci: the build job computes the answer from a 2-deep checkout', () => {
  const build = job('build');
  assert.match(build, /outputs:\n\s+native: \$\{\{ steps\.native\.outputs\.native \}\}/);
  assert.match(build, /fetch-depth: 2/);
  assert.match(build, /id: native\n\s+env:\n\s+EVENT_NAME: \$\{\{ github\.event_name \}\}\n\s+BEFORE_SHA: \$\{\{ github\.event\.before \}\}\n\s+run: node tools\/ci-detect-native\.mjs/);
});

test('frontend-ci: the Android build does not depend on the iOS decision', () => {
  const android = job('android-release');
  assert.match(android, /needs: build\n/);
  assert.doesNotMatch(android, /native/);
});

test('frontend-ci: a newer push cancels the older pull-request run, never a run on main', () => {
  assert.match(
    workflow,
    /concurrency:\n  group: frontend-ci-\$\{\{ github\.event_name == 'pull_request' && github\.ref \|\| github\.run_id \}\}\n  cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/,
  );
});

test('frontend-ci: no new third-party action, every uses: stays pinned to a commit', () => {
  const uses = workflow.split('\n').filter((l) => /^\s+(- )?uses:/.test(l));
  assert.ok(uses.length > 0);
  for (const line of uses) {
    assert.match(line, /@[0-9a-f]{40}\b/, line.trim());
  }
});
