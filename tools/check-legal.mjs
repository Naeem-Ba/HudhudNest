// Fails while the Impressum or Datenschutz draft still contains a "[TODO" placeholder.
// Run before every PRODUCTION deploy (npm run check:legal). Deliberately NOT part of build:staging or build:ci, so
// Staging and previews keep building while the texts are drafts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const files = [
  'src/app/features/marketing/pages/impressum.page.ts',
  'src/app/features/marketing/pages/datenschutz.page.ts'
];

let open = 0;
for (const file of files) {
  const lines = readFileSync(join(root, file), 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    // Only the rendered template counts, not this repository's own comments about the placeholder convention.
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    for (const match of line.matchAll(/\[TODO[^\]]*\]/g)) {
      open += 1;
      console.error(`[check:legal] ${file}:${index + 1}  ${match[0]}`);
    }
  });
}

if (open > 0) {
  console.error(`[check:legal] ${open} placeholder(s) left. Fill them in (with a lawyer's review) before a production deploy.`);
  process.exit(1);
}
console.log('[check:legal] no [TODO placeholders left in the Impressum and Datenschutz pages.');
