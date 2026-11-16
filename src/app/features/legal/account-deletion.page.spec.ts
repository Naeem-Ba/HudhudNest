import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { LanguageService } from '../../core/services/language.service';
import { PageMetaService } from '../../core/services/page-meta.service';
import { ACCOUNT_DELETION_CONTENT, DeletionBlock } from './account-deletion.content';
import { AccountDeletionPage, parseInline } from './account-deletion.page';

// P5-D02: the page used to be fixed Arabic text, which the Play and App Store reviewers cannot
// read. It now ships in ar/en/de/tr, follows the app language and lets the reader switch.
describe('AccountDeletionPage', () => {
  function render(appLang?: 'ar' | 'en' | 'de' | 'tr') {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [provideRouter([])]
    });
    if (appLang) {
      TestBed.inject(LanguageService).use(appLang, 'ephemeral');
    }
    const applyDynamic = spyOn(TestBed.inject(PageMetaService), 'applyDynamic');
    const fixture = TestBed.createComponent(AccountDeletionPage);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement, applyDynamic };
  }

  function lastMetaTitle(applyDynamic: jasmine.Spy): string {
    return applyDynamic.calls.mostRecent().args[0].title;
  }

  it('✅ يعرض العربية بـ RTL افتراضيًا ويذكر اسم التطبيق الحالي "هدهد نيست" لا "عقاراتك"', () => {
    const { root } = render('ar');
    const section = root.querySelector('section.legal');
    const text = root.textContent ?? '';

    expect(section?.getAttribute('dir')).toBe('rtl');
    expect(section?.getAttribute('lang')).toBe('ar');
    expect(text).toContain('في "هدهد نيست"');
    expect(text).not.toContain('في "عقاراتك"');
  });

  it('✅ يتبع لغة التطبيق: الإنجليزية LTR مع عنوان الصفحة بالإنجليزية', () => {
    const { root, applyDynamic } = render('en');
    const section = root.querySelector('section.legal');

    expect(section?.getAttribute('dir')).toBe('ltr');
    expect(section?.getAttribute('lang')).toBe('en');
    expect(root.querySelector('h1')?.textContent).toContain('Delete your account');
    expect(root.textContent).toContain('deletion is scheduled for 30 days later');
    expect(lastMetaTitle(applyDynamic)).toBe(ACCOUNT_DELETION_CONTENT.en.metaTitle);
  });

  it('✅ يعرض الألمانية LTR', () => {
    const { root } = render('de');

    expect(root.querySelector('section.legal')?.getAttribute('lang')).toBe('de');
    expect(root.querySelector('h1')?.textContent).toContain('Konto löschen');
  });

  it('✅ يعرض التركية LTR مع الحفاظ على حروف İ/ı والعنوان التركي', () => {
    const { root, applyDynamic } = render('tr');
    const section = root.querySelector('section.legal');

    expect(section?.getAttribute('dir')).toBe('ltr');
    expect(section?.getAttribute('lang')).toBe('tr');
    expect(root.querySelector('h1')?.textContent).toContain('Hesabınızı silin');
    expect(root.textContent).toContain('silme işlemi 30 gün sonrasına planlanır');
    expect(lastMetaTitle(applyDynamic)).toBe(ACCOUNT_DELETION_CONTENT.tr.metaTitle);
  });

  it('✅ أزرار اللغة تبدّل لغة الصفحة وحدها دون لغة التطبيق، وتحدّث العنوان', () => {
    const { fixture, root, applyDynamic } = render('ar');
    const languages = TestBed.inject(LanguageService);
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('.legal__lang'));

    expect(buttons.map(b => b.getAttribute('lang'))).toEqual(['ar', 'en', 'de', 'tr']);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');

    buttons[1].click();
    fixture.detectChanges();

    expect(root.querySelector('section.legal')?.getAttribute('lang')).toBe('en');
    expect(root.querySelector('section.legal')?.getAttribute('dir')).toBe('ltr');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(lastMetaTitle(applyDynamic)).toBe(ACCOUNT_DELETION_CONTENT.en.metaTitle);
    expect(languages.getCurrent()).toBe('ar');
  });

  it('✅ يبقى رابط البريد الداعم والرابط إلى سياسة الخصوصية في كل لغة', () => {
    for (const lang of ['ar', 'en', 'de', 'tr'] as const) {
      TestBed.resetTestingModule();
      const { root } = render(lang);

      const mail = root.querySelector<HTMLAnchorElement>('a[href^="mailto:support@hudhudnest.com"]');
      expect(mail).withContext(lang).not.toBeNull();
      expect(root.querySelector('a[href="/privacy-policy"]')).withContext(lang).not.toBeNull();
    }
  });

  it('✅ النصوص الأربعة بنفس البنية (أقسام وقوائم وعدد العناصر) حتى لا يسقط قسم من لغة', () => {
    const shape = (blocks: DeletionBlock[]) =>
      blocks.map(block => ('p' in block ? 'p' : 'ul' in block ? `ul${block.ul.length}` : `ol${block.ol.length}`));
    const reference = ACCOUNT_DELETION_CONTENT.ar.sections.map(s => shape(s.blocks));

    for (const lang of ['en', 'de', 'tr'] as const) {
      expect(ACCOUNT_DELETION_CONTENT[lang].sections.map(s => shape(s.blocks))).withContext(lang).toEqual(reference);
    }
  });

  it('✅ parseInline يفصل الخط العريض والروابط ولا يحقن HTML', () => {
    const segments = parseInline('أ **ب** [ج](/د) <b>x</b>');

    expect(segments.map(s => s.bold)).toEqual([false, true, false]);
    expect(segments[1].parts[0]).toEqual({ kind: 'text', text: 'ب' });
    expect(segments[2].parts.some(p => p.kind === 'route' && p.href === '/د')).toBeTrue();
    expect(segments[2].parts.at(-1)).toEqual({ kind: 'text', text: ' <b>x</b>' });
  });
});
