import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProfileService, UserProfile } from '../services/profile.service';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  // استخدام التبعيات الحديثة inject بدل Constructor
  private profileService = inject(ProfileService);
  private authService = inject(AuthService);

  // الحالة (State) الخاصة بالمكون
  user = signal<UserProfile | null>(null);
  isLoading = signal(true);
  errorMsg = signal('');
  avatarPreview = signal<string | null>(null);
  
  // إعدادات الملفات
  readonly baseUrl = 'https://localhost:7136';
  readonly allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
  readonly maxFileSizeMB = 2;

  ngOnInit(): void {
    this.fetchProfile();
  }

  /** تحميل بيانات الملف الشخصي من السيرفر */
  fetchProfile(): void {
    this.isLoading.set(true);
    this.profileService.getMe().subscribe({
      next: (data) => {
        this.user.set({ ...data });
        this.updateAvatarPreview(data.ImageUrl);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Fetch Error:', err);
        this.errorMsg.set('تعذر تحميل البيانات، يرجى التحقق من الجلسة.');
        this.isLoading.set(false);
      }
    });
  }

  /** تحديث رابط الصورة المعروضة */
  private updateAvatarPreview(path: string | undefined): void {
    if (path) {
      // التأكد من عدم تكرار السلاش بين الـ BaseUrl والمسار
      const fullPath = path.startsWith('/') ? `${this.baseUrl}${path}` : `${this.baseUrl}/${path}`;
      this.avatarPreview.set(fullPath);
    } else {
      this.avatarPreview.set(null);
    }
  }

  /** حفظ التعديلات النصية */
  onSaveProfile(): void {
    const userData = this.user();
    if (!userData) return;

    this.profileService.updateProfile(userData).subscribe({
      next: (updated) => {
        this.user.set(updated);
        this.authService.updateCurrentUser(updated);
        alert('✅ تم تحديث بياناتك بنجاح');
      },
      error: () => alert('❌ فشل حفظ التعديلات')
    });
  }

  /** معالجة رفع الصورة الشخصية */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    // التحقق من الصلاحية (النوع والحجم)
    if (!this.allowedTypes.includes(file.type)) {
      alert('الرجاء اختيار صورة بصيغة JPG أو PNG');
      return;
    }

    if (file.size / 1024 / 1024 > this.maxFileSizeMB) {
      alert(`حجم الصورة يجب أن لا يتجاوز ${this.maxFileSizeMB} ميجابايت`);
      return;
    }

    // عرض صورة مؤقتة للمستخدم (UX)
    const reader = new FileReader();
    reader.onload = () => this.avatarPreview.set(reader.result as string);
    reader.readAsDataURL(file);

    // الرفع الفعلي للسيرفر
    this.profileService.uploadAvatar(file).subscribe({
      next: (res) => {
        if (this.user()) {
          const updatedUser = { ...this.user()!, ImageUrl: res.imageUrl };
          this.user.set(updatedUser);
          this.updateAvatarPreview(res.imageUrl);
          this.authService.updateCurrentUser(updatedUser);
        }
      },
      error: () => alert('❌ حدث خطأ أثناء رفع الصورة')
    });
  }

  /** حذف الحساب */
  onDeleteAccount(): void {
    if (confirm('⚠️ تحذير: سيتم حذف حسابك نهائياً. هل أنت متأكد؟')) {
      this.profileService.deleteAccount().subscribe({
        next: () => {
          alert('تم حذف الحساب. وداعاً!');
          // هنا يفضل التوجيه لصفحة تسجيل الدخول أو الرئيسية
        },
        error: () => alert('فشل حذف الحساب حالياً')
      });
    }
  }
}