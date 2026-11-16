import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { NewsletterApiService } from '../../core/api/newsletter-api.service';
import { NewsletterTokenPage } from './newsletter-token.page';

describe('NewsletterTokenPage', () => {
  let api: jasmine.SpyObj<NewsletterApiService>;

  function create(mode: 'confirm' | 'unsubscribe', token: string | null) {
    api = jasmine.createSpyObj<NewsletterApiService>('NewsletterApiService', ['confirm', 'unsubscribe']);
    api.confirm.and.returnValue(of({ status: 'confirmed' }));
    api.unsubscribe.and.returnValue(of({ status: 'unsubscribed' }));
    TestBed.configureTestingModule({
      imports: [NewsletterTokenPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: NewsletterApiService, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { data: { mode }, queryParamMap: convertToParamMap(token ? { token } : {}) } }
        }
      ]
    });
    const fixture = TestBed.createComponent(NewsletterTokenPage);
    fixture.detectChanges();
    return fixture;
  }

  it('confirms at once with the token from the link', () => {
    const fixture = create('confirm', 'tok');
    expect(api.confirm).toHaveBeenCalledWith('tok');
    expect(fixture.nativeElement.querySelector('[data-testid="newsletter-done"]')).not.toBeNull();
  });

  it('unsubscribes only after the button is clicked, without sign-in', () => {
    const fixture = create('unsubscribe', 'unsub');
    expect(api.unsubscribe).not.toHaveBeenCalled();
    (fixture.nativeElement.querySelector('[data-testid="newsletter-unsubscribe"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(api.unsubscribe).toHaveBeenCalledWith('unsub');
    expect(fixture.nativeElement.querySelector('[data-testid="newsletter-done"]')).not.toBeNull();
  });

  it('says the link is invalid on a 400 and calls nothing without a token', () => {
    const fixture = create('confirm', null);
    expect(api.confirm).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('NEWSLETTER.MISSING_TOKEN');
    TestBed.resetTestingModule();
    api = jasmine.createSpyObj<NewsletterApiService>('NewsletterApiService', ['confirm', 'unsubscribe']);
  });

  it('shows the invalid message when the API refuses the token', () => {
    api = jasmine.createSpyObj<NewsletterApiService>('NewsletterApiService', ['confirm', 'unsubscribe']);
    api.confirm.and.returnValue(throwError(() => ({ status: 400 })));
    TestBed.configureTestingModule({
      imports: [NewsletterTokenPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: NewsletterApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { data: { mode: 'confirm' }, queryParamMap: convertToParamMap({ token: 'old' }) } } }
      ]
    });
    const fixture = TestBed.createComponent(NewsletterTokenPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('NEWSLETTER.CONFIRM_INVALID');
  });
});
