import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { PropertyApiService } from './property-api.service';

describe('PropertyApiService image mapping', () => {
  it('preserves image sort order and does not duplicate the main image', done => {
    TestBed.configureTestingModule({
      providers: [
        PropertyApiService,
        {
          provide: BackendApiService,
          useValue: {
            get: () => of({
              id: 'property-1',
              title: 'Flat',
              city: 'Berlin',
              mainImageUrl: '/main.jpg',
              images: [
                { url: '/main.jpg', isMain: true, sortOrder: 2 },
                { url: '/first.jpg', sortOrder: 1 }
              ]
            })
          }
        }
      ]
    });

    TestBed.inject(PropertyApiService).getProperty('property-1').subscribe(property => {
      expect(property.images?.map(image => image.url)).toEqual(['/first.jpg', '/main.jpg']);
      expect(property.images?.filter(image => image.url === '/main.jpg').length).toBe(1);
      done();
    });
  });
});
