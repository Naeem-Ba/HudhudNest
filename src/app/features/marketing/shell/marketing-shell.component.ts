import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { filter } from 'rxjs';

import { LangCode, LanguageService } from '../../../core/services/language.service';
import { MARKETING_CONFIG, platformUrl } from '../marketing.config';
import { WaitlistDialogComponent } from '../waitlist/waitlist-dialog.component';
import { WaitlistService } from '../waitlist/waitlist.service';

/**
 * Header, footer and landmarks shared by the public marketing pages (/landing, /ueber-uns, /fuer-anbieter,
 * /impressum, /datenschutz). It sits beside LayoutComponent, not inside it, so the app navbar stays off these pages.
 * The waitlist dialog is deferred: its code loads only after the first call to action asks for it.
 */
@Component({
  selector: 'app-marketing-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslateModule, WaitlistDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './marketing-shell.component.html',
  styleUrl: './marketing-shell.component.scss'
})
export class MarketingShellComponent {
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  private readonly config = inject(MARKETING_CONFIG);
  readonly waitlist = inject(WaitlistService);

  readonly languages = this.language.getLanguages();
  readonly currentLang = signal<LangCode>(this.language.getCurrent());
  readonly menuOpen = signal(false);
  readonly listingsLive = this.config.listingsLive;
  readonly platformHref = platformUrl(this.config);
  readonly year = new Date().getFullYear();

  constructor() {
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.menuOpen.set(false));
    this.language.currentLang$
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(code => this.currentLang.set(code));
  }

  toggleMenu(): void {
    this.menuOpen.update(open => !open);
  }

  @HostListener('document:keydown.escape')
  closeMenu(): void {
    this.menuOpen.set(false);
  }

  setLanguage(event: Event): void {
    this.language.use((event.target as HTMLSelectElement).value as LangCode);
  }

  /** "Immobilien" menu item: the search once listings exist, the waitlist before that. */
  openProperties(event: Event): void {
    if (!this.listingsLive) {
      event.preventDefault();
      this.menuOpen.set(false);
      this.requestWaitlist();
    }
  }

  requestWaitlist(): void {
    this.waitlist.open(null);
  }
}
