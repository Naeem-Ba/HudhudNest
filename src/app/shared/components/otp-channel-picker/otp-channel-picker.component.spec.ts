// =====================================================================
// ✅ Unit Tests – otp-channel-picker / otp-channel-fallback
// The radio group semantics (keyboard + screen reader come from real radios), the "not available in
// your country" text under an unavailable channel, the fixed list of countries, and the manual fallback.
// Translations are not loaded, so the translate pipe renders the keys — enough to tell messages apart.
// =====================================================================
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { OtpChannel, OtpChannelOption } from '../../../core/models/auth.model';
import { OtpChannelFallbackComponent } from './otp-channel-fallback.component';
import { OtpChannelPickerComponent } from './otp-channel-picker.component';

function option(channel: OtpChannel, patch: Partial<OtpChannelOption> = {}): OtpChannelOption {
  return { channel, available: true, recommended: false, reason: null, unavailableCountryCodes: [], ...patch };
}

const OPTIONS: OtpChannelOption[] = [
  option('Sms'),
  option('Telegram', { recommended: true }),
  option('WhatsApp', {
    available: false,
    reason: 'COUNTRY_NOT_SUPPORTED',
    unavailableCountryCodes: ['+963', '+53', '+98', '+850', '+7']
  })
];

describe('OtpChannelPickerComponent', () => {
  let fixture: ComponentFixture<OtpChannelPickerComponent>;
  let component: OtpChannelPickerComponent;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const radios = (): HTMLInputElement[] => Array.from(el().querySelectorAll('input[type="radio"]'));

  function render(options = OPTIONS, selected: OtpChannel = 'Telegram', disabled = false): void {
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('selected', selected);
    fixture.componentRef.setInput('disabled', disabled);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [OtpChannelPickerComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(OtpChannelPickerComponent);
    component = fixture.componentInstance;
  });

  it('renders one radio per channel inside a labelled fieldset', () => {
    render();

    expect(el().querySelector('fieldset legend')?.textContent).toContain('AUTH.CHANNELS.TITLE');
    expect(radios().length).toBe(3);
    expect(el().textContent).toContain('AUTH.CHANNELS.NAMES.Sms');
    expect(el().textContent).toContain('AUTH.CHANNELS.NAMES.Telegram');
    expect(el().textContent).toContain('AUTH.CHANNELS.NAMES.WhatsApp');
  });

  it('checks the selected channel and marks the recommended one', () => {
    render();

    expect(radios().map(r => r.checked)).toEqual([false, true, false]);
    expect(el().querySelectorAll('.otp-channel__badge').length).toBe(1);
    expect(el().querySelector('.otp-channel--selected')?.textContent).toContain('AUTH.CHANNELS.NAMES.Telegram');
  });

  it('disables an unavailable channel and says, under it, that it is not available in the country', () => {
    render();

    const whatsApp = radios()[2];
    expect(whatsApp.disabled).toBeTrue();
    expect(whatsApp.checked).toBeFalse();
    const card = el().querySelectorAll('.otp-channel')[2];
    expect(card.classList).toContain('otp-channel--unavailable');
    expect(card.textContent).toContain('AUTH.CHANNELS.NOT_IN_YOUR_COUNTRY');
    expect(radios()[0].disabled).toBeFalse();
    expect(radios()[1].disabled).toBeFalse();
  });

  it('lists the countries where a channel does not work, by name when known and by code otherwise', () => {
    render();

    const note = el().querySelectorAll('.otp-channel')[2].textContent ?? '';
    expect(note).toContain('AUTH.CHANNELS.NOT_AVAILABLE_IN');
    for (const key of ['963', '53', '98', '850']) {
      expect(note).toContain(`AUTH.CHANNELS.COUNTRIES.${key}`);
    }
    expect(note).toContain('+7');
    expect(note).not.toContain('AUTH.CHANNELS.COUNTRIES.7');
  });

  it('shows no country note for a channel that works everywhere', () => {
    render();

    expect(el().querySelectorAll('.otp-channel')[0].textContent).not.toContain('NOT_AVAILABLE_IN');
    expect(el().querySelectorAll('.otp-channel')[0].textContent).not.toContain('NOT_IN_YOUR_COUNTRY');
  });

  it('emits the channel when an available radio is chosen', () => {
    render(OPTIONS, 'Sms');
    const emitted: OtpChannel[] = [];
    component.selectedChange.subscribe(channel => emitted.push(channel));

    radios()[1].click();

    expect(emitted).toEqual(['Telegram']);
  });

  it('never emits for an unavailable channel, even if it is triggered programmatically', () => {
    render();
    const emitted: OtpChannel[] = [];
    component.selectedChange.subscribe(channel => emitted.push(channel));

    component.pick(OPTIONS[2]);
    radios()[2].click();

    expect(emitted).toEqual([]);
  });

  it('disables every radio while a request is in flight', () => {
    render(OPTIONS, 'Sms', true);

    expect(el().querySelector('fieldset')?.disabled).toBeTrue();
    const emitted: OtpChannel[] = [];
    component.selectedChange.subscribe(channel => emitted.push(channel));
    component.pick(OPTIONS[1]);
    expect(emitted).toEqual([]);
  });

  it('ties every radio to its description for screen readers', () => {
    render();

    for (const radio of radios()) {
      const id = radio.getAttribute('aria-describedby');
      expect(id).toBeTruthy();
      expect(el().querySelector(`#${id}`)).not.toBeNull();
    }
  });

  it('lets the whole card be clicked and reached with the keyboard (native radios in labels)', () => {
    render(OPTIONS, 'Sms');
    const emitted: OtpChannel[] = [];
    component.selectedChange.subscribe(channel => emitted.push(channel));

    (el().querySelectorAll('.otp-channel')[1] as HTMLElement).click();

    expect(emitted).toEqual(['Telegram']);
    expect(radios().every(r => r.tabIndex >= -1)).toBeTrue();
  });
});

describe('OtpChannelFallbackComponent', () => {
  let fixture: ComponentFixture<OtpChannelFallbackComponent>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const buttons = (): HTMLButtonElement[] => Array.from(el().querySelectorAll('button'));

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [OtpChannelFallbackComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(OtpChannelFallbackComponent);
  });

  it('says which channel the code was sent through', () => {
    fixture.componentRef.setInput('sent', 'Telegram');
    fixture.detectChanges();

    expect(el().querySelector('[role="status"]')?.textContent).toContain('AUTH.CHANNELS.SENT_VIA');
  });

  it('offers one button per alternative, and none when there is no other channel', () => {
    fixture.componentRef.setInput('sent', 'Telegram');
    fixture.componentRef.setInput('alternatives', [option('Sms'), option('WhatsApp')]);
    fixture.detectChanges();

    expect(el().textContent).toContain('AUTH.CHANNELS.NO_CODE');
    expect(buttons().length).toBe(2);

    fixture.componentRef.setInput('alternatives', []);
    fixture.detectChanges();
    expect(buttons().length).toBe(0);
    expect(el().textContent).not.toContain('AUTH.CHANNELS.NO_CODE');
  });

  it('emits the chosen alternative (the person starts the switch — nothing is sent automatically)', () => {
    fixture.componentRef.setInput('sent', 'Telegram');
    fixture.componentRef.setInput('alternatives', [option('Sms')]);
    fixture.detectChanges();
    const emitted: OtpChannel[] = [];
    fixture.componentInstance.pick.subscribe(channel => emitted.push(channel));

    buttons()[0].click();

    expect(emitted).toEqual(['Sms']);
  });

  it('disables the buttons while a request is in flight', () => {
    fixture.componentRef.setInput('alternatives', [option('Sms')]);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();

    expect(buttons()[0].disabled).toBeTrue();
  });
});
