import { Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { TokenStorageService } from './token-storage.service';
import {
  AuthTokenResponse,
  SendOtpRequest,
  SendOtpResponse,
  VerifyOtpRequest
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
    return this.api
      .post<AuthTokenResponse>('/auth/phone/verify', request)
      .pipe(tap(response => this.tokenStorage.storeTokens(response)));
  }
}
