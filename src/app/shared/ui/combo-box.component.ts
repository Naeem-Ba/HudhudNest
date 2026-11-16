// =============================================================
// src/app/shared/ui/combo-box.component.ts
//
// A text field with a real dropdown, used instead of <input list="..."> / <datalist> and instead of long <select>s
// where the person may also type:
//  - the arrow button (and a click / focus on the field) opens the WHOLE list; the browser's own datalist hid the
//    list when the field already had text and does not show one at all in several mobile WebViews;
//  - typing narrows the list (Arabic spellings folded together);
//  - `allowCustom`: text that is not in the list is kept and reported through (customText) instead of being thrown
//    away, so "a district that is not in the catalog" can still be typed;
//  - keyboard (arrows, Enter, Escape) and screen-reader roles (combobox / listbox / option).
// It is a ControlValueAccessor: the value is the chosen option's value, or null when nothing (or only custom text)
// is chosen. Works with ngModel and with reactive forms.
// =============================================================

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  computed,
  forwardRef,
  signal
} from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

import { normalizePlaceName } from '../../core/api/location-names.service';

export interface ComboOption {
  value: string | number;
  label: string;
  /** A second, smaller line (for example where the place is). */
  hint?: string | null;
}

@Component({
  selector: 'app-combo-box',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIf, NgFor, TranslateModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ComboBoxComponent), multi: true }],
  template: `
    <div class="combo" [class.combo--disabled]="isDisabled()" [class.combo--plain]="plain">
      <input
        #field
        type="text"
        class="combo__input"
        role="combobox"
        aria-autocomplete="list"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        [attr.id]="inputId"
        [attr.name]="name"
        [attr.aria-label]="ariaLabel"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="listId"
        [attr.aria-activedescendant]="activeIndex() >= 0 ? listId + '-' + activeIndex() : null"
        [placeholder]="placeholder"
        [value]="text()"
        [disabled]="isDisabled()"
        (input)="onInput($any($event.target).value)"
        (focus)="openAll()"
        (click)="openAll()"
        (blur)="onBlur()"
        (keydown)="onKeydown($event)"
      />
      <button
        type="button"
        class="combo__toggle"
        tabindex="-1"
        [disabled]="isDisabled()"
        [attr.aria-label]="(open() ? 'COMMON.CLOSE_LIST' : 'COMMON.OPEN_LIST') | translate"
        (mousedown)="$event.preventDefault()"
        (click)="toggle()"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" [class.combo__chevron--up]="open()">
          <path d="M2.5 5L7 9.5L11.5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <div class="combo__panel" *ngIf="open() && !isDisabled()" (mousedown)="$event.preventDefault()">
        <ul class="combo__list" role="listbox" [attr.id]="listId" *ngIf="visible().length; else none">
          <li *ngFor="let opt of visible(); let i = index" role="option"
              [attr.id]="listId + '-' + i" [attr.aria-selected]="opt.value === value()">
            <button type="button" class="combo__option"
                    [class.combo__option--active]="i === activeIndex()"
                    [class.combo__option--selected]="opt.value === value()"
                    (click)="choose(opt)">
              <span>{{ opt.label }}</span>
              <span class="combo__hint" *ngIf="opt.hint">{{ opt.hint }}</span>
            </button>
          </li>
        </ul>
        <ng-template #none>
          <p class="combo__empty" role="status">
            {{ (allowCustom && text().trim() ? 'COMMON.COMBO_KEEP_TYPED' : 'COMMON.COMBO_NO_OPTIONS') | translate: { value: text().trim() } }}
          </p>
        </ng-template>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .combo { position: relative; }
    .combo__input {
      width: 100%; box-sizing: border-box; padding: .65rem .9rem; padding-inline-end: 2.4rem;
      border: 1.5px solid var(--border); border-radius: var(--r-md);
      /* 16px: anything smaller makes iOS Safari zoom the page on focus. */
      font-size: 16px; font-family: inherit; background: var(--surface); color: var(--gray-900);
      transition: border-color .15s, box-shadow .15s;
    }
    .combo__input:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px var(--gold-soft); }
    .combo__input:disabled { opacity: .6; cursor: not-allowed; }
    .combo--plain .combo__input {
      border: none; background: transparent; padding: 0; padding-inline-end: 1.8rem; box-shadow: none;
      font-size: .92rem; font-weight: 600; color: var(--gray-800); min-height: 1.6rem;
    }
    .combo--plain .combo__input::placeholder { color: var(--text-placeholder); font-weight: 600; opacity: 1; }
    .combo--plain .combo__input:focus { box-shadow: none; }
    .combo--plain .combo__input:focus-visible { outline: 2px solid var(--gold-text); outline-offset: 4px; border-radius: 4px; }
    .combo--plain .combo__toggle { width: 1.8rem; }
    /* The field itself is narrow inside the search bar; the list can be wider than it. */
    .combo--plain .combo__panel { min-width: 13rem; }
    .combo__toggle {
      position: absolute; inset-block: 0; inset-inline-end: 0; width: 2.4rem; border: none; background: transparent;
      color: var(--gray-500); cursor: pointer; display: flex; align-items: center; justify-content: center;
    }
    .combo__toggle:disabled { cursor: not-allowed; }
    .combo__toggle svg { transition: transform .15s; }
    .combo__chevron--up { transform: rotate(180deg); }
    .combo__panel {
      position: absolute; z-index: 40; top: calc(100% + .3rem); inset-inline: 0; background: var(--surface);
      border: 1px solid var(--border); border-radius: var(--r-md);
      box-shadow: var(--shadow-lg, 0 12px 32px rgba(0,0,0,.14)); overflow: hidden;
    }
    .combo__list { list-style: none; margin: 0; padding: .3rem; max-height: 15rem; overflow-y: auto; overscroll-behavior: contain; }
    .combo__option {
      width: 100%; text-align: start; padding: .6rem .7rem; border: none; background: transparent;
      border-radius: var(--r-sm, 6px); font-size: .95rem; font-family: inherit; color: var(--gray-900); cursor: pointer;
      display: flex; flex-direction: column; gap: .1rem; min-height: 2.5rem; justify-content: center;
    }
    .combo__option:hover, .combo__option--active { background: var(--gold-soft); }
    .combo__option--selected { font-weight: 700; }
    .combo__hint { font-size: .75rem; color: var(--gray-500); }
    .combo__empty { margin: 0; padding: .75rem; font-size: .85rem; color: var(--gray-500); }
  `]
})
export class ComboBoxComponent implements ControlValueAccessor, OnChanges {
  private static nextId = 0;

  @Input() set options(value: ComboOption[] | null | undefined) {
    this.optionList.set(value ?? []);
    // The label of the chosen value can change with the list (language switch, lookups arriving late);
    // text being typed is never touched here.
    this.relabelChosen();
  }
  @Input() placeholder = '';
  @Input() inputId: string | null = null;
  @Input() name: string | null = null;
  @Input() ariaLabel: string | null = null;
  /** Keep text that is not in the list (reported through customText) instead of discarding it. */
  @Input() allowCustom = false;
  /** Text to show when no option is chosen (a previously typed place being edited). */
  @Input() customValue: string | null = null;
  @Input() disabled = false;
  /** Same as disabled, for a combo bound with formControlName (where `disabled` belongs to the form directive). */
  @Input() locked = false;
  /** Borderless look for a field that sits inside a card which draws its own frame (the home search bar). */
  @Input() plain = false;

  /** The typed text while it is not one of the options (null when empty or when it matches an option). */
  @Output() customText = new EventEmitter<string | null>();

  @ViewChild('field') private field?: ElementRef<HTMLInputElement>;

  readonly listId = `combo-${ComboBoxComponent.nextId++}`;
  readonly value = signal<string | number | null>(null);
  readonly text = signal('');
  readonly open = signal(false);
  readonly activeIndex = signal(-1);
  readonly isDisabledByForm = signal(false);

  private readonly optionList = signal<ComboOption[]>([]);
  /** Null until the person types after opening: then the whole list is shown. */
  private readonly filterText = signal<string | null>(null);

  readonly visible = computed(() => {
    const list = this.optionList();
    const q = normalizePlaceName(this.filterText());
    if (!q) return list;
    return list.filter(o => normalizePlaceName(o.label).includes(q) || normalizePlaceName(o.hint).includes(q));
  });

  private onChange: (value: string | number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private blurTimer: ReturnType<typeof setTimeout> | null = null;

  isDisabled(): boolean {
    return this.disabled || this.locked || this.isDisabledByForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['customValue'] && this.value() === null) {
      this.text.set(this.customValue ?? '');
    }
  }

  // ── ControlValueAccessor ──
  writeValue(value: string | number | null): void {
    this.value.set(value === undefined || value === '' ? null : value);
    const match = this.value() === null ? undefined : this.optionList().find(o => o.value === this.value());
    // An external reset (null) clears the field, or shows the custom text a previous visit left.
    this.text.set(match ? match.label : this.value() === null ? (this.allowCustom ? (this.customValue ?? '') : '') : this.text());
  }

  registerOnChange(fn: (value: string | number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabledByForm.set(isDisabled);
  }

  // ── Interaction ──
  openAll(): void {
    if (this.isDisabled()) return;
    if (this.blurTimer) clearTimeout(this.blurTimer);
    this.filterText.set(null);
    this.activeIndex.set(-1);
    this.open.set(true);
  }

  toggle(): void {
    if (this.isDisabled()) return;
    if (this.open()) {
      this.open.set(false);
    } else {
      this.field?.nativeElement.focus();
      this.openAll();
    }
  }

  onInput(typed: string): void {
    this.text.set(typed);
    this.filterText.set(typed);
    this.activeIndex.set(-1);
    this.open.set(true);

    const exact = this.optionList().find(o => normalizePlaceName(o.label) === normalizePlaceName(typed));
    if (exact) {
      this.setValue(exact.value);
      this.customText.emit(null);
      return;
    }
    this.setValue(null);
    this.customText.emit(this.allowCustom && typed.trim() ? typed : null);
  }

  choose(option: ComboOption): void {
    this.setValue(option.value);
    this.text.set(option.label);
    this.filterText.set(null);
    this.open.set(false);
    this.customText.emit(null);
    this.field?.nativeElement.focus();
  }

  onBlur(): void {
    this.onTouched();
    this.blurTimer = setTimeout(() => {
      this.open.set(false);
      // Without allowCustom, text that is not an option is not a value: do not leave it looking like one.
      if (!this.allowCustom && this.value() === null) this.text.set('');
    }, 120);
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.visible().length;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!this.open()) this.openAll();
      if (count) this.activeIndex.set((this.activeIndex() + 1) % count);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (count) this.activeIndex.set((this.activeIndex() - 1 + count) % count);
    } else if (event.key === 'Enter') {
      const active = this.visible()[this.activeIndex()];
      if (this.open() && active) {
        event.preventDefault();
        this.choose(active);
      }
    } else if (event.key === 'Escape') {
      if (this.open()) {
        event.preventDefault();
        this.open.set(false);
      }
    }
  }

  private setValue(value: string | number | null): void {
    if (this.value() === value) return;
    this.value.set(value);
    this.onChange(value);
  }

  private relabelChosen(): void {
    const current = this.value();
    if (current === null) return;
    const match = this.optionList().find(o => o.value === current);
    if (match) this.text.set(match.label);
  }
}
