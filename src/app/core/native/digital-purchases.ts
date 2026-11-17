import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';

import { isNativeApp } from './is-native-app';

/**
 * Paid plans, featured listings and listing extensions are digital goods used inside the app. Apple (App Store
 * Review Guideline 3.1.1) and Google Play require their own in-app billing for those, and HudhudNest sells them by
 * bank transfer or an online provider instead. Until in-app billing exists, the installed app does not offer them at
 * all: no buy buttons, no paid plan cards, and no checkout pages. A plan bought on the website still works in the
 * app (Guideline 3.1.3(b), multiplatform services). The website is unchanged.
 */
export function digitalPurchasesAllowed(): boolean {
  return !isNativeApp();
}

/** Keeps the installed app out of the one-off listing fee checkout (/checkout/:kind/:propertyId). */
export const digitalPurchaseGuard: CanActivateFn = () =>
  digitalPurchasesAllowed() ? true : inject(Router).createUrlTree(['/my-listings']);
