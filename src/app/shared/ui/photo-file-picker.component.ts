import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { map, startWith } from 'rxjs';

/** The summary phrase for a number of picked files, in the grammar of the page language. */
export type PhotoPickerSummaryKey =
  | 'PHOTO_PICKER.NONE'
  | 'PHOTO_PICKER.SELECTED_ONE'
  | 'PHOTO_PICKER.SELECTED_TWO'
  | 'PHOTO_PICKER.SELECTED_FEW'
  | 'PHOTO_PICKER.SELECTED_MANY'
  | 'PHOTO_PICKER.SELECTED_OTHER';

/**
 * Chooses the translation key for `count` picked files from the language's own plural rules
 * (Arabic has six forms, German/English/Turkish two), so the wording never depends on a literal translation.
 */
export function photoPickerSummaryKey(count: number, language: string): PhotoPickerSummaryKey {
  if (count <= 0) return 'PHOTO_PICKER.NONE';
  let category: Intl.LDMLPluralRule = 'other';
  try {
    category = new Intl.PluralRules(language || 'en').select(count);
  } catch {
    // An unknown language tag falls back to the generic plural form.
  }
  switch (category) {
    case 'one': return 'PHOTO_PICKER.SELECTED_ONE';
    case 'two': return 'PHOTO_PICKER.SELECTED_TWO';
    case 'few': return 'PHOTO_PICKER.SELECTED_FEW';
    case 'many': return 'PHOTO_PICKER.SELECTED_MANY';
    default: return 'PHOTO_PICKER.SELECTED_OTHER';
  }
}

/**
 * Photo chooser used instead of a bare `<input type="file">`. The browser prints the "no file chosen"
 * text of a native file input in the BROWSER's language (German on a German browser even in the Arabic
 * app), and that text cannot be translated from the page. The real input is therefore kept hidden; a
 * button opens it and the status line below is rendered from the app's own translations (ar/en/de/tr).
 *
 * The component only reports what was picked; validation, shrinking and upload stay with the page.
 */
@Component({
  selector: 'app-photo-file-picker',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pfp">
      <button type="button" class="pfp__btn" [disabled]="disabled || busy()" (click)="open()">
        <span aria-hidden="true">🖼️</span> {{ 'PHOTO_PICKER.CHOOSE' | translate }}
      </button>
      <input #fileInput type="file" hidden multiple [attr.accept]="accept" [attr.aria-label]="'PHOTO_PICKER.CHOOSE' | translate"
             (change)="onChange($event)" />
      <span class="pfp__status" role="status" aria-live="polite" data-testid="photo-picker-status">
        {{ statusKey() | translate: { count: count() } }}
      </span>
    </div>
  `,
  styles: [`
    .pfp { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem .75rem; }
    .pfp__btn {
      display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 14px;
      border: 1px solid var(--border); border-radius: var(--r-md, 12px); background: var(--surface);
      color: var(--primary-text); font: inherit; font-weight: 700; cursor: pointer;
    }
    .pfp__btn:disabled { opacity: .6; cursor: default; }
    .pfp__btn:focus-visible { outline: 2px solid var(--navy); outline-offset: 2px; }
    .pfp__status { color: var(--gray-700, inherit); font-size: .9rem; min-width: 0; overflow-wrap: anywhere; }
  `]
})
export class PhotoFilePickerComponent {
  private readonly translate = inject(TranslateService);

  /** How many photos are currently chosen (waiting to upload). */
  readonly count = input(0);
  /** An upload is running: shows the uploading text and ignores new picks. */
  readonly busy = input(false);
  @Input() disabled = false;
  @Input() accept = 'image/png,image/jpeg,image/webp';
  @Output() readonly picked = new EventEmitter<File[]>();

  @ViewChild('fileInput', { static: true }) private readonly fileInput!: ElementRef<HTMLInputElement>;

  private readonly language = toSignal(
    this.translate.onLangChange.pipe(map(event => event.lang), startWith(this.translate.currentLang || this.translate.defaultLang || 'en')),
    { initialValue: this.translate.currentLang || this.translate.defaultLang || 'en' });

  protected readonly statusKey = computed<PhotoPickerSummaryKey | 'PHOTO_PICKER.UPLOADING'>(() =>
    this.busy() ? 'PHOTO_PICKER.UPLOADING' : photoPickerSummaryKey(this.count(), this.language()));

  /** Opens the system file dialog (also used by the photography guide's "start" button). */
  open(): void {
    if (this.disabled || this.busy()) return;
    this.fileInput.nativeElement.click();
  }

  protected onChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // Cleared at once so choosing the same file again fires a new change event, and so one change event is
    // reported exactly once.
    input.value = '';
    if (files.length === 0 || this.busy()) return;
    this.picked.emit(files);
  }
}
