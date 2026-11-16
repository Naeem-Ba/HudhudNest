import { InjectionToken } from '@angular/core';

import { environment } from '../../../environments/environment';
import { WaitlistInterest } from './waitlist/waitlist.validation';

export interface MarketingConfig {
  /** Whether property listings exist yet (environment.listingsLive). */
  listingsLive: boolean;
  /** Origin of the platform (no trailing slash); '' means "this origin". */
  appUrl: string;
}

/** A token so tests can run the pages with listingsLive on and off. */
export const MARKETING_CONFIG = new InjectionToken<MarketingConfig>('MARKETING_CONFIG', {
  providedIn: 'root',
  factory: () => ({ listingsLive: environment.listingsLive, appUrl: environment.appUrl })
});

export function platformUrl(config: MarketingConfig, path = '/'): string {
  return `${config.appUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Where a call to action leads. 'waitlist' opens the dialog, 'platform' leaves for the app, 'route' stays on this site. */
export type CtaTarget =
  | { kind: 'waitlist'; interest: WaitlistInterest | null }
  | { kind: 'platform'; path: string }
  | { kind: 'route'; path: string; query?: Record<string, string> };

export interface HeroCtas {
  primary: { labelKey: string; target: CtaTarget };
  secondary: { labelKey: string; target: CtaTarget } | null;
}

const PUBLISH: CtaTarget = { kind: 'platform', path: '/property-form' };

/**
 * No listings yet (listingsLive false): the most useful action is getting listings, so "list your property" is the
 * gold primary button and "notify me" the outline one, and nothing points at an empty search. Once listings exist the
 * primary button becomes "discover properties" and the waitlist disappears (there is nothing left to wait for).
 */
export function heroCtas(listingsLive: boolean): HeroCtas {
  return listingsLive
    ? {
        primary: { labelKey: 'SITE.HERO.CTA_EXPLORE', target: { kind: 'route', path: '/properties' } },
        secondary: { labelKey: 'SITE.HERO.CTA_PUBLISH', target: PUBLISH }
      }
    : {
        primary: { labelKey: 'SITE.HERO.CTA_PUBLISH', target: PUBLISH },
        secondary: { labelKey: 'SITE.HERO.CTA_NOTIFY', target: { kind: 'waitlist', interest: null } }
      };
}

export type StartCardKey = 'BUY' | 'RENT' | 'SHORT' | 'OFFER';

export interface StartCard {
  key: StartCardKey;
  icon: 'home' | 'key' | 'bed' | 'plus';
  target: CtaTarget;
}

/** The four "Hier starten" cards. Searching cards open the waitlist (with the interest preselected) until listings exist. */
export function startCards(listingsLive: boolean): StartCard[] {
  const search = (interest: WaitlistInterest, live: CtaTarget): CtaTarget =>
    listingsLive ? live : { kind: 'waitlist', interest };
  return [
    { key: 'BUY', icon: 'home', target: search('kaufen', { kind: 'route', path: '/properties', query: { listingType: 'ForSale' } }) },
    { key: 'RENT', icon: 'key', target: search('mieten', { kind: 'route', path: '/properties', query: { listingType: 'ForRent' } }) },
    { key: 'SHORT', icon: 'bed', target: search('kurz', { kind: 'route', path: '/short-stay' }) },
    { key: 'OFFER', icon: 'plus', target: PUBLISH }
  ];
}
