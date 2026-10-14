import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';

import { CurrencyLookup, LookupsApiService } from '../api/lookups-api.service';
import { ExchangeRate, ExchangeRateProvider } from './price-display';

/**
 * The currencies the product prices in and their administrator-maintained rates
 * (GET /api/lookups/currencies). Used by the search filters (which currency a price range is
 * written in) and by the cards (an approximate equivalent next to a listing priced in another
 * currency). It also implements ExchangeRateProvider, so describePrice() can use it the day a
 * screen wants the "converted price + original" form.
 *
 * The rates are approximate by design: a converted figure is always shown as "≈", never as a
 * price the seller asked.
 */
@Injectable({ providedIn: 'root' })
export class CurrencyRatesService implements ExchangeRateProvider {
  private readonly lookups = inject(LookupsApiService);

  readonly currencies = signal<readonly CurrencyLookup[]>([]);
  readonly loaded = signal(false);

  private request$: Observable<readonly CurrencyLookup[]> | null = null;

  /** Loads the list once per session; a failed load is retried by the next caller. */
  load(): Observable<readonly CurrencyLookup[]> {
    if (!this.request$) {
      this.request$ = this.lookups.getCurrencies().pipe(
        tap(list => {
          this.currencies.set(list);
          this.loaded.set(true);
        }),
        catchError(() => {
          this.request$ = null;
          return of([] as readonly CurrencyLookup[]);
        }),
        shareReplay(1)
      );
    }

    return this.request$;
  }

  /** `amount` of `from`, in `to`; null when either currency has no rate (the caller shows nothing then). */
  convert(amount: number, from: string | null | undefined, to: string | null | undefined): number | null {
    const source = this.rateOf(from);
    const target = this.rateOf(to);

    if (!Number.isFinite(amount) || source === null || target === null) {
      return null;
    }

    return (amount / source) * target;
  }

  getRate(from: string, to: string): Observable<ExchangeRate | null> {
    return this.load().pipe(
      map(list => {
        const source = list.find(c => c.code === from.toUpperCase());
        const target = list.find(c => c.code === to.toUpperCase());

        if (!source || !target) {
          return null;
        }

        return {
          rate: target.exchangeRateToUsd / source.exchangeRateToUsd,
          from: source.code,
          to: target.code,
          source: 'HudhudNest',
          asOf: [source.rateUpdatedAt, target.rateUpdatedAt].sort().at(-1) ?? ''
        };
      })
    );
  }

  private rateOf(code: string | null | undefined): number | null {
    const upper = (code ?? '').trim().toUpperCase();
    const row = this.currencies().find(c => c.code === upper);
    return row ? row.exchangeRateToUsd : null;
  }
}
