// =============================================================
// src/app/shared/ui/location-combo.component.ts
//
// مكوّن مركّب (autocomplete) يوحّد قائمة الاختيار + الحقل اليدوي
// الاحتياطي اللي كانا معروضين منفصلين (select + input تحته) لحقلي
// المنطقة/الحي بصفحة property-form. المستخدم يكتب بحقل واحد، وبعد
// حرفين تظهر اقتراحات من القائمة المُحمَّلة فعليًا (فلترة محلية —
// القوائم هنا صغيرة الحجم لكل مستوى جغرافي، فلا داعي لنداء API بحث).
// إذا ما فيه تطابق، يظهر زر "أضف" يؤكد استخدام النص المكتوب — بالضبط
// نفس آلية *Text الموجودة أصلًا بالباك اند (LocationSuggestion)، هذا
// المكوّن لا يستدعي أي API جديد، فقط يجعل نفس الآلية القائمة أوضح
// وأسهل استخدامًا.
//
// يعمل مباشرة على FormControl الخاصين بالـid والنص (idControl/textControl)
// المُمرَّرين من النموذج الأب — التناوب بينهما (اختيار يمسح النص المكتوب
// والعكس) يبقى مُدارًا بنفس اشتراكات valueChanges الموجودة أصلًا بـ
// property-form.page.ts، هذا المكوّن لا يكرر ذلك المنطق.
// =============================================================

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { StructuredLocationLookup, pickLocalizedName } from '../../core/api/lookups-api.service';
import { LangCode } from '../../core/services/language.service';

@Component({
  selector: 'app-location-combo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="loc-combo" [class.loc-combo--disabled]="disabled">
      <div class="loc-combo__field">
        <input
          type="text"
          class="loc-combo__input"
          [value]="query()"
          [disabled]="disabled"
          [placeholder]="(placeholderKey | translate)"
          autocomplete="off"
          (input)="onInput($any($event.target).value)"
          (focus)="onFocus()"
          (blur)="onBlur()"
        />
        <button
          type="button"
          class="loc-combo__clear"
          *ngIf="query() && !disabled"
          (click)="clear()"
          [attr.aria-label]="'COMMON.CLEAR' | translate"
        >×</button>
      </div>

      <div class="loc-combo__panel" *ngIf="open() && !disabled && query().trim().length >= minChars">
        <ul class="loc-combo__list" *ngIf="filtered().length">
          <li *ngFor="let opt of filtered()">
            <button type="button" class="loc-combo__option" (mousedown)="select(opt)">
              {{ localizedName(opt) }}
            </button>
          </li>
        </ul>

        <div class="loc-combo__empty" *ngIf="!filtered().length">
          <p class="loc-combo__empty-text">
            {{ 'PROPERTY_FORM.LOCATION_NO_MATCH' | translate: { value: query().trim() } }}
          </p>
          <button type="button" class="loc-combo__add-btn" (mousedown)="confirmNew()">
            + {{ 'PROPERTY_FORM.LOCATION_ADD_NEW' | translate: { value: query().trim() } }}
          </button>
        </div>
      </div>

      <p class="loc-combo__confirmed" *ngIf="confirmedText() && confirmedText() === query().trim()">
        ✓ {{ 'PROPERTY_FORM.LOCATION_ADD_CONFIRMED' | translate: { value: confirmedText() } }}
      </p>
    </div>
  `,
  styles: [`
    .loc-combo {
      position: relative;
    }

    .loc-combo__field {
      position: relative;
      display: flex;
      align-items: center;
    }

    .loc-combo__input {
      width: 100%;
      box-sizing: border-box;
      padding: .72rem .9rem;
      padding-inline-end: 2rem;
      border: 1.5px solid var(--border);
      border-radius: var(--r-md);
      font-size: .92rem;
      font-family: inherit;
      background: var(--surface);
      color: var(--gray-900);
      transition: border-color .15s, box-shadow .15s;

      &:focus {
        outline: none;
        border-color: var(--gold);
        box-shadow: 0 0 0 3px var(--gold-soft);
      }

      &:disabled {
        opacity: .6;
        cursor: not-allowed;
      }
    }

    .loc-combo--disabled .loc-combo__input {
      background: var(--gray-50);
    }

    .loc-combo__clear {
      position: absolute;
      inset-inline-end: .5rem;
      width: 22px;
      height: 22px;
      border: none;
      background: var(--gray-100);
      color: var(--gray-500);
      border-radius: 50%;
      cursor: pointer;
      font-size: .9rem;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .loc-combo__panel {
      position: absolute;
      z-index: 20;
      top: calc(100% + .3rem);
      inset-inline: 0;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      box-shadow: var(--shadow-lg, 0 12px 32px rgba(0,0,0,.14));
      overflow: hidden;
    }

    .loc-combo__list {
      list-style: none;
      margin: 0;
      padding: .3rem;
      max-height: 220px;
      overflow-y: auto;
    }

    .loc-combo__option {
      width: 100%;
      text-align: start;
      padding: .55rem .7rem;
      border: none;
      background: transparent;
      border-radius: var(--r-sm, 6px);
      font-size: .88rem;
      color: var(--gray-900);
      cursor: pointer;

      &:hover {
        background: var(--gold-soft);
      }
    }

    .loc-combo__empty {
      padding: .75rem;
      display: flex;
      flex-direction: column;
      gap: .5rem;
    }

    .loc-combo__empty-text {
      margin: 0;
      font-size: .8rem;
      color: var(--gray-500);
    }

    .loc-combo__add-btn {
      align-self: flex-start;
      border: 1px dashed var(--gold);
      background: var(--gold-soft);
      color: var(--gold-text);
      font-weight: 700;
      font-size: .84rem;
      padding: .5rem .8rem;
      border-radius: var(--r-md);
      cursor: pointer;

      &:hover {
        background: var(--gold);
        color: var(--navy);
      }
    }

    .loc-combo__confirmed {
      margin: .4rem 0 0;
      font-size: .78rem;
      color: var(--gold-text);
      line-height: 1.5;
    }
  `]
})
export class LocationComboComponent implements OnInit, OnChanges {
  private readonly destroyRef = inject(DestroyRef);

  @Input({ required: true }) options: StructuredLocationLookup[] = [];
  @Input({ required: true }) idControl!: FormControl<number | null>;
  @Input({ required: true }) textControl!: FormControl<string | null>;
  @Input() lang: LangCode = 'ar';
  @Input() disabled = false;
  @Input() placeholderKey = 'PROPERTY_FORM.SELECT_PLACEHOLDER';
  @Input() minChars = 2;

  readonly query = signal('');
  readonly open = signal(false);
  readonly confirmedText = signal<string | null>(null);

  ngOnInit(): void {
    this.syncFromControls();

    this.idControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncFromControls());

    this.textControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncFromControls());
  }

  ngOnChanges(changes: SimpleChanges): void {
    // إذا تغيّرت مراجع الـcontrols نفسها (نادر، لكن ممكن نظريًا) أو
    // القائمة، أعد المزامنة حتى يبقى النص المعروض صحيحًا.
    if (changes['idControl'] || changes['textControl'] || changes['options']) {
      this.syncFromControls();
    }
  }

  filtered(): StructuredLocationLookup[] {
    const q = this.query().trim().toLocaleLowerCase();
    if (q.length < this.minChars) {
      return [];
    }

    return this.options
      .filter(opt => this.localizedName(opt).toLocaleLowerCase().includes(q))
      .slice(0, 8);
  }

  localizedName(opt: StructuredLocationLookup): string {
    return pickLocalizedName(opt, this.lang);
  }

  onInput(value: string): void {
    this.query.set(value);
    this.confirmedText.set(null);
    this.open.set(true);
    this.textControl.setValue(value.trim() ? value : null);
  }

  onFocus(): void {
    if (this.query().trim().length >= this.minChars) {
      this.open.set(true);
    }
  }

  onBlur(): void {
    // تأخير بسيط حتى يُسجَّل نقر الاقتراح/زر الإضافة (mousedown) قبل
    // إغلاق اللوحة بحدث blur — لولاه كان الزر يختفي قبل ما ينفّذ نقره.
    setTimeout(() => this.open.set(false), 150);
  }

  select(opt: StructuredLocationLookup): void {
    this.query.set(this.localizedName(opt));
    this.confirmedText.set(null);
    this.idControl.setValue(opt.id);
    this.open.set(false);
  }

  confirmNew(): void {
    const text = this.query().trim();
    if (!text) {
      return;
    }

    this.textControl.setValue(text);
    this.confirmedText.set(text);
    this.open.set(false);
  }

  clear(): void {
    this.query.set('');
    this.confirmedText.set(null);
    this.idControl.setValue(null);
    this.textControl.setValue(null);
    this.open.set(false);
  }

  private syncFromControls(): void {
    const id = this.idControl?.value ?? null;

    if (id !== null) {
      const match = this.options.find(opt => opt.id === id);
      this.query.set(match ? this.localizedName(match) : this.query());
      return;
    }

    const text = this.textControl?.value ?? '';
    this.query.set(text ?? '');
  }
}
