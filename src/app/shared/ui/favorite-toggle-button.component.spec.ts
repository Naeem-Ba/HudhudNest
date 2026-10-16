// =====================================================================
// The heart: red when the property is a favorite (read from the shared FavoritesApiService
// state), clicking it adds/removes, and signed-out visitors are sent to log in instead.
// =====================================================================
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { FavoritesApiService, FavoritesLoadState } from '../../core/api/favorites-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../services/toast.service';
import { FavoriteToggleButtonComponent } from './favorite-toggle-button.component';

@Component({
  standalone: true,
  imports: [FavoriteToggleButtonComponent],
  template: `<app-favorite-toggle-button [propertyId]="id()" (changed)="changes.push($event)" />`
})
class HostComponent {
  readonly id = signal('p1');
  readonly changes: boolean[] = [];
}

describe('FavoriteToggleButtonComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let favoriteIds: ReturnType<typeof signal<ReadonlySet<string>>>;
  let loadState: ReturnType<typeof signal<FavoritesLoadState>>;
  let favoritesApi: { favoriteIds: typeof favoriteIds; loadState: typeof loadState; toggleFavorite: jasmine.Spy };
  let token: string | null;
  let toast: jasmine.SpyObj<ToastService>;
  let router: jasmine.SpyObj<Router>;

  const button = () => fixture.nativeElement.querySelector('button.fav-btn') as HTMLButtonElement;

  beforeEach(() => {
    favoriteIds = signal<ReadonlySet<string>>(new Set());
    loadState = signal<FavoritesLoadState>('ready');
    favoritesApi = {
      favoriteIds,
      loadState,
      toggleFavorite: jasmine.createSpy('toggleFavorite').and.callFake((id: string) => of(!favoriteIds().has(id)))
    };
    token = 'jwt';
    toast = jasmine.createSpyObj('ToastService', ['info', 'error']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      imports: [HostComponent, TranslateModule.forRoot()],
      providers: [
        { provide: FavoritesApiService, useValue: favoritesApi },
        { provide: AuthService, useValue: { getAccessToken: () => token } },
        { provide: ToastService, useValue: toast },
        { provide: Router, useValue: router }
      ]
    });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('✅ empty (not pressed) when the property is not a favorite', () => {
    expect(button().classList).not.toContain('fav-btn--active');
    expect(button().getAttribute('aria-pressed')).toBe('false');
  });

  it('✅ filled red (active) when the property is in the favorites — wherever the heart is shown', () => {
    favoriteIds.set(new Set(['p1']));
    fixture.detectChanges();

    expect(button().classList).toContain('fav-btn--active');
    expect(button().getAttribute('aria-pressed')).toBe('true');
    expect(button().querySelector('svg')!.getAttribute('fill')).toBe('currentColor');
  });

  it('✅ follows a change made elsewhere (another heart, the favorites page) without any click here', () => {
    favoriteIds.set(new Set(['p1']));
    fixture.detectChanges();
    favoriteIds.set(new Set());
    fixture.detectChanges();

    expect(button().classList).not.toContain('fav-btn--active');
  });

  it('✅ follows the propertyId input when the card is reused for another property', () => {
    favoriteIds.set(new Set(['p2']));
    fixture.componentInstance.id.set('p2');
    fixture.detectChanges();

    expect(button().classList).toContain('fav-btn--active');
  });

  it('✅ click toggles through the service and reports the new state', () => {
    button().click();
    fixture.detectChanges();

    expect(favoritesApi.toggleFavorite).toHaveBeenCalledOnceWith('p1');
    expect(fixture.componentInstance.changes).toEqual([true]);
  });

  it('✅ a click on a favorite asks to remove it', () => {
    favoriteIds.set(new Set(['p1']));
    fixture.detectChanges();

    button().click();

    expect(fixture.componentInstance.changes).toEqual([false]);
  });

  it('✅ a failed request shows the error toast and leaves the button usable', () => {
    favoritesApi.toggleFavorite.and.returnValue(throwError(() => new Error('boom')));

    button().click();
    fixture.detectChanges();

    expect(toast.error).toHaveBeenCalled();
    expect(button().disabled).toBeFalse();
    expect(fixture.componentInstance.changes).toEqual([]);
  });

  it('✅ a signed-out visitor is sent to the login page and nothing is requested', () => {
    token = null;

    button().click();

    expect(toast.info).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
    expect(favoritesApi.toggleFavorite).not.toHaveBeenCalled();
  });

  it('✅ disabled while the favorites are still loading, so the heart never acts on a guess', () => {
    loadState.set('loading');
    fixture.detectChanges();

    expect(button().disabled).toBeTrue();
  });
});
