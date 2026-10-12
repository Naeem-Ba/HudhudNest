// Pins .github/workflows/promote-release.yml: the only thing that may start a production build is moving
// the `release` branch, and that move must be a fast-forward onto a main commit whose Frontend CI passed.
// The workflow's own shell script is extracted and run here against throw-away git repositories, with a
// fake `gh` that answers "which commits have a green Frontend CI run".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflow = readFileSync(join(root, '.github', 'workflows', 'promote-release.yml'), 'utf8').replace(/\r\n/g, '\n');

function extractScript() {
  const lines = workflow.split('\n');
  const stepAt = lines.findIndex((l) => l.trim() === '- name: Fast-forward release');
  assert.ok(stepAt >= 0, 'the "Fast-forward release" step exists');
  const runAt = lines.findIndex((l, i) => i > stepAt && l.trim() === 'run: |');
  assert.ok(runAt >= 0, 'the step has a run block');
  const indent = lines[runAt].length - lines[runAt].trimStart().length + 2;
  const body = [];
  for (const line of lines.slice(runAt + 1)) {
    if (line.trim() !== '' && line.length - line.trimStart().length < indent) break;
    body.push(line.slice(indent));
  }
  return body.join('\n') + '\n';
}

const SCRIPT = extractScript();
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com'
};

const FAKE_GH = `#!/usr/bin/env bash
commit=""
while [ $# -gt 0 ]; do
  if [ "$1" = "--commit" ]; then commit="$2"; shift; fi
  shift
done
if [ -n "$commit" ]; then
  for s in $FAKE_GREEN; do [ "$s" = "$commit" ] && echo "$s"; done
else
  set -- $FAKE_GREEN
  echo "\${1:-}"
fi
exit 0
`;

/** A bare origin with main = c1 <- c2 <- c3, plus a work clone. */
function makeRepos() {
  const dir = mkdtempSync(join(tmpdir(), 'promote-release-'));
  const origin = join(dir, 'origin.git');
  const work = join(dir, 'work');
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'gh'), FAKE_GH);
  chmodSync(join(bin, 'gh'), 0o755);
  writeFileSync(join(dir, 'script.sh'), SCRIPT);

  const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' }).trim();
  git(dir, 'init', '--bare', '-b', 'main', origin);
  git(dir, 'init', '-b', 'main', work);
  git(work, 'remote', 'add', 'origin', origin);
  const shas = [];
  for (const name of ['c1', 'c2', 'c3']) {
    writeFileSync(join(work, `${name}.txt`), name);
    git(work, 'add', '.');
    git(work, 'commit', '-m', name);
    shas.push(git(work, 'rev-parse', 'HEAD'));
  }
  git(work, 'push', 'origin', 'main');

  return {
    dir, shas,
    git: (...args) => git(work, ...args),
    releaseAt: () => {
      const out = spawnSync('git', ['rev-parse', '--verify', '-q', 'refs/heads/release'], { cwd: origin, env: GIT_ENV, encoding: 'utf8' });
      return out.status === 0 ? out.stdout.trim() : null;
    },
    setRelease: (sha) => git(work, 'push', 'origin', `${sha}:refs/heads/release`),
    // `staging`: 'skip' (default) bypasses the Staging check; 'ok' / 'bad' install a stub checker that
    // exits 0 / 1 and records the arguments it was called with.
    run: ({ requested = '', green = [], staging = 'skip' }) => {
      mkdirSync(join(work, 'tools'), { recursive: true });
      if (staging !== 'skip') {
        writeFileSync(
          join(work, 'tools', 'check-live-environment.mjs'),
          `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(join(dir, 'checker-args.txt'))}, process.argv.slice(2).join(' '));\nprocess.exit(${staging === 'ok' ? 0 : 1});\n`
        );
      }
      return spawnSync('bash', [join(dir, 'script.sh')], {
      cwd: work,
      encoding: 'utf8',
      env: {
        ...GIT_ENV,
        PATH: `${bin}:${process.env.PATH}`,
        GH_TOKEN: 'x', REPO: 'o/r',
        REQUESTED_SHA: requested,
        FAKE_GREEN: green.join(' '),
        SKIP_STAGING_CHECK: staging === 'skip' ? 'true' : 'false',
        STAGING_URL: 'https://staging.example',
        GITHUB_STEP_SUMMARY: join(dir, 'summary.md')
      }
    });
    },
    checkerArgs: () => { try { return readFileSync(join(dir, 'checker-args.txt'), 'utf8'); } catch { return null; } },
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  };
}

function scenario(fn) {
  const repos = makeRepos();
  try { return fn(repos); } finally { repos.cleanup(); }
}

test('creates release at the newest green main commit when the branch does not exist yet', () => scenario((r) => {
  const [, c2, c3] = r.shas;
  const out = r.run({ green: [c3, c2] });
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.equal(r.releaseAt(), c3);
}));

test('fast-forwards release and says where it came from', () => scenario((r) => {
  const [c1, , c3] = r.shas;
  r.setRelease(c1);
  const out = r.run({ green: [c3] });
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.equal(r.releaseAt(), c3);
  assert.ok(out.stdout.includes(c1.slice(0, 7)), 'the previous commit is printed');
}));

test('an explicit sha is promoted when its CI is green', () => scenario((r) => {
  const [, c2] = r.shas;
  const out = r.run({ requested: c2.slice(0, 10), green: [c2] });
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.equal(r.releaseAt(), c2);
}));

test('moves release only after Staging confirms it runs that very commit', () => scenario((r) => {
  const [, , c3] = r.shas;
  const out = r.run({ green: [c3], staging: 'ok' });
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.equal(r.releaseAt(), c3);
  assert.equal(r.checkerArgs(), `https://staging.example --expect staging --commit ${c3}`);
}));

test('refuses to promote when Staging is on another commit or unreachable', () => scenario((r) => {
  const [, , c3] = r.shas;
  const out = r.run({ green: [c3], staging: 'bad' });
  assert.notEqual(out.status, 0);
  assert.match(out.stdout + out.stderr, /Staging is not running/);
  assert.equal(r.releaseAt(), null);
}));

test('never moves release backwards', () => scenario((r) => {
  const [, c2, c3] = r.shas;
  r.setRelease(c3);
  const out = r.run({ requested: c2, green: [c2] });
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.equal(r.releaseAt(), c3);
  assert.match(out.stdout, /nothing to do/);
}));

test('refuses to overwrite a release that has commits main does not have', () => scenario((r) => {
  const [c1, , c3] = r.shas;
  r.git('checkout', '-q', '-b', 'side', c1);
  writeFileSync(join(r.dir, 'work', 'side.txt'), 'side');
  r.git('add', '.');
  r.git('commit', '-q', '-m', 'side');
  const side = r.git('rev-parse', 'HEAD');
  r.setRelease(side);
  r.git('checkout', '-q', 'main');
  const out = r.run({ green: [c3] });
  assert.notEqual(out.status, 0);
  assert.match(out.stdout + out.stderr, /does not contain/);
  assert.equal(r.releaseAt(), side);
}));

test('refuses a commit that is not on main, even if some CI run is green for it', () => scenario((r) => {
  const [c1] = r.shas;
  r.git('checkout', '-q', '-b', 'side', c1);
  writeFileSync(join(r.dir, 'work', 'side.txt'), 'side');
  r.git('add', '.');
  r.git('commit', '-q', '-m', 'side');
  const side = r.git('rev-parse', 'HEAD');
  r.git('checkout', '-q', 'main');
  const out = r.run({ requested: side, green: [side] });
  assert.notEqual(out.status, 0);
  assert.match(out.stdout + out.stderr, /not on main/);
  assert.equal(r.releaseAt(), null);
}));

test('refuses a main commit whose Frontend CI has no successful run', () => scenario((r) => {
  const [, c2, c3] = r.shas;
  const out = r.run({ requested: c2, green: [c3] });
  assert.notEqual(out.status, 0);
  assert.match(out.stdout + out.stderr, /no successful run/);
  assert.equal(r.releaseAt(), null);
}));

test('fails clearly when no CI run on main is green at all', () => scenario((r) => {
  const out = r.run({ green: [] });
  assert.notEqual(out.status, 0);
  assert.match(out.stdout + out.stderr, /No successful Frontend CI run/);
  assert.equal(r.releaseAt(), null);
}));

test('a sha that is not plain hex never reaches git', () => scenario((r) => {
  for (const bad of ['--help', 'main', 'abc;ls', 'ABCDEF1']) {
    const out = r.run({ requested: bad, green: r.shas });
    assert.notEqual(out.status, 0, bad);
    assert.match(out.stdout + out.stderr, /lowercase hex/, bad);
  }
  assert.equal(r.releaseAt(), null);
}));

test('only a person can start it, and it can only ever push the release branch', () => {
  const on = workflow.slice(workflow.indexOf('\non:'), workflow.indexOf('\npermissions:'));
  assert.ok(/workflow_dispatch:/.test(on), 'manual trigger');
  for (const trigger of ['push:', 'pull_request', 'schedule:', 'workflow_run:']) {
    assert.ok(!on.includes(trigger), `no ${trigger} trigger`);
  }
  const pushes = SCRIPT.split('\n').filter((l) => /\bgit push\b/.test(l));
  assert.equal(pushes.length, 1, 'exactly one push');
  assert.match(pushes[0], /git push origin "\$TARGET_SHA:refs\/heads\/release"$/);
  assert.ok(!/--force|--force-with-lease|\s-f\s|:\+|"\+/.test(pushes[0]), 'never forced');
});

test('every action is pinned to a full commit sha, and runs are serialised', () => {
  const uses = [...workflow.matchAll(/^\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
  assert.ok(uses.length >= 1);
  for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, u);
  assert.match(workflow, /concurrency:\n\s+group: promote-release\n\s+cancel-in-progress: false/);
});
