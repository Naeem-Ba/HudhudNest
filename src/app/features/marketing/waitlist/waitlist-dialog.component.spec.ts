import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { LanguageService } from '../../../core/services/language.service';
import { WaitlistDialogComponent } from './waitlist-dialog.component';
import { WaitlistResult, WaitlistService, WaitlistSignup } from './waitlist.service';

describe('WaitlistDialogComponent', () => {
  let submit: jasmine.Spy<(s: WaitlistSignup) => Promise<WaitlistResult>>;
  let waitlist: WaitlistService;

  function create() {
    submit = jasmine.createSpy('submit').and.resolveTo('ok');
    TestBed.configureTestingModule({
      imports: [WaitlistDialogComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: LanguageService, useValue: { getCurrent: () => 'ar' } }
      ]
    });
    waitlist = TestBed.inject(WaitlistService);
    spyOn(waitlist, 'submit').and.callFake(submit);
    const fixture = TestBed.createComponent(WaitlistDialogComponent);
    fixture.detectChanges();
    return fixture;
  }

  function fill(fixture: ReturnType<typeof create>, values: { contact?: string; consent?: boolean; website?: string }) {
    fixture.detectChanges(); // lets the open-effect run (it resets the form with the preselected interest)
    fixture.componentInstance.form.patchValue(values);
  }

  it('opens as a modal dialog with the interest from the card preselected', () => {
    const fixture = create();
    waitlist.open('mieten');
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBeTrue();
    expect(fixture.componentInstance.form.controls.interest.value).toBe('mieten');
    waitlist.close();
    fixture.detectChanges();
    expect(dialog.open).toBeFalse();
  });

  it('does not send without a valid contact and without the consent, and shows both errors', async () => {
    const fixture = create();
    waitlist.open();
    fixture.detectChanges();
    await fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(submit).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#wl-contact-err')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('#wl-consent-err')).toBeTruthy();
  });

  it('rejects a valid contact when the consent box is not ticked', async () => {
    const fixture = create();
    waitlist.open();
    fill(fixture, { contact: 'a@b.de', consent: false });
    await fixture.componentInstance.submit();
    expect(submit).not.toHaveBeenCalled();
  });

  it('sends a normalised WhatsApp number with interest and the UI language, then shows success', async () => {
    const fixture = create();
    waitlist.open('kurz');
    fill(fixture, { contact: '0049 157 1234567', consent: true });
    await fixture.componentInstance.submit();
    expect(submit).toHaveBeenCalledOnceWith({ contact: '+491571234567', contactType: 'whatsapp', interest: 'kurz', language: 'ar' });
    expect(fixture.componentInstance.state()).toBe('success');
  });

  it('sends interest=null when none is chosen', async () => {
    const fixture = create();
    waitlist.open();
    fill(fixture, { contact: 'a@b.de', consent: true });
    await fixture.componentInstance.submit();
    expect(submit.calls.mostRecent().args[0].interest).toBeNull();
  });

  it('a filled honeypot looks like success but sends nothing', async () => {
    const fixture = create();
    waitlist.open();
    fill(fixture, { contact: 'a@b.de', consent: true, website: 'http://spam' });
    await fixture.componentInstance.submit();
    expect(submit).not.toHaveBeenCalled();
    expect(fixture.componentInstance.state()).toBe('success');
  });

  it('maps service results to the error and unavailable states', async () => {
    const fixture = create();
    waitlist.open();
    fill(fixture, { contact: 'a@b.de', consent: true });
    submit.and.resolveTo('error');
    await fixture.componentInstance.submit();
    expect(fixture.componentInstance.state()).toBe('error');
    submit.and.resolveTo('unavailable');
    await fixture.componentInstance.submit();
    expect(fixture.componentInstance.state()).toBe('unavailable');
  });

  it('the consent text links to /datenschutz', () => {
    const fixture = create();
    waitlist.open();
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('.wl__consent a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/datenschutz');
  });
});
