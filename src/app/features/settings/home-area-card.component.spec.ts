import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { LookupsApiService, StructuredLocationLookup } from '../../core/api/lookups-api.service';
import { ProfileService, UserProfile } from '../../core/api/profile.service';
import { LanguageService } from '../../core/services/language.service';
import { PreferencesService } from '../../core/services/preferences.service';
import { HomeAreaCardComponent } from './home-area-card.component';

const GOVERNORATES: StructuredLocationLookup[] = [
  { id: 1, nameAr: 'دمشق', nameEn: 'Damascus' },
  { id: 3, nameAr: 'حلب', nameEn: 'Aleppo' }
];

describe('HomeAreaCardComponent', () => {
  let profile: jasmine.SpyObj<ProfileService>;

  function create(signedIn: boolean, homeGovernorateId: number | null = null) {
    profile = jasmine.createSpyObj('ProfileService', ['getMe', 'setHomeGovernorate']);
    profile.getMe.and.returnValue(of({ HomeGovernorateId: homeGovernorateId } as UserProfile));
    TestBed.configureTestingModule({
      imports: [HomeAreaCardComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ProfileService, useValue: profile },
        { provide: LookupsApiService, useValue: { getGovernorates: () => of(GOVERNORATES) } },
        { provide: LanguageService, useValue: { getCurrent: () => 'en' } },
        { provide: PreferencesService, useValue: { isSignedIn: signedIn } }
      ]
    });
    const fixture = TestBed.createComponent(HomeAreaCardComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('shows nothing to a signed-out visitor and loads nothing', () => {
    const fixture = create(false);

    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    expect(profile.getMe).not.toHaveBeenCalled();
  });

  it('lists the governorates in the current language and selects the saved area', () => {
    const fixture = create(true, 3);

    const options = Array.from<HTMLOptionElement>(fixture.nativeElement.querySelectorAll('option'));
    expect(options.map(o => o.textContent?.trim()).slice(1)).toEqual(['Damascus', 'Aleppo']);
    expect(options.find(o => o.selected)?.value).toBe('3');
  });

  it('saves the chosen governorate and shows what the server stored', () => {
    const fixture = create(true);
    profile.setHomeGovernorate.and.returnValue(of({ HomeGovernorateId: 1 } as UserProfile));

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    select.value = '1';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(profile.setHomeGovernorate).toHaveBeenCalledOnceWith(1);
    expect(Array.from<HTMLOptionElement>(fixture.nativeElement.querySelectorAll('option')).find(o => o.selected)?.value).toBe('1');
  });

  it('clears the area when "not set" is chosen', () => {
    const fixture = create(true, 3);
    profile.setHomeGovernorate.and.returnValue(of({ HomeGovernorateId: null } as UserProfile));

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    select.value = '';
    select.dispatchEvent(new Event('change'));

    expect(profile.setHomeGovernorate).toHaveBeenCalledOnceWith(null);
  });

  it('reports a failed save and keeps the previous selection', () => {
    const fixture = create(true, 3);
    profile.setHomeGovernorate.and.returnValue(throwError(() => new Error('422')));

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    select.value = '1';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.ha__error')).not.toBeNull();
    expect(Array.from<HTMLOptionElement>(fixture.nativeElement.querySelectorAll('option')).find(o => o.selected)?.value).toBe('3');
  });
});
