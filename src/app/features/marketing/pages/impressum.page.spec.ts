import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';

import { LanguageService } from '../../../core/services/language.service';
import { CONTROLLER_IDENTITY, missingOperatorFields } from '../../legal/controller-identity';
import { ImpressumPage } from './impressum.page';

describe('ImpressumPage', () => {
  function create(lang: 'ar' | 'en' | 'de' | 'tr' = 'de') {
    TestBed.configureTestingModule({
      imports: [ImpressumPage, TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: LanguageService, useValue: { currentLang$: new BehaviorSubject(lang) } }]
    });
    const fixture = TestBed.createComponent(ImpressumPage);
    fixture.detectChanges();
    return fixture;
  }

  it('shows only confirmed facts: trading name, correspondence city, the four mailboxes', () => {
    const text: string = create('de').nativeElement.textContent;
    expect(text).toContain(CONTROLLER_IDENTITY.displayName);
    expect(text).toContain('Damaskus, Arabische Republik Syrien');
    for (const mail of ['support@hudhudnest.com', 'legal@hudhudnest.com', 'privacy@hudhudnest.com', 'security@hudhudnest.com']) {
      expect(text).toContain(mail);
    }
    expect(text).not.toContain('[TODO');
    expect(text).not.toMatch(/GmbH|HRB|LLC/);
  });

  it('says openly that the provider information is incomplete while mandatory fields are missing', () => {
    const fixture = create('en');
    const notice = fixture.nativeElement.querySelector('[data-testid="impressum-incomplete"]');
    expect(missingOperatorFields().length).toBeGreaterThan(0);
    expect(notice).not.toBeNull();
    expect(notice.querySelectorAll('li').length).toBe(missingOperatorFields().length);
  });
});
