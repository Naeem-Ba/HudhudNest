import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// Capacitor CLI writes ios/App/CapApp-SPM/Package.swift using the host OS's path
// separator for local `.package(path: ...)` dependency entries. On Windows this
// produces backslash paths (e.g. "..\..\..\node_modules\@capacitor\app"), which
// Swift Package Manager cannot resolve on macOS/Xcode -- SPM path dependencies
// require POSIX-style forward slashes regardless of the host that generated the
// manifest. Every `npx cap sync ios` / `npx cap update ios` run on Windows
// regenerates this file and reintroduces the broken paths, so this fixup must run
// after every sync (wired into the ios:sync / ios:setup npm scripts), not just once.
const root = process.cwd();
const manifestPath = path.join(root, 'ios', 'App', 'CapApp-SPM', 'Package.swift');

if (!fs.existsSync(manifestPath)) {
  console.log('fix-ios-spm-paths: ios/App/CapApp-SPM/Package.swift not found, nothing to do.');
  process.exit(0);
}

const original = fs.readFileSync(manifestPath, 'utf8');

const fixed = original.replace(
  /(path:\s*")([^"]*)(")/g,
  (match, prefix, value, suffix) => `${prefix}${value.replace(/\\/g, '/')}${suffix}`
);

if (fixed !== original) {
  fs.writeFileSync(manifestPath, fixed, 'utf8');
  console.log('fix-ios-spm-paths: normalized backslash path(s) in Package.swift to POSIX form.');
} else {
  console.log('fix-ios-spm-paths: Package.swift paths already POSIX-style, no change needed.');
}
