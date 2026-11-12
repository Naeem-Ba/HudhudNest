import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { LanguageService } from '../../../core/services/language.service';
import { WaitlistService } from './waitlist.service';
import { WAITLIST_INTERESTS, WaitlistInterest, normalizeContact } from './waitlist.validation';

export type WaitlistFormState = 'idle' | 'loading' | 'success' | 'error' | 'unavailable';

/**
 * The waitlist form in a native <dialog>: the browser traps focus, closes on Escape and makes the page behind inert.
 * One field takes an email address OR a WhatsApp number (told apart by the "@"). A hidden honeypot field catches
 * bots; a filled one gets a normal-looking success and nothing is sent. Opened through WaitlistService.open().
 */
@Component({
  selector: 'app-waitlist-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './waitlist-dialog.component.html',
  styleUrl: './waitlist-dialog.component.scss'
})
export class WaitlistDialogComponent {
  private readonly waitlist = inject(WaitlistService);
  private readonly language = inject(LanguageService);
  private readonly fb = inject(FormBuilder);
  private readonly dialogEl = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  readonly interests = WAITLIST_INTERESTS;
  readonly state = signal<WaitlistFormState>('idle');
  readonly submitted = signal(false);

  readonly form = this.fb.nonNullable.group({
    contact: ['', [Validators.required, c => (normalizeContact(c.value) ? null : { contact: true })]],
    interest: ['' as WaitlistInterest | ''],
    consent: [false, Validators.requiredTrue],
    website: [''] // honeypot: real visitors never see or fill it
  });

  constructor() {
    effect(() => {
      const { open, interest } = this.waitlist.dialog();
      const el = this.dialogEl().nativeElement;
      if (open && !el.open) {
        this.reset(interest);
        el.showModal();
      } else if (!open && el.open) {
        el.close();
      }
    });
  }

  close(): void {
    this.waitlist.close();
  }

  /** Native close (Escape key) keeps the service state in sync. */
  onNativeClose(): void {
    if (this.waitlist.dialog().open) {
      this.waitlist.close();
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialogEl().nativeElement) {
      this.close();
    }
  }

  invalid(name: 'contact' | 'consent'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  async submit(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.state() === 'loading') {
      return;
    }
    const value = this.form.getRawValue();
    if (value.website.trim().length > 0) {
      this.state.set('success'); // bot: look successful, store nothing
      return;
    }
    const contact = normalizeContact(value.contact);
    if (!contact) {
      return;
    }
    this.state.set('loading');
    const result = await this.waitlist.submit({
      contact: contact.value,
      contactType: contact.type,
      interest: value.interest === '' ? null : value.interest,
      language: this.language.getCurrent()
    });
    this.state.set(result === 'ok' ? 'success' : result === 'unavailable' ? 'unavailable' : 'error');
  }

  private reset(interest: WaitlistInterest | null): void {
    this.form.reset({ contact: '', interest: interest ?? '', consent: false, website: '' });
    this.submitted.set(false);
    this.state.set('idle');
  }
}
