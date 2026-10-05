import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { AccountDeletionPage } from './account-deletion.page';

// The page is fixed Arabic text shown under any UI language. It must carry its own direction,
// and must name the app by its current name.
describe('AccountDeletionPage', () => {
  function render(): HTMLElement {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [provideRouter([])]
    });
    const fixture = TestBed.createComponent(AccountDeletionPage);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('✅ يفرض اتجاه RTL ولغة العربية على المحتوى مهما كانت لغة الواجهة', () => {
    const section = render().querySelector('section.legal');

    expect(section?.getAttribute('dir')).toBe('rtl');
    expect(section?.getAttribute('lang')).toBe('ar');
  });

  it('✅ يذكر اسم التطبيق الحالي "هدهد نيست" لا الاسم القديم "عقاراتك"', () => {
    const text = render().textContent ?? '';

    expect(text).toContain('في "هدهد نيست"');
    expect(text).not.toContain('في "عقاراتك"');
  });
});
