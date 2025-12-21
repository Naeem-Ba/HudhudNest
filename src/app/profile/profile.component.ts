import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '../services/profile.service';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {

  user: any = null;
  previewImage: string | null = null;

  constructor(
    private profile: ProfileService,
    private auth: AuthService
  ) {}

  ngOnInit(): void {
    this.profile.getMe().subscribe(user => {
      this.user = { ...user };
    });
  }

  save(): void {
    this.profile.updateProfile(this.user).subscribe(updated => {
      this.user = updated;
      this.auth.updateCurrentUser(updated);
      alert('تم حفظ التغييرات بنجاح');
    });
  }

  onFileChange(event: any): void {
    const file: File = event.target.files[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onload = () => {
      this.previewImage = reader.result as string;
    };
    reader.readAsDataURL(file);

    // Upload
    this.profile.uploadAvatar(file).subscribe(res => {
      this.user.ImageUrl = res.imageUrl;
      this.auth.updateCurrentUser(this.user);
    });
  }
}
