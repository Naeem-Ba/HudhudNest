import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ContactMessageDto, ContactService } from '../../core/api/contact.service';
import { TranslateModule } from '@ngx-translate/core';


@Component({
  selector: 'app-admin-messages',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule],
  templateUrl: './messages.component.html',
  styleUrls: ['./messages.component.scss']
})
export class AdminMessagesComponent implements OnInit {

  messages: ContactMessageDto[] = [];
  loading = true;

  constructor(private readonly contactService: ContactService, private readonly router: Router) {}

  ngOnInit(): void {
    this.contactService.getMessages().subscribe({
      next: (res) => {
        this.messages = res;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }
  goBack(): void {
    this.router.navigate(['/home']);
  }
}
