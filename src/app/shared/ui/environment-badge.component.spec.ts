import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { AppEnvironmentName } from '../../../environments/environment.model';
import { AuthService } from '../../core/auth/auth.service';
import { BackendApiService } from '../../core/api/backend-api.service';
import {
  APP_ENVIRONMENT_NAME,
  EnvironmentBadgeComponent,
  normalizeApiEnvironment
} from './environment-badge.component';

describe('normalizeApiEnvironment', () => {
  it('maps the backend environment names onto the app environment names', () => {
    expect(normalizeApiEnvironment('Production')).toBe('production');
    expect(normalizeApiEnvironment('Staging')).toBe('staging');
    expect(normalizeApiEnvironment('Development')).toBe('local');
  });

  it('returns null for unknown or missing values so no false mismatch is shown', () => {
    expect(normalizeApiEnvironment('Testing')).toBeNull();
    expect(normalizeApiEnvironment(undefined)).toBeNull();
  });
});

describe('EnvironmentBadgeComponent', () => {
  let isAdmin: BehaviorSubject<boolean>;
  let apiGet: jasmine.Spy;

  async function render(
    appEnv: AppEnvironmentName,
    admin: boolean,
    apiResponse: unknown = { environment: 'Production', version: '1.2.3', commitSha: '34aa6a89b1f4903a17da55daaba830863962e3e1' }
  ): Promise<ComponentFixture<EnvironmentBadgeComponent>> {
    isAdmin = new BehaviorSubject(admin);
    apiGet = jasmine
      .createSpy('get')
      .and.callFake(() => (apiResponse === 'fail' ? throwError(() => new Error('403')) : of(apiResponse)));

    await TestBed.configureTestingModule({
      imports: [EnvironmentBadgeComponent],
      providers: [
        { provide: APP_ENVIRONMENT_NAME, useValue: appEnv },
        { provide: AuthService, useValue: { isAdmin$: isAdmin.asObservable() } },
        { provide: BackendApiService, useValue: { get: apiGet } }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(EnvironmentBadgeComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const badge = (fixture: ComponentFixture<EnvironmentBadgeComponent>) =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-testid="environment-badge"]');

  it('shows a STAGING pill to ordinary users and never asks the API for its version', async () => {
    const fixture = await render('staging', false);

    expect(badge(fixture)?.textContent).toContain('STAGING');
    expect(badge(fixture)?.classList).toContain('env-staging');
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('shows nothing to ordinary users on Production', async () => {
    const fixture = await render('production', false);

    expect(badge(fixture)).toBeNull();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('shows admins on Production the green pill with the API environment, version and short commit', async () => {
    const fixture = await render('production', true);

    expect(apiGet).toHaveBeenCalledOnceWith('operational/version');
    const element = badge(fixture);
    expect(element?.classList).toContain('env-production');
    expect(element?.classList).not.toContain('env-mismatch');
    expect(element?.textContent).toContain('API: Production · v1.2.3 · 34aa6a8');
  });

  it('turns red and warns when the bundle and the API belong to different environments', async () => {
    const fixture = await render('staging', true, { environment: 'Production', version: '1', commitSha: 'abcdef1234567' });

    const element = badge(fixture);
    expect(element?.classList).toContain('env-mismatch');
    expect(element?.textContent).toContain('App and API environments differ');
  });

  it('does not flag a mismatch for an API environment it does not recognise', async () => {
    const fixture = await render('staging', true, { environment: 'Testing', version: '1', commitSha: 'unknown' });

    expect(badge(fixture)?.classList).not.toContain('env-mismatch');
    expect(badge(fixture)?.textContent).toContain('unknown');
  });

  it('keeps the plain pill when the version request fails', async () => {
    const fixture = await render('staging', true, 'fail');

    expect(badge(fixture)?.textContent).toContain('STAGING');
    expect(badge(fixture)?.textContent).not.toContain('API:');
  });
});
