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

import { CONTACT_REASONS, KontaktComponent } from './contact.component';
import { ProfileService, UserProfile } from '../../core/api/profile.service';

function makeActivatedRoute(queryParams: Record<string, string>): ActivatedRoute {
  return {
    snapshot: { queryParamMap: convertToParamMap(queryParams) }
  } as unknown as ActivatedRoute;
}

describe('KontaktComponent — query-param prefills', () => {
  function build(queryParams: Record<string, string>, profile: Partial<UserProfile> | null = null, translations: Parameters<TranslateService['setTranslation']>[1] | null = null) {
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

    if (translations) {
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('en', translations);
      translate.use('en');
    }

    const fixture = TestBed.createComponent(KontaktComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('✅ "?ref=<guid>": يُكتب مرجع طلب الخطة في أول سطر من الرسالة الفارغة', () => {
    const component = build(
      { plan: 'basic', ref: '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b' },
      null,
      { KONTAKT: { PLAN_REF_LINE: 'Plan request reference: {{ref}}' } }
    );
    expect(component.model.Message).toBe('Plan request reference: 3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b\n\n');
  });

  it('✅ "?ref=" غير صالح لا يُكتب في النموذج', () => {
    const component = build({ plan: 'basic', ref: '<script>alert(1)</script>' });
    expect(component.model.Message).toBe('');
  });

  it('✅ "?intent=service-provider" (روابط قديمة): يختار سبب "مزوّد خدمة" ويغيّر نص التلميح', () => {
    const component = build({ intent: 'service-provider' });

    expect(component.reason).toBe('provider');
    expect(component.serviceProviderIntent).toBeTrue();
    expect(component.messagePlaceholderKey).toBe('KONTAKT.REASONS.PROVIDER.PLACEHOLDER');
  });

  it('✅ "?reason=privacy": يختار السبب صراحةً ويرسل العنوان الألماني الثابت', () => {
    const component = build({ reason: 'privacy' });

    expect(component.reason).toBe('privacy');
    expect(component.buildSubject()).toBe('Datenschutz & Datenanfrage');
  });

  it('✅ "?reason=" غير معروف يُتجاهل ويبقى السبب العام', () => {
    const component = build({ reason: '<script>' });

    expect(component.reason).toBe('general');
    expect(component.buildSubject()).toBe('Allgemeine Frage');
  });

  it('✅ "?plan=basic": سبب الباقات والعنوان يذكر الباقة', () => {
    const component = build({ plan: 'basic' });

    expect(component.reason).toBe('plans');
    expect(component.buildSubject()).toBe('Pakete, Zahlung & Rechnung (basic)');
  });

  it('✅ "?plan=" غير صالح لا يغيّر السبب ولا يظهر في العنوان', () => {
    const component = build({ plan: 'hacker' });

    expect(component.reason).toBe('general');
    expect(component.buildSubject()).toBe('Allgemeine Frage');
  });

  it('✅ "?ref=<guid>" وحده (من صفحة الدفع): سبب الباقات', () => {
    const component = build({ ref: '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b' });

    expect(component.reason).toBe('plans');
  });

  it('✅ "?intent=service-provider" لمستخدم مسجَّل دخول: يملأ الاسم والبريد من الملف الشخصي المخزَّن', () => {
    const component = build(
      { intent: 'service-provider' },
      { Email: 'host@example.com', DisplayName: 'مضيف تجريبي' }
    );

    expect(component.model.Email).toBe('host@example.com');
    expect(component.model.Name).toBe('مضيف تجريبي');
  });

  it('✅ بلا أي query param: السبب العام والنموذج فارغ', () => {
    const component = build({});

    expect(component.reason).toBe('general');
    expect(component.model.Message).toBe('');
    expect(component.messagePlaceholderKey).toBe('KONTAKT.REASONS.GENERAL.PLACEHOLDER');
  });

  it('✅ كل سبب له تسمية وتلميح وعنوان ألماني غير فارغ', () => {
    expect(CONTACT_REASONS.length).toBe(6);
    for (const r of CONTACT_REASONS) {
      expect(r.subject.length).toBeGreaterThan(2);
      expect(r.labelKey).toContain(r.code.toUpperCase());
      expect(r.placeholderKey).toContain(r.code.toUpperCase());
    }
  });
});
