import { Injectable } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { BackendApiService } from '../api/backend-api.service';
import { TokenStorageService } from '../services/token-storage.service';
import {
  AuthTokenResponse,
  OtpPurpose,
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
    const payload: SendOtpRequest = {
      ...request,
      phoneNumber: request.phoneNumber.trim(),
      purpose: request.purpose ?? OtpPurpose.PhoneRegistration
    };

    return this.api.post<SendOtpResponse>('/auth/phone/send-otp', payload);
  }

  verifyOtp(request: VerifyOtpRequest): Observable<AuthTokenResponse> {
    const payload: VerifyOtpRequest = {
      ...request,
      phoneNumber: request.phoneNumber.trim(),
      code: request.code.trim(),
      purpose: request.purpose ?? OtpPurpose.PhoneRegistration,
      firstName: request.firstName?.trim() || undefined,
      lastName: request.lastName?.trim() || undefined
    };

    return this.api.post<unknown>('/auth/phone/verify', payload).pipe(
      map(response => normalizeAuthTokenResponse(response)),
      tap(response => this.tokenStorage.storeTokens(response))
    );
  }
}