import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { LocationsApiService } from '../../../core/api/locations-api.service';
import { GeoLocation } from '../../../core/models/geo-location.model';
import { GeoAutocompleteComponent } from './geo-autocomplete.component';
import { DAMASCUS, MAZZEH, place } from './geo-fixtures.spec';
import { locationsApiStub } from './locations-api.stub.spec';

describe('GeoAutocompleteComponent', () => {
  let api: jasmine.SpyObj<LocationsApiService>;
  let fixture: ComponentFixture<GeoAutocompleteComponent>;
  let ac: GeoAutocompleteComponent;
  let picked: GeoLocation[];
  let typed: (string | null)[];

  beforeEach(() => {
    api = locationsApiStub();
    TestBed.configureTestingModule({
      imports: [GeoAutocompleteComponent, TranslateModule.forRoot()],
      providers: [{ provide: LocationsApiService, useValue: api }]
    });
    fixture = TestBed.createComponent(GeoAutocompleteComponent);
    ac = fixture.componentInstance;
    fixture.componentRef.setInput('type', 'District');
    fixture.componentRef.setInput('ancestorId', DAMASCUS.id);
    picked = [];
    typed = [];
    ac.picked.subscribe(p => picked.push(p));
    ac.typed.subscribe(t => typed.push(t));
    fixture.detectChanges();
  });

  it('searches inside the chosen area, of this level only, after a pause in typing', fakeAsync(() => {
    api.search.and.returnValue(of([place(MAZZEH)]));
    ac.onInput('مزة');
    tick(100);
    expect(api.search).not.toHaveBeenCalled();
    tick(200);

    expect(api.search).toHaveBeenCalledTimes(1);
    expect(api.search).toHaveBeenCalledWith('مزة', { parentId: DAMASCUS.id, types: ['District'], limit: 8 });
    expect(ac.results().map(r => r.id)).toEqual([MAZZEH.id]);
  }));

  it('does not search for a single character', fakeAsync(() => {
    ac.onInput('م');
    tick(400);
    expect(api.search).not.toHaveBeenCalled();
  }));

  it('does nothing without an area above it', fakeAsync(() => {
    fixture.componentRef.setInput('ancestorId', null);
    fixture.detectChanges();
    ac.onInput('مزة');
    tick(400);
    expect(api.search).not.toHaveBeenCalled();
    expect(ac.results()).toEqual([]);
  }));

  it('browses the places of the level when focused with nothing typed', fakeAsync(() => {
    api.getDescendants.and.returnValue(of([place(MAZZEH)]));
    ac.onFocus();
    tick(300);
    expect(api.getDescendants).toHaveBeenCalledWith(DAMASCUS.id, 'District', undefined, jasmine.any(Number));
    expect(ac.results().length).toBe(1);
  }));

  it('choosing a result emits the catalog place', () => {
    ac.select(place(MAZZEH));
    expect(picked.map(p => p.id)).toEqual([MAZZEH.id]);
    expect(ac.query()).toBe(MAZZEH.nameAr);
  });

  it('offers to add the typed name only after the lookup found nothing, and it does not block anything', fakeAsync(() => {
    api.search.and.returnValue(of([]));
    ac.onInput('حي جديد');
    expect(ac.showAdd()).toBeFalse(); // not while the lookup is pending
    tick(300);
    expect(ac.showAdd()).toBeTrue();

    ac.confirmNew();
    expect(ac.confirmed()).toBe('حي جديد');
    expect(typed[typed.length - 1]).toBe('حي جديد');
    expect(picked).toEqual([]);
  }));

  it('a failing lookup is reported and the box keeps working', fakeAsync(() => {
    api.search.and.returnValue(throwError(() => new Error('down')));
    ac.onInput('مزة');
    tick(300);
    expect(ac.failed()).toBeTrue();

    api.search.and.returnValue(of([place(MAZZEH)]));
    ac.onInput('مزة ');
    tick(300);
    expect(ac.results().length).toBe(1);
  }));

  it('typing reports the text so the caller knows the place is not a catalog place', () => {
    ac.onInput('abc');
    expect(typed).toEqual(['abc']);
    ac.clear();
    expect(typed[typed.length - 1]).toBeNull();
  });

  it('arrow keys and Enter choose a result', fakeAsync(() => {
    api.search.and.returnValue(of([place(MAZZEH)]));
    ac.onInput('مزة');
    tick(300);

    ac.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    ac.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(picked.map(p => p.id)).toEqual([MAZZEH.id]);
  }));
});
