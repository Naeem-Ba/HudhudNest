import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ToastMessage, ToastService } from '../services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="toast-stack" aria-live="polite" aria-atomic="true">
      <article
        *ngFor="let toast of toastService.toasts(); trackBy: trackById"
        class="toast"
        [class.success]="toast.type === 'success'"
        [class.error]="toast.type === 'error'"
        [class.warning]="toast.type === 'warning'"
        [class.info]="toast.type === 'info'"
        role="status"
      >
        <span class="toast-icon" aria-hidden="true">{{ getIcon(toast.type) }}</span>

        <div class="toast-content">
          <strong *ngIf="toast.title">{{ toast.title }}</strong>
          <p>{{ toast.message }}</p>
        </div>

        <button type="button" class="toast-close" (click)="toastService.remove(toast.id)" aria-label="إغلاق">
          ×
        </button>
      </article>
    </section>
  `,
  styles: [`
    .toast-stack {
      position: fixed;
      inset-block-start: 1rem;
      inset-inline-end: 1rem;
      z-index: 10000;
      display: grid;
      gap: .75rem;
      width: min(420px, calc(100vw - 2rem));
      /* عدّة تنبيهات متزامنة (مثل فشل طلبات API متعددة) لا يجب أن تغطي
         الشاشة كاملة على الهاتف — الحزمة تصبح قابلة للتمرير بدل ذلك. */
      max-height: calc(100dvh - 2rem);
      overflow-y: auto;
      overscroll-behavior: contain;
      pointer-events: none;
    }

    .toast {
      pointer-events: auto;
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: .75rem;
      align-items: start;
      padding: .9rem 1rem;
      border-radius: 14px;
      background: var(--surface);
      color: var(--gray-800);
      box-shadow: var(--shadow-lg);
      border-inline-start: 5px solid var(--primary);
      animation: toast-in .18s ease-out;
    }

    .toast.success { border-inline-start-color: var(--success); }
    .toast.error { border-inline-start-color: var(--danger); }
    .toast.warning { border-inline-start-color: var(--warning); }
    .toast.info { border-inline-start-color: var(--info); }

    .toast-icon {
      font-size: 1.1rem;
      line-height: 1.5;
    }

    .toast-content strong {
      display: block;
      margin-bottom: .15rem;
      font-size: .95rem;
    }

    .toast-content p {
      margin: 0;
      line-height: 1.5;
      font-size: .92rem;
      overflow-wrap: anywhere;
    }

    .toast-close {
      border: 0;
      background: transparent;
      color: var(--gray-500);
      font-size: 1.25rem;
      line-height: 1;
      cursor: pointer;
      padding: .1rem;
    }

    .toast-close:hover {
      color: var(--gray-800);
    }

    @keyframes toast-in {
      from { opacity: 0; transform: translateY(-6px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class ToastContainerComponent {
  readonly toastService = inject(ToastService);

  trackById(_: number, toast: ToastMessage): number {
    return toast.id;
  }

  getIcon(type: ToastMessage['type']): string {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '⚠️';
      case 'warning': return '⚠️';
      default: return 'ℹ️';
    }
  }
}
