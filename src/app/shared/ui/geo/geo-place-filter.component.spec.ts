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
});
