import { Injectable } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { BackendApiService } from '../api/backend-api.service';
import { TokenStorageService } from '../services/token-storage.service';
import {
  AuthTokenResponse,
  SendOtpRequest,
  SendOtpResponse,
  VerifyOtpRequest,
  normalizeAuthTokenResponse
} from '../models/auth.model';

@Injectable({ providedIn: 'root' })
export class OtpApiService {
  constructor(
    private readonly api: BackendApiService,
    private readonly tokenStorage: TokenStorageService
  ) {}

  sendOtp(request: SendOtpRequest): Observable<SendOtpResponse> {
    return this.api.post<SendOtpResponse>('/auth/phone/send-otp', request);
  }

  verifyOtp(request: VerifyOtpRequest): Observable<AuthTokenResponse> {
    return this.api.post<unknown>('/auth/phone/verify', request).pipe(
      map(response => normalizeAuthTokenResponse(response)),
      tap(response => this.tokenStorage.storeTokens(response))
    );
  }
}
