import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { OfficeMapBounds, OfficesMapComponent } from './offices-map.component';

describe('OfficesMapComponent', () => {
  function create() {
    TestBed.configureTestingModule({ imports: [OfficesMapComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(OfficesMapComponent);
    fixture.componentInstance.height = '300px';
    return fixture;
  }

  it('reports the map bounds once it is drawn', () => {
    const fixture = create();
    const bounds: OfficeMapBounds[] = [];
    fixture.componentInstance.boundsChange.subscribe(b => bounds.push(b));
    fixture.detectChanges();
    expect(bounds.length).toBeGreaterThan(0);
    const b = bounds[0];
    expect(b.minLat).toBeLessThan(b.maxLat);
    expect(b.minLng).toBeLessThan(b.maxLng);
  });

  it('draws small dots when zoomed out, so neighbouring branch names do not pile up', () => {
    const fixture = create();
    fixture.detectChanges();
    fixture.componentInstance.points = [
      { id: 'b1', latitude: 33.5, longitude: 36.3, label: 'Alpha' },
      { id: 'b2', latitude: 33.51, longitude: 36.31, label: 'Beta' }
    ];
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.om-pin--dot').length).toBe(2);
    expect(el.querySelector('.om-pin')!.textContent).toBe('');
    expect(el.querySelector('.om-pin')!.getAttribute('title')).toBe('Alpha');
  });

  it('draws one labelled marker per point once zoomed in, and escapes the label', () => {
    const fixture = create();
    fixture.detectChanges();
    fixture.componentInstance.centerOn(33.5, 36.3, 12);
    fixture.componentInstance.points = [
      { id: 'b1', latitude: 33.5, longitude: 36.3, label: '<b>Alpha</b>', detail: 'Mezzeh', link: ['/offices', 'alpha'] },
      { id: 'b2', latitude: 33.6, longitude: 36.4, label: 'Beta', main: true }
    ];
    expect(fixture.componentInstance.draw()).toBe(2);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.om-pin').length).toBe(2);
    expect(el.querySelector('.om-pin')!.innerHTML).toContain('&lt;b&gt;Alpha&lt;/b&gt;');
    expect(el.querySelectorAll('.om-pin--main').length).toBe(1);
  });

  it('opens the office page when a linked marker is clicked', () => {
    const fixture = create();
    fixture.detectChanges();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture.componentInstance.points = [{ id: 'b1', latitude: 33.5, longitude: 36.3, label: 'Alpha', link: ['/offices', 'alpha'] }];
    (fixture.nativeElement.querySelector('.om-pin') as HTMLElement).click();
    expect(navigate).toHaveBeenCalledWith(['/offices', 'alpha']);
  });

  it('fitting to the points draws each marker once, even when the fit zooms past the label level', () => {
    const fixture = create();
    fixture.componentInstance.fitToPoints = true;
    fixture.detectChanges();
    fixture.componentInstance.points = [
      { id: 'b1', latitude: 33.503, longitude: 36.255, label: 'A', main: true },
      { id: 'b2', latitude: 33.49, longitude: 36.3, label: 'B' }
    ];
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.om-pin').length).toBe(2);
    expect(el.querySelectorAll('.om-pin--dot').length).toBe(0);
  });
});

