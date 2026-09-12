// src/app/core/api/agencies-api.service.ts
//
// يستهلك AgenciesController (api/Agencies/*) — لم يكن موجودًا إطلاقًا من قبل
// بأي شكل (لا service ولا model ولا صفحة) رغم أن الباك اند الكامل (CRUD +
// أعضاء + دعوات) جاهز منذ فترة. هذه أول واجهة استهلاك له، وتغطي فقط ما
// تحتاجه صفحة إنشاء/تعديل المكتب — لا كل نقاط AgenciesController (الدعوات،
// نقل الملكية، الشعار... تبقى خارج هذا النطاق).

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { Agency, CreateAgencyRequest, UpdateAgencyRequest } from '../models/agency.model';

@Injectable({ providedIn: 'root' })
export class AgenciesApiService {
  private readonly endpoint = '/agencies';

  constructor(private readonly api: BackendApiService) {}

  /**
   * GET /api/agencies/me — مكتب المستخدم الحالي. الباك اند يعيد 204 (لا 404)
   * إن لم ينتمِ المستخدم إلى أي مكتب — BackendApiService/HttpClient يترجم جسم
   * 204 الفارغ إلى null تلقائيًا، فتُعاد Observable<null> بلا أي معالجة خاصة هنا.
   */
  getMine(): Observable<Agency | null> {
    return this.api.get<Agency | null>(`${this.endpoint}/me`);
  }

  /** POST /api/agencies — تسجيل مكتب جديد؛ ينجح مرة واحدة فقط لكل مستخدم. */
  create(request: CreateAgencyRequest): Observable<Agency> {
    return this.api.post<Agency>(this.endpoint, request);
  }

  /**
   * PUT /api/agencies/{id} — تعديل مالك فقط. استبدال كامل (انظر
   * UpdateAgencyRequest's doc comment) — أرسل كل الحقول الحالية.
   */
  update(agencyId: string, request: UpdateAgencyRequest): Observable<Agency> {
    return this.api.put<Agency>(`${this.endpoint}/${agencyId}`, request);
  }
}
