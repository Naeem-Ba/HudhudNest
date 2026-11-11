// Pins the quality rules of public/i18n/tr.json and the Turkish legal texts. Key parity alone (tools/check-i18n-keys.mjs)
// would pass a file full of English copies; these tests check what the user would actually read.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { TR_OTHER_SCRIPT, TR_SAME_AS_ENGLISH, flattenEntries, measureCoverage, placeholders } from './i18n-coverage.mjs';

const load = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const en = load('public/i18n/en.json');
const tr = load('public/i18n/tr.json');
const options = { script: 'latin', allowSameAsEnglish: TR_SAME_AS_ENGLISH, allowOtherScript: TR_OTHER_SCRIPT };

test('tr.json has exactly the keys of en.json: nothing missing, nothing extra, nothing empty', () => {
  const report = measureCoverage(en, tr, options);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.extra, []);
  assert.deepEqual(report.empty, []);
});

test('every {{placeholder}} of the English text is in the Turkish text, and only those', () => {
  const report = measureCoverage(en, tr, options);
  assert.deepEqual(report.placeholderMismatch, []);
});

test('no Turkish value is a copy of the English text, except brands, units and separators on the allowlist', () => {
  const report = measureCoverage(en, tr, options);
  assert.deepEqual(report.suspects, []);
  assert.ok(report.allowedSame.length <= TR_SAME_AS_ENGLISH.size);
});

test('no Arabic-script text leaks into the Turkish file (except the language-name chip row)', () => {
  const report = measureCoverage(en, tr, options);
  assert.deepEqual(report.wrongScript, []);
});

test('no German-only letters (ä, ß) appear in Turkish values: a German string pasted into tr.json would show here', () => {
  const offenders = flattenEntries(tr).filter(([, value]) => /[äßÄ]/.test(value)).map(([key]) => key);
  assert.deepEqual(offenders, []);
});

test('the translation coverage is complete: every key translated, measured by the strict rules above', () => {
  const report = measureCoverage(en, tr, options);
  assert.equal(report.translated, report.total, `${report.percentTranslated}% translated`);
});

test('Turkish characters survive in the file (a lost UTF-8 encoding would drop them)', () => {
  const withTurkish = flattenEntries(tr).filter(([, value]) => /[çğıöşüÇĞİÖŞÜ]/.test(value)).length;
  assert.ok(withTurkish > 3000, `only ${withTurkish} values contain Turkish letters`);
  const text = readFileSync(new URL('../../public/i18n/tr.json', import.meta.url), 'utf8');
  assert.ok(!text.includes('�'), 'replacement character found');
  assert.ok(!/Ã[¤¶¼§±]|Ä[±°]|Å[ŸžŒ]/.test(text), 'mojibake found');
});

test('Turkish casing: i/ı and İ/I are distinct letters, the way search and headings must treat them', () => {
  assert.equal('i'.toLocaleUpperCase('tr'), 'İ');
  assert.equal('ı'.toLocaleUpperCase('tr'), 'I');
  assert.equal('I'.toLocaleLowerCase('tr'), 'ı');
  assert.equal('İ'.toLocaleLowerCase('tr'), 'i');
  assert.equal('Iğdır'.toLocaleLowerCase('tr'), 'ığdır');
  assert.equal('İstanbul'.toLocaleLowerCase('tr'), 'istanbul');
  assert.notEqual('Iğdır'.toLowerCase(), 'ığdır', 'plain toLowerCase would turn I into i: why search must not use it for Turkish');
});

test('the LANDING language chips and tiles mention Turkish in every UI language', () => {
  for (const language of ['ar', 'en', 'de', 'tr']) {
    const file = load(`public/i18n/${language}.json`);
    assert.match(file.LANDING.HERO.CHIP_LANGS, /Türkçe/, language);
  }
});

test('the Turkish legal texts have the structure of the English ones and carry the legal-review notice', () => {
  const run = spawnSync(process.execPath, ['scripts/check-legal-parity.mjs'], { cwd: new URL('../../', import.meta.url), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  for (const doc of ['privacy', 'terms']) {
    const turkish = load(`public/i18n/legal/tr/${doc}.json`);
    assert.ok(turkish.reviewNotice && turkish.reviewNotice.includes('hukukçu'), `${doc}: reviewNotice missing`);
    assert.ok(!/[äß]/.test(JSON.stringify(turkish)), `${doc}: German letters found`);
    assert.ok(!/[؀-ۿ]/.test(JSON.stringify(turkish)), `${doc}: Arabic script found`);
    const english = load(`public/i18n/legal/en/${doc}.json`);
    assert.equal(english.reviewNotice, undefined, 'the reviewed languages carry no banner');
  }
});

test('placeholders() ignores spaces inside the braces', () => {
  assert.equal(placeholders('{{ value }} (m²)'), placeholders('{{value}} (m²)'));
});
