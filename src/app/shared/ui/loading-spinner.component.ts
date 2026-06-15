import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="loading-state" [class.compact]="compact" role="status" aria-live="polite">
      <span class="spinner" aria-hidden="true"></span>
      <span>{{ label }}</span>
    </div>
  `,
  styles: [`
    .loading-state {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: .75rem;
      width: 100%;
      min-height: 160px;
      color: #475569;
      font-weight: 600;
    }

    .loading-state.compact {
      min-height: auto;
      justify-content: flex-start;
      padding: .5rem 0;
    }

    .spinner {
      width: 1.75rem;
      height: 1.75rem;
      border: 3px solid #dbeafe;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin .8s linear infinite;
      flex: 0 0 auto;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class LoadingSpinnerComponent {
  @Input() label = 'جارٍ التحميل...';
  @Input() compact = false;
}
