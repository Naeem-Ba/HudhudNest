import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class ProfileService {

  private api = 'https://localhost:7136/api/profile';

  constructor(private http: HttpClient) {}

  getMe() {
    return this.http.get<any>(`${this.api}/me`);
  }

  updateProfile(data: any) {
    return this.http.put<any>(this.api, data);
  }

  uploadAvatar(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<any>(`${this.api}/avatar`, fd);
  }
}
