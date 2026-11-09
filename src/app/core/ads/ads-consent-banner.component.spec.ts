import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { ADS_DISABLED, AdsEnvironment } from '../../../environments/environment.model';
import { AdsConsentBannerComponent } from './ads-consent-banner.component';
import { ADS_ENVIRONMENT, ADS_PLATFORM } from './ads-config.service';
import { ADS_CONSENT_STORAGE_KEY, AdsConsentService } from './ads-consent.service';

describe('AdsConsentBannerComponent', () => {
  beforeEach(() => localStorage.removeItem(ADS_CONSENT_STORAGE_KEY));
  afterEach(() => localStorage.removeItem(ADS_CONSENT_STORAGE_KEY));

  function render(env: Partial<AdsEnvironment>) {
    TestBed.configureTestingModule({
      imports: [AdsConsentBannerComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ADS_ENVIRONMENT, useValue: { ...ADS_DISABLED, ...env } },
        { provide: ADS_PLATFORM, useValue: 'web' }
      ]
    });
    const f = TestBed.createComponent(AdsConsentBannerComponent);
    f.detectChanges();
    return f;
  }

  it('is absent while ads are disabled (default)', () => {
    expect(render({}).nativeElement.querySelector('section')).toBeNull();
  });

  it('asks once when web ads are enabled, offers equal accept/decline, and remembers the answer', () => {
    const f = render({ enabled: true, webEnabled: true });
    const buttons = f.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    expect(buttons.length).toBe(2);
    buttons[0].click();
    f.detectChanges();
    expect(f.nativeElement.querySelector('section')).toBeNull();
    expect(TestBed.inject(AdsConsentService).state()).toBe('denied');
  });

  it('reappears when the visitor reopens their choices', () => {
    localStorage.setItem(ADS_CONSENT_STORAGE_KEY, JSON.stringify({ v: 1, choice: 'granted' }));
    const f = render({ enabled: true, webEnabled: true });
    expect(f.nativeElement.querySelector('section')).toBeNull();
    TestBed.inject(AdsConsentService).reopen();
    f.detectChanges();
    expect(f.nativeElement.querySelector('section')).not.toBeNull();
  });
});
