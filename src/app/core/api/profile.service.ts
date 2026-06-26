import { Injectable } from '@angular/core';
import { Observable, map, throwError } from 'rxjs';
import { BackendApiService } from './backend-api.service';

export interface UserProfile {
  Id?: string;
  id?: string;

  Vorname?: string;
  Name?: string;
  DisplayName?: string;
  Email?: string;
  Phone?: string;
  ImageUrl?: string;

  IsAgent?: boolean;
  TaxNumber?: string;

  Role?: string;
}

interface BackendUserProfile {
  id?: string;
  Id?: string;

  userName?: string;
  UserName?: string;

  fullName?: string;
  FullName?: string;

  firstName?: string;
  FirstName?: string;

  lastName?: string;
  LastName?: string;

  displayName?: string;
  DisplayName?: string;

  email?: string;
  Email?: string;

  phoneNumber?: string;
  PhoneNumber?: string;
  phone?: string;
  Phone?: string;

  profileImageUrl?: string;
  ProfileImageUrl?: string;
  imageUrl?: string;
  ImageUrl?: string;

  isAgent?: boolean;
  IsAgent?: boolean;

  taxNumber?: string;
  TaxNumber?: string;

  role?: string;
  Role?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  constructor(private readonly api: BackendApiService) {}

  getMe(): Observable<UserProfile> {
    return this.api
      .get<BackendUserProfile>('/users/me')
      .pipe(map(user => this.toLegacyUserProfile(user)));
  }

  updateProfile(data: UserProfile): Observable<UserProfile> {
    return this.api
      .put<BackendUserProfile>('/users/me', this.toUpdateRequest(data))
      .pipe(map(user => this.toLegacyUserProfile(user)));
  }

  changePassword(data: ChangePasswordRequest): Observable<void> {
    return this.api.post<void>('/users/me/change-password', data);
  }

  deleteAccount(): Observable<void> {
    return this.api.delete<void>('/users/me');
  }

  uploadAvatar(_file: File): Observable<{ ImageUrl: string; imageUrl: string }> {
    return throwError(() => new Error('Avatar upload endpoint is not confirmed in Backend contract yet.'));
  }

  private toLegacyUserProfile(user: BackendUserProfile): UserProfile {
    const fullName = user.fullName ?? user.FullName ?? user.displayName ?? user.DisplayName ?? user.userName ?? user.UserName ?? '';
    const nameParts = fullName.trim().split(/\s+/).filter(Boolean);

    return {
      Id: user.id ?? user.Id,
      id: user.id ?? user.Id,

      Vorname: user.firstName ?? user.FirstName ?? nameParts[0] ?? '',
      Name: user.lastName ?? user.LastName ?? nameParts.slice(1).join(' ') ?? '',
      DisplayName: user.displayName ?? user.DisplayName ?? fullName,

      Email: user.email ?? user.Email ?? '',
      Phone: user.phoneNumber ?? user.PhoneNumber ?? user.phone ?? user.Phone ?? '',
      ImageUrl: user.profileImageUrl ?? user.ProfileImageUrl ?? user.imageUrl ?? user.ImageUrl ?? '',

      IsAgent: user.isAgent ?? user.IsAgent ?? false,
      TaxNumber: user.taxNumber ?? user.TaxNumber ?? '',

      Role: user.role ?? user.Role
    };
  }

  private toUpdateRequest(user: UserProfile): Record<string, unknown> {
    const fullName = [user.Vorname, user.Name].filter(Boolean).join(' ').trim();

    return {
      fullName: user.DisplayName?.trim() || fullName || undefined,
      phoneNumber: user.Phone?.trim() || undefined,
      isAgent: user.IsAgent ?? false,
      taxNumber: user.TaxNumber?.trim() || undefined
    };
  }
}