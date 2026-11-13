import { ChangeDetectionStrategy, Component } from '@angular/core';

import { PreferencesCardComponent } from '../../shared/ui/preferences-card.component';
import { HomeAreaCardComponent } from './home-area-card.component';
import { NotificationSettingsCardComponent } from './notification-settings-card.component';
import { LegalLinksCardComponent } from './legal-links-card.component';
import { MeasurementSettingsCardComponent } from './measurement-settings-card.component';
import { NewsletterSettingsCardComponent } from './newsletter-settings-card.component';

/** Language, display currency, (signed in) home area, notification and newsletter settings, the measurement choice, reachable signed in or out (the account menu links the signed-in profile page too). */
@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [PreferencesCardComponent, HomeAreaCardComponent, NotificationSettingsCardComponent, NewsletterSettingsCardComponent, MeasurementSettingsCardComponent, LegalLinksCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<main class="settings-page"><app-preferences-card /><app-home-area-card /><app-notification-settings-card /><app-newsletter-settings-card /><app-measurement-settings-card /><app-legal-links-card /></main>`,
  styles: [`.settings-page { max-width: 560px; margin: 0 auto; padding: 1.5rem 1rem 3rem; }`]
})
export class SettingsPage {}
