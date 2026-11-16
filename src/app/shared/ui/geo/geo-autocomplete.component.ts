// =============================================================
// src/app/shared/ui/geo/geo-autocomplete.component.ts
//
// One level of the location picker (city / district / neighborhood / street): a single field that
//  - searches HudhudNest's own catalog while the user types (never the map provider), inside the
//    area already chosen above it, in Arabic, English or German and through aliases;
//  - lists the places of that level inside the area when the field is focused empty ("browse"),
//    so someone who does not know the names can still pick;
//  - keeps whatever the user typed as free text when the place is not in the catalog, so the listing
//    is never blocked - the parent proposes it to the administrators after saving.
// A failing lookup only shows a hint; typing always keeps working.
// =============================================================

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
  signal
} from '@angular/core';
import { NgIf, NgFor } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, catchError, debounceTime, map, of, switchMap, tap } from 'rxjs';

import { LocationsApiService } from '../../../core/api/locations-api.service';
import { GeoLocation, GeoLocationType, geoBreadcrumb, geoName } from '../../../core/models/geo-location.model';
import { LangCode } from '../../../core/services/language.service';

const BROWSE_LIMIT = 30;

@Component({
  selector: 'app-geo-autocomplete',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIf, NgFor, TranslateModule],
  template: `
    <div class="geo-ac" [class.geo-ac--disabled]="disabled">
      <div class="geo-ac__field">
        <input
          type="text"
          class="geo-ac__input"
          role="combobox"
          aria-autocomplete="list"
          [attr.id]="inputId"
          [attr.aria-expanded]="panelOpen()"
          [attr.aria-controls]="listId"
          [attr.aria-activedescendant]="activeIndex() >= 0 ? listId + '-' + activeIndex() : null"
          [value]="query()"
          [disabled]="disabled"
          [placeholder]="placeholderKey | translate"
          autocomplete="off"
          (input)="onInput($any($event.target).value)"
          (focus)="onFocus()"
          (blur)="onBlur()"
          (keydown)="onKeydown($event)"
        />
        <button
          type="button"
          class="geo-ac__clear"
          *ngIf="query() && !disabled"
          (click)="clear()"
          [attr.aria-label]="'COMMON.CLEAR' | translate"
        >×</button>
      </div>

      <div class="geo-ac__panel" *ngIf="panelOpen()">
        <p class="geo-ac__status" *ngIf="loading()" role="status">{{ 'GEO.LOADING' | translate }}</p>

        <ul class="geo-ac__list" role="listbox" [attr.id]="listId" *ngIf="results().length">
          <li *ngFor="let opt of results(); let i = index" role="option"
              [attr.id]="listId + '-' + i" [attr.aria-selected]="i === activeIndex()">
            <button type="button" class="geo-ac__option" [class.geo-ac__option--active]="i === activeIndex()"
                    (mousedown)="select(opt)">
              <span class="geo-ac__name">{{ name(opt) }}</span>
              <span class="geo-ac__crumb" *ngIf="crumb(opt) as c">{{ c }}</span>
            </button>
          </li>
        </ul>

        <p class="geo-ac__status geo-ac__status--warn" *ngIf="failed() && !loading()" role="status">
          {{ 'GEO.LOAD_ERROR' | translate }}
        </p>

        <div class="geo-ac__empty" *ngIf="showAdd()">
          <p class="geo-ac__empty-text">{{ 'GEO.NO_MATCH' | translate: { value: query().trim() } }}</p>
          <button type="button" class="geo-ac__add" (mousedown)="confirmNew()">
            + {{ 'GEO.ADD_NEW' | translate: { value: query().trim() } }}
          </button>
        </div>
      </div>

      <p class="geo-ac__confirmed" *ngIf="confirmed() && confirmed() === query().trim()" role="status">
        ✓ {{ 'GEO.ADD_CONFIRMED' | translate: { value: confirmed() } }}
      </p>
    </div>
  `,
  styles: [`
    .geo-ac { position: relative; }
    .geo-ac__field { position: relative; display: flex; align-items: center; }
    .geo-ac__input {
      width: 100%; box-sizing: border-box; padding: .72rem .9rem; padding-inline-end: 2rem;
      border: 1.5px solid var(--border); border-radius: var(--r-md);
      /* 16px: anything smaller makes iOS Safari zoom the page on focus. */
      font-size: 16px; font-family: inherit; background: var(--surface); color: var(--gray-900);
      transition: border-color .15s, box-shadow .15s;
    }
    .geo-ac__input:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px var(--gold-soft); }
    .geo-ac__input:disabled { opacity: .6; cursor: not-allowed; background: var(--gray-50); }
    .geo-ac__clear {
      position: absolute; inset-inline-end: .5rem; width: 22px; height: 22px; border: none; border-radius: 50%;
      background: var(--gray-100); color: var(--gray-500); cursor: pointer; font-size: .9rem; line-height: 1;
      display: flex; align-items: center; justify-content: center;
    }
    .geo-ac__panel {
      position: absolute; z-index: 20; top: calc(100% + .3rem); inset-inline: 0; background: var(--surface);
      border: 1px solid var(--border); border-radius: var(--r-md);
      box-shadow: var(--shadow-lg, 0 12px 32px rgba(0,0,0,.14)); overflow: hidden;
    }
    .geo-ac__list { list-style: none; margin: 0; padding: .3rem; max-height: 240px; overflow-y: auto; }
    .geo-ac__option {
      width: 100%; text-align: start; padding: .55rem .7rem; border: none; background: transparent;
      border-radius: var(--r-sm, 6px); font-size: .9rem; color: var(--gray-900); cursor: pointer;
      display: flex; flex-direction: column; gap: .1rem;
    }
    .geo-ac__option:hover, .geo-ac__option--active { background: var(--gold-soft); }
    .geo-ac__crumb { font-size: .74rem; color: var(--gray-500); }
    .geo-ac__status { margin: 0; padding: .55rem .75rem; font-size: .8rem; color: var(--gray-500); }
    .geo-ac__status--warn { color: var(--gold-text); }
    .geo-ac__empty { padding: .75rem; display: flex; flex-direction: column; gap: .5rem; }
    .geo-ac__empty-text { margin: 0; font-size: .8rem; color: var(--gray-500); }
    .geo-ac__add {
      align-self: flex-start; border: 1px dashed var(--gold); background: var(--gold-soft); color: var(--gold-text);
      font-weight: 700; font-size: .84rem; padding: .5rem .8rem; border-radius: var(--r-md); cursor: pointer;
    }
    .geo-ac__add:hover { background: var(--gold); color: var(--navy); }
    .geo-ac__confirmed { margin: .4rem 0 0; font-size: .78rem; color: var(--gold-text); line-height: 1.5; }
  `]
})
export class GeoAutocompleteComponent implements OnChanges {
  private static nextId = 0;

  private readonly api = inject(LocationsApiService);
  private readonly destroyRef = inject(DestroyRef);

  @Input({ required: true }) type!: GeoLocationType;
  /** The area the user already chose above this level; results stay inside it. */
  @Input() ancestorId: number | null = null;
  @Input() lang: LangCode = 'ar';
  @Input() disabled = false;
  @Input() inputId: string | null = null;
  @Input() placeholderKey = 'GEO.PLACEHOLDER';
  /** The catalog place currently chosen for this level. */
  @Input() selected: GeoLocation | null = null;
  /** Free text typed for this level (shown when no catalog place is chosen). */
  @Input() text: string | null = null;
  @Input() minChars = 2;

  @Output() picked = new EventEmitter<GeoLocation>();
  /** Fired on every keystroke with the typed text (null when emptied): the place is not (yet) a catalog place. */
  @Output() typed = new EventEmitter<string | null>();

  readonly listId = `geo-ac-${GeoAutocompleteComponent.nextId++}`;
  readonly query = signal('');
  readonly open = signal(false);
  readonly results = signal<GeoLocation[]>([]);
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly confirmed = signal<string | null>(null);
  readonly activeIndex = signal(-1);
  /** The text the last finished lookup was for; "add this place" is offered only once it matches what is typed. */
  private readonly settledQuery = signal<string | null>(null);

  private readonly request$ = new Subject<string>();
  private blurTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.request$
      .pipe(
        debounceTime(250),
        tap(() => {
          this.loading.set(true);
          this.failed.set(false);
        }),
        switchMap(q => this.lookup(q).pipe(map(items => ({ q, items })))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ q, items }) => {
        this.results.set(items);
        this.settledQuery.set(this.failed() ? null : q);
        this.activeIndex.set(-1);
        this.loading.set(false);
      });

    this.destroyRef.onDestroy(() => {
      if (this.blurTimer) clearTimeout(this.blurTimer);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selected'] || changes['text']) {
      this.query.set(this.selected ? geoName(this.selected, this.lang) : (this.text ?? ''));
    }
    if (changes['ancestorId'] || changes['type']) {
      this.results.set([]);
    }
  }

  panelOpen(): boolean {
    if (!this.open() || this.disabled) return false;
    const q = this.query().trim();
    return this.loading() || this.failed() || this.results().length > 0 || q.length >= this.minChars || q.length === 0 && this.ancestorId !== null;
  }

  /** "Add" is offered only after the lookup answered and found nothing for what was typed. */
  showAdd(): boolean {
    const q = this.query().trim();
    return q.length >= this.minChars && !this.loading() && this.settledQuery() === q && !this.results().length;
  }

  name(opt: GeoLocation): string {
    return geoName(opt, this.lang);
  }

  /** Where the place is, so two places with the same name (in different cities) can be told apart. */
  crumb(opt: GeoLocation): string {
    return geoBreadcrumb(opt.path.slice(0, -1), this.lang);
  }

  onInput(value: string): void {
    this.query.set(value);
    this.confirmed.set(null);
    this.settledQuery.set(null);
    this.open.set(true);
    this.typed.emit(value.trim() ? value : null);
    this.request$.next(value.trim());
  }

  onFocus(): void {
    if (this.blurTimer) clearTimeout(this.blurTimer);
    this.open.set(true);
    const q = this.query().trim();
    // Browse the places of this level when nothing is typed; otherwise refresh what matches the text.
    if (!this.selected && (q.length === 0 || q.length >= this.minChars) && !this.results().length) {
      this.request$.next(q);
    }
  }

  onBlur(): void {
    // Let a click on a suggestion (mousedown) register before the panel disappears.
    this.blurTimer = setTimeout(() => this.open.set(false), 150);
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.results().length;
    if (event.key === 'ArrowDown' && count) {
      event.preventDefault();
      this.open.set(true);
      this.activeIndex.set((this.activeIndex() + 1) % count);
    } else if (event.key === 'ArrowUp' && count) {
      event.preventDefault();
      this.activeIndex.set((this.activeIndex() - 1 + count) % count);
    } else if (event.key === 'Enter' && this.activeIndex() >= 0 && this.open()) {
      const active = this.results()[this.activeIndex()];
      if (!active) return;
      event.preventDefault();
      this.select(active);
    } else if (event.key === 'Escape') {
      this.open.set(false);
    }
  }

  select(opt: GeoLocation): void {
    this.query.set(this.name(opt));
    this.confirmed.set(null);
    this.open.set(false);
    this.picked.emit(opt);
  }

  confirmNew(): void {
    const text = this.query().trim();
    if (!text) return;
    this.confirmed.set(text);
    this.open.set(false);
    this.typed.emit(text);
  }

  clear(): void {
    this.query.set('');
    this.confirmed.set(null);
    this.results.set([]);
    this.typed.emit(null);
    this.open.set(false);
  }

  private lookup(q: string) {
    if (this.ancestorId === null) return of<GeoLocation[]>([]);

    const source = q.length >= this.minChars
      ? this.api.search(q, { parentId: this.ancestorId, types: [this.type], limit: 8 })
      : q.length === 0
        ? this.api.getDescendants(this.ancestorId, this.type, undefined, BROWSE_LIMIT)
        : of<GeoLocation[]>([]);

    return source.pipe(
      map(items => items.filter(i => i.type === this.type)),
      catchError(() => {
        this.failed.set(true);
        return of<GeoLocation[]>([]);
      })
    );
  }
}
