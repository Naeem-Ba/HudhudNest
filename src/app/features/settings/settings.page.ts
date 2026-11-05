import { ChangeDetectionStrategy, Component } from '@angular/core';

import { PreferencesCardComponent } from '../../shared/ui/preferences-card.component';
import { HomeAreaCardComponent } from './home-area-card.component';
import { NotificationSettingsCardComponent } from './notification-settings-card.component';

/** Language, display currency and (signed in) home area and notification settings, reachable signed in or out (the account menu links the signed-in profile page too). */
@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [PreferencesCardComponent, HomeAreaCardComponent, NotificationSettingsCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<main class="settings-page"><app-preferences-card /><app-home-area-card /><app-notification-settings-card /></main>`,
  styles: [`.settings-page { max-width: 560px; margin: 0 auto; padding: 1.5rem 1rem 3rem; }`]
})
export class SettingsPage {}
