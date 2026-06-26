import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ContactMessageDto, ContactService } from '../../core/api/contact.service';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-message-detail',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './message-details.component.html',
  styleUrls: ['./message-details.component.scss']
})
export class MessageDetailComponent implements OnInit {
  message: ContactMessageDto | null = null;
  loading = true;
  id = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly contactService: ContactService
  ) {}

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';

    if (!this.id) {
      console.error('لم يتم العثور على معرف الرسالة في الرابط.');
      this.loading = false;
      this.router.navigate(['/admin/messages']);
      return;
    }

    this.loadMessage();
  }

  loadMessage(): void {
    this.loading = true;

    this.contactService.getMessageById(this.id).subscribe({
      next: (res) => {
        this.message = res;
        this.loading = false;

        if (!this.isMessageRead(res)) {
          this.setAsRead();
        }
      },
      error: (err) => {
        console.error('خطأ جلب الرسالة:', err);
        this.loading = false;
      }
    });
  }

  setAsRead(): void {
    if (!this.id || !this.message) {
      return;
    }

    this.contactService.markAsRead(this.id).subscribe({
      next: () => {
        if (this.message) {
          this.message.isRead = true;
          this.message.IsRead = true;
        }
      },
      error: (err) => {
        console.error('خطأ تحديد الرسالة كمقروءة:', err);
      }
    });
  }

  deleteMessage(): void {
    if (!this.id) {
      return;
    }

    if (!confirm('هل أنت متأكد أنك تريد حذف الرسالة؟')) {
      return;
    }

    this.contactService.deleteMessage(this.id).subscribe({
      next: () => {
        alert('تم حذف الرسالة');
        this.router.navigate(['/admin/messages']);
      },
      error: (err) => {
        console.error('خطأ عند الحذف:', err);
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/admin/messages']);
  }

  private isMessageRead(message: ContactMessageDto): boolean {
    return message.isRead ?? message.IsRead ?? false;
  }
}