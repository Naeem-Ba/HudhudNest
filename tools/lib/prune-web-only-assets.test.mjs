import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pruneWebOnlyAssets } from '../prune-web-only-assets.mjs';

test('removes the survey pages and keeps the app files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prune-'));
  mkdirSync(join(dir, 'survey'));
  writeFileSync(join(dir, 'survey', 'survey-users.html'), 'x');
  writeFileSync(join(dir, 'index.html'), 'app');
  assert.deepEqual(pruneWebOnlyAssets(dir), ['survey']);
  assert.equal(existsSync(join(dir, 'survey')), false);
  assert.equal(existsSync(join(dir, 'index.html')), true);
});

test('is a no-op when nothing needs removing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prune-'));
  assert.deepEqual(pruneWebOnlyAssets(dir), []);
});
