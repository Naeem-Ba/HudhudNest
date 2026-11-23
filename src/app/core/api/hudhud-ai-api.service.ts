// src/app/core/api/hudhud-ai-api.service.ts
//
// Hudhud AI, the free property assistant (Stage 0: rule-based, no language model).
//   GET    /api/ai/status                         ← anonymous; is the assistant switched on
//   GET    /api/ai/usage                          ← anonymous; messages left today (and this month for an account)
//   POST   /api/ai/messages                       ← a guest message, or the first message of a new conversation
//   POST   /api/ai/conversations/{id}/messages    ← a follow-up in one of the caller's conversations
//   GET    /api/ai/conversations?page
//   GET    /api/ai/conversations/{id}
//   DELETE /api/ai/conversations/{id}
//   POST   /api/ai/messages/{id}/feedback         ← { rating: 1 | -1 }

import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { BackendApiService } from './backend-api.service';
import {
  AiChatResponse,
  AiConversationDetail,
  AiConversationSummary,
  AiErrorCode,
  AiSendPayload,
  AiStatus,
  AiUsage
} from '../models/hudhud-ai.model';

@Injectable({ providedIn: 'root' })
export class HudhudAiApiService {
  private readonly api = inject(BackendApiService);
  private readonly endpoint = '/ai';

  status(): Observable<AiStatus> {
    return this.api.get<AiStatus>(`${this.endpoint}/status`);
  }

  usage(): Observable<AiUsage> {
    return this.api.get<AiUsage>(`${this.endpoint}/usage`);
  }

  send(payload: AiSendPayload, conversationId?: string | null): Observable<AiChatResponse> {
    const path = conversationId
      ? `${this.endpoint}/conversations/${encodeURIComponent(conversationId)}/messages`
      : `${this.endpoint}/messages`;
    return this.api.post<AiChatResponse>(path, payload);
  }

  conversations(page = 1): Observable<AiConversationSummary[]> {
    return this.api.get<AiConversationSummary[]>(`${this.endpoint}/conversations`, { page });
  }

  conversation(id: string): Observable<AiConversationDetail> {
    return this.api.get<AiConversationDetail>(`${this.endpoint}/conversations/${encodeURIComponent(id)}`);
  }

  deleteConversation(id: string): Observable<void> {
    return this.api.delete<void>(`${this.endpoint}/conversations/${encodeURIComponent(id)}`);
  }

  feedback(messageId: string, rating: 1 | -1): Observable<void> {
    return this.api.post<void>(`${this.endpoint}/messages/${encodeURIComponent(messageId)}/feedback`, { rating });
  }
}

/** The stable code of a refusal, so the panel can show a translated line and the right action. */
export function aiErrorCode(error: unknown): AiErrorCode {
  if (!(error instanceof HttpErrorResponse)) return 'AI_FAILED';
  if (error.status === 0) return 'AI_OFFLINE';
  const code = (error.error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code.startsWith('AI_')) return code as AiErrorCode;
  if (error.status === 429) return 'AI_RATE_LIMITED';
  if (error.status === 401 || error.status === 403) return 'AI_SIGN_IN_REQUIRED';
  if (error.status === 404) return 'AI_NOT_FOUND';
  if (error.status === 422) return 'AI_INVALID';
  if (error.status === 503) return 'AI_DISABLED';
  return 'AI_FAILED';
}
