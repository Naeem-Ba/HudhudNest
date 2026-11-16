import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { LocationsApiService } from '../../../core/api/locations-api.service';
import { GeoLocation } from '../../../core/models/geo-location.model';
import { GeoPlaceFilterComponent } from './geo-place-filter.component';
import { DAMASCUS, VILLAT, place } from './geo-fixtures.spec';
import { locationsApiStub } from './locations-api.stub.spec';

describe('GeoPlaceFilterComponent', () => {
  let api: jasmine.SpyObj<LocationsApiService>;
  let fixture: ComponentFixture<GeoPlaceFilterComponent>;
  let filter: GeoPlaceFilterComponent;
  let picked: (GeoLocation | null)[];

  beforeEach(() => {
    api = locationsApiStub();
    TestBed.configureTestingModule({
      imports: [GeoPlaceFilterComponent, TranslateModule.forRoot()],
      providers: [{ provide: LocationsApiService, useValue: api }]
    });
    fixture = TestBed.createComponent(GeoPlaceFilterComponent);
    filter = fixture.componentInstance;
    picked = [];
    filter.picked.subscribe(p => picked.push(p));
    fixture.detectChanges();
  });

  it('finds a place of any level by name', fakeAsync(() => {
    api.search.and.returnValue(of([place(VILLAT)]));
    filter.onInput('فيلات');
    tick(300);

    expect(api.search).toHaveBeenCalledWith('فيلات', { parentId: null, limit: 10 });
    expect(filter.results().map(r => r.id)).toEqual([VILLAT.id]);
  }));

  it('stays inside the scope when one is given', fakeAsync(() => {
    fixture.componentRef.setInput('scopeId', DAMASCUS.id);
    api.search.and.returnValue(of([]));
    filter.onInput('فيلات');
    tick(300);
    expect(api.search).toHaveBeenCalledWith('فيلات', { parentId: DAMASCUS.id, limit: 10 });
    expect(filter.state()).toBe('empty');
  }));

  it('ignores one character', fakeAsync(() => {
    filter.onInput('ف');
    tick(300);
    expect(api.search).not.toHaveBeenCalled();
  }));

  it('choosing a place emits it; clearing emits null', () => {
    filter.choose(place(VILLAT));
    expect(picked[0]?.id).toBe(VILLAT.id);
    expect(filter.query()).toBe(VILLAT.nameAr);

    filter.clear();
    expect(picked[1]).toBeNull();
    expect(filter.query()).toBe('');
  });

  it('shows the applied place as the box text', () => {
    fixture.componentRef.setInput('selected', place(VILLAT));
    fixture.detectChanges();
    expect(filter.query()).toBe(VILLAT.nameAr);
  });

  it('a failing search shows an error state', fakeAsync(() => {
    api.search.and.returnValue(throwError(() => new Error('down')));
    filter.onInput('فيلات');
    tick(300);
    expect(filter.state()).toBe('error');
  }));

  describe('search the typed text in listing addresses', () => {
    let texts: string[];
    let typed: string[];

    beforeEach(() => {
      texts = [];
      typed = [];
      filter.textPicked.subscribe(t => texts.push(t));
      filter.typed.subscribe(t => typed.push(t));
    });

    it('is offered whenever two or more characters are typed, even when the catalog finds nothing', fakeAsync(() => {
      api.search.and.returnValue(of([]));
      filter.onInput('شارع بغداد');
      tick(300);
      fixture.detectChanges();

      expect(filter.state()).toBe('empty');
      expect(filter.canSearchText()).toBeTrue();
      const option = fixture.nativeElement.querySelector('[data-testid="place-search-text"]') as HTMLElement;
      expect(option).not.toBeNull();
    }));

    it('is not offered for one character, nor for the place that is already applied', () => {
      filter.onInput('ب');
      expect(filter.canSearchText()).toBeFalse();

      fixture.componentRef.setInput('selected', place(VILLAT));
      fixture.detectChanges();
      expect(filter.canSearchText()).toBeFalse();
    });

    it('choosing it emits the trimmed text and closes the list, without pretending a place was picked', () => {
      filter.onInput('  بغداد ');
      filter.chooseText();

      expect(texts).toEqual(['بغداد']);
      expect(picked).toEqual([]);
      expect(filter.open()).toBeFalse();
    });

    it('every keystroke is reported, and clearing reports an empty text and no place', () => {
      filter.onInput('بغ');
      filter.onInput('بغد');
      filter.clear();

      expect(typed).toEqual(['بغ', 'بغد', '']);
      expect(picked).toEqual([null]);
    });

    it('emptying the box by hand removes what was applied through it (a place or a text)', () => {
      fixture.componentRef.setInput('text', 'بغداد');
      fixture.detectChanges();
      expect(filter.query()).toBe('بغداد');

      filter.onInput('');
      expect(picked).toEqual([null]);
    });

    it('reset() puts the box back to what is applied, dropping a draft', () => {
      fixture.componentRef.setInput('text', 'بغداد');
      fixture.detectChanges();
      filter.onInput('شيء آخر');

      filter.reset();
      expect(filter.query()).toBe('بغداد');
    });
  });
});
