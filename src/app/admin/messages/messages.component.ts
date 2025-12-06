import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router,RouterLink} from '@angular/router';
import { ContactService } from '../../services/contact.service';

@Component({
  selector: 'app-admin-messages',
  standalone: true,
  imports: [CommonModule,RouterLink],
  templateUrl: './messages.component.html',
  styleUrls: ['./messages.component.scss']
})
export class AdminMessagesComponent implements OnInit {

  messages: any[] = [];
  loading = true;

  constructor(private contactService: ContactService,   private router: Router ) {}

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
    goBack() {
    this.router.navigate(['/home']);
  }
}
