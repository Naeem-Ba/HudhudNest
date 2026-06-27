import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const write = process.argv.includes('--write');
const root = process.cwd();
const ignoredDirs = new Set([
  '.git', 'node_modules', 'dist', '.angular', 'coverage', 'android', 'ios'
]);
const ignoredDirPrefixes = ['angular_frontend_merge_kit', '_merge_backup_', '_backup_', '_migration_backup_'];
const scanRootDirs = ['src', 'public'];
const scanRootFiles = ['angular.json', 'package.json', 'manifest.webmanifest'];
const textExtensions = new Set(['.ts', '.html', '.scss', '.css', '.json', '.mjs', '.md', '.webmanifest', '.yml', '.yaml', '.txt']);
const badTokens = ['Ø', 'Ù', 'Ã', 'Â', 'â', 'ðŸ', '�'];
const suspectRun = /(?:[ØÙÃÂâð�][\u00a0-\u00ff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u02c6\u02dc\u2018-\u201e\u2020-\u2026\u2030\u2039\u203a\u20ac\w\s\-–—:!؟()/.]*|[\u00a0-\u00ff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u02c6\u02dc\u2018-\u201e\u2020-\u2026\u2030\u2039\u203a\u20ac]*[ØÙÃÂâð�][\u00a0-\u00ff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u02c6\u02dc\u2018-\u201e\u2020-\u2026\u2030\u2039\u203a\u20ac\w\s\-–—:!؟()/.]*)/gu;

function isIgnoredDir(entry) {
  return ignoredDirs.has(entry) || ignoredDirPrefixes.some(prefix => entry.startsWith(prefix));
}

function badScore(value) {
  return badTokens.reduce((sum, token) => sum + value.split(token).length - 1, 0);
}

function decodeCp1252AsUtf8(value) {
  const bytes = [];
  const cp1252 = new Map([
    [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
    [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
    [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
    [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
    [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
    [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
    [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f]
  ]);

  for (const char of value) {
    const code = char.codePointAt(0);
    if (code <= 0xff) {
      bytes.push(code);
      continue;
    }

    if (!cp1252.has(code)) {
      return value;
    }

    bytes.push(cp1252.get(code));
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
  } catch {
    return value;
  }
}

function repairFragment(fragment) {
  let current = fragment;

  for (let i = 0; i < 3; i += 1) {
    const before = badScore(current);
    if (before === 0) {
      break;
    }

    const candidate = decodeCp1252AsUtf8(current);
    const after = badScore(candidate);

    if (candidate !== current && after < before) {
      current = candidate;
      continue;
    }

    break;
  }

  return current;
}

function repairText(text) {
  return text
    .split(/(?<=\n)/)
    .map(line => badScore(line) > 0 ? line.replace(suspectRun, repairFragment) : line)
    .join('');
}

function extensionOf(file) {
  const index = file.lastIndexOf('.');
  return index >= 0 ? file.slice(index) : '';
}

function shouldScanFile(fileName) {
  return textExtensions.has(extensionOf(fileName)) || scanRootFiles.includes(fileName);
}

const changed = [];

function repairFile(absolute) {
  const fileName = absolute.split(/[\\/]/).pop() ?? '';
  if (!shouldScanFile(fileName)) {
    return;
  }

  const original = readFileSync(absolute, 'utf8');
  const repaired = repairText(original);

  if (repaired !== original) {
    changed.push(relative(root, absolute).replace(/\\/g, '/'));
    if (write) {
      writeFileSync(absolute, repaired, 'utf8');
    }
  }
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (isIgnoredDir(entry)) {
      continue;
    }

    const absolute = join(dir, entry);
    const stats = statSync(absolute);

    if (stats.isDirectory()) {
      walk(absolute);
      continue;
    }

    repairFile(absolute);
  }
}

for (const dir of scanRootDirs) {
  const absolute = join(root, dir);
  if (existsSync(absolute)) {
    walk(absolute);
  }
}

for (const file of scanRootFiles) {
  const absolute = join(root, file);
  if (existsSync(absolute)) {
    repairFile(absolute);
  }
}

if (changed.length === 0) {
  console.log('[repair-mojibake] No corrupted text detected.');
} else {
  console.log(`[repair-mojibake] ${write ? 'Repaired' : 'Would repair'} ${changed.length} file(s):`);
  for (const file of changed) {
    console.log(`- ${file}`);
  }
}
