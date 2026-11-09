import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ChoiceChipOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
}

/**
 * A multi-select as a wrapping row of toggle buttons (categories, governorates). Each chip is
 * a real button with aria-pressed, so keyboard and screen-reader use needs nothing extra, and
 * the row wraps in both LTR and RTL without horizontal scrolling.
 */
@Component({
  selector: 'app-choice-chips',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chips" role="group" [attr.aria-label]="ariaLabel">
      <button
        *ngFor="let option of options; trackBy: trackByValue"
        type="button"
        class="chip"
        [class.chip--on]="isSelected(option.value)"
        [attr.aria-pressed]="isSelected(option.value)"
        [disabled]="disabled || option.disabled"
        (click)="toggle(option.value)"
      >{{ option.label }}</button>
    </div>
  `,
  styles: [`
    .chips { display: flex; flex-wrap: wrap; gap: .45rem; }
    .chip {
      border: 1px solid var(--gray-300); background: var(--surface); color: var(--gray-800);
      border-radius: 999px; padding: .45rem .85rem; font: inherit; font-size: .9rem; cursor: pointer;
    }
    .chip--on { background:var(--inverse-bg);color:var(--inverse-text);border-color:var(--inverse-bg); }
    .chip:disabled { opacity: .55; cursor: not-allowed; }
  `]
})
export class ChoiceChipsComponent<T extends string | number> {
  @Input() options: ChoiceChipOption<T>[] = [];
  @Input() selected: readonly T[] = [];
  @Input() disabled = false;
  @Input() ariaLabel: string | null = null;
  @Output() selectedChange = new EventEmitter<T[]>();

  isSelected(value: T): boolean { return this.selected.includes(value); }

  toggle(value: T): void {
    this.selectedChange.emit(
      this.isSelected(value) ? this.selected.filter(v => v !== value) : [...this.selected, value]);
  }

  trackByValue(_: number, option: ChoiceChipOption<T>): T { return option.value; }
}
