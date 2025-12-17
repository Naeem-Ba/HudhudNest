import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { ContactService } from '../services/contact.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-kontakt',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  constructor(private contactService: ContactService ) {}

  onSubmit(form: NgForm) {
    // مارك الحقول كـ touched لعرض الرسائل لو لازم
    form.control.markAllAsTouched();

    if (form.invalid) {
      this.success = false;
      this.messageText = 'Bitte füllen Sie alle erforderlichen Felder korrekt aus.';
      return;
    }

    this.sending = true;
    this.messageText = '';
    this.contactService.sendContact(this.model).subscribe({
      next: (res) => {
        this.sending = false;
        this.success = true;
        this.messageText = 'Ihre Nachricht wurde erfolgreich gesendet. Wir melden uns bald bei Ihnen.';
        form.resetForm();
      },
      error: (err) => {
        console.error('Kontakt senden Fehler', err);
        this.sending = false;
        this.success = false;
        this.messageText = 'Beim Senden ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.';
      }
    });
  }
}
