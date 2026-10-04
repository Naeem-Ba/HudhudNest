import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { PendingDeletionBannerComponent } from './pending-deletion-banner.component';
import { AuthService } from '../../core/auth/auth.service';
import { ProfileService, UserProfile } from '../../core/api/profile.service';
import { ToastService } from '../services/toast.service';

@Component({ standalone: true, template: '' })
class BlankPage {}

describe('PendingDeletionBannerComponent', () => {
  let fixture: ComponentFixture<PendingDeletionBannerComponent>;
  let loggedIn: BehaviorSubject<boolean>;
  let profile: BehaviorSubject<UserProfile | null>;
  let cancelAccountDeletion: jasmine.Spy;
  let toast: jasmine.SpyObj<ToastService>;
  let router: Router;

  const banner = () =>
    (fixture.nativeElement as HTMLElement).querySelector('.pending-deletion');

  beforeEach(async () => {
    loggedIn = new BehaviorSubject(true);
    profile = new BehaviorSubject<UserProfile | null>(null);
    cancelAccountDeletion = jasmine.createSpy('cancelAccountDeletion').and.callFake(() => {
      profile.next({ id: 'u1', DeletionScheduledFor: null });
      return of(profile.value);
    });
    toast = jasmine.createSpyObj<ToastService>('ToastService', ['success', 'error']);

    await TestBed.configureTestingModule({
      imports: [PendingDeletionBannerComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([
          { path: 'home', component: BlankPage },
          { path: 'profile', component: BlankPage }
        ]),
        { provide: AuthService, useValue: { isLoggedIn$: loggedIn.asObservable() } },
        { provide: ProfileService, useValue: { profile$: profile.asObservable(), cancelAccountDeletion } },
        { provide: ToastService, useValue: toast }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(PendingDeletionBannerComponent);
    fixture.detectChanges();
  });

  it('is hidden when no deletion is pending', () => {
    profile.next({ id: 'u1', DeletionScheduledFor: null });
    fixture.detectChanges();
    expect(banner()).toBeNull();
  });

  it('shows while a deletion is pending and hides once it is cancelled', () => {
    profile.next({ id: 'u1', DeletionScheduledFor: '2026-11-03T10:00:00Z' });
    fixture.detectChanges();
    expect(banner()).not.toBeNull();

    (banner()!.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(cancelAccountDeletion).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalled();
    expect(banner()).toBeNull();
  });

  it('keeps the banner and reports an error when cancelling fails', () => {
    cancelAccountDeletion.and.returnValue(throwError(() => ({ status: 500 })));
    profile.next({ id: 'u1', DeletionScheduledFor: '2026-11-03T10:00:00Z' });
    fixture.detectChanges();

    (banner()!.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(toast.error).toHaveBeenCalled();
    expect(banner()).not.toBeNull();
  });

  it('is hidden when signed out, and on /profile which shows the same state itself', fakeAsync(() => {
    profile.next({ id: 'u1', DeletionScheduledFor: '2026-11-03T10:00:00Z' });

    void router.navigateByUrl('/profile');
    tick();
    fixture.detectChanges();
    expect(banner()).toBeNull();

    void router.navigateByUrl('/home');
    tick();
    fixture.detectChanges();
    expect(banner()).not.toBeNull();

    loggedIn.next(false);
    fixture.detectChanges();
    expect(banner()).toBeNull();
  }));
});
