// GoogleService-Info.plist is the iOS counterpart of Android's google-services.json: without it Firebase cannot
// hand the app an FCM token, so no push ever reaches an iPhone. It holds the Firebase project's identifiers
// and is not committed (same rule as google-services.json); CI writes it from a secret.
//
// The file must also be a member of the Xcode target, or it is not copied into the app. Adding it to the
// project permanently would break every build that does not have the file (the unsigned simulator job and any
// local build), so the signed release build adds the reference at build time with the helpers below.
import { plistString } from './ios-config.mjs';

const PLIST_FILE = 'GoogleService-Info.plist';
const FILE_REF_ID = 'A7E5D0C92B3F4A6C9D8E1F28';
const BUILD_FILE_ID = 'A7E5D0CA2B3F4A6C9D8E1F29';

/** Problems with the plist content; an empty list means it can be used for this bundle id. */
export function validateFirebasePlist(text, bundleId) {
  const problems = [];
  if (!text || !/<plist[\s>]/.test(text)) {
    return ['not an XML property list (is the secret the Base64 of GoogleService-Info.plist?)'];
  }
  const get = (key) => plistString(text, key);

  if (get('BUNDLE_ID') !== bundleId) {
    problems.push(`BUNDLE_ID is "${get('BUNDLE_ID') ?? ''}", expected "${bundleId}" (add the iOS app in Firebase with this exact id)`);
  }
  if (!/^1:\d+:ios:[0-9a-f]+$/.test(get('GOOGLE_APP_ID') ?? '')) problems.push('GOOGLE_APP_ID is missing or is not an iOS app id (1:<number>:ios:<hex>)');
  if (!/^\d+$/.test(get('GCM_SENDER_ID') ?? '')) problems.push('GCM_SENDER_ID is missing');
  if (!(get('PROJECT_ID') ?? '')) problems.push('PROJECT_ID is missing');
  if (!(get('API_KEY') ?? '')) problems.push('API_KEY is missing');
  return problems;
}

/** Adds GoogleService-Info.plist to the App target's Resources. Idempotent. Throws when the project shape is unexpected. */
export function addFirebasePlistToProject(pbxproj) {
  if (pbxproj.includes(FILE_REF_ID)) return pbxproj;

  const insertBefore = (text, marker, line, label) => {
    const at = text.indexOf(marker);
    if (at < 0) throw new Error(`project.pbxproj: cannot find ${label}`);
    return text.slice(0, at) + line + text.slice(at);
  };

  let out = pbxproj;
  out = insertBefore(
    out,
    '/* End PBXBuildFile section */',
    `\t\t${BUILD_FILE_ID} /* ${PLIST_FILE} in Resources */ = {isa = PBXBuildFile; fileRef = ${FILE_REF_ID} /* ${PLIST_FILE} */; };\n`,
    'the PBXBuildFile section'
  );
  out = insertBefore(
    out,
    '/* End PBXFileReference section */',
    `\t\t${FILE_REF_ID} /* ${PLIST_FILE} */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = ${PLIST_FILE}; sourceTree = "<group>"; };\n`,
    'the PBXFileReference section'
  );

  // The App group lists Info.plist; the new file sits right after it.
  const infoLine = /\t\t\t\t[0-9A-F]{24} \/\* Info\.plist \*\/,\n/.exec(out);
  if (!infoLine) throw new Error('project.pbxproj: cannot find Info.plist in the App group');
  const afterInfo = infoLine.index + infoLine[0].length;
  out = `${out.slice(0, afterInfo)}\t\t\t\t${FILE_REF_ID} /* ${PLIST_FILE} */,\n${out.slice(afterInfo)}`;

  // End of the file list of the Resources build phase: the last ");" before the section's end marker.
  const phaseEnd = out.indexOf('/* End PBXResourcesBuildPhase section */');
  const listClose = phaseEnd < 0 ? -1 : out.lastIndexOf('\t\t\t);', phaseEnd);
  if (listClose < 0) throw new Error('project.pbxproj: cannot find the Resources file list');
  out = `${out.slice(0, listClose)}\t\t\t\t${BUILD_FILE_ID} /* ${PLIST_FILE} in Resources */,\n${out.slice(listClose)}`;
  return out;
}

export const FIREBASE_PLIST_FILE = PLIST_FILE;
