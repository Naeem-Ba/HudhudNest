// =============================================================
// src/app/core/sharing/external-link.ts
//
// The one way the share providers hand an https:/mailto: link to the outside world.
//
// Why this exists (the false "could not open the share window" error): the providers used to call
// `window.open(url, '_blank', 'noopener,noreferrer')` and treat a null return as "blocked by a
// pop-up blocker". But the HTML spec makes window.open return null whenever the `noopener` feature
// is passed, even though the window DID open. So every WhatsApp/Telegram/Facebook tap opened the
// app and then showed a failure toast. A pop-up blocker cannot be detected through window.open's
// return value once noopener is in play, so the result must not be read from it at all.
//
// An anchor click inside the user's tap is the form browsers treat as user-initiated navigation
// (it is not blocked like a delayed window.open) and it carries rel="noopener noreferrer" without
// changing any return value. Inside the Capacitor app the system browser / the target app is
// reached through @capacitor/browser instead.
// =============================================================

import { Capacitor } from '@capacitor/core';

export async function openExternalLink(url: string): Promise<void> {
  // mailto:/tel: are handed to the OS mail/phone app by an ordinary same-window anchor click (the page
  // is not left); neither a new tab (a stray blank tab on some desktop browsers) nor an in-app browser
  // (cannot open them) is wanted.
  const isWebLink = /^https?:\/\//i.test(url);

  if (isWebLink && Capacitor.isNativePlatform()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
    return;
  }

  const anchor = document.createElement('a');
  anchor.href = url;
  if (isWebLink) {
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
  }
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    document.body.removeChild(anchor);
  }
}
