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
      background: #fff;
      color: #1f2937;
      box-shadow: 0 18px 45px rgba(15, 23, 42, .18);
      border-inline-start: 5px solid #2563eb;
      animation: toast-in .18s ease-out;
    }

    .toast.success { border-inline-start-color: #16a34a; }
    .toast.error { border-inline-start-color: #dc2626; }
    .toast.warning { border-inline-start-color: #d97706; }
    .toast.info { border-inline-start-color: #2563eb; }

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
      color: #64748b;
      font-size: 1.25rem;
      line-height: 1;
      cursor: pointer;
      padding: .1rem;
    }

    .toast-close:hover {
      color: #111827;
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
