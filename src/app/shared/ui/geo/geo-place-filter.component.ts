// =============================================================
// src/app/shared/ui/geo/geo-place-filter.component.ts
//
// "Search by place" for listing filters: one box that finds a catalog place of ANY level (governorate down to
// street) by name, alias or spelling in any language. Choosing one filters by `locationId`, which the API
// expands to everything inside that place. Unlike <app-geo-autocomplete> it never offers to add a place.
//
// The catalog does not hold every street or city (those live as free text on listings), so the list ALWAYS ends with
// "search «text» in listing addresses": a typed text is never mistaken for a confirmed place, and a search that finds
// no catalog place still has a way forward instead of failing silently.
// =============================================================

import { ChangeDetectionStrategy, Component, DestroyRef, EventEmitter, Injector, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { NgIf, NgFor } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, catchError, debounceTime, of, switchMap, tap } from 'rxjs';

import { LocationsApiService } from '../../../core/api/locations-api.service';
import { GeoLocation, geoBreadcrumb, geoName } from '../../../core/models/geo-location.model';
import { LangCode } from '../../../core/services/language.service';

@Component({
  selector: 'app-geo-place-filter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIf, NgFor, TranslateModule],
  template: `
    <div class="gpf">
      <div class="gpf__field">
        <input
          type="text"
          class="gpf__input"
          role="combobox"
          autocomplete="off"
          [id]="inputId"
          [attr.aria-expanded]="open()"
          [attr.aria-controls]="inputId + '-list'"
          [placeholder]="'GEO.FILTER_PLACEHOLDER' | translate"
          [value]="query()"
          (input)="onInput($any($event.target).value)"
          (focus)="open.set(true)"
          (blur)="onBlur()"
          (keydown.escape)="open.set(false)"
        />
        <button *ngIf="query()" type="button" class="gpf__clear" [attr.aria-label]="'COMMON.CLEAR' | translate" (mousedown)="$event.preventDefault()" (click)="clear()">×</button>
      </div>

      <ul class="gpf__list" *ngIf="open() && (results().length || state() !== 'idle' || canSearchText())" [id]="inputId + '-list'" role="listbox">
        <li *ngIf="state() === 'loading'" class="gpf__status" role="status">{{ 'GEO.LOADING' | translate }}</li>
        <li *ngIf="state() === 'error'" class="gpf__status" role="alert">{{ 'GEO.LOAD_ERROR' | translate }}</li>
        <li *ngIf="state() === 'empty'" class="gpf__status">{{ 'GEO.FILTER_NO_MATCH' | translate }}</li>
        <li *ngFor="let r of results()" role="option">
          <button type="button" class="gpf__option" (mousedown)="$event.preventDefault()" (click)="choose(r)">
            <span>{{ label(r) }}</span>
            <span class="gpf__crumb">{{ 'ADMIN_GEO.TYPE_' + r.type.toUpperCase() | translate }} · {{ crumb(r) }}</span>
          </button>
        </li>
        <li *ngIf="canSearchText()" role="option">
          <button type="button" class="gpf__option gpf__option--text" data-testid="place-search-text" (mousedown)="$event.preventDefault()" (click)="chooseText()">
            <span>{{ 'GEO.FILTER_SEARCH_TEXT' | translate: { text: typedText() } }}</span>
          </button>
        </li>
      </ul>
    </div>
  `,
  styles: [`
    .gpf { position: relative; }
    .gpf__field { position: relative; display: flex; align-items: center; }
    .gpf__input {
      width: 100%; box-sizing: border-box; min-height: 44px; padding: .55rem .8rem; padding-inline-end: 2rem;
      border: 1.5px solid var(--border); border-radius: var(--r-md); font-size: .9rem; font-family: inherit;
      background: var(--surface); color: var(--gray-900);
    }
    .gpf__input:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px var(--gold-soft); }
    .gpf__clear {
      position: absolute; inset-inline-end: .5rem; width: 22px; height: 22px; border: none; border-radius: 50%;
      background: var(--gray-100); color: var(--gray-500); cursor: pointer; line-height: 1;
    }
    .gpf__list {
      position: absolute; z-index: 20; inset-inline: 0; top: calc(100% + .3rem); margin: 0; padding: .3rem; list-style: none;
      max-height: 260px; overflow-y: auto; background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--r-md); box-shadow: var(--shadow-lg, 0 12px 32px rgba(0,0,0,.14));
    }
    .gpf__option {
      width: 100%; text-align: start; padding: .5rem .7rem; border: none; background: transparent; cursor: pointer;
      border-radius: var(--r-sm, 6px); display: flex; flex-direction: column; gap: .1rem; color: var(--gray-900); font-size: .9rem;
    }
    .gpf__option:hover, .gpf__option:focus-visible { background: var(--gold-soft); outline: none; }
    .gpf__option--text { border-top: 1px dashed var(--border); border-radius: 0 0 var(--r-sm, 6px) var(--r-sm, 6px); font-weight: 600; }
    .gpf__crumb { font-size: .74rem; color: var(--gray-500); }
    .gpf__status { padding: .55rem .75rem; font-size: .8rem; color: var(--gray-500); }
  `]
})
export class GeoPlaceFilterComponent implements OnChanges {
  private static nextId = 0;

  // Resolved on first search, so a page that only renders the (closed) box does not need the catalog service.
  private readonly injector = inject(Injector);
  private get api(): LocationsApiService { return this.injector.get(LocationsApiService); }
  private readonly destroyRef = inject(DestroyRef);

  @Input() lang: LangCode = 'ar';
  /** The place currently applied as the filter (shown as the box's text). */
  @Input() selected: GeoLocation | null = null;
  /** The text currently applied as an address search (shown as the box's text when no place is selected). */
  @Input() text = '';
  /** Keep the results inside this place (for example the chosen governorate). */
  @Input() scopeId: number | null = null;

  @Output() picked = new EventEmitter<GeoLocation | null>();
  /** "Search this text in listing addresses" was chosen. */
  @Output() textPicked = new EventEmitter<string>();
  /** Every keystroke: what is in the box right now (an empty string once it is cleared). */
  @Output() typed = new EventEmitter<string>();

  /** Id of the text box, so an outer <label for> can point at it. */
  @Input() inputId = `geo-place-filter-${GeoPlaceFilterComponent.nextId++}`;
  readonly query = signal('');
  readonly open = signal(false);
  readonly results = signal<GeoLocation[]>([]);
  readonly state = signal<'idle' | 'loading' | 'error' | 'empty'>('idle');

  private readonly request$ = new Subject<string>();

  constructor() {
    this.request$
      .pipe(
        debounceTime(250),
        tap(() => this.state.set('loading')),
        switchMap(q =>
          this.api.search(q, { parentId: this.scopeId, limit: 10 }).pipe(
            catchError(() => {
              this.state.set('error');
              return of<GeoLocation[]>([]);
            })
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(items => {
        this.results.set(items);
        if (this.state() !== 'error') this.state.set(items.length ? 'idle' : 'empty');
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selected'] || changes['text']) this.query.set(this.selected ? geoName(this.selected, this.lang) : this.text);
  }

  /** Puts the box back to what is applied (a draft that was never applied is dropped). */
  reset(): void {
    this.query.set(this.selected ? geoName(this.selected, this.lang) : this.text);
    this.results.set([]);
    this.state.set('idle');
  }

  /** The words in the box, trimmed. */
  typedText(): string { return this.query().trim(); }

  /** Offered whenever there is something to search for that is not the place already applied. */
  canSearchText(): boolean {
    const q = this.typedText();
    if (q.length < 2) return false;
    return !(this.selected && q === geoName(this.selected, this.lang));
  }

  label(p: GeoLocation): string { return geoName(p, this.lang); }
  crumb(p: GeoLocation): string { return geoBreadcrumb(p.path.slice(0, -1), this.lang); }

  onInput(value: string): void {
    this.query.set(value);
    this.open.set(true);
    this.typed.emit(value);
    const q = value.trim();
    // Emptying the box removes whatever was applied through it (a place or an address text).
    if (!q && (this.selected || this.text)) this.picked.emit(null);
    if (q.length < 2) {
      this.results.set([]);
      this.state.set('idle');
      return;
    }
    this.request$.next(q);
  }

  onBlur(): void { setTimeout(() => this.open.set(false), 150); }

  choose(place: GeoLocation): void {
    this.query.set(this.label(place));
    this.open.set(false);
    this.results.set([]);
    this.picked.emit(place);
  }

  chooseText(): void {
    const text = this.typedText();
    this.open.set(false);
    this.results.set([]);
    this.state.set('idle');
    this.textPicked.emit(text);
  }

  clear(): void {
    this.query.set('');
    this.results.set([]);
    this.state.set('idle');
    this.typed.emit('');
    this.picked.emit(null);
  }
}
