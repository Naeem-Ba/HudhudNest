import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ContactService } from '../../services/contact.service';

@Component({
  selector: 'app-message-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './message-details.component.html',
  styleUrls: ['./message-details.component.scss']
})
export class MessageDetailComponent implements OnInit {

  message: any = null;
  loading = true;
  id!: number;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private contactService: ContactService
  ) {}

  ngOnInit(): void {
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    this.loadMessage();
  }

  loadMessage() {
    this.contactService.getMessageById(this.id).subscribe({
      next: (res) => {
        this.message = res;
        this.loading = false;

        // إذا لم تكن مقروءة، اجعلها مقروءة
        if (!this.message.isRead) {
          this.setAsRead();
        }
      },
      error: (err) => {
        console.error("خطأ جلب الرسالة:", err);
        this.loading = false;
      }
    });
  }

  setAsRead() {
    this.contactService.markAsRead(this.id).subscribe({
      next: () => {
        this.message.isRead = true;
      },
      error: (err) => {
        console.error("خطأ تحديد الرسالة كمقروءة:", err);
      }
    });
  }

  deleteMessage() {
    if (!confirm("هل أنت متأكد أنك تريد حذف الرسالة؟")) return;

    this.contactService.deleteMessage(this.id).subscribe({
      next: () => {
        alert("تم حذف الرسالة");
        this.router.navigate(['/admin/messages']);
      },
      error: (err) => {
        console.error("خطأ عند الحذف:", err);
      }
    });
  }

  goBack() {
    this.router.navigate(['/admin/messages']);
  }
}
