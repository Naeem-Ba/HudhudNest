import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './core/api.service';

export interface UserProfile {
  Id: number;
  Vorname: string;
  Name: string;
  DisplayName: string;
  Email: string;
  Phone?: string;
  IsAgent: boolean;
  TaxNumber?: string; // تم إضافة الرقم الضريبي هنا
  ImageUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  
   private readonly endpoint = '/profile';

  constructor(private api: ApiService) {}

  getMe(): Observable<UserProfile> {
    return this.api.get<UserProfile>(`${this.endpoint}/me`);
  }

  updateProfile(data: UserProfile): Observable<UserProfile> {
    return this.api.put<UserProfile>(this.endpoint, data);
  }

  uploadAvatar(file: File): Observable<{ imageUrl: string }> {
    const fd = new FormData();
    fd.append('file', file);
    return this.api.post<{ imageUrl: string }>(`${this.endpoint}/avatar`, fd);
  }
  
  changePassword(data: any): Observable<any> {
    return this.api.post(`${this.endpoint}/change-password`, data);
  }

  deleteAccount(): Observable<any> {
    return this.api.delete(`${this.endpoint}/delete`);
  }
}
