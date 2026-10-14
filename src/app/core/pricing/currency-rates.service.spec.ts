import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';

import { CurrencyLookup, LookupsApiService } from '../api/lookups-api.service';
import { CurrencyRatesService } from './currency-rates.service';

function currency(code: string, rate: number, isBase = false): CurrencyLookup {
  return { code, nameEn: code, nameAr: code, symbol: code, decimalPlaces: 2, exchangeRateToUsd: rate, rateUpdatedAt: '2026-10-01T00:00:00Z', isBase };
}

describe('CurrencyRatesService', () => {
  let lookups: jasmine.SpyObj<LookupsApiService>;

  function create(): CurrencyRatesService {
    TestBed.configureTestingModule({ providers: [{ provide: LookupsApiService, useValue: lookups }] });
    return TestBed.inject(CurrencyRatesService);
  }

  beforeEach(() => {
    lookups = jasmine.createSpyObj('LookupsApiService', ['getCurrencies']);
    lookups.getCurrencies.and.returnValue(of([currency('USD', 1, true), currency('SYP', 14000), currency('EUR', 0.9)]));
  });

  it('converts through the dollar: units per USD divide out', () => {
    const service = create();
    service.load().subscribe();

    expect(service.convert(14000, 'SYP', 'USD')).toBeCloseTo(1, 6);
    expect(service.convert(100, 'USD', 'SYP')).toBeCloseTo(1_400_000, 3);
    expect(service.convert(90, 'EUR', 'USD')).toBeCloseTo(100, 6);
    expect(service.convert(1, 'SYP', 'SYP')).toBeCloseTo(1, 9);
  });

  it('gives no figure for a currency without a rate or before the rates are loaded', () => {
    const service = create();
    expect(service.convert(10, 'USD', 'SYP')).toBeNull();

    service.load().subscribe();
    expect(service.convert(10, 'USD', 'GBP')).toBeNull();
    expect(service.convert(10, null, 'USD')).toBeNull();
    expect(service.convert(Number.NaN, 'USD', 'SYP')).toBeNull();
  });

  it('loads once per session, and retries after a failed load', async () => {
    const service = create();
    await firstValueFrom(service.load());
    await firstValueFrom(service.load());
    expect(lookups.getCurrencies).toHaveBeenCalledTimes(1);

    TestBed.resetTestingModule();
    lookups.getCurrencies.calls.reset();
    lookups.getCurrencies.and.returnValues(throwError(() => new Error('down')), of([currency('USD', 1, true)]));
    const second = create();

    expect(await firstValueFrom(second.load())).toEqual([]);
    expect(second.loaded()).toBeFalse();
    expect((await firstValueFrom(second.load())).length).toBe(1);
    expect(lookups.getCurrencies).toHaveBeenCalledTimes(2);
  });

  it('implements ExchangeRateProvider with the rate of one unit and its date', async () => {
    const service = create();

    const rate = await firstValueFrom(service.getRate('USD', 'SYP'));
    expect(rate).toEqual(jasmine.objectContaining({ rate: 14000, from: 'USD', to: 'SYP' }));
    expect(rate?.asOf).toBe('2026-10-01T00:00:00Z');
    expect(await firstValueFrom(service.getRate('USD', 'GBP'))).toBeNull();
  });
});
