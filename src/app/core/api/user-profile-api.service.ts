// =============================================================
// src/app/core/api/user-profile-api.service.ts
//
// يغلّف نقاط الملف الشخصي العام على UsersController:
//   GET  /api/Users/{id}/profile
//   GET  /api/Users/{id}/ratings?page=&pageSize=
//   POST /api/Users/{id}/ratings   { credibility, safety, responseSpeed, transparency, comment }
//
// جميعها [AllowAnonymous] بالباك اند عدا POST (يتطلب تسجيل دخول) —
// راجع UsersController.cs.
// =============================================================

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { BackendApiService } from './backend-api.service';
import { apiToCamelCase } from '../adapters/api-naming.adapter';
import {
  RatingEligibilityDto,
  SubmitUserRatingRequest,
  UserProfileDto,
  UserRatingDto,
  UserRatingSummaryDto
} from '../models/user-profile.model';

@Injectable({ providedIn: 'root' })
export class UserProfileApiService {
  constructor(private readonly api: BackendApiService) {}

  getProfile(userId: string): Observable<UserProfileDto> {
    return this.api
      .get<unknown>(`/Users/${userId}/profile`)
      .pipe(map(item => this.toProfile(item)));
  }

  getRatings(userId: string, page = 1, pageSize = 20): Observable<UserRatingSummaryDto> {
    return this.api
      .get<unknown>(`/Users/${userId}/ratings`, { page, pageSize })
      .pipe(map(item => this.toRatingSummary(item)));
  }

  getEligibility(userId: string): Observable<RatingEligibilityDto> {
    return this.api
      .get<unknown>(`/Users/${userId}/ratings/eligibility`)
      .pipe(map(item => this.toEligibility(item)));
  }

  submitRating(userId: string, request: SubmitUserRatingRequest): Observable<UserRatingDto> {
    // ✅ الـ Backend يتوقع PascalCase في الـ body (نفس نمط messages-api.service.ts)
    const body = {
      Credibility: request.credibility,
      Safety: request.safety,
      ResponseSpeed: request.responseSpeed,
      Transparency: request.transparency,
      Comment: request.comment?.trim() || null
    };

    return this.api
      .post<unknown>(`/Users/${userId}/ratings`, body)
      .pipe(map(item => this.toRating(item)));
  }

  private toProfile(item: unknown): UserProfileDto {
    const p = apiToCamelCase<Record<string, unknown>>(item);

    return {
      id: String(p['id'] ?? ''),
      displayName: String(p['displayName'] ?? ''),
      profileImageUrl: (p['profileImageUrl'] as string) ?? null,
      memberSince: String(p['memberSince'] ?? ''),
      isAgent: Boolean(p['isAgent']),
      bio: (p['bio'] as string) ?? null,
      contactInfo: (p['contactInfo'] as string) ?? null,
      soldCount: Number(p['soldCount'] ?? 0),
      rentedCount: Number(p['rentedCount'] ?? 0),
      averageCredibility: Number(p['averageCredibility'] ?? 0),
      averageSafety: Number(p['averageSafety'] ?? 0),
      averageResponseSpeed: Number(p['averageResponseSpeed'] ?? 0),
      averageTransparency: Number(p['averageTransparency'] ?? 0),
      averageOverall: Number(p['averageOverall'] ?? 0),
      ratingsCount: Number(p['ratingsCount'] ?? 0)
    };
  }

  private toRatingSummary(item: unknown): UserRatingSummaryDto {
    const s = apiToCamelCase<Record<string, unknown>>(item);
    const rawRatings = Array.isArray(s['ratings']) ? s['ratings'] : [];

    return {
      averageCredibility: Number(s['averageCredibility'] ?? 0),
      averageSafety: Number(s['averageSafety'] ?? 0),
      averageResponseSpeed: Number(s['averageResponseSpeed'] ?? 0),
      averageTransparency: Number(s['averageTransparency'] ?? 0),
      averageOverall: Number(s['averageOverall'] ?? 0),
      totalCount: Number(s['totalCount'] ?? 0),
      page: Number(s['page'] ?? 1),
      pageSize: Number(s['pageSize'] ?? 20),
      ratings: rawRatings.map(r => this.toRating(r))
    };
  }

  private toEligibility(item: unknown): RatingEligibilityDto {
    const e = apiToCamelCase<Record<string, unknown>>(item);
    const rawExisting = e['existingRating'];

    return {
      canRate: Boolean(e['canRate']),
      isSelf: Boolean(e['isSelf']),
      alreadyRated: Boolean(e['alreadyRated']),
      existingRating: rawExisting ? this.toRating(rawExisting) : null
    };
  }

  private toRating(item: unknown): UserRatingDto {
    const r = apiToCamelCase<Record<string, unknown>>(item);

    return {
      id: String(r['id'] ?? ''),
      ratedUserId: String(r['ratedUserId'] ?? ''),
      raterId: String(r['raterId'] ?? ''),
      raterName: String(r['raterName'] ?? ''),
      raterImageUrl: (r['raterImageUrl'] as string) ?? null,
      credibility: Number(r['credibility'] ?? 0),
      safety: Number(r['safety'] ?? 0),
      responseSpeed: Number(r['responseSpeed'] ?? 0),
      transparency: Number(r['transparency'] ?? 0),
      overallScore: Number(r['overallScore'] ?? 0),
      comment: (r['comment'] as string) ?? null,
      createdAt: String(r['createdAt'] ?? '')
    };
  }
}
