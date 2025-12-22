import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface UserProfile {
  Id: number;
  Vorname: string;
  Name: string;
  DisplayName: string;
  Email: string;
  Phone?: string;
  IsAgent: boolean;
  ImageUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private api = 'https://localhost:7136/api/profile/';

  constructor(private http: HttpClient) {}

  getMe(): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.api}me`);
  }

  updateProfile(data: UserProfile): Observable<UserProfile> {
    return this.http.put<UserProfile>(this.api, data);
  }

  uploadAvatar(file: File): Observable<{ imageUrl: string }> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<{ imageUrl: string }>(`${this.api}avatar`, fd);
  }

  deleteAccount(): Observable<any> {
    return this.http.delete(`${this.api}delete`);
  }
}
