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

// xcodebuild is required unconditionally. `pod` (CocoaPods) is only required if the
// project actually has a Podfile -- this project's Capacitor/Cordova dependencies are
// resolved via Swift Package Manager (ios/App/CapApp-SPM), so a Mac with only Xcode
// and no CocoaPods installed can still complete this setup. Adding a Cordova plugin
// later would introduce a Podfile and make `pod` genuinely required again.
const hasPodfile = fs.existsSync(path.join(root, 'ios', 'App', 'Podfile'));
const requiredCommands = hasPodfile ? ['xcodebuild', 'pod'] : ['xcodebuild'];
for (const command of requiredCommands) {
  const result = spawnSync('which', [command], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(`Missing required command: ${command}`);
    process.exit(3);
  }
}
if (!hasPodfile) {
  console.log('No ios/App/Podfile detected -- skipping the CocoaPods requirement (SPM-only project).');
}

run('node', ['tools/validate-ios-config.mjs']);
run('npm', ['install']);
run('npm', ['run', 'build:prod']);

// `npx cap add ios` does not actually require macOS -- it only extracts Capacitor's
// bundled template and templates in appId/appName. It has already been run once from
// Windows for this project; this branch just covers the case where ios/ is missing.
const iosDir = path.join(root, 'ios');
if (!fs.existsSync(iosDir)) run('npx', ['cap', 'add', 'ios']);
run('npx', ['cap', 'sync', 'ios']);
run('node', ['tools/fix-ios-spm-paths.mjs']);

const plist = path.join(root, 'ios', 'App', 'App', 'Info.plist');
if (fs.existsSync(plist)) {
  const plistBuddy = '/usr/libexec/PlistBuddy';
  const set = (key, type, value) => {
    const current = spawnSync(plistBuddy, ['-c', `Print :${key}`, plist], { stdio: 'ignore' });
    const action = current.status === 0 ? 'Set' : 'Add';
    run(plistBuddy, ['-c', `${action} :${key} ${type} ${value}`, plist]);
  };
  // CFBundleDisplayName / UIViewControllerBasedStatusBarAppearance and the
  // NS*UsageDescription privacy strings are already templated into Info.plist as of
  // this repo's committed ios/ scaffold (see docs/IOS_SETUP.md); these two Sets are
  // kept as a defensive no-op in case a future `cap add ios` regenerates the file
  // without them, not because they are currently missing.
  set('CFBundleDisplayName', 'string', 'HudhudNest');
  set('UIViewControllerBasedStatusBarAppearance', 'bool', 'true');
}

const privacySource = path.join(root, 'resources', 'ios', 'PrivacyInfo.xcprivacy');
const privacyTarget = path.join(root, 'ios', 'App', 'App', 'PrivacyInfo.xcprivacy');
if (fs.existsSync(privacySource)) fs.copyFileSync(privacySource, privacyTarget);

run('npx', ['cap', 'sync', 'ios']);
run('node', ['tools/fix-ios-spm-paths.mjs']);
console.log('\nNative iOS platform generated and synchronized.');
console.log(
  'NOTE: copying PrivacyInfo.xcprivacy onto disk does not add it to the Xcode project. ' +
  'In Xcode, drag ios/App/App/PrivacyInfo.xcprivacy into the App group with "Copy items ' +
  'if needed" and target membership "App" checked, or it will be silently absent from ' +
  'the build.'
);
console.log('Next: npm run ios:open, select a Development Team, then build on a real device.');
