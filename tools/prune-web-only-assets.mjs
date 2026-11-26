// Removes web-only static pages from the built web bundle before it is copied into a native app (Android / iOS).
//
// The research surveys (/survey/users, /survey/offices) are standalone pages served by Netlify rewrites. They are not
// part of the app, nothing in the app links to them, and their settings may point at a test backend, so they must not
// ship inside a store build (Google Play audit 2026-11-25, M-02). Run it between `ng build` and `cap sync`.
//
// Usage: node tools/prune-web-only-assets.mjs [webDir]   (default: dist/HudhudNest/browser)
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const WEB_ONLY_PATHS = ['survey'];

export function pruneWebOnlyAssets(webDir) {
  const removed = [];
  for (const rel of WEB_ONLY_PATHS) {
    const target = join(webDir, rel);
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true });
      removed.push(rel);
    }
  }
  return removed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const webDir = process.argv[2] ?? 'dist/HudhudNest/browser';
  if (!existsSync(webDir)) {
    console.error(`prune-web-only-assets: ${webDir} does not exist. Run the production build first.`);
    process.exit(1);
  }
  const removed = pruneWebOnlyAssets(webDir);
  console.log(`prune-web-only-assets: removed ${removed.length ? removed.join(', ') : 'nothing (already clean)'} from ${webDir}`);
}
