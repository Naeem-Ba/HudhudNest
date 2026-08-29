import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-skeleton-card-grid',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="skeleton-grid" aria-hidden="true">
      <article class="skeleton-card" *ngFor="let item of placeholders">
        <div class="skeleton skeleton-image"></div>
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text short"></div>
      </article>
    </div>
  `,
  styles: [`
    .skeleton-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1rem;
      width: 100%;
    }

    .skeleton-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1rem;
      box-shadow: var(--shadow-xs);
      overflow: hidden;
    }

    .skeleton {
      background: linear-gradient(90deg, var(--gray-200) 25%, var(--gray-100) 37%, var(--gray-200) 63%);
      background-size: 400% 100%;
      animation: shimmer 1.2s ease-in-out infinite;
      border-radius: 10px;
    }

    .skeleton-image { height: 160px; margin-bottom: 1rem; }
    .skeleton-title { height: 22px; width: 75%; margin-bottom: .75rem; }
    .skeleton-text { height: 16px; width: 100%; margin-bottom: .5rem; }
    .skeleton-text.short { width: 55%; }

    @keyframes shimmer {
      0% { background-position: 100% 0; }
      100% { background-position: 0 0; }
    }
  `]
})
export class SkeletonCardGridComponent {
  @Input() count = 6;

  get placeholders(): number[] {
    return Array.from({ length: this.count }, (_, index) => index);
  }
}
