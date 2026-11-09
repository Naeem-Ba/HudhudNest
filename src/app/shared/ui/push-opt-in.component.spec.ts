import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { PushRegistrationService } from '../../core/push/push-registration.service';
import { PushOptInComponent } from './push-opt-in.component';

describe('PushOptInComponent', () => {
  let fixture: ComponentFixture<PushOptInComponent>;
  let permission: ReturnType<typeof signal<'granted' | 'prompt' | 'denied' | 'unknown'>>;
  let push: { permission: typeof permission; enable: jasmine.Spy };

  function render(state: 'granted' | 'prompt' | 'denied' | 'unknown'): HTMLElement {
    permission.set(state);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    permission = signal<'granted' | 'prompt' | 'denied' | 'unknown'>('unknown');
    push = { permission, enable: jasmine.createSpy('enable').and.resolveTo(true) };
    TestBed.configureTestingModule({
      imports: [PushOptInComponent, TranslateModule.forRoot()],
      providers: [{ provide: PushRegistrationService, useValue: push }]
    });
    fixture = TestBed.createComponent(PushOptInComponent);
  });

  it('renders nothing on the web (unknown) or when notifications are already on', () => {
    expect(render('unknown').querySelector('.opt-in')).toBeNull();
    expect(render('granted').querySelector('.opt-in')).toBeNull();
  });

  it('offers a button while the permission has not been asked, and the button asks', async () => {
    const root = render('prompt');
    const button = root.querySelector<HTMLButtonElement>('.opt-in__btn');

    expect(button).not.toBeNull();
    button!.click();
    await fixture.whenStable();

    expect(push.enable).toHaveBeenCalledTimes(1);
  });

  it('shows only a hint (no button) once the system permission was refused', () => {
    const root = render('denied');

    expect(root.querySelector('.opt-in__btn')).toBeNull();
    expect(root.querySelector('.opt-in--note')).not.toBeNull();
  });
});
