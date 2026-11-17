import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Capacitor } from '@capacitor/core';

import { digitalPurchaseGuard, digitalPurchasesAllowed } from './digital-purchases';

describe('digital purchases in the installed app', () => {
  const run = () =>
    TestBed.runInInjectionContext(() =>
      digitalPurchaseGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  it('the website may open the listing fee checkout', () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(false);
    expect(digitalPurchasesAllowed()).toBeTrue();
    expect(run()).toBeTrue();
  });

  it('the installed app is sent back to my listings', () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
    expect(digitalPurchasesAllowed()).toBeFalse();
    const result = run();
    expect(result instanceof UrlTree).toBeTrue();
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/my-listings');
  });
});
