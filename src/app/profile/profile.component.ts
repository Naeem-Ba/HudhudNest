import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
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
  imports: [CommonModule, FormsModule, TranslateModule, LoadingSpinnerComponent, ImageFallbackDirective],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly authService = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly urlService = inject(UrlService);
  private readonly toast = inject(ToastService);

  user = signal<UserProfile | null>(null);
  isLoading = signal(true);
  isSaving = signal(false);
  isUploading = signal(false);
  errorMsg = signal('');
  avatarPreview = signal<string | null>(null);
  showPasswordForm = signal(false);

  submitted = false;
  passwordSubmitted = false;

  readonly fallbackAvatar = '/images/default-avatar.svg';
  readonly allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
  readonly maxFileSizeMB = 2;

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

  onFileSelected(event: Event): void {
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
        this.avatarPreview.set(this.urlService.buildWithCacheBuster(res.imageUrl) || this.fallbackAvatar);
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

  onDeleteAccount(): void {
    if (!confirm(this.translate.instant('PROFILE.MESSAGES.DELETE_CONFIRM'))) return;

    this.profileService.deleteAccount().subscribe({
      next: () => this.toast.success(this.translate.instant('PROFILE.MESSAGES.DELETE_SUCCESS')),
      error: () => this.toast.error(this.translate.instant('PROFILE.MESSAGES.DELETE_ERROR'))
    });
  }


  patchUserField(field: keyof UserProfile, value: any): void {
    const current = this.user();

    if (!current) {
      return;
    }

    this.user.set({ ...current, [field]: value });
  }

  hasAgentValidationError(user: UserProfile | null): boolean {
    return !!user?.IsAgent && (!user.Phone?.trim() || !user.TaxNumber?.trim());
  }

  passwordMismatch(): boolean {
    return !!this.passwordData.confirmPassword && this.passwordData.newPassword !== this.passwordData.confirmPassword;
  }

  private resetPasswordForm(): void {
    this.passwordData = { currentPassword: '', newPassword: '', confirmPassword: '' };
    this.passwordSubmitted = false;
    this.showPasswordForm.set(false);
  }
}
