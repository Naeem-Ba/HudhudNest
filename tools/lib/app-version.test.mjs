import assert from 'node:assert/strict';
import test from 'node:test';

import { applyVersion, evaluate, isStrictVersion, normalizeVersion, readAndroid, readIos } from './app-version.mjs';

const gradle = 'defaultConfig {\n        versionCode 2\n        versionName "1.1.0"\n}';
const pbx = 'A = {\n CURRENT_PROJECT_VERSION = 1;\n MARKETING_VERSION = 1.0;\n};\nB = {\n CURRENT_PROJECT_VERSION = 1;\n MARKETING_VERSION = 1.0;\n};';

test('isStrictVersion / normalizeVersion follow the backend and client rules', () => {
  assert.ok(isStrictVersion('1.10.0'));
  for (const bad of ['1.0', '01.0.0', '1.0.0-beta', 'v1.0.0', '', null]) assert.ok(!isStrictVersion(bad), String(bad));
  assert.equal(normalizeVersion('1.0'), '1.0.0');
  assert.equal(normalizeVersion('1.2.3'), '1.2.3');
  assert.equal(normalizeVersion('1.2.3.4'), null);
  assert.equal(normalizeVersion('abc'), null);
});

test('reads Android and iOS versions', () => {
  assert.deepEqual(readAndroid(gradle), { versionName: '1.1.0', versionCode: 2 });
  assert.deepEqual(readIos(pbx), { marketing: ['1.0', '1.0'], build: ['1', '1'] });
});

test('evaluate: current repo state is valid but drifted (warning, not error)', () => {
  const { errors, warnings } = evaluate(readAndroid(gradle), readIos(pbx));
  assert.deepEqual(errors, []);
  assert.ok(warnings.some(w => w.includes('drift')));
  assert.ok(warnings.some(w => w.includes('three-segment')));
});

test('evaluate: aligned versions produce no warnings', () => {
  const { errors, warnings } = evaluate({ versionName: '1.1.0', versionCode: 2 }, { marketing: ['1.1.0'], build: ['2'] });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('evaluate: errors on malformed or inconsistent values', () => {
  assert.ok(evaluate({ versionName: '1.1', versionCode: 2 }, { marketing: ['1.1.0'], build: ['2'] }).errors.length > 0);
  assert.ok(evaluate({ versionName: '1.1.0', versionCode: 0 }, { marketing: ['1.1.0'], build: ['2'] }).errors.length > 0);
  assert.ok(evaluate({ versionName: '1.1.0', versionCode: 2 }, { marketing: ['1.1.0', '1.2.0'], build: ['2'] }).errors.length > 0);
  assert.ok(evaluate({ versionName: '1.1.0', versionCode: 2 }, { marketing: [], build: [] }).errors.length > 0);
});

test('applyVersion writes both platforms in every build configuration', () => {
  const next = applyVersion(gradle, pbx, '1.2.0', 3);
  assert.deepEqual(readAndroid(next.gradle), { versionName: '1.2.0', versionCode: 3 });
  assert.deepEqual(readIos(next.pbxproj), { marketing: ['1.2.0', '1.2.0'], build: ['3', '3'] });
  assert.deepEqual(evaluate(readAndroid(next.gradle), readIos(next.pbxproj)), { errors: [], warnings: [] });
});

test('applyVersion rejects bad versions and non-increasing build numbers', () => {
  assert.throws(() => applyVersion(gradle, pbx, '1.2', 3), /major\.minor\.patch/);
  assert.throws(() => applyVersion(gradle, pbx, '1.2.0', 2), /greater than/);
  assert.throws(() => applyVersion(gradle, pbx, '1.2.0', 1), /greater than/);
  assert.throws(() => applyVersion(gradle, pbx, '1.2.0', 2.5), /positive integer/);
});
