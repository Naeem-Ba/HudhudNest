import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ProfileService, UserProfile } from '../services/profile.service';
import { AuthService } from '../services/auth.service';
import { UrlService } from '../services/core/url.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {

  private profileService = inject(ProfileService);
  private authService = inject(AuthService);
  private translate = inject(TranslateService);
  private urlService = inject(UrlService);

  user = signal<UserProfile | null>(null);
  isLoading = signal(true);
  errorMsg = signal('');
  avatarPreview = signal<string | null>(null);
  showPasswordForm = signal(false);

  readonly allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
  readonly maxFileSizeMB = 2;

  passwordData = { currentPassword: '', newPassword: '', confirmPassword: '' };

  ngOnInit(): void {
    this.fetchProfile();
  }

  fetchProfile(): void {
    this.isLoading.set(true);

    this.profileService.getMe().subscribe({
      next: (data) => {
        this.user.set(data);
        this.avatarPreview.set(this.urlService.build(data.ImageUrl));
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMsg.set(this.translate.instant('PROFILE.FETCH_ERROR'));
        this.isLoading.set(false);
      }
    });
  }

  onSaveProfile(): void {
    const user = this.user();
    if (!user) return;

    if (user.IsAgent && (!user.Phone?.trim() || !user.TaxNumber?.trim())) {
      this.showAlert('PROFILE.MESSAGES.AGENT_VALIDATION');
      return;
    }

    this.profileService.updateProfile(user).subscribe({
      next: (updated) => {
        this.user.set(updated);
        this.authService.updateCurrentUser(updated);
        this.showAlert('PROFILE.MESSAGES.SAVE_SUCCESS');
      },
      error: () => this.showAlert('PROFILE.MESSAGES.SAVE_ERROR')
    });
  }

  onFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (!this.allowedTypes.includes(file.type)) {
      alert('JPG / PNG فقط');
      return;
    }

    if (file.size / 1024 / 1024 > this.maxFileSizeMB) {
      this.showAlert('PROFILE.MESSAGES.SAVE_ERROR');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => this.avatarPreview.set(reader.result as string);
    reader.readAsDataURL(file);

    this.profileService.uploadAvatar(file).subscribe({
      next: (res) => {
        const updated = { ...this.user()!, ImageUrl: res.imageUrl };
        this.user.set(updated);
        this.avatarPreview.set(this.urlService.buildWithCacheBuster(res.imageUrl));
        this.authService.updateCurrentUser(updated);
      },
      error: () => this.showAlert('PROFILE.MESSAGES.SAVE_ERROR')
    });
  }

  onChangePassword(): void {
    const { currentPassword, newPassword, confirmPassword } = this.passwordData;

    if (!currentPassword || !newPassword || !confirmPassword) {
      this.showAlert('PROFILE.MESSAGES.FILL_ALL_FIELDS');
      return;
    }

    if (newPassword !== confirmPassword) {
      this.showAlert('PROFILE.MESSAGES.PASS_MISMATCH');
      return;
    }

    this.profileService.changePassword({ currentPassword, newPassword }).subscribe({
      next: () => {
        this.showAlert('PROFILE.MESSAGES.PASS_SUCCESS');
        this.resetPasswordForm();
      },
      error: () => this.showAlert('PROFILE.MESSAGES.PASS_ERROR')
    });
  }

  onDeleteAccount(): void {
    if (!confirm(this.translate.instant('PROFILE.MESSAGES.DELETE_CONFIRM'))) return;

    this.profileService.deleteAccount().subscribe({
      next: () => this.showAlert('PROFILE.MESSAGES.DELETE_SUCCESS'),
      error: () => this.showAlert('PROFILE.MESSAGES.DELETE_ERROR')
    });
  }

  private showAlert(key: string): void {
    this.translate.get(key).subscribe(alert);
  }

  private resetPasswordForm(): void {
    this.passwordData = { currentPassword: '', newPassword: '', confirmPassword: '' };
    this.showPasswordForm.set(false);
  }
}
