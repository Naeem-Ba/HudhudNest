// Static checks of the iOS project that do not need Xcode or a Mac, so a regression in what makes the iPhone
// build ready (push, Sign in with Apple, privacy manifest, permission texts) is caught on Linux in
// `npm run test:tools` and again by `npm run ios:check`.
//
// What this proves: the files say the right things and agree with each other. What it cannot prove: that
// Xcode builds them, that Apple's portal has the matching capabilities, or that a device receives a push.
// Those need the owner's Apple account and a real iPhone (docs/IOS_RELEASE.md, docs/MOBILE-DEVICE-TEST-CHECKLIST.md).
import fs from 'node:fs';
import path from 'node:path';

const LOCALES = ['en', 'ar', 'de'];

function read(root, relative) {
  try {
    return fs.readFileSync(path.join(root, relative), 'utf8');
  } catch {
    return null;
  }
}

/** XML plist text without comments, so words in a comment can never satisfy a check. */
function stripComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

/** True when the top-level dictionary has this key. Good enough for the flat plists of this project. */
export function plistHasKey(text, key) {
  return new RegExp(`<key>${key}</key>`).test(stripComments(text));
}

/** The <string> items of an array value, or null when the key is absent / not an array. */
export function plistStringArray(text, key) {
  const match = stripComments(text).match(new RegExp(`<key>${key}</key>\\s*<array>([\\s\\S]*?)</array>`));
  if (!match) return null;
  return [...match[1].matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1].trim());
}

/** The <string> value of a key, or null. */
export function plistString(text, key) {
  const match = stripComments(text).match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
  return match ? match[1].trim() : null;
}

/** The <true/>/<false/> value of a key, or null. */
export function plistBool(text, key) {
  const match = stripComments(text).match(new RegExp(`<key>${key}</key>\\s*<(true|false)\\s*/>`));
  return match ? match[1] === 'true' : null;
}

/** Keys of a .strings file ("KEY" = "value";). */
export function stringsKeys(text) {
  return [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/^\s*"([^"]+)"\s*=\s*"/gm)].map((m) => m[1]);
}

/** Names of the files in a PBXResourcesBuildPhase ("X in Resources"). */
export function resourcesPhaseFiles(pbxproj) {
  const phase = pbxproj.match(/\/\* Begin PBXResourcesBuildPhase section \*\/([\s\S]*?)\/\* End PBXResourcesBuildPhase section \*\//);
  if (!phase) return [];
  return [...phase[1].matchAll(/\/\* (.+?) in Resources \*\//g)].map((m) => m[1]);
}

export function knownRegions(pbxproj) {
  const match = pbxproj.match(/knownRegions = \(([\s\S]*?)\);/);
  return match ? [...match[1].matchAll(/([A-Za-z-]+),/g)].map((m) => m[1]) : [];
}

/**
 * @param {string} root repository root
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function checkIosProject(root) {
  const errors = [];
  const warnings = [];
  const appDir = 'ios/App/App';

  if (!fs.existsSync(path.join(root, 'ios'))) {
    return { errors, warnings: ['ios/ is not generated yet. Run npm run ios:setup on macOS.'] };
  }

  const links = JSON.parse(read(root, 'deep-links.config.json') ?? '{}');
  const entitlements = read(root, `${appDir}/App.entitlements`);
  const info = read(root, `${appDir}/Info.plist`);
  const pbxproj = read(root, 'ios/App/App.xcodeproj/project.pbxproj');
  const appDelegate = read(root, `${appDir}/AppDelegate.swift`);
  const privacy = read(root, `${appDir}/PrivacyInfo.xcprivacy`);

  // --- entitlements -------------------------------------------------------------------------
  if (!entitlements) {
    errors.push(`${appDir}/App.entitlements is missing.`);
  } else {
    const domains = plistStringArray(entitlements, 'com.apple.developer.associated-domains') ?? [];
    if (links.host && !domains.includes(`applinks:${links.host}`)) {
      errors.push(`App.entitlements: associated-domains must list applinks:${links.host} (deep-links.config.json host).`);
    }
    const aps = plistString(entitlements, 'aps-environment');
    if (aps !== 'development' && aps !== 'production') {
      errors.push('App.entitlements: aps-environment (development|production) is missing, so the app can never receive a push.');
    }
    if (!(plistStringArray(entitlements, 'com.apple.developer.applesignin') ?? []).includes('Default')) {
      errors.push('App.entitlements: com.apple.developer.applesignin = [Default] is missing, Sign in with Apple would fail.');
    }
  }

  // --- Info.plist ---------------------------------------------------------------------------
  if (!info) {
    errors.push(`${appDir}/Info.plist is missing.`);
  } else {
    if (!(plistStringArray(info, 'UIBackgroundModes') ?? []).includes('remote-notification')) {
      errors.push('Info.plist: UIBackgroundModes must contain remote-notification (push).');
    }
    const caps = plistStringArray(info, 'UIRequiredDeviceCapabilities') ?? [];
    if (caps.includes('armv7')) errors.push('Info.plist: UIRequiredDeviceCapabilities must not require armv7; use arm64.');
    if (!caps.includes('arm64')) errors.push('Info.plist: UIRequiredDeviceCapabilities must contain arm64.');

    const declared = plistStringArray(info, 'CFBundleLocalizations') ?? [];
    for (const locale of LOCALES) {
      if (!declared.includes(locale)) errors.push(`Info.plist: CFBundleLocalizations is missing "${locale}".`);
    }

    // Every permission text in Info.plist must exist in each language file, or iOS shows English to Arabic users.
    const usageKeys = [...stripComments(info).matchAll(/<key>(NS[A-Za-z]+UsageDescription)<\/key>/g)].map((m) => m[1]);
    for (const locale of LOCALES) {
      const strings = read(root, `${appDir}/${locale}.lproj/InfoPlist.strings`);
      if (!strings) {
        errors.push(`${appDir}/${locale}.lproj/InfoPlist.strings is missing.`);
        continue;
      }
      const keys = new Set(stringsKeys(strings));
      for (const key of usageKeys) {
        if (!keys.has(key)) errors.push(`${locale}.lproj/InfoPlist.strings: no translation for ${key}.`);
      }
    }

    // Ads are off, but the day they are switched on for iOS this pair must be changed together.
    if (plistHasKey(info, 'NSUserTrackingUsageDescription') && privacy && plistBool(privacy, 'NSPrivacyTracking') === false) {
      warnings.push(
        'Info.plist asks for tracking permission text while PrivacyInfo.xcprivacy says NSPrivacyTracking=false. ' +
          'Fine while ads stay off (nothing calls the ATT dialog); before enabling iOS ads, set NSPrivacyTracking, ' +
          'NSPrivacyTrackingDomains and the App Store privacy answers together (docs/MONETIZATION.md).'
      );
    }
  }

  // --- privacy manifest -----------------------------------------------------------------------
  if (!privacy) {
    errors.push(`${appDir}/PrivacyInfo.xcprivacy is missing.`);
  }

  // --- Xcode project: files that exist on disk must also be packaged -------------------------
  if (!pbxproj) {
    errors.push('ios/App/App.xcodeproj/project.pbxproj is missing.');
  } else {
    const bundled = resourcesPhaseFiles(pbxproj);
    for (const file of ['PrivacyInfo.xcprivacy', 'InfoPlist.strings']) {
      if (!bundled.includes(file)) {
        errors.push(`project.pbxproj: ${file} is not in the Resources build phase, so it is not packaged in the app.`);
      }
    }
    const regions = knownRegions(pbxproj);
    for (const locale of ['ar', 'de']) {
      if (!regions.includes(locale)) errors.push(`project.pbxproj: knownRegions is missing "${locale}".`);
    }
  }

  // --- AppDelegate: the three hooks the push plugin needs -------------------------------------
  if (!appDelegate) {
    errors.push(`${appDir}/AppDelegate.swift is missing.`);
  } else {
    const hooks = [
      ['didRegisterForRemoteNotificationsWithDeviceToken', 'capacitorDidRegisterForRemoteNotifications'],
      ['didFailToRegisterForRemoteNotificationsWithError', 'capacitorDidFailToRegisterForRemoteNotifications'],
      ['didReceiveRemoteNotification', 'didReceiveRemoteNotification']
    ];
    for (const [method, notification] of hooks) {
      if (!appDelegate.includes(method) || !appDelegate.includes(notification)) {
        errors.push(`AppDelegate.swift: ${method} must post ${notification} (push plugin).`);
      }
    }
  }

  // --- things only the owner can supply ----------------------------------------------------------
  if (!String(links.ios?.teamId ?? '').trim() && !process.env.APPLE_TEAM_ID) {
    warnings.push('No Apple Team ID (deep-links.config.json ios.teamId / APPLE_TEAM_ID): Universal Links stay inactive until it is set.');
  }

  return { errors, warnings };
}
