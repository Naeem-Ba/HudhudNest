// =====================================================================
// FavoritesPage — the heart on a card removes the property from the list at once, and the list
// is the server's own (GET /favorites).
// =====================================================================
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { FavoritesApiService } from '../../core/api/favorites-api.service';
import { FavoritesPage } from './favorites.page';

describe('FavoritesPage', () => {
  function create() {
    const favoritesApi = jasmine.createSpyObj('FavoritesApiService', ['getFavorites']);
    favoritesApi.getFavorites.and.returnValue(of([
      { propertyId: 'a', property: { title: 'شقة أ' } },
      { propertyId: 'b', property: { title: 'شقة ب' } }
    ]));

    TestBed.configureTestingModule({
      imports: [FavoritesPage, TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: FavoritesApiService, useValue: favoritesApi }]
    });
    return TestBed.createComponent(FavoritesPage).componentInstance;
  }

  it('✅ loads the favorites from the server', () => {
    const page = create();

    expect(page.favorites().length).toBe(2);
  });

  it('✅ un-favoriting a card drops it from the list at once', () => {
    const page = create();

    page.onFavoriteChanged('a', false);

    expect(page.favorites().map(f => page.getPropertyId(f))).toEqual(['b']);
  });

  it('✅ a heart that ends up favorited (e.g. re-added) leaves the list alone', () => {
    const page = create();

    page.onFavoriteChanged('a', true);

    expect(page.favorites().length).toBe(2);
  });
});
