// Pure builders for the public /download page: one stable address that shows every real way to get the app, and
// the single QR code that points at it. No file or network access here; tools/generate-download-page.mjs does
// the I/O and tools/lib/download-page.test.mjs pins the rules below.
//
// Rules this file enforces, on purpose:
//   * Nothing is ever redirected. Device detection only highlights the option that fits the visitor's device
//     ("recommended for your device"); every option stays visible and clickable, so a wrong guess costs nothing.
//   * The destination of every button is never read from the request. The only addresses that can appear in the
//     page are the two store addresses built here from deep-links.config.json (android.package, ios.appStoreId)
//     and, when a person approved one, the direct APK address of downloads/android-release.json (validated by
//     tools/lib/android-release.mjs: fixed host, fixed path, real SHA-256). No query parameter, hash or referrer
//     is read anywhere in the page's script.
//   * While a store is not published (stores.<os>.published !== true) no store address is emitted at all; the
//     card says it is not available yet and offers the website. No disabled-looking link ever points anywhere.
//   * The QR code encodes exactly https://<host>/download, with <host> taken from the same config.
//   * No analytics, no third-party script, no web font. The CSP is still report-only (netlify.toml), so inline
//     script/style are allowed, but nothing here loads from another origin.

import qrcode from 'qrcode-generator';

import { androidVersionLabel, bytesToHuman } from './android-release.mjs';

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const ANDROID_PACKAGE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i;
const APP_STORE_ID = /^\d{6,12}$/;

const LANGS = ['ar', 'en', 'de', 'tr'];

const TEXT = {
  ar: {
    dir: 'rtl',
    title: 'تنزيل تطبيق HudhudNest',
    description: 'نزّل تطبيق HudhudNest لتصفّح العقارات من هاتفك: من المتجر المناسب لجهازك أو بالتنزيل المباشر الموقّع لنظام Android.',
    heading: 'تنزيل تطبيق HudhudNest',
    lead: 'تصفّح العقارات، احفظ عمليات بحثك، وتابع إعلاناتك ورسائلك من هاتفك.',
    recommended: 'مناسب لجهازك',
    soon: 'غير متاح بعد',
    playName: 'Google Play',
    playSoon: 'التطبيق غير منشور على Google Play بعد.',
    playOpen: 'فتح في Google Play',
    iosName: 'App Store',
    iosSoon: 'التطبيق غير منشور على App Store بعد. يمكنك استخدام الموقع من متصفح iPhone.',
    iosOpen: 'فتح في App Store',
    directTitle: 'تنزيل مباشر لنظام Android (APK)',
    directLead: 'ملف التثبيت الرسمي الموقّع من HudhudNest، لمن لا يتوفر له Google Play أو يفضّل التنزيل المباشر.',
    directButton: 'تنزيل APK الرسمي',
    version: 'الإصدار',
    released: 'تاريخ الإصدار',
    size: 'حجم الملف',
    requires: 'يتطلب',
    requiresValue: 'Android {v} أو أحدث',
    sha: 'بصمة الملف (SHA-256)',
    cert: 'بصمة شهادة التوقيع (SHA-256)',
    directWarning: 'التثبيت من خارج المتجر يتطلب السماح بتثبيت التطبيقات من هذا المصدر في إعدادات Android. لا تُعطّل Google Play Protect، ولا تثبّت الملف إن اختلفت البصمة عمّا هو معروض هنا.',
    helpTitle: 'مساعدة التثبيت',
    helpSteps: [
      'نزّل ملف APK، ثم افتحه من إشعار التنزيل أو من تطبيق الملفات.',
      'إن طلب Android السماح بالتثبيت من هذا المصدر، فعّل الخيار لهذا المتصفح أو لتطبيق الملفات فقط، ثم ارجع واضغط تثبيت.',
      'لا تعطّل Google Play Protect. إن عرض تحذيرًا فاقرأه ولا تتابع إلا إذا تطابقت بصمة الملف مع المعروضة في هذه الصفحة.',
      'للتحقق من الملف اختياريًا: على Windows نفّذ certutil -hashfile {file} SHA256 ، وعلى macOS أو Linux نفّذ shasum -a 256 {file} ، وقارن الناتج ببصمة الملف أعلاه.',
      'إن انقطع التنزيل أو لم يكتمل فاحذف الملف وأعد التنزيل، فالملف الناقص لا يُثبَّت.'
    ],
    switchNote: 'لا تخلط المصدرين: النسخة المنزَّلة مباشرة لا تتحدّث عبر Google Play، والانتقال إلى نسخة المتجر لاحقًا يتطلب حذف التطبيق أولًا (تُحذف بياناته المحلية على الهاتف، ويبقى حسابك محفوظًا).',
    iosNote: 'لا يوجد ملف تثبيت مباشر لـ iPhone. الطريقة الوحيدة هي App Store عند نشر التطبيق فيه.',
    desktopNote: 'أنت تتصفح من حاسوب. امسح الرمز بكاميرا هاتفك لفتح هذه الصفحة عليه.',
    web: 'افتح الموقع',
    privacy: 'سياسة الخصوصية',
    terms: 'شروط الاستخدام',
    support: 'الدعم والتواصل',
    scan: 'امسح الرمز بكاميرا هاتفك',
    qrAlt: 'رمز QR يفتح هذه الصفحة',
    language: 'اللغة'
  },
  en: {
    dir: 'ltr',
    title: 'Download the HudhudNest app',
    description: 'Download the HudhudNest app to browse properties on your phone: from the store that matches your device, or as a signed direct download for Android.',
    heading: 'Download the HudhudNest app',
    lead: 'Browse properties, save your searches and follow your listings and messages from your phone.',
    recommended: 'Fits your device',
    soon: 'Not available yet',
    playName: 'Google Play',
    playSoon: 'The app is not published on Google Play yet.',
    playOpen: 'Open in Google Play',
    iosName: 'App Store',
    iosSoon: 'The app is not published on the App Store yet. You can use the website in your iPhone browser.',
    iosOpen: 'Open in the App Store',
    directTitle: 'Direct download for Android (APK)',
    directLead: 'The official, signed install file from HudhudNest, for people without Google Play or who prefer a direct download.',
    directButton: 'Download the official APK',
    version: 'Version',
    released: 'Release date',
    size: 'File size',
    requires: 'Requires',
    requiresValue: 'Android {v} or newer',
    sha: 'File fingerprint (SHA-256)',
    cert: 'Signing certificate fingerprint (SHA-256)',
    directWarning: 'Installing from outside a store means allowing installs from this source in Android settings. Do not turn off Google Play Protect, and do not install the file if its fingerprint differs from the one shown here.',
    helpTitle: 'Installation help',
    helpSteps: [
      'Download the APK, then open it from the download notification or from your Files app.',
      'If Android asks to allow installs from this source, enable it for this browser or the Files app only, then go back and tap Install.',
      'Do not turn off Google Play Protect. If it shows a warning, read it, and continue only if the file fingerprint matches the one shown on this page.',
      'To verify the file (optional): on Windows run certutil -hashfile {file} SHA256 , on macOS or Linux run shasum -a 256 {file} , and compare the result with the file fingerprint above.',
      'If the download was interrupted or incomplete, delete the file and download it again. An incomplete file will not install.'
    ],
    switchNote: 'Do not mix the two sources: a directly downloaded copy is not updated through Google Play, and switching to the store version later means uninstalling first (the local data on the phone is removed; your account stays saved).',
    iosNote: 'There is no direct install file for iPhone. The App Store is the only way, once the app is published there.',
    desktopNote: 'You are browsing from a computer. Scan the code with your phone camera to open this page on it.',
    web: 'Open the website',
    privacy: 'Privacy policy',
    terms: 'Terms of use',
    support: 'Support and contact',
    scan: "Scan with your phone's camera",
    qrAlt: 'QR code that opens this page',
    language: 'Language'
  },
  de: {
    dir: 'ltr',
    title: 'HudhudNest App herunterladen',
    description: 'Laden Sie die HudhudNest App herunter, um Immobilien auf dem Handy zu durchsuchen: aus dem passenden Store oder als signierter Direkt-Download für Android.',
    heading: 'HudhudNest App herunterladen',
    lead: 'Immobilien durchsuchen, Suchen speichern und Anzeigen und Nachrichten unterwegs verfolgen.',
    recommended: 'Passt zu Ihrem Gerät',
    soon: 'Noch nicht verfügbar',
    playName: 'Google Play',
    playSoon: 'Die App ist noch nicht bei Google Play veröffentlicht.',
    playOpen: 'In Google Play öffnen',
    iosName: 'App Store',
    iosSoon: 'Die App ist noch nicht im App Store veröffentlicht. Die Website können Sie im iPhone-Browser nutzen.',
    iosOpen: 'Im App Store öffnen',
    directTitle: 'Direkt-Download für Android (APK)',
    directLead: 'Die offizielle, signierte Installationsdatei von HudhudNest, für Geräte ohne Google Play oder wenn Sie den Direkt-Download bevorzugen.',
    directButton: 'Offizielle APK herunterladen',
    version: 'Version',
    released: 'Veröffentlicht am',
    size: 'Dateigröße',
    requires: 'Voraussetzung',
    requiresValue: 'Android {v} oder neuer',
    sha: 'Fingerabdruck der Datei (SHA-256)',
    cert: 'Fingerabdruck des Signaturzertifikats (SHA-256)',
    directWarning: 'Für die Installation außerhalb eines Stores müssen Sie in den Android-Einstellungen Installationen aus dieser Quelle erlauben. Deaktivieren Sie Google Play Protect nicht und installieren Sie die Datei nicht, wenn ihr Fingerabdruck von dem hier angezeigten abweicht.',
    helpTitle: 'Installationshilfe',
    helpSteps: [
      'Laden Sie die APK herunter und öffnen Sie sie über die Download-Benachrichtigung oder die Dateien-App.',
      'Fragt Android nach der Erlaubnis für Installationen aus dieser Quelle, aktivieren Sie sie nur für diesen Browser oder die Dateien-App, gehen Sie zurück und tippen Sie auf Installieren.',
      'Deaktivieren Sie Google Play Protect nicht. Zeigt es eine Warnung, lesen Sie sie und fahren Sie nur fort, wenn der Fingerabdruck der Datei mit dem auf dieser Seite übereinstimmt.',
      'Datei prüfen (optional): unter Windows certutil -hashfile {file} SHA256 , unter macOS oder Linux shasum -a 256 {file} ausführen und das Ergebnis mit dem Fingerabdruck der Datei oben vergleichen.',
      'Wurde der Download unterbrochen oder ist er unvollständig, löschen Sie die Datei und laden Sie sie erneut herunter. Eine unvollständige Datei lässt sich nicht installieren.'
    ],
    switchNote: 'Mischen Sie die beiden Quellen nicht: Eine direkt heruntergeladene Version wird nicht über Google Play aktualisiert, und der spätere Wechsel zur Store-Version erfordert zuerst das Deinstallieren (die lokalen Daten auf dem Handy werden entfernt, Ihr Konto bleibt erhalten).',
    iosNote: 'Für das iPhone gibt es keine direkte Installationsdatei. Der App Store ist der einzige Weg, sobald die App dort veröffentlicht ist.',
    desktopNote: 'Sie surfen am Computer. Scannen Sie den Code mit der Handykamera, um diese Seite auf dem Handy zu öffnen.',
    web: 'Website öffnen',
    privacy: 'Datenschutzerklärung',
    terms: 'Nutzungsbedingungen',
    support: 'Support und Kontakt',
    scan: 'Mit der Handykamera scannen',
    qrAlt: 'QR-Code, der diese Seite öffnet',
    language: 'Sprache'
  },
  tr: {
    dir: 'ltr',
    title: 'HudhudNest uygulamasını indirin',
    description: 'Mülklere telefonunuzdan göz atmak için HudhudNest uygulamasını indirin: cihazınıza uygun mağazadan veya Android için imzalı doğrudan indirme ile.',
    heading: 'HudhudNest uygulamasını indirin',
    lead: 'Mülklere göz atın, aramalarınızı kaydedin, ilanlarınızı ve mesajlarınızı telefonunuzdan takip edin.',
    recommended: 'Cihazınıza uygun',
    soon: 'Henüz mevcut değil',
    playName: 'Google Play',
    playSoon: 'Uygulama henüz Google Play\'de yayınlanmadı.',
    playOpen: 'Google Play\'de aç',
    iosName: 'App Store',
    iosSoon: 'Uygulama henüz App Store\'da yayınlanmadı. Web sitesini iPhone tarayıcınızda kullanabilirsiniz.',
    iosOpen: 'App Store\'da aç',
    directTitle: 'Android için doğrudan indirme (APK)',
    directLead: 'HudhudNest\'in resmî, imzalı kurulum dosyası; Google Play\'i olmayanlar veya doğrudan indirmeyi tercih edenler için.',
    directButton: 'Resmî APK\'yı indir',
    version: 'Sürüm',
    released: 'Yayın tarihi',
    size: 'Dosya boyutu',
    requires: 'Gereksinim',
    requiresValue: 'Android {v} veya daha yeni',
    sha: 'Dosya parmak izi (SHA-256)',
    cert: 'İmza sertifikası parmak izi (SHA-256)',
    directWarning: 'Mağaza dışından kurulum, Android ayarlarında bu kaynaktan kuruluma izin vermeyi gerektirir. Google Play Protect\'i kapatmayın ve parmak izi burada gösterilenden farklıysa dosyayı kurmayın.',
    helpTitle: 'Kurulum yardımı',
    helpSteps: [
      'APK\'yı indirin, ardından indirme bildiriminden veya Dosyalar uygulamasından açın.',
      'Android bu kaynaktan kuruluma izin vermenizi isterse, yalnızca bu tarayıcı veya Dosyalar uygulaması için etkinleştirin, ardından geri dönüp Yükle\'ye dokunun.',
      'Google Play Protect\'i kapatmayın. Bir uyarı gösterirse okuyun ve yalnızca dosya parmak izi bu sayfada gösterilenle eşleşiyorsa devam edin.',
      'Dosyayı doğrulamak için (isteğe bağlı): Windows\'ta certutil -hashfile {file} SHA256 , macOS veya Linux\'ta shasum -a 256 {file} çalıştırın ve sonucu yukarıdaki dosya parmak iziyle karşılaştırın.',
      'İndirme yarıda kesildiyse veya tamamlanmadıysa dosyayı silip yeniden indirin. Eksik bir dosya kurulmaz.'
    ],
    switchNote: 'İki kaynağı karıştırmayın: doğrudan indirilen kopya Google Play üzerinden güncellenmez ve daha sonra mağaza sürümüne geçmek önce kaldırmayı gerektirir (telefondaki yerel veriler silinir; hesabınız kayıtlı kalır).',
    iosNote: 'iPhone için doğrudan kurulum dosyası yoktur. Uygulama yayınlandığında tek yol App Store\'dur.',
    desktopNote: 'Bir bilgisayardan göz atıyorsunuz. Bu sayfayı telefonunuzda açmak için kodu telefon kameranızla tarayın.',
    web: 'Web sitesini aç',
    privacy: 'Gizlilik politikası',
    terms: 'Kullanım koşulları',
    support: 'Destek ve iletişim',
    scan: 'Telefon kameranızla tarayın',
    qrAlt: 'Bu sayfayı açan QR kodu',
    language: 'Dil'
  }
};

const LANGUAGE_NAMES = { ar: 'العربية', en: 'English', de: 'Deutsch', tr: 'Türkçe' };

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** JSON that is safe inside an inline <script>. */
function scriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** The one public address of the page, and the only text the QR code encodes. */
export function downloadPageUrl(config) {
  const host = String(config?.host ?? '');
  if (!HOST.test(host)) {
    throw new Error(`Invalid host in deep-links.config.json: "${host}".`);
  }
  return `https://${host}/download`;
}

function readPublished(stores, os) {
  const flag = stores?.[os]?.published;
  if (flag === undefined) {
    return false;
  }
  if (typeof flag !== 'boolean') {
    throw new Error(`stores.${os}.published in deep-links.config.json must be true or false, got ${JSON.stringify(flag)}.`);
  }
  return flag;
}

/**
 * Store addresses, built only from the package name and the numeric App Store id. An address is returned only for
 * a store marked published; otherwise url is "". A malformed id is an error even while unpublished, so a typo
 * is caught when it is typed, not on the day the store goes live.
 */
export function resolveStores(config) {
  const stores = config?.stores ?? {};
  const androidPublished = readPublished(stores, 'android');
  const iosPublished = readPublished(stores, 'ios');

  const packageName = String(config?.android?.package ?? '');
  if (androidPublished && !ANDROID_PACKAGE.test(packageName)) {
    throw new Error(`Invalid android.package in deep-links.config.json: "${packageName}".`);
  }

  const appStoreId = String(stores?.ios?.appStoreId ?? '').trim();
  if (appStoreId && !APP_STORE_ID.test(appStoreId)) {
    throw new Error(`Invalid stores.ios.appStoreId in deep-links.config.json: "${appStoreId}" (digits only, e.g. 1234567890, without the "id" prefix).`);
  }
  if (iosPublished && !appStoreId) {
    throw new Error('stores.ios.published is true but stores.ios.appStoreId is empty in deep-links.config.json.');
  }

  return {
    android: {
      published: androidPublished,
      url: androidPublished ? `https://play.google.com/store/apps/details?id=${packageName}` : ''
    },
    ios: {
      published: iosPublished,
      url: iosPublished ? `https://apps.apple.com/app/id${appStoreId}` : ''
    }
  };
}

/**
 * The QR code as a compact, deterministic SVG: one path of merged horizontal runs, black on a white square
 * with the 4-module quiet zone the standard asks for. White stays white in dark mode, or phones cannot read it.
 */
export function buildQrSvg(text, { label = 'QR code' } = {}) {
  const qr = qrcode(0, 'Q');
  qr.addData(String(text), 'Byte');
  qr.make();

  const modules = qr.getModuleCount();
  const quiet = 4;
  const size = modules + quiet * 2;
  let path = '';

  for (let row = 0; row < modules; row++) {
    let col = 0;
    while (col < modules) {
      if (!qr.isDark(row, col)) {
        col++;
        continue;
      }
      const start = col;
      while (col < modules && qr.isDark(row, col)) {
        col++;
      }
      path += `M${start + quiet} ${row + quiet}h${col - start}v1h-${col - start}z`;
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeHtml(label)}">` +
    `<rect width="${size}" height="${size}" fill="#fff"/>` +
    `<path fill="#000" shape-rendering="crispEdges" d="${path}"/></svg>\n`
  );
}


/** Plain text with the {file} placeholder turned into a <code> element; everything else is escaped. */
function stepHtml(step, fileName) {
  return step
    .split('{file}')
    .map(escapeHtml)
    .join(`<code dir="ltr">${escapeHtml(fileName)}</code>`);
}

function fact(label, valueHtml) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${valueHtml}</dd></div>`;
}

function formatReleaseDate(isoDate, lang) {
  const locale = { ar: 'ar-u-nu-latn', en: 'en-GB', de: 'de-DE' }[lang];
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * Which android card carries the "fits your device" badge: Google Play when it is published, else the direct
 * download when one is approved, else the (not yet available) Play card.
 */
function androidRecommendation(stores, release) {
  if (stores.android.published || !release) {
    return 'play';
  }
  return 'direct';
}

function playCard(text, stores, recommended) {
  const cls = `card card--android${recommended ? ' is-rec' : ''}`;
  const badge = `<span class="rec">${escapeHtml(text.recommended)}</span>`;
  const body = stores.android.published
    ? `<a class="btn" href="${escapeHtml(stores.android.url)}">${escapeHtml(text.playOpen)}</a>`
    : `<p class="muted"><span class="tag">${escapeHtml(text.soon)}</span> ${escapeHtml(text.playSoon)}</p>`;
  return [`<article class="${cls}">`, `  <h2>${escapeHtml(text.playName)} ${badge}</h2>`, `  ${body}`, '</article>'].join('\n');
}

function iosCard(text, stores) {
  const body = stores.ios.published
    ? `<a class="btn" href="${escapeHtml(stores.ios.url)}">${escapeHtml(text.iosOpen)}</a>`
    : `<p class="muted"><span class="tag">${escapeHtml(text.soon)}</span> ${escapeHtml(text.iosSoon)}</p>`;
  return [
    '<article class="card card--ios is-rec">',
    `  <h2>${escapeHtml(text.iosName)} <span class="rec">${escapeHtml(text.recommended)}</span></h2>`,
    `  ${body}`,
    `  <p class="muted small">${escapeHtml(text.iosNote)}</p>`,
    '</article>'
  ].join('\n');
}

function directCard(lang, text, release, recommended) {
  const cls = `card card--android card--direct${recommended ? ' is-rec' : ''}`;
  return [
    `<article class="${cls}">`,
    `  <h2>${escapeHtml(text.directTitle)} <span class="rec">${escapeHtml(text.recommended)}</span></h2>`,
    `  <p class="muted">${escapeHtml(text.directLead)}</p>`,
    '  <dl class="facts">',
    `    ${fact(text.version, `<bdi dir="ltr">${escapeHtml(release.versionName)} (${release.versionCode})</bdi>`)}`,
    `    ${fact(text.released, escapeHtml(formatReleaseDate(release.releasedAt, lang)))}`,
    `    ${fact(text.size, `<bdi dir="ltr">${escapeHtml(bytesToHuman(release.sizeBytes))}</bdi>`)}`,
    `    ${fact(text.requires, escapeHtml(text.requiresValue).replace('{v}', `<bdi dir="ltr">${escapeHtml(androidVersionLabel(release.minSdk))}</bdi>`))}`,
    `    ${fact(text.sha, `<code class="hash" dir="ltr">${escapeHtml(release.sha256)}</code>`)}`,
    `    ${fact(text.cert, `<code class="hash" dir="ltr">${escapeHtml(release.signingCertSha256)}</code>`)}`,
    '  </dl>',
    `  <a class="btn" href="/download/android">${escapeHtml(text.directButton)}</a>`,
    `  <p class="muted small">${escapeHtml(text.directWarning)}</p>`,
    '</article>'
  ].join('\n');
}

function helpBlock(text, release) {
  const fileName = apkFileNameFor(release);
  return [
    '<details class="help">',
    `  <summary>${escapeHtml(text.helpTitle)}</summary>`,
    '  <ol>',
    ...text.helpSteps.map(step => `    <li>${stepHtml(step, fileName)}</li>`),
    '  </ol>',
    `  <p class="muted small">${escapeHtml(text.switchNote)}</p>`,
    '</details>'
  ].join('\n');
}

function apkFileNameFor(release) {
  return `HudhudNest-${release.versionName}.apk`;
}

function copyBlock(lang, stores, release) {
  const text = TEXT[lang];
  const recommended = androidRecommendation(stores, release);

  return [
    `<div class="copy" data-l="${lang}" lang="${lang}" dir="${text.dir}">`,
    `  <h1>${escapeHtml(text.heading)}</h1>`,
    `  <p class="lead">${escapeHtml(text.lead)}</p>`,
    '  <div class="cards">',
    playCard(text, stores, recommended === 'play').replace(/^/gm, '    '),
    ...(release ? [directCard(lang, text, release, recommended === 'direct').replace(/^/gm, '    ')] : []),
    iosCard(text, stores).replace(/^/gm, '    '),
    '  </div>',
    ...(release ? [helpBlock(text, release).replace(/^/gm, '  ')] : []),
    `  <p class="muted small desk">${escapeHtml(text.desktopNote)}</p>`,
    '  <nav class="links">',
    `    <a href="/">${escapeHtml(text.web)}</a>`,
    `    <a href="/privacy-policy">${escapeHtml(text.privacy)}</a>`,
    `    <a href="/terms-of-service">${escapeHtml(text.terms)}</a>`,
    `    <a href="/kontakt">${escapeHtml(text.support)}</a>`,
    '  </nav>',
    '</div>'
  ].join('\n');
}

/**
 * The inline script. It picks the language (saved choice, then the browser's, then Arabic) and marks the device
 * family on <html data-os> so the CSS can highlight the fitting card. It never navigates, never reads the
 * address bar, the query string, the hash or the referrer, and never sends anything anywhere.
 */
function script() {
  const titles = Object.fromEntries(LANGS.map(lang => [lang, TEXT[lang].title]));

  return [
    '(function () {',
    `  var LANGS = ${scriptJson(LANGS)};`,
    `  var TITLES = ${scriptJson(titles)};`,
    '  var root = document.documentElement;',
    '  function pick() {',
    '    var stored = null;',
    "    try { stored = window.localStorage.getItem('lang'); } catch (e) {}",
    '    if (LANGS.indexOf(stored) !== -1) { return stored; }',
    '    var list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];',
    '    for (var i = 0; i < list.length; i++) {',
    "      var code = String(list[i] || '').slice(0, 2).toLowerCase();",
    '      if (LANGS.indexOf(code) !== -1) { return code; }',
    '    }',
    "    return 'ar';",
    '  }',
    '  function apply(lang) {',
    "    root.setAttribute('data-lang', lang);",
    '    root.lang = lang;',
    "    root.dir = lang === 'ar' ? 'rtl' : 'ltr';",
    '    document.title = TITLES[lang];',
    "    var buttons = document.querySelectorAll('[data-set-lang]');",
    '    for (var i = 0; i < buttons.length; i++) {',
    "      buttons[i].setAttribute('aria-pressed', String(buttons[i].getAttribute('data-set-lang') === lang));",
    '    }',
    '  }',
    "  var switchers = document.querySelectorAll('[data-set-lang]');",
    '  for (var i = 0; i < switchers.length; i++) {',
    "    switchers[i].addEventListener('click', function (event) { apply(event.currentTarget.getAttribute('data-set-lang')); });",
    '  }',
    '  apply(pick());',
    "  var ua = navigator.userAgent || '';",
    "  var os = 'desktop';",
    "  if (/Android/i.test(ua)) { os = 'android'; }",
    "  else if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) { os = 'ios'; }",
    "  root.setAttribute('data-os', os);",
    '})();'
  ].join('\n');
}

const STYLE = `
:root { color-scheme: light dark; --navy: #0F2742; --gold: #D6A84F; --gold-dark: #b5872e;
  --bg: #f4f5f7; --card: #ffffff; --text: #14202e; --muted: #4b5766; --line: #d9dde3;
  --btn-bg: var(--navy); --btn-text: #ffffff; --tag-bg: #eef0f3; --tag-text: #3b4655; --code-bg: #eef0f3; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #0d0e11; --card: #15161a; --text: #e8eaee; --muted: #b3bac6; --line: #2c2f36;
    --btn-bg: var(--gold); --btn-text: var(--navy); --tag-bg: #22242a; --tag-text: #cfd5df; --code-bg: #22242a; }
}
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: start center; padding: 24px 16px;
  background: var(--bg); color: var(--text);
  font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Arabic", "Noto Sans", sans-serif; }
main { width: 100%; max-width: 800px; background: var(--card); border: 1px solid var(--line);
  border-radius: 16px; padding: 32px 24px; display: grid; gap: 24px; }
main > header { display: flex; justify-content: space-between; align-items: center; gap: 12px 16px; flex-wrap: wrap; }
.logo { display: block; width: 180px; max-width: 60%; height: auto; }
.lang { display: flex; gap: 8px; flex-wrap: wrap; margin: 0; padding: 0; list-style: none; }
.lang button { font: inherit; font-size: 14px; padding: 4px 12px; min-height: 44px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--line); background: transparent; color: var(--text); }
.lang button[aria-pressed="true"] { border-color: var(--gold-dark); box-shadow: inset 0 0 0 1px var(--gold-dark); }
[data-l] { display: none; }
html:not([data-lang]) [data-l="ar"], html[data-lang="ar"] [data-l="ar"],
html[data-lang="en"] [data-l="en"], html[data-lang="de"] [data-l="de"] { display: block; }
h1 { margin: 0 0 8px; font-size: 1.75rem; line-height: 1.3; }
h2 { margin: 0 0 8px; font-size: 1.125rem; line-height: 1.4; }
.lead { margin: 0 0 20px; color: var(--muted); }
.cards { display: grid; gap: 16px; margin-bottom: 16px; }
.card { border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.card .rec { display: none; margin-inline-start: 8px; padding: 2px 10px; border-radius: 999px; font-size: 0.75rem;
  font-weight: 700; background: var(--gold); color: var(--navy); vertical-align: middle; }
html[data-os="android"] .card--android.is-rec, html[data-os="ios"] .card--ios.is-rec { border-color: var(--gold-dark);
  box-shadow: inset 0 0 0 1px var(--gold-dark); }
html[data-os="android"] .card--android.is-rec .rec, html[data-os="ios"] .card--ios.is-rec .rec { display: inline-block; }
html[data-os="android"] .card--android { order: -2; }
html[data-os="android"] .card--direct { order: -1; }
html[data-os="android"] .card--android.is-rec { order: -3; }
html[data-os="ios"] .card--ios { order: -1; }
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 20px;
  border-radius: 12px; font-weight: 700; text-decoration: none; background: var(--btn-bg); color: var(--btn-text); }
.tag { display: inline-block; padding: 1px 10px; border-radius: 999px; font-size: 0.8125rem; font-weight: 600;
  background: var(--tag-bg); color: var(--tag-text); }
.muted { margin: 0 0 12px; color: var(--muted); }
.small { font-size: 0.875rem; }
.facts { display: grid; gap: 8px; margin: 0 0 16px; }
.facts > div { display: grid; grid-template-columns: minmax(7rem, 11rem) 1fr; gap: 8px; }
.facts dt { color: var(--muted); font-size: 0.9375rem; }
.facts dd { margin: 0; min-width: 0; }
code { font: 0.875rem/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--code-bg);
  padding: 1px 6px; border-radius: 6px; }
code.hash { display: block; overflow-wrap: anywhere; user-select: all; }
.help { margin: 0 0 16px; border: 1px solid var(--line); border-radius: 12px; padding: 12px 16px; }
.help summary { cursor: pointer; font-weight: 700; min-height: 44px; display: flex; align-items: center; }
.help ol { margin: 8px 0 12px; padding-inline-start: 1.25rem; }
.help li { margin-bottom: 8px; overflow-wrap: anywhere; }
.desk { display: none; }
.links { display: flex; gap: 8px 20px; flex-wrap: wrap; padding-top: 8px; border-top: 1px solid var(--line); }
.links a { color: var(--text); font-weight: 600; text-underline-offset: 3px; min-height: 44px; display: inline-flex; align-items: center; }
.qr { display: none; margin: 0; text-align: center; }
.qr svg { width: 168px; height: 168px; border-radius: 8px; border: 1px solid var(--line); }
.qr [data-l] { margin-top: 8px; color: var(--muted); font-size: 0.875rem; }
html[data-os="desktop"] .desk { display: block; }
@media (min-width: 760px) and (hover: hover) and (pointer: fine) {
  .qr { display: block; }
}
@media (max-width: 520px) { .facts > div { grid-template-columns: 1fr; gap: 0; } }
a:focus-visible, button:focus-visible, summary:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }
@media (prefers-reduced-motion: no-preference) { .btn { transition: transform .12s ease; } .btn:active { transform: scale(.98); } }
@media print { body { background: #fff; color: #000; } main { border: 0; } .lang { display: none; } }
`.trim();

/** The marked block of public/_redirects that the build owns (see applyRedirectsBlock). */
export const REDIRECT_BEGIN = '# BEGIN generated:download-android (tools/generate-download-page.mjs; edit downloads/android-release.json instead)';
export const REDIRECT_END = '# END generated:download-android';

/**
 * The /download/android rule. With an approved release it redirects (302, forced) to the one validated address;
 * without one it sends the visitor back to the page instead of a 404, so the stable address never breaks.
 */
export function renderRedirectsBlock(release) {
  const target = release ? release.url : '/download';
  return [REDIRECT_BEGIN, `/download/android   ${target}   302!`, REDIRECT_END].join('\n');
}

/** Replaces the marked block in the text of public/_redirects, or throws if the markers are missing or doubled. */
export function applyRedirectsBlock(text, release) {
  const start = text.indexOf(REDIRECT_BEGIN);
  const end = text.indexOf(REDIRECT_END);
  if (start === -1 || end === -1 || end < start || text.indexOf(REDIRECT_BEGIN, start + 1) !== -1) {
    throw new Error('public/_redirects must contain exactly one generated:download-android block (BEGIN before END).');
  }
  return text.slice(0, start) + renderRedirectsBlock(release) + text.slice(end + REDIRECT_END.length);
}

/**
 * The finished page and its QR code.
 *
 * @param {object} config  deep-links.config.json
 * @param {{ release?: object|null, indexable?: boolean }} [options]
 *   release   the approved, validated Android release (tools/lib/android-release.mjs), or null for none
 *   indexable true only for a real Production deploy; every other build keeps the page out of search engines
 * @returns {{ html: string, qrSvg: string, url: string, stores: ReturnType<typeof resolveStores> }}
 */
export function buildDownloadPage(config, { release = null, indexable = false } = {}) {
  const url = downloadPageUrl(config);
  const stores = resolveStores(config);
  const qrSvg = buildQrSvg(url, { label: TEXT.en.qrAlt });
  const origin = url.slice(0, -'/download'.length);

  const languageButtons = LANGS.map(
    lang => `<li><button type="button" data-set-lang="${lang}" aria-pressed="false" lang="${lang}">${LANGUAGE_NAMES[lang]}</button></li>`
  ).join('\n      ');

  const captions = LANGS.map(
    lang => `<div data-l="${lang}" lang="${lang}" dir="${TEXT[lang].dir}">${escapeHtml(TEXT[lang].scan)}</div>`
  ).join('\n      ');

  const html = [
    '<!doctype html>',
    `<html lang="ar" dir="rtl">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(TEXT.ar.title)}</title>`,
    `<meta name="description" content="${escapeHtml(TEXT.ar.description)}">`,
    `<meta name="robots" content="${indexable ? 'index,follow' : 'noindex,follow'}">`,
    '<meta name="theme-color" content="#0F2742">',
    `<link rel="canonical" href="${escapeHtml(url)}">`,
    '<link rel="icon" href="/favicon.ico">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="HudhudNest">',
    `<meta property="og:url" content="${escapeHtml(url)}">`,
    `<meta property="og:title" content="${escapeHtml(TEXT.ar.title)}">`,
    `<meta property="og:description" content="${escapeHtml(TEXT.ar.description)}">`,
    `<meta property="og:image" content="${escapeHtml(origin)}/images/og-default.png">`,
    '<meta property="og:locale" content="ar_AR">',
    '<meta property="og:locale:alternate" content="en_US">',
    '<meta property="og:locale:alternate" content="de_DE">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<style>\n${STYLE}\n</style>`,
    '</head>',
    '<body>',
    '<main>',
    '  <header>',
    '    <picture>',
    '      <source media="(prefers-color-scheme: dark)" srcset="/images/horizontal-logo-dark-480.png">',
    '      <img class="logo" src="/images/horizontal-logo-480.png" alt="HudhudNest" width="480" height="151">',
    '    </picture>',
    `    <ul class="lang" aria-label="${escapeHtml(TEXT.en.language)}">`,
    `      ${languageButtons}`,
    '    </ul>',
    '  </header>',
    '  <section>',
    ...LANGS.map(lang => copyBlock(lang, stores, release).replace(/^/gm, '    ')),
    '  </section>',
    '  <figure class="qr">',
    `    ${qrSvg.trim()}`,
    '    <figcaption>',
    `      ${captions}`,
    '    </figcaption>',
    '  </figure>',
    '</main>',
    `<script>\n${script()}\n</script>`,
    '</body>',
    '</html>',
    ''
  ].join('\n');

  return { html, qrSvg, url, stores };
}
