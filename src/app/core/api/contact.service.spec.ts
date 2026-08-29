// =====================================================================
// ✅ Unit Tests – contact.service.spec.ts
// تغطية: normalizeMessage — الخادم يُسلسِل الحقول بصيغة camelCase وباسم "body"/
// "createdAt" لنص الرسالة/تاريخها، بينما تقرأ صفحات الإدارة (messages,
// message-details) حصراً msg.Name/msg.Message/msg.SentAt بصيغة PascalCase.
// أول اختبار لهذا الصف على الإطلاق.
// =====================================================================
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { ContactService } from './contact.service';

describe('ContactService — تطبيع شكل رسائل التواصل القادم من الخادم', () => {
  let service: ContactService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    service = TestBed.inject(ContactService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('✅ getMessages: يملأ Name/Message/SentAt بصيغة PascalCase من استجابة camelCase تحمل body/createdAt', done => {
    service.getMessages().subscribe(messages => {
      expect(messages.length).toBe(1);

      const msg = messages[0];
      expect(msg.Name).toBe('أحمد');
      expect(msg.Email).toBe('ahmad@example.com');
      expect(msg.Subject).toBe('استفسار');
      expect(msg.Message).toBe('هل الشقة ما زالت متاحة؟');
      expect(msg.SentAt).toBe('2026-08-20T10:00:00Z');
      expect(msg.IsRead).toBe(false);

      done();
    });

    httpMock.expectOne(`${environment.apiBaseUrl}/contact`).flush({
      data: [
        {
          id: 'msg-1',
          name: 'أحمد',
          email: 'ahmad@example.com',
          subject: 'استفسار',
          body: 'هل الشقة ما زالت متاحة؟',
          createdAt: '2026-08-20T10:00:00Z',
          isRead: false
        }
      ],
      total: 1,
      page: 1,
      pageSize: 20
    });
  });

  it('✅ getMessageById: نفس التطبيع لعنصر واحد غير مغلَّف بصفحة (Data)', done => {
    service.getMessageById('msg-1').subscribe(msg => {
      expect(msg.Name).toBe('أحمد');
      expect(msg.Message).toBe('هل الشقة ما زالت متاحة؟');
      expect(msg.SentAt).toBe('2026-08-20T10:00:00Z');
      done();
    });

    httpMock.expectOne(`${environment.apiBaseUrl}/contact/msg-1`).flush({
      id: 'msg-1',
      name: 'أحمد',
      email: 'ahmad@example.com',
      subject: 'استفسار',
      body: 'هل الشقة ما زالت متاحة؟',
      createdAt: '2026-08-20T10:00:00Z',
      isRead: false
    });
  });
});
