// =====================================================================
// âœ… FIX #7 â€“ profile.component.ts
// Ø§Ù„Ù…Ø´ÙƒÙ„Ø© Ø§Ù„Ø£ÙˆÙ„Ù‰: uploadAvatar() ØªÙØ±Ø¬Ø¹ Ø®Ø·Ø£ Ø¯Ø§Ø¦Ù…Ø§Ù‹ â€“ endpoint ØºÙŠØ± Ù…ÙƒØªÙ…Ù„
// Ø§Ù„Ù…Ø´ÙƒÙ„Ø© Ø§Ù„Ø«Ø§Ù†ÙŠØ© (#13): deleteAccount() Ù„Ø§ ØªÙØ³Ø¬Ù‘Ù„ Ø®Ø±ÙˆØ¬Ø§Ù‹ Ø¨Ø¹Ø¯ Ø§Ù„Ø­Ø°Ù
// Ø§Ù„Ø­Ù„ #7: Ø¥Ø®ÙØ§Ø¡ Ø²Ø± Ø§Ù„Ø±ÙØ¹ Ù…Ø¹ Ø¥Ø´Ø¹Ø§Ø± ÙˆØ§Ø¶Ø­ Ù„Ù„Ù…Ø³ØªØ®Ø¯Ù…
// Ø§Ù„Ø­Ù„ #13: Ù…Ø³Ø­ Ø§Ù„Ø¬Ù„Ø³Ø© ÙˆØ§Ù„ØªÙˆØ¬ÙŠÙ‡ Ù„ØµÙØ­Ø© ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ø¨Ø¹Ø¯ Ø§Ù„Ø­Ø°Ù
// =====================================================================
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ProfileService, UserProfile } from '../services/profile.service';
import { AuthService } from '../services/auth.service';
import { UrlService } from '../services/core/url.service';
import { ToastService } from '../shared/services/toast.service';
import { LoadingSpinnerComponent } from '../shared/ui/loading-spinner.component';
import { ImageFallbackDirective } from '../shared/directives/image-fallback.directive';

@Component({
  selector: 'app-profile',
  standalone: true,
  // âœ… FIX #15: OnPush Ù„ØªØ­Ø³ÙŠÙ† Ø§Ù„Ø£Ø¯Ø§Ø¡ â€“ ÙŠØ¹Ù…Ù„ Ø¬ÙŠØ¯Ø§Ù‹ Ù…Ø¹ Signals
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    LoadingSpinnerComponent,
    ImageFallbackDirective
  ],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly authService    = inject(AuthService);
  private readonly translate      = inject(TranslateService);
  private readonly urlService     = inject(UrlService);
  private readonly toast          = inject(ToastService);
  // âœ… FIX #13: Ù†Ø­ØªØ§Ø¬ Router Ù„Ù„ØªÙˆØ¬ÙŠÙ‡ Ø¨Ø¹Ø¯ Ø­Ø°Ù Ø§Ù„Ø­Ø³Ø§Ø¨
  private readonly router         = inject(Router);

  user          = signal<UserProfile | null>(null);
  isLoading     = signal(true);
  isSaving      = signal(false);
  isUploading   = signal(false);
  errorMsg      = signal('');
  avatarPreview = signal<string | null>(null);
  showPasswordForm = signal(false);

  // âœ… FIX #7: Ø¥Ø¸Ù‡Ø§Ø± Ø±Ø³Ø§Ù„Ø© "Ø§Ù„ÙˆØ¸ÙŠÙØ© Ù‚ÙŠØ¯ Ø§Ù„ØªØ·ÙˆÙŠØ±" Ø¨Ø¯Ù„Ø§Ù‹ Ù…Ù† Ø®Ø·Ø£ ØµØ§Ù…Øª
  avatarUploadAvailable = false; // â† Ø§Ø¬Ø¹Ù„Ù‡Ø§ true Ø¹Ù†Ø¯Ù…Ø§ ÙŠÙƒÙˆÙ† Backend Ø¬Ø§Ù‡Ø²Ø§Ù‹

  submitted         = false;
  passwordSubmitted = false;

  readonly fallbackAvatar = '/images/default-avatar.svg';
  readonly allowedTypes   = ['image/png', 'image/jpeg', 'image/jpg'];
  readonly maxFileSizeMB  = 2;

  passwordData = { currentPassword: '', newPassword: '', confirmPassword: '' };

  ngOnInit(): void {
    this.fetchProfile();
  }

  fetchProfile(): void {
    this.isLoading.set(true);
    this.errorMsg.set('');

    this.profileService.getMe().subscribe({
      next: data => {
        this.user.set(data);
        this.avatarPreview.set(this.urlService.build(data.ImageUrl) || this.fallbackAvatar);
        this.isLoading.set(false);
      },
      error: () => {
        const message = this.translate.instant('PROFILE.FETCH_ERROR');
        this.errorMsg.set(message);
        this.toast.error(message);
        this.isLoading.set(false);
      }
    });
  }

  onSaveProfile(form: NgForm): void {
    this.submitted = true;
    form.control.markAllAsTouched();

    const user = this.user();
    if (!user) return;

    if (form.invalid || this.hasAgentValidationError(user)) {
      this.toast.error(this.translate.instant('PROFILE.MESSAGES.AGENT_VALIDATION'));
      return;
    }

    this.isSaving.set(true);

    this.profileService.updateProfile(user).subscribe({
      next: updated => {
        this.user.set(updated);
        this.authService.updateCurrentUser(updated);
        this.isSaving.set(false);
        this.submitted = false;
        this.toast.success(this.translate.instant('PROFILE.MESSAGES.SAVE_SUCCESS'));
      },
      error: () => {
        this.isSaving.set(false);
        this.toast.error(this.translate.instant('PROFILE.MESSAGES.SAVE_ERROR'));
      }
    });
  }

  /**
   * âœ… FIX #7: Ø¥Ø°Ø§ Ù„Ù… ÙŠÙƒÙ† Ø§Ù„Ù€ endpoint Ø¬Ø§Ù‡Ø²Ø§Ù‹ØŒ Ø£Ø®Ø¨Ø± Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø¨ÙˆØ¶ÙˆØ­
   * Ø¨Ø¯Ù„Ø§Ù‹ Ù…Ù† Ø¥Ø±Ø³Ø§Ù„ Ø·Ù„Ø¨ ÙŠÙØ´Ù„ Ø¨ØµÙ…Øª
   */
  onFileSelected(event: Event): void {
    // âœ… FIX #7: Ø¥Ø°Ø§ Ù„Ù… ØªÙƒÙ† Ø§Ù„ÙˆØ¸ÙŠÙØ© Ø¬Ø§Ù‡Ø²Ø©ØŒ Ø£Ø®Ø¨Ø± Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… ÙÙˆØ±Ø§Ù‹
    if (!this.avatarUploadAvailable) {
      this.toast.warning(this.translate.instant('PROFILE.MESSAGES.AVATAR_COMING_SOON')
        || 'ÙˆØ¸ÙŠÙØ© Ø±ÙØ¹ Ø§Ù„ØµÙˆØ±Ø© Ù‚ÙŠØ¯ Ø§Ù„ØªØ·ÙˆÙŠØ± ÙˆØ³ØªÙƒÙˆÙ† Ù…ØªØ§Ø­Ø© Ù‚Ø±ÙŠØ¨Ø§Ù‹.');
      // Ø£Ø¹Ø¯ Ø¶Ø¨Ø· Ù‚ÙŠÙ…Ø© Ø§Ù„Ø­Ù‚Ù„
      const input = event.target as HTMLInputElement;
      input.value = '';
      return;
    }

    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (!this.allowedTypes.includes(file.type)) {
      this.toast.error(this.translate.instant('PROFILE.MESSAGES.INVALID_IMAGE_TYPE'));
      return;
    }

    if (file.size / 1024 / 1024 > this.maxFileSizeMB) {
      this.toast.error(this.translate.instant('PROFILE.MESSAGES.IMAGE_TOO_LARGE'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => this.avatarPreview.set(reader.result as string);
    reader.readAsDataURL(file);

    this.isUploading.set(true);

    this.profileService.uploadAvatar(file).subscribe({
      next: res => {
        const updated = { ...this.user()!, ImageUrl: res.imageUrl };
        this.user.set(updated);
        this.avatarPreview.set(
          this.urlService.buildWithCacheBuster(res.imageUrl) || this.fallbackAvatar
        );
        this.authService.updateCurrentUser(updated);
        this.isUploading.set(false);
        this.toast.success(this.translate.instant('PROFILE.MESSAGES.AVATAR_SUCCESS'));
      },
      error: () => {
        this.isUploading.set(false);
        this.avatarPreview.set(this.fallbackAvatar);
        this.toast.error(this.translate.instant('PROFILE.MESSAGES.SAVE_ERROR'));
      }
    });
  }

  onChangePassword(): void {
    this.passwordSubmitted = true;
    const { currentPassword, newPassword, confirmPassword } = this.passwordData;

    if (!currentPassword || !newPassword || !confirmPassword) {
      this.toast.error(this.translate.instant('PROFILE.MESSAGES.FILL_ALL_FIELDS'));
      return;
    }

    if (newPassword.length < 8) {
      this.toast.error(this.translate.instant('AUTH.ERRORS.PASSWORD_MIN'));
      return;
    }

    if (newPassword !== confirmPassword) {
      this.toast.error(this.translate.instant('PROFILE.MESSAGES.PASS_MISMATCH'));
      return;
    }

    this.isSaving.set(true);

    this.profileService.changePassword({ currentPassword, newPassword }).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.toast.success(this.translate.instant('PROFILE.MESSAGES.PASS_SUCCESS'));
        this.resetPasswordForm();
      },
      error: () => {
        this.isSaving.set(false);
        this.toast.error(this.translate.instant('PROFILE.MESSAGES.PASS_ERROR'));
      }
    });
  }

  /**
   * âœ… FIX #13: Ø¨Ø¹Ø¯ Ø­Ø°Ù Ø§Ù„Ø­Ø³Ø§Ø¨ â†’ Ù…Ø³Ø­ Ø§Ù„Ø¬Ù„Ø³Ø© â†’ Ø§Ù„ØªÙˆØ¬ÙŠÙ‡ Ù„ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„
   */
  onDeleteAccount(): void {
    if (!confirm(this.translate.instant('PROFILE.MESSAGES.DELETE_CONFIRM'))) return;

    this.profileService.deleteAccount().subscribe({
      next: () => {
        // âœ… FIX #13: Ù…Ø³Ø­ Ø§Ù„ØªÙˆÙƒÙ† ÙˆØ¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø¬Ù„Ø³Ø©
        this.authService.logout();

        this.toast.success(this.translate.instant('PROFILE.MESSAGES.DELETE_SUCCESS'));

        // âœ… FIX #13: ØªÙˆØ¬ÙŠÙ‡ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø®Ø§Ø±Ø¬ Ø§Ù„ØªØ·Ø¨ÙŠÙ‚
        this.router.navigateByUrl('/auth/login');
      },
      error: () => {
        this.toast.error(this.translate.instant('PROFILE.MESSAGES.DELETE_ERROR'));
      }
    });
  }

  patchUserField(field: keyof UserProfile, value: any): void {
    const current = this.user();
    if (!current) return;
    this.user.set({ ...current, [field]: value });
  }

  hasAgentValidationError(user: UserProfile | null): boolean {
    return !!user?.IsAgent && (!user.Phone?.trim() || !user.TaxNumber?.trim());
  }

  passwordMismatch(): boolean {
    return (
      !!this.passwordData.confirmPassword &&
      this.passwordData.newPassword !== this.passwordData.confirmPassword
    );
  }

  private resetPasswordForm(): void {
    this.passwordData     = { currentPassword: '', newPassword: '', confirmPassword: '' };
    this.passwordSubmitted = false;
    this.showPasswordForm.set(false);
  }
}
