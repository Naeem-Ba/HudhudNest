// Pure builders for the public /download page: one stable address that sends each visitor to their store, and
// the single QR code that points at it. No file or network access here; tools/generate-download-page.mjs does
// the I/O and tools/lib/download-page.test.mjs pins the rules below.
//
// Rules this file enforces, on purpose:
//   * The destination of the redirect is never read from the request. The only store addresses that can appear
//     in the page are the two built here from deep-links.config.json (android.package, ios.appStoreId), after a
//     strict format check. There is no query parameter, hash or referrer anywhere in the page's script.
//   * While a store is not published (stores.<os>.published !== true) no store address and no redirect code is
//     emitted at all; the page just says "coming soon" and offers the website.
//   * The QR code encodes exactly https://<host>/download, with <host> taken from the same config.
//   * No analytics, no third-party script, no web font. The CSP is still report-only (netlify.toml), so inline
//     script/style are allowed, but nothing here loads from another origin.

import qrcode from 'qrcode-generator';

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const ANDROID_PACKAGE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i;
const APP_STORE_ID = /^\d{6,12}$/;

const LANGS = ['ar', 'en', 'de'];

const TEXT = {
  ar: {
    dir: 'rtl',
    title: 'تحميل تطبيق HudhudNest',
    description: 'حمّل تطبيق HudhudNest من المتجر المناسب لهاتفك.',
    heading: 'حمّل تطبيق HudhudNest',
    lead: 'تصفّح العقارات واحفظ عمليات بحثك وتابع إعلاناتك من هاتفك.',
    soon: 'قريبًا',
    comingSoon: 'التطبيق قيد التجهيز للنشر على المتاجر. تستطيع استخدام الموقع من هاتفك الآن.',
    published: 'إن لم تُفتح صفحة المتجر تلقائيًا، اضغط الزر المناسب لجهازك.',
    web: 'افتح الموقع',
    scan: 'امسح الرمز بكاميرا هاتفك',
    qrAlt: 'رمز QR يفتح هذه الصفحة',
    language: 'اللغة'
  },
  en: {
    dir: 'ltr',
    title: 'Get the HudhudNest app',
    description: 'Get the HudhudNest app from the store that matches your phone.',
    heading: 'Get the HudhudNest app',
    lead: 'Browse properties, save your searches and follow your listings from your phone.',
    soon: 'Coming soon',
    comingSoon: 'The app is being prepared for the stores. You can use the website on your phone right now.',
    published: 'If the store does not open on its own, tap the button for your device.',
    web: 'Open the website',
    scan: "Scan with your phone's camera",
    qrAlt: 'QR code that opens this page',
    language: 'Language'
  },
  de: {
    dir: 'ltr',
    title: 'HudhudNest App herunterladen',
    description: 'Laden Sie die HudhudNest App aus dem passenden Store für Ihr Handy.',
    heading: 'HudhudNest App herunterladen',
    lead: 'Immobilien durchsuchen, Suchen speichern und Anzeigen unterwegs verfolgen.',
    soon: 'Demnächst',
    comingSoon: 'Die App wird für die Stores vorbereitet. Die Website können Sie jetzt schon auf dem Handy nutzen.',
    published: 'Öffnet sich der Store nicht von selbst, tippen Sie auf die Schaltfläche für Ihr Gerät.',
    web: 'Website öffnen',
    scan: 'Mit der Handykamera scannen',
    qrAlt: 'QR-Code, der diese Seite öffnet',
    language: 'Sprache'
  }
};

const LANGUAGE_NAMES = { ar: 'العربية', en: 'English', de: 'Deutsch' };

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

function storeButton(label, store, text) {
  if (store.published) {
    return `<a class="btn" href="${escapeHtml(store.url)}">${escapeHtml(label)}</a>`;
  }
  return `<span class="btn is-off" aria-disabled="true">${escapeHtml(label)} <small>${escapeHtml(text.soon)}</small></span>`;
}

function copyBlock(lang, stores) {
  const text = TEXT[lang];
  const anyPublished = stores.android.published || stores.ios.published;

  return [
    `<div class="copy" data-l="${lang}" lang="${lang}" dir="${text.dir}">`,
    `  <h1>${escapeHtml(text.heading)}</h1>`,
    `  <p class="lead">${escapeHtml(text.lead)}</p>`,
    '  <div class="stores">',
    `    ${storeButton('Google Play', stores.android, text)}`,
    `    ${storeButton('App Store', stores.ios, text)}`,
    '  </div>',
    `  <p class="note">${escapeHtml(anyPublished ? text.published : text.comingSoon)}</p>`,
    `  <a class="web" href="/">${escapeHtml(text.web)}</a>`,
    '</div>'
  ].join('\n');
}

function script(stores) {
  const anyPublished = stores.android.published || stores.ios.published;
  const titles = Object.fromEntries(LANGS.map(lang => [lang, TEXT[lang].title]));

  const lines = [
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
    '  apply(pick());'
  ];

  if (anyPublished) {
    lines.push(
      `  var STORES = ${scriptJson({ android: stores.android.url, ios: stores.ios.url })};`,
      "  var ua = navigator.userAgent || '';",
      '  var android = /Android/i.test(ua);',
      "  var ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);",
      "  var target = android ? STORES.android : (ios ? STORES.ios : '');",
      '  if (target) { window.location.replace(target); }'
    );
  }

  lines.push('})();');
  return lines.join('\n');
}

const STYLE = `
:root { color-scheme: light dark; --navy: #0F2742; --gold: #D6A84F; --gold-dark: #b5872e;
  --bg: #f4f5f7; --card: #ffffff; --text: #14202e; --muted: #4b5766; --line: #d9dde3;
  --btn-bg: var(--navy); --btn-text: #ffffff; --off-bg: #eef0f3; --off-text: #4b5766; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #0d0e11; --card: #15161a; --text: #e8eaee; --muted: #b3bac6; --line: #2c2f36;
    --btn-bg: var(--gold); --btn-text: var(--navy); --off-bg: #22242a; --off-text: #b3bac6; }
}
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px;
  background: var(--bg); color: var(--text);
  font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Arabic", "Noto Sans", sans-serif; }
main { width: 100%; max-width: 760px; background: var(--card); border: 1px solid var(--line);
  border-radius: 16px; padding: 32px 24px; display: grid; gap: 24px; }
.logo { display: block; width: 180px; max-width: 60%; height: auto; }
.lang { display: flex; gap: 8px; flex-wrap: wrap; margin: 0; padding: 0; list-style: none; }
.lang button { font: inherit; font-size: 14px; padding: 4px 12px; min-height: 32px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--line); background: transparent; color: var(--text); }
.lang button[aria-pressed="true"] { border-color: var(--gold-dark); box-shadow: inset 0 0 0 1px var(--gold-dark); }
[data-l] { display: none; }
html:not([data-lang]) [data-l="ar"], html[data-lang="ar"] [data-l="ar"],
html[data-lang="en"] [data-l="en"], html[data-lang="de"] [data-l="de"] { display: block; }
h1 { margin: 0 0 8px; font-size: 1.75rem; line-height: 1.3; }
.lead { margin: 0 0 20px; color: var(--muted); }
.stores { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.btn { display: inline-flex; align-items: center; gap: 8px; min-height: 48px; padding: 0 20px; border-radius: 12px;
  font-weight: 700; text-decoration: none; background: var(--btn-bg); color: var(--btn-text); }
.btn small { font-weight: 400; font-size: 0.8125rem; }
.btn.is-off { background: var(--off-bg); color: var(--off-text); border: 1px dashed var(--line); }
.note { margin: 0 0 16px; color: var(--muted); }
.web { color: var(--text); font-weight: 600; text-underline-offset: 3px; }
.qr { display: none; margin: 0; text-align: center; }
.qr svg { width: 168px; height: 168px; border-radius: 8px; border: 1px solid var(--line); }
.qr [data-l] { margin-top: 8px; color: var(--muted); font-size: 0.875rem; }
@media (min-width: 760px) and (hover: hover) and (pointer: fine) {
  main { grid-template-columns: 1fr auto; align-items: center; }
  main > header { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
  .qr { display: block; }
}
a:focus-visible, button:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }
@media print { body { background: #fff; color: #000; } main { border: 0; } .lang { display: none; } }
`.trim();

/**
 * The finished page and its QR code.
 *
 * @returns {{ html: string, qrSvg: string, url: string, stores: ReturnType<typeof resolveStores> }}
 */
export function buildDownloadPage(config) {
  const url = downloadPageUrl(config);
  const stores = resolveStores(config);
  const qrSvg = buildQrSvg(url, { label: TEXT.en.qrAlt });

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
    '<meta name="robots" content="noindex,follow">',
    '<meta name="theme-color" content="#0F2742">',
    `<link rel="canonical" href="${escapeHtml(url)}">`,
    '<link rel="icon" href="/favicon.ico">',
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
    ...LANGS.map(lang => copyBlock(lang, stores).replace(/^/gm, '    ')),
    '  </section>',
    '  <figure class="qr">',
    `    ${qrSvg.trim()}`,
    '    <figcaption>',
    `      ${captions}`,
    '    </figcaption>',
    '  </figure>',
    '</main>',
    `<script>\n${script(stores)}\n</script>`,
    '</body>',
    '</html>',
    ''
  ].join('\n');

  return { html, qrSvg, url, stores };
}
