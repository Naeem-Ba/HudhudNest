import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { PriceChange, PriceHistoryApiService } from '../../core/api/price-history-api.service';
import { PriceHistoryComponent } from './price-history.component';

const change = (over: Partial<PriceChange> = {}): PriceChange => ({
  priceField: 'PurchasePrice',
  oldValue: 100000,
  newValue: 90000,
  currencyCode: 'USD',
  oldCurrencyCode: null,
  changePercent: -10,
  changedAt: '2026-10-20T10:00:00',
  ...over
});

describe('PriceHistoryComponent', () => {
  let api: jasmine.SpyObj<PriceHistoryApiService>;

  function render(id: string | null, changes: PriceChange[]) {
    api.getChanges.and.returnValue(of(changes));
    const fixture = TestBed.createComponent(PriceHistoryComponent);
    fixture.componentRef.setInput('propertyId', id);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<PriceHistoryApiService>('PriceHistoryApiService', ['getChanges']);
    TestBed.configureTestingModule({
      imports: [PriceHistoryComponent, TranslateModule.forRoot()],
      providers: [{ provide: PriceHistoryApiService, useValue: api }]
    });
  });

  it('renders nothing when the listing has no price change', () => {
    const el = render('p1', []);
    expect(el.querySelector('[data-testid="price-history"]')).toBeNull();
    expect(api.getChanges).toHaveBeenCalledOnceWith('p1');
  });

  it('does not call the API without an id', () => {
    render(null, []);
    expect(api.getChanges).not.toHaveBeenCalled();
  });

  it('lists each change with a drop badge', () => {
    const el = render('p1', [change(), change({ changePercent: 5, oldValue: 95000, newValue: 99750 })]);
    const items = el.querySelectorAll('[data-testid="price-history-item"]');
    expect(items.length).toBe(2);
    expect(items[0].querySelector('.price-history__badge--down')?.textContent?.trim()).toBe('-10%');
    expect(items[1].querySelector('.price-history__badge--up')?.textContent?.trim()).toBe('+5%');
  });

  it('shows no percent for a currency switch', () => {
    const el = render('p1', [change({ currencyCode: 'EUR', oldCurrencyCode: 'USD', newValue: 100000, changePercent: null })]);
    expect(el.querySelector('.price-history__badge')).toBeNull();
    expect(el.querySelector('.price-history__old')?.textContent).toContain('100');
  });
});
