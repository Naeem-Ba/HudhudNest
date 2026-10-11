// Infrastructure for showing a price in the viewer's display currency. Today NO exchange-rate
// source is configured, so every price is shown in the currency the listing was published in -- a
// currency symbol is never swapped onto an unconverted number. When a rate source is added, it only
// has to implement ExchangeRateProvider; describePrice() already knows how to use it.

import { InjectionToken } from '@angular/core';
import { Observable, of } from 'rxjs';

export interface ExchangeRate {
  /** Units of `to` per one unit of `from`. */
  readonly rate: number;
  readonly from: string;
  readonly to: string;
  /** Where the rate came from, shown next to a converted price. */
  readonly source: string;
  /** When the rate was published (ISO-8601). */
  readonly asOf: string;
}

export interface ExchangeRateProvider {
  /** null = no trustworthy rate: the caller must show the original price. */
  getRate(from: string, to: string): Observable<ExchangeRate | null>;
}

/** The default until a real source exists: never has a rate. */
export const EXCHANGE_RATE_PROVIDER = new InjectionToken<ExchangeRateProvider>('EXCHANGE_RATE_PROVIDER', {
  providedIn: 'root',
  factory: () => ({ getRate: () => of(null) })
});

export interface PriceDisplay {
  /** What to print as the main price. */
  readonly text: string;
  /** The listing's own price, to print next to a converted one; null when `text` already is the original. */
  readonly originalText: string | null;
  readonly converted: boolean;
  readonly rate: ExchangeRate | null;
}

function money(amount: number, currency: string, locale: string): string {
  // Whole units for currencies that do not use decimals (JPY, SYP rounds to whole pounds in practice);
  // two decimals otherwise. Intl knows each currency's own digits, so ask it rather than guess.
  const digits = new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: digits }).format(amount);
}

/**
 * The price to show. Converts only with a valid rate for exactly this currency pair; otherwise (no
 * rate, wrong pair, bad number, same currency) the original price is shown, labelled as what it is.
 * The listing's stored price is never changed.
 */
export function describePrice(
  amount: number,
  originalCurrency: string,
  displayCurrency: string | null,
  rate: ExchangeRate | null,
  locale: string
): PriceDisplay {
  const original = money(amount, originalCurrency, locale);
  const usable =
    !!displayCurrency &&
    displayCurrency !== originalCurrency &&
    !!rate &&
    rate.from === originalCurrency &&
    rate.to === displayCurrency &&
    Number.isFinite(rate.rate) &&
    rate.rate > 0;

  if (!usable || !rate || !displayCurrency) {
    return { text: original, originalText: null, converted: false, rate: null };
  }

  return { text: money(amount * rate.rate, displayCurrency, locale), originalText: original, converted: true, rate };
}
