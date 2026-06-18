import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ContactService } from '../services/contact.service';
import { ToastService } from '../shared/services/toast.service';

@Component({
  selector: 'app-kontakt',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './kontakt.component.html',
  styleUrls: ['./kontakt.component.scss']
})
export class KontaktComponent {
  model = {
    Name: '',
    Email: '',
    Subject: '',
    Message: ''
  };

  sending = false;
  messageText = '';
  success = false;
  submitted = false;

  constructor(
    private readonly contactService: ContactService,
    private readonly translate: TranslateService,
    private readonly toast: ToastService
  ) {}

  onSubmit(form: NgForm): void {
    this.submitted = true;
    form.control.markAllAsTouched();

    if (form.invalid) {
      this.success = false;
      this.messageText = this.translate.instant('KONTAKT.error_validation');
      this.toast.error(this.messageText);
      return;
    }

    this.sending = true;
    this.messageText = '';

    this.contactService.sendContact(this.model).subscribe({
      next: () => {
        this.sending = false;
        this.success = true;
        this.submitted = false;
        this.messageText = this.translate.instant('KONTAKT.success_msg');
        this.toast.success(this.messageText);
        form.resetForm();
      },
      error: err => {
        console.error('Kontakt senden Fehler', err);
        this.sending = false;
        this.success = false;
        this.messageText = this.translate.instant('KONTAKT.error_msg');
        this.toast.error(this.messageText);
      }
    });
  }
}
