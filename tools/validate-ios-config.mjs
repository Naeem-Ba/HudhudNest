import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { checkIosProject } from './lib/ios-config.mjs';

const root = process.cwd();
const requiredFiles = ['package.json', 'angular.json', 'capacitor.config.ts'];
const errors = [];
const warnings = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) errors.push(`Missing required file: ${file}`);
}

const pkgPath = path.join(root, 'package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const dep of ['@capacitor/core', '@capacitor/cli', '@capacitor/ios']) {
    if (!deps[dep]) errors.push(`Missing dependency: ${dep}`);
  }
  const majors = ['@capacitor/core', '@capacitor/cli', '@capacitor/ios']
    .map((name) => String(deps[name] ?? '').match(/(\d+)/)?.[1])
    .filter(Boolean);
  if (new Set(majors).size > 1) errors.push('Capacitor core/cli/ios major versions do not match.');
}

const configPath = path.join(root, 'capacitor.config.ts');
if (fs.existsSync(configPath)) {
  const config = fs.readFileSync(configPath, 'utf8');
  if (!/appId\s*:/.test(config)) errors.push('capacitor.config.ts has no appId.');
  if (!/webDir\s*:/.test(config)) errors.push('capacitor.config.ts has no webDir.');
  if (/cleartext\s*:\s*true/.test(config)) warnings.push('cleartext is permanently enabled; disable it for production.');
}

if (!fs.existsSync(path.join(root, 'ios'))) {
  warnings.push('ios/ is not generated yet. Run npm run ios:setup on macOS.');
}

// `npx cap sync ios` regenerates this file and, on a Windows host, writes Windows-style
// backslash paths into its local SPM `.package(path: ...)` entries -- Swift Package
// Manager on macOS/Xcode cannot resolve those. tools/fix-ios-spm-paths.mjs corrects
// this and is wired into `npm run ios:sync` / `ios:setup`, but this check exists so a
// sync run outside those scripts (e.g. a bare `npx cap sync ios`) is still caught
// before it reaches Xcode.
const spmManifestPath = path.join(root, 'ios', 'App', 'CapApp-SPM', 'Package.swift');
if (fs.existsSync(spmManifestPath)) {
  const spmManifest = fs.readFileSync(spmManifestPath, 'utf8');
  const backslashPathMatch = spmManifest.match(/path:\s*"[^"]*\\[^"]*"/);
  if (backslashPathMatch) {
    errors.push(
      `ios/App/CapApp-SPM/Package.swift has a Windows-style backslash path (${backslashPathMatch[0]}); ` +
      'run "node tools/fix-ios-spm-paths.mjs" before opening the project in Xcode.'
    );
  }
}

// Entitlements, Info.plist, permission texts, packaged resources and the push hooks (tools/lib/ios-config.mjs).
const project = checkIosProject(root);
errors.push(...project.errors);
warnings.push(...project.warnings);

console.log('iOS configuration preflight');
for (const warning of warnings) console.warn(`WARN: ${warning}`);
for (const error of errors) console.error(`ERROR: ${error}`);
if (errors.length) process.exit(1);
console.log('PASS: static iOS configuration checks completed.');
