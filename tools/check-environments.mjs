import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
let failed = false;

function fail(message) {
  console.error(`[check-env] ${message}`);
  failed = true;
}

function warn(message) {
  console.warn(`[check-env] WARN: ${message}`);
}

function read(relativePath) {
  const fullPath = join(root, relativePath);
  if (!existsSync(fullPath)) {
    fail(`${relativePath} is missing.`);
    return '';
  }
  return readFileSync(fullPath, 'utf8');
}

function hasProductionFlag(source, expectedValue) {
  return new RegExp(`production\\s*:\\s*${expectedValue}`).test(source);
}

function hasApiBaseConfig(source) {
  // The project currently uses AppEnvironment + createAppEnvironment({ apiBaseUrl }).
  // Older Angular apps often use environment.apiUrl, so both names are valid here.
  return /\bapiBaseUrl\b/.test(source) || /\bapiUrl\s*:/.test(source);
}

const requiredFiles = [
  'src/environments/environment.ts',
  'src/environments/environment.staging.ts',
  'src/environments/environment.prod.ts'
];

for (const file of requiredFiles) {
  read(file);
}

const prod = read('src/environments/environment.prod.ts');
const staging = read('src/environments/environment.staging.ts');
const dev = read('src/environments/environment.ts');

if (/localhost|127\.0\.0\.1|http:\/\//i.test(prod)) {
  fail('Production environment must not contain localhost, 127.0.0.1, or plain HTTP URLs.');
}

if (!hasProductionFlag(prod, 'true')) {
  fail('environment.prod.ts must contain production: true.');
}

if (!hasProductionFlag(dev, 'false')) {
  warn('environment.ts should usually contain production: false.');
}

if (!hasApiBaseConfig(prod) || !hasApiBaseConfig(staging) || !hasApiBaseConfig(dev)) {
  fail('All environment files should expose apiBaseUrl or apiUrl.');
}

if (failed) {
  process.exit(1);
}

console.log('[check-env] Environment checks passed.');
