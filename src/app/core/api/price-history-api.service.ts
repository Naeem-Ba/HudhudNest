import { Injectable, inject } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { SKIP_ERROR_TOAST } from '../interceptors/api-error.interceptor';

/** One change of one price field, newest first. `changePercent` is null when the currencies differ. */
export interface PriceChange {
  priceField: 'PurchasePrice' | 'ColdRent' | 'WarmRent' | string;
  oldValue: number | null;
  newValue: number | null;
  currencyCode: string;
  oldCurrencyCode: string | null;
  changePercent: number | null;
  changedAt: string;
}

/**
 * GET /properties/{id}/price-history (growth engine P1). Public, cached by the API. A failure or a
 * 404 is not worth a toast on the detail page: the section is simply not shown.
 */
@Injectable({ providedIn: 'root' })
export class PriceHistoryApiService {
  private readonly api = inject(BackendApiService);

  getChanges(propertyId: string): Observable<PriceChange[]> {
    return this.api
      .get<{ changes?: PriceChange[] }>(`/properties/${encodeURIComponent(propertyId)}/price-history`, undefined, {
        context: new HttpContext().set(SKIP_ERROR_TOAST, true)
      })
      .pipe(
        map(body => (Array.isArray(body?.changes) ? body.changes : [])),
        catchError(() => of([] as PriceChange[]))
      );
  }
}
