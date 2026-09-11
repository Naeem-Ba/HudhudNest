// =====================================================================
// ✅ Unit Tests – contact.component.spec.ts
// Covers the "?intent=service-provider" prefill added to reuse the existing
// contact form as the "become a service provider" application (see
// KontaktComponent.ngOnInit) — mirrors the pre-existing "?plan=" prefill.
// =====================================================================
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';

import { KontaktComponent } from './contact.component';
import { ProfileService, UserProfile } from '../../core/api/profile.service';

function makeActivatedRoute(queryParams: Record<string, string>): ActivatedRoute {
  return {
    snapshot: { queryParamMap: convertToParamMap(queryParams) }
  } as unknown as ActivatedRoute;
}

describe('KontaktComponent — query-param prefills', () => {
  function build(queryParams: Record<string, string>, profile: Partial<UserProfile> | null = null) {
    const profileSubject = new BehaviorSubject<UserProfile | null>(profile as UserProfile | null);

    TestBed.configureTestingModule({
      imports: [KontaktComponent, TranslateModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: makeActivatedRoute(queryParams) },
        { provide: ProfileService, useValue: { profile$: profileSubject.asObservable() } }
      ]
    });

    const fixture = TestBed.createComponent(KontaktComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('✅ عند تبديل اللغة: يُعاد ملء العنوان التلقائي بالترجمة الجديدة دون المساس بتعديل المستخدم', () => {
    const component = build({ intent: 'service-provider' });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('ar', { KONTAKT: { SERVICE_PROVIDER_SUBJECT: 'طلب بالعربية' } });
    translate.setTranslation('en', { KONTAKT: { SERVICE_PROVIDER_SUBJECT: 'English request' } });
    translate.setTranslation('de', { KONTAKT: { SERVICE_PROVIDER_SUBJECT: 'Deutsche Anfrage' } });
    translate.use('ar');

    const originalSubject = component.model.Subject;
    translate.use('en');
    expect(component.model.Subject).not.toBe(originalSubject); // re-translated, not frozen

    // A subject the visitor edited by hand must never be silently overwritten again.
    component.model.Subject = 'كتبته أنا بنفسي';
    translate.use('de');
    expect(component.model.Subject).toBe('كتبته أنا بنفسي');
  });

  it('✅ "?intent=service-provider": يملأ العنوان تلقائياً ويغيّر نص التلميح', () => {
    const component = build({ intent: 'service-provider' });

    expect(component.model.Subject).toBeTruthy();
    expect(component.messagePlaceholderKey).toBe('KONTAKT.SERVICE_PROVIDER_MESSAGE_PLACEHOLDER');
  });

  it('✅ "?intent=service-provider" لمستخدم مسجَّل دخول: يملأ الاسم والبريد من الملف الشخصي المخزَّن', () => {
    const component = build(
      { intent: 'service-provider' },
      { Email: 'host@example.com', DisplayName: 'مضيف تجريبي' }
    );

    expect(component.model.Email).toBe('host@example.com');
    expect(component.model.Name).toBe('مضيف تجريبي');
  });

  it('✅ بلا أي query param: النموذج يبقى فارغاً كما كان', () => {
    const component = build({});

    expect(component.model.Subject).toBe('');
    expect(component.messagePlaceholderKey).toBe('KONTAKT.message_placeholder');
  });
});
