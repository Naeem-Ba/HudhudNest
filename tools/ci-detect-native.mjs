// Writes `native=true|false` to $GITHUB_OUTPUT: does this run's change touch anything the iOS build depends on?
// Rules and the reason for them: tools/lib/native-changes.mjs. Used by .github/workflows/frontend-ci.yml.
//
// Fail-safe by construction: whatever goes wrong (shallow clone, force-push, unknown event), the answer is
// `native=true` and the iOS job runs as it did before this script existed. It never exits non-zero.
//
// Inputs (environment): EVENT_NAME, BEFORE_SHA (push only: github.event.before), GITHUB_OUTPUT.
// The checkout must be at least 2 commits deep:
//   pull_request: HEAD is GitHub's test merge commit, so HEAD^1 is the base branch tip and
//                 `HEAD^1..HEAD` is exactly what the pull request adds.
//   push:         `BEFORE_SHA..HEAD`; BEFORE_SHA is fetched if the shallow clone does not have it.

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { detectNative } from './lib/native-changes.mjs';

const ALL_ZEROS = /^0+$/;
const SHA = /^[0-9a-f]{7,64}$/i;

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function names(output) {
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

function hasCommit(sha, cwd) {
  try {
    git(['cat-file', '-e', `${sha}^{commit}`], cwd);
    return true;
  } catch {
    return false;
  }
}

/** The changed paths for this run, or null when they cannot be worked out. */
export function changedFilesFor({ eventName, beforeSha, cwd = process.cwd() }) {
  try {
    // --no-renames: a file moved out of ios/ must still count as touching ios/.
    if (eventName === 'pull_request') {
      return names(git(['diff', '--name-only', '--no-renames', 'HEAD^1', 'HEAD'], cwd));
    }
    if (eventName === 'push') {
      if (!beforeSha || ALL_ZEROS.test(beforeSha) || !SHA.test(beforeSha)) return null;
      if (!hasCommit(beforeSha, cwd)) {
        git(['fetch', '--no-tags', '--depth=1', 'origin', beforeSha], cwd);
      }
      return names(git(['diff', '--name-only', '--no-renames', beforeSha, 'HEAD'], cwd));
    }
  } catch {
    // fall through: unknown means "run the job"
  }
  return null;
}

export function run({ eventName, beforeSha, cwd, outputPath, log = console.log }) {
  const result = detectNative({
    eventName,
    changedFiles: changedFilesFor({ eventName, beforeSha, cwd }),
  });

  log(`[ci-detect-native] ${eventName || 'unknown event'}: native=${result.native} (${result.reason})`);
  for (const file of result.matched.slice(0, 20)) log(`[ci-detect-native]   ${file}`);
  if (result.matched.length > 20) log(`[ci-detect-native]   ... and ${result.matched.length - 20} more`);

  if (outputPath) appendFileSync(outputPath, `native=${result.native}\n`);
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run({
    eventName: process.env.EVENT_NAME,
    beforeSha: process.env.BEFORE_SHA,
    outputPath: process.env.GITHUB_OUTPUT,
  });
}
