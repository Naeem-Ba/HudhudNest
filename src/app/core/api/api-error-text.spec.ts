import { HttpErrorResponse } from '@angular/common/http';

import { apiErrorText } from './api-error-text';

describe('apiErrorText (P16-D04 stopgap)', () => {
  const arabic = new HttpErrorResponse({ status: 409, error: { message: 'لا يمكن إتمام الحجز في هذه الفترة.' } });
  const english = new HttpErrorResponse({ status: 409, error: { message: 'This period is not available.' } });
  let original: string;

  beforeEach(() => { original = document.documentElement.lang; });
  afterEach(() => { document.documentElement.lang = original; });

  it('shows the API sentence as written when the site is in Arabic', () => {
    document.documentElement.lang = 'ar';
    expect(apiErrorText(arabic)).toBe('لا يمكن إتمام الحجز في هذه الفترة.');
  });

  it('hides an Arabic sentence from a visitor reading English or German, so the caller shows its translated text', () => {
    for (const lang of ['en', 'de']) {
      document.documentElement.lang = lang;
      expect(apiErrorText(arabic)).withContext(lang).toBeNull();
    }
  });

  it('still shows a sentence that is already readable (Latin script) in any language', () => {
    document.documentElement.lang = 'de';
    expect(apiErrorText(english)).toBe('This period is not available.');
  });

  it('applies to a plain-string body too, and never to 5xx', () => {
    document.documentElement.lang = 'en';
    expect(apiErrorText(new HttpErrorResponse({ status: 400, error: 'نص عربي' }))).toBeNull();
    expect(apiErrorText(new HttpErrorResponse({ status: 500, error: { message: 'boom' } }))).toBeNull();
  });
});
