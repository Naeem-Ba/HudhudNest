// =====================================================================
// Ã¢Å“â€¦ FIX #7 Ã¢â‚¬â€œ profile.component.ts
// Ã˜Â§Ã™â€žÃ™â€¦Ã˜Â´Ã™Æ’Ã™â€žÃ˜Â© Ã˜Â§Ã™â€žÃ˜Â£Ã™Ë†Ã™â€žÃ™â€°: uploadAvatar() Ã˜ÂªÃ™ÂÃ˜Â±Ã˜Â¬Ã˜Â¹ Ã˜Â®Ã˜Â·Ã˜Â£ Ã˜Â¯Ã˜Â§Ã˜Â¦Ã™â€¦Ã˜Â§Ã™â€¹ Ã¢â‚¬â€œ endpoint Ã˜ÂºÃ™Å Ã˜Â± Ã™â€¦Ã™Æ’Ã˜ÂªÃ™â€¦Ã™â€ž
// Ã˜Â§Ã™â€žÃ™â€¦Ã˜Â´Ã™Æ’Ã™â€žÃ˜Â© Ã˜Â§Ã™â€žÃ˜Â«Ã˜Â§Ã™â€ Ã™Å Ã˜Â© (#13): deleteAccount() Ã™â€žÃ˜Â§ Ã˜ÂªÃ™ÂÃ˜Â³Ã˜Â¬Ã™â€˜Ã™â€ž Ã˜Â®Ã˜Â±Ã™Ë†Ã˜Â¬Ã˜Â§Ã™â€¹ Ã˜Â¨Ã˜Â¹Ã˜Â¯ Ã˜Â§Ã™â€žÃ˜Â­Ã˜Â°Ã™Â
// Ã˜Â§Ã™â€žÃ˜Â­Ã™â€ž #7: Ã˜Â¥Ã˜Â®Ã™ÂÃ˜Â§Ã˜Â¡ Ã˜Â²Ã˜Â± Ã˜Â§Ã™â€žÃ˜Â±Ã™ÂÃ˜Â¹ Ã™â€¦Ã˜Â¹ Ã˜Â¥Ã˜Â´Ã˜Â¹Ã˜Â§Ã˜Â± Ã™Ë†Ã˜Â§Ã˜Â¶Ã˜Â­ Ã™â€žÃ™â€žÃ™â€¦Ã˜Â³Ã˜ÂªÃ˜Â®Ã˜Â¯Ã™â€¦
// Ã˜Â§Ã™â€žÃ˜Â­Ã™â€ž #13: Ã™â€¦Ã˜Â³Ã˜Â­ Ã˜Â§Ã™â€žÃ˜Â¬Ã™â€žÃ˜Â³Ã˜Â© Ã™Ë†Ã˜Â§Ã™â€žÃ˜ÂªÃ™Ë†Ã˜Â¬Ã™Å Ã™â€¡ Ã™â€žÃ˜ÂµÃ™ÂÃ˜Â­Ã˜Â© Ã˜ÂªÃ˜Â³Ã˜Â¬Ã™Å Ã™â€ž Ã˜Â§Ã™â€žÃ˜Â¯Ã˜Â®Ã™Ë†Ã™â€ž Ã˜Â¨Ã˜Â¹Ã˜Â¯ Ã˜Â§Ã™â€žÃ˜Â­Ã˜Â°Ã™Â
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
  // Ã¢Å“â€¦ FIX #15: OnPush Ã™â€žÃ˜ÂªÃ˜Â­Ã˜Â³Ã™Å Ã™â€  Ã˜Â§Ã™â€žÃ˜Â£Ã˜Â¯Ã˜Â§Ã˜Â¡ Ã¢â‚¬â€œ Ã™Å Ã˜Â¹Ã™â€¦Ã™â€ž Ã˜Â¬Ã™Å Ã˜Â¯Ã˜Â§Ã™â€¹ Ã™â€¦Ã˜Â¹ Signals
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
  // Ã¢Å“â€¦ FIX #13: Ã™â€ Ã˜Â­Ã˜ÂªÃ˜Â§Ã˜Â¬ Router Ã™â€žÃ™â€žÃ˜ÂªÃ™Ë†Ã˜Â¬Ã™Å Ã™â€¡ Ã˜Â¨Ã˜Â¹Ã˜Â¯ Ã˜Â­Ã˜Â°Ã™Â Ã˜Â§Ã™â€žÃ˜Â­Ã˜Â³Ã˜Â§Ã˜Â¨
  private readonly router         = inject(Router);

  user          = signal<UserProfile | null>(null);
  isLoading     = signal(true);
  isSaving      = signal(false);
  isUploading   = signal(false);
  errorMsg      = signal('');
  avatarPreview = signal<string | null>(null);
  showPasswordForm = signal(false);

  // Ã¢Å“â€¦ FIX #7: Ã˜Â¥Ã˜Â¸Ã™â€¡Ã˜Â§Ã˜Â± Ã˜Â±Ã˜Â³Ã˜Â§Ã™â€žÃ˜Â© "Ã˜Â§Ã™â€žÃ™Ë†Ã˜Â¸Ã™Å Ã™ÂÃ˜Â© Ã™â€šÃ™Å Ã˜Â¯ Ã˜Â§Ã™â€žÃ˜ÂªÃ˜Â·Ã™Ë†Ã™Å Ã˜Â±" Ã˜Â¨Ã˜Â¯Ã™â€žÃ˜Â§Ã™â€¹ Ã™â€¦Ã™â€  Ã˜Â®Ã˜Â·Ã˜Â£ Ã˜ÂµÃ˜Â§Ã™â€¦Ã˜Âª
  avatarUploadAvailable = false; // Ã¢â€ Â Ã˜Â§Ã˜Â¬Ã˜Â¹Ã™â€žÃ™â€¡Ã˜Â§ true Ã˜Â¹Ã™â€ Ã˜Â¯Ã™â€¦Ã˜Â§ Ã™Å Ã™Æ’Ã™Ë†Ã™â€  Backend Ã˜Â¬Ã˜Â§Ã™â€¡Ã˜Â²Ã˜Â§Ã™â€¹

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
        this.syncAuthStateFromProfile(updated);
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
   * Ã¢Å“â€¦ FIX #7: Ã˜Â¥Ã˜Â°Ã˜Â§ Ã™â€žÃ™â€¦ Ã™Å Ã™Æ’Ã™â€  Ã˜Â§Ã™â€žÃ™â‚¬ endpoint Ã˜Â¬Ã˜Â§Ã™â€¡Ã˜Â²Ã˜Â§Ã™â€¹Ã˜Å’ Ã˜Â£Ã˜Â®Ã˜Â¨Ã˜Â± Ã˜Â§Ã™â€žÃ™â€¦Ã˜Â³Ã˜ÂªÃ˜Â®Ã˜Â¯Ã™â€¦ Ã˜Â¨Ã™Ë†Ã˜Â¶Ã™Ë†Ã˜Â­
   * Ã˜Â¨Ã˜Â¯Ã™â€žÃ˜Â§Ã™â€¹ Ã™â€¦Ã™â€  Ã˜Â¥Ã˜Â±Ã˜Â³Ã˜Â§Ã™â€ž Ã˜Â·Ã™â€žÃ˜Â¨ Ã™Å Ã™ÂÃ˜Â´Ã™â€ž Ã˜Â¨Ã˜ÂµÃ™â€¦Ã˜Âª
   */
  onFileSelected(event: Event): void {
    // Ã¢Å“â€¦ FIX #7: Ã˜Â¥Ã˜Â°Ã˜Â§ Ã™â€žÃ™â€¦ Ã˜ÂªÃ™Æ’Ã™â€  Ã˜Â§Ã™â€žÃ™Ë†Ã˜Â¸Ã™Å Ã™ÂÃ˜Â© Ã˜Â¬Ã˜Â§Ã™â€¡Ã˜Â²Ã˜Â©Ã˜Å’ Ã˜Â£Ã˜Â®Ã˜Â¨Ã˜Â± Ã˜Â§Ã™â€žÃ™â€¦Ã˜Â³Ã˜ÂªÃ˜Â®Ã˜Â¯Ã™â€¦ Ã™ÂÃ™Ë†Ã˜Â±Ã˜Â§Ã™â€¹
    if (!this.avatarUploadAvailable) {
      this.toast.warning(this.translate.instant('PROFILE.MESSAGES.AVATAR_COMING_SOON')
        || 'Ã™Ë†Ã˜Â¸Ã™Å Ã™ÂÃ˜Â© Ã˜Â±Ã™ÂÃ˜Â¹ Ã˜Â§Ã™â€žÃ˜ÂµÃ™Ë†Ã˜Â±Ã˜Â© Ã™â€šÃ™Å Ã˜Â¯ Ã˜Â§Ã™â€žÃ˜ÂªÃ˜Â·Ã™Ë†Ã™Å Ã˜Â± Ã™Ë†Ã˜Â³Ã˜ÂªÃ™Æ’Ã™Ë†Ã™â€  Ã™â€¦Ã˜ÂªÃ˜Â§Ã˜Â­Ã˜Â© Ã™â€šÃ˜Â±Ã™Å Ã˜Â¨Ã˜Â§Ã™â€¹.');
      // Ã˜Â£Ã˜Â¹Ã˜Â¯ Ã˜Â¶Ã˜Â¨Ã˜Â· Ã™â€šÃ™Å Ã™â€¦Ã˜Â© Ã˜Â§Ã™â€žÃ˜Â­Ã™â€šÃ™â€ž
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
        this.syncAuthStateFromProfile(updated);
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
   * Ã¢Å“â€¦ FIX #13: Ã˜Â¨Ã˜Â¹Ã˜Â¯ Ã˜Â­Ã˜Â°Ã™Â Ã˜Â§Ã™â€žÃ˜Â­Ã˜Â³Ã˜Â§Ã˜Â¨ Ã¢â€ â€™ Ã™â€¦Ã˜Â³Ã˜Â­ Ã˜Â§Ã™â€žÃ˜Â¬Ã™â€žÃ˜Â³Ã˜Â© Ã¢â€ â€™ Ã˜Â§Ã™â€žÃ˜ÂªÃ™Ë†Ã˜Â¬Ã™Å Ã™â€¡ Ã™â€žÃ˜ÂªÃ˜Â³Ã˜Â¬Ã™Å Ã™â€ž Ã˜Â§Ã™â€žÃ˜Â¯Ã˜Â®Ã™Ë†Ã™â€ž
   */
  onDeleteAccount(): void {
    if (!confirm(this.translate.instant('PROFILE.MESSAGES.DELETE_CONFIRM'))) return;

    this.profileService.deleteAccount().subscribe({
      next: () => {
        // Ã¢Å“â€¦ FIX #13: Ã™â€¦Ã˜Â³Ã˜Â­ Ã˜Â§Ã™â€žÃ˜ÂªÃ™Ë†Ã™Æ’Ã™â€  Ã™Ë†Ã˜Â¨Ã™Å Ã˜Â§Ã™â€ Ã˜Â§Ã˜Âª Ã˜Â§Ã™â€žÃ˜Â¬Ã™â€žÃ˜Â³Ã˜Â©
        this.authService.logoutLocal();

        this.toast.success(this.translate.instant('PROFILE.MESSAGES.DELETE_SUCCESS'));

        // Ã¢Å“â€¦ FIX #13: Ã˜ÂªÃ™Ë†Ã˜Â¬Ã™Å Ã™â€¡ Ã˜Â§Ã™â€žÃ™â€¦Ã˜Â³Ã˜ÂªÃ˜Â®Ã˜Â¯Ã™â€¦ Ã˜Â®Ã˜Â§Ã˜Â±Ã˜Â¬ Ã˜Â§Ã™â€žÃ˜ÂªÃ˜Â·Ã˜Â¨Ã™Å Ã™â€š
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

  /**
   * Keeps AuthService independent from Profile DTO shape.
   * The profile endpoint returns UserProfile, while AuthService owns AuthenticatedUser.
   */
  private syncAuthStateFromProfile(profile: UserProfile): void {
    const id = profile.id ?? profile.Id ?? '';
    const displayName =
      profile.DisplayName?.trim() ||
      [profile.Vorname, profile.Name].filter(Boolean).join(' ').trim() ||
      profile.Email ||
      '';

    this.authService.updateCurrentUser({
      id,
      Id: id,
      email: profile.Email ?? '',
      Email: profile.Email ?? '',
      displayName,
      DisplayName: displayName,
      ImageUrl: profile.ImageUrl ?? null,
      imageUrl: profile.ImageUrl ?? null
    });
  }
  private resetPasswordForm(): void {
    this.passwordData     = { currentPassword: '', newPassword: '', confirmPassword: '' };
    this.passwordSubmitted = false;
    this.showPasswordForm.set(false);
  }
}