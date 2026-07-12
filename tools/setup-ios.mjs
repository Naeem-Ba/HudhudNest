import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const run = (command, args, options = {}) => {
  console.log(`> ${command} ${args.join(' ')}`);
  execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options });
};

if (process.platform !== 'darwin') {
  console.error('iOS native setup requires macOS with Xcode.');
  console.error('Run "npm run ios:check" here, then execute "npm run ios:setup" on a Mac.');
  process.exit(2);
}

for (const command of ['xcodebuild', 'pod']) {
  const result = spawnSync('which', [command], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(`Missing required command: ${command}`);
    process.exit(3);
  }
}

run('node', ['tools/validate-ios-config.mjs']);
run('npm', ['install']);
run('npm', ['run', 'build:prod']);

const iosDir = path.join(root, 'ios');
if (!fs.existsSync(iosDir)) run('npx', ['cap', 'add', 'ios']);
run('npx', ['cap', 'sync', 'ios']);

const plist = path.join(root, 'ios', 'App', 'App', 'Info.plist');
if (fs.existsSync(plist)) {
  const plistBuddy = '/usr/libexec/PlistBuddy';
  const set = (key, type, value) => {
    const current = spawnSync(plistBuddy, ['-c', `Print :${key}`, plist], { stdio: 'ignore' });
    const action = current.status === 0 ? 'Set' : 'Add';
    run(plistBuddy, ['-c', `${action} :${key} ${type} ${value}`, plist]);
  };
  set('CFBundleDisplayName', 'string', 'Real Estate World');
  set('UIViewControllerBasedStatusBarAppearance', 'bool', 'true');
}

const privacySource = path.join(root, 'resources', 'ios', 'PrivacyInfo.xcprivacy');
const privacyTarget = path.join(root, 'ios', 'App', 'App', 'PrivacyInfo.xcprivacy');
if (fs.existsSync(privacySource)) fs.copyFileSync(privacySource, privacyTarget);

run('npx', ['cap', 'sync', 'ios']);
console.log('\nNative iOS platform generated and synchronized.');
console.log('Next: npm run ios:open, select a Development Team, then build on a real device.');
