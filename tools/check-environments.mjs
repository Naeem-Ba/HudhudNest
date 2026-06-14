import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = [
  'src/environments/environment.prod.ts',
  'src/environments/environment.staging.ts'
];

const forbidden = [/localhost/i, /127\.0\.0\.1/i, /http:\/\//i];
let failed = false;

for (const file of files) {
  const absolute = resolve(file);
  const content = readFileSync(absolute, 'utf8');

  for (const rule of forbidden) {
    if (rule.test(content)) {
      console.error(`[environment-check] ${file} contains forbidden value: ${rule}`);
      failed = true;
    }
  }

  if (!content.includes('/api')) {
    console.error(`[environment-check] ${file} does not contain an API URL with /api.`);
    failed = true;
  }

  if (!content.includes('/notificationHub')) {
    console.error(`[environment-check] ${file} does not contain a SignalR notification hub URL.`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log('[environment-check] Staging/Production environment files passed.');
