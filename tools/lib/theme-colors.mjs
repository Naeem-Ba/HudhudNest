// Helpers for the colour-system guard (see docs/design/color-system.md).
import fs from 'node:fs';
import path from 'node:path';

export const SRC = path.resolve(import.meta.dirname, '../../src');
export const TOKENS_FILE = path.join(SRC, 'styles/_tokens.scss');

export function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export const styleFiles = () =>
  walk(SRC).filter(f => /\.(scss|css|ts|html)$/.test(f) && !/\.spec\.ts$/.test(f) && f !== TOKENS_FILE);

const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'(])\/\/.*$/gm, '$1');

/** Parse `--name: value;` declarations of _tokens.scss into {light, dark}. */
export function parseTokens(file = TOKENS_FILE) {
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  const light = {};
  const darkOnly = {};
  const re = /(:root|html\[data-theme="dark"\])\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const target = m[1] === ':root' ? light : darkOnly;
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) target[d[1]] = d[2].trim();
  }
  return { light, dark: { ...light, ...darkOnly } };
}

function resolve(value, vars, depth = 0) {
  if (depth > 12) throw new Error('token cycle: ' + value);
  const m = value.match(/^var\((--[\w-]+)(?:\s*,\s*(.+))?\)$/);
  if (!m) return value;
  const next = vars[m[1]] ?? m[2];
  if (next === undefined) throw new Error('undefined token ' + m[1]);
  return resolve(next, vars, depth + 1);
}

export function parseColor(str) {
  str = str.trim().toLowerCase();
  let m = str.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map(c => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  }
  m = str.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  throw new Error('cannot parse colour: ' + str);
}

const over = (fg, bg) => fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/** WCAG contrast of token `fg` on token `bg` in one theme (translucent colours are composited). */
export function contrast(vars, fgToken, bgToken, canvasToken = '--surface') {
  const val = t => (t.startsWith('--') ? resolve(vars[t] ?? `var(${t})`, vars) : t);
  const bgRaw = parseColor(val(bgToken));
  const bg = over(bgRaw, parseColor(val(canvasToken)).slice(0, 3));
  const fgRaw = parseColor(val(fgToken));
  const fg = over(fgRaw, bg);
  const [a, b] = [lum(fg), lum(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Every `var(--x)` used in app code must be defined somewhere (tokens, or a local custom property). */
export function undefinedVars() {
  const defined = new Set(['--safe-area-inset-top', '--safe-area-inset-right', '--safe-area-inset-bottom', '--safe-area-inset-left']);
  const used = new Map();
  for (const f of [...styleFiles(), TOKENS_FILE]) {
    const s = fs.readFileSync(f, 'utf8');
    for (const d of s.matchAll(/(--[\w-]+)\s*:/g)) defined.add(d[1]);
    for (const d of s.matchAll(/\[style\.(--[\w-]+)\]/g)) defined.add(d[1]);
    for (const d of s.matchAll(/['"`](--[\w-]+)['"`]/g)) defined.add(d[1]);
    for (const d of s.matchAll(/(--[\w-]+)\s*[:=]/g)) defined.add(d[1]);
    for (const d of s.matchAll(/var\((--[\w-]+)(\s*,)?/g)) {
      if (f === TOKENS_FILE) continue;
      if (!used.has(d[1])) used.set(d[1], []);
      used.get(d[1]).push(path.relative(SRC, f));
    }
  }
  return [...used].filter(([n]) => !defined.has(n) && !/^--(tw-|color-|font-|text-.+--)/.test(n)).map(([n, files]) => ({ name: n, files: [...new Set(files)] }));
}

/** Hard-coded colour literals per file (var() fallbacks and comments excluded). */
export function hardcodedColorCounts() {
  const counts = {};
  for (const f of styleFiles()) {
    let s = stripComments(fs.readFileSync(f, 'utf8'));
    s = s.replace(/var\(\s*--[\w-]+\s*,\s*(?:[^()]|\([^()]*\))*\)/g, 'var()');
    const n = (s.match(/#[0-9a-fA-F]{3,8}\b(?![-\w])|\brgba?\(|\bhsla?\(/g) || []).length;
    if (n) counts[path.relative(path.resolve(SRC, '..'), f)] = n;
  }
  return counts;
}
