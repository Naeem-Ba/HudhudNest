import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const textExtensions = new Set(['.ts', '.html', '.scss', '.css', '.json', '.mjs', '.md', '.webmanifest']);
const ignoredDirs = new Set(['node_modules', 'dist', '.angular', 'coverage', 'android', 'ios', '.git']);
const mojibakePattern = /(?:\u00d8|\u00d9|\u00c3|\u00c2|\u00e2|\u00f0\u0178|\ufffd)/;
const unsafePatterns = [
  { name: 'bypassSecurityTrustHtml', regex: /bypassSecurityTrustHtml\s*\(/ },
  { name: 'direct innerHTML usage', regex: /\[innerHTML\]|\.innerHTML\s*=/ },
  { name: 'possible frontend secret', regex: /(api[_-]?key|client[_-]?secret|password)\s*[:=]\s*['\"][^'\"]{8,}/i }
];

let failed = false;

function fail(message) {
  console.error(`[frontend-audit] ${message}`);
  failed = true;
}

function warn(message) {
  console.warn(`[frontend-audit] WARN: ${message}`);
}

function extensionOf(file) {
  const index = file.lastIndexOf('.');
  return index >= 0 ? file.slice(index) : '';
}

function shouldIgnoreDirectory(entry) {
  return (
    ignoredDirs.has(entry) ||
    entry.startsWith('angular_frontend_merge_kit') ||
    entry.startsWith('_merge_backup_') ||
    entry.startsWith('_backup_') ||
    entry.startsWith('_migration_backup_')
  );
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (shouldIgnoreDirectory(entry)) {
      continue;
    }

    const absolute = join(dir, entry);
    const stats = statSync(absolute);

    if (stats.isDirectory()) {
      walk(absolute);
      continue;
    }

    if (!textExtensions.has(extensionOf(entry)) && !['angular.json', 'package.json', 'manifest.webmanifest'].includes(entry)) {
      continue;
    }

    const content = readFileSync(absolute, 'utf8');
    const displayPath = relative(root, absolute).replace(/\\/g, '/');

    if (displayPath !== 'tools/repair-mojibake.mjs' && mojibakePattern.test(content)) {
      warn(`${displayPath} contains possible mojibake/corrupted encoding markers.`);
    }

    for (const pattern of unsafePatterns) {
      if (pattern.regex.test(content)) {
        fail(`${displayPath} matches unsafe pattern: ${pattern.name}`);
      }
    }
  }
}

if (!existsSync(join(root, 'package-lock.json'))) {
  warn('package-lock.json is missing. Generate it with: npm install --package-lock-only');
}

const prodEnvironment = readFileSync(join(root, 'src/environments/environment.prod.ts'), 'utf8');
if (/localhost|127\.0\.0\.1|http:\/\//i.test(prodEnvironment)) {
  fail('src/environments/environment.prod.ts contains a forbidden production URL.');
}

const tsconfig = readFileSync(join(root, 'tsconfig.json'), 'utf8');
if (/"strict"\s*:\s*false/.test(tsconfig)) {
  warn('TypeScript strict mode is still disabled in tsconfig.json. Use the merge script with -EnableStrict only after build is clean.');
}

walk(root);

if (failed) {
  process.exit(1);
}

console.log('[frontend-audit] Checks passed.');
