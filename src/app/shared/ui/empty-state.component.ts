import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="empty-state">
      <div class="empty-icon" aria-hidden="true">{{ icon }}</div>
      <h2>{{ title }}</h2>
      <p *ngIf="message">{{ message }}</p>
      <button *ngIf="actionLabel" type="button" (click)="action.emit()">{{ actionLabel }}</button>
    </section>
  `,
  styles: [`
    .empty-state {
      display: grid;
      place-items: center;
      text-align: center;
      gap: .35rem;
      padding: 2rem;
      border: 1px dashed var(--gray-300);
      border-radius: 18px;
      background: var(--gray-50);
      color: var(--gray-600);
      min-height: 180px;
    }

    .empty-icon {
      font-size: 2.5rem;
      line-height: 1;
      margin-bottom: .35rem;
    }

    h2 {
      margin: 0;
      color: var(--gray-900);
      font-size: 1.25rem;
    }

    p {
      margin: 0;
      max-width: 520px;
      line-height: 1.6;
    }

    button {
      margin-top: .75rem;
      border: 0;
      border-radius: 10px;
      background: var(--primary);
      color: var(--on-primary);
      padding: .7rem 1rem;
      cursor: pointer;
      font-weight: 700;
    }
  `]
})
export class EmptyStateComponent {
  @Input() icon = '📭';
  @Input() title = 'لا توجد بيانات';
  @Input() message = '';
  @Input() actionLabel = '';
  @Output() action = new EventEmitter<void>();
}
