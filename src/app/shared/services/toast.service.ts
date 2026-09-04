import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
  title?: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly messages = signal<ToastMessage[]>([]);
  readonly toasts = this.messages.asReadonly();

  show(message: string, type: ToastType = 'info', title?: string, durationMs = 5000): void {
    const trimmedMessage = message?.trim();

    if (!trimmedMessage) {
      return;
    }

    // على الهاتف تحديدًا، عدّة أخطاء متزامنة (مثل فشل عدة طلبات API دفعة واحدة)
    // كانت تكدّس نفس الرسالة كتنبيه منفصل لكل طلب فاشل، لتغطي كامل الشاشة.
    // تجاهل رسالة مكرّرة لا تزال معروضة بدل تكديسها.
    const alreadyShown = this.messages().some(
      item => item.message === trimmedMessage && item.type === type
    );
    if (alreadyShown) {
      return;
    }

    const id = Date.now() + Math.floor(Math.random() * 1000);
    const toast: ToastMessage = { id, message: trimmedMessage, type, title };

    this.messages.update(items => [toast, ...items].slice(0, 5));

    if (durationMs > 0) {
      window.setTimeout(() => this.remove(id), durationMs);
    }
  }

  success(message: string, title?: string): void {
    this.show(message, 'success', title);
  }

  error(message: string, title?: string): void {
    this.show(message, 'error', title, 7000);
  }

  warning(message: string, title?: string): void {
    this.show(message, 'warning', title, 6500);
  }

  info(message: string, title?: string): void {
    this.show(message, 'info', title);
  }

  remove(id: number): void {
    this.messages.update(items => items.filter(item => item.id !== id));
  }

  clear(): void {
    this.messages.set([]);
  }
}
