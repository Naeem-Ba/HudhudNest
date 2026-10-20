import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { ServiceConversationActivity, ServiceConversationComponent, ServiceConversationRole } from './service-conversation.component';
import { ServiceRequestService } from '../../core/api/service-request.service';
import { ServiceRequestDto, ServiceRequestMessageDto } from '../../core/models/service.model';
import { ToastService } from '../../shared/services/toast.service';

function request(overrides: Partial<ServiceRequestDto> = {}): ServiceRequestDto {
  return {
    id: 'r1', requestNumber: 'SR-1', propertyId: 'p1', propertyTitle: 'Flat', requesterId: 'u1', requesterName: 'Me',
    serviceProviderId: 's1', serviceProviderDisplayName: 'Clean Co', serviceOfferingId: 'o1', serviceOfferingTitle: 'Deep clean',
    category: 'Cleaning', status: 'Inquiry', createdAt: '2026-10-10T09:00:00Z', ...overrides
  };
}

function message(id: string, mine: boolean, overrides: Partial<ServiceRequestMessageDto> = {}): ServiceRequestMessageDto {
  return {
    id, serviceRequestId: 'r1', senderParty: mine ? 'Requester' : 'Provider', senderName: mine ? 'Me' : 'Clean Co',
    body: `body ${id}`, createdAt: '2026-10-10T10:00:00Z', readAt: null, isMine: mine, ...overrides
  };
}

describe('ServiceConversationComponent', () => {
  let api: jasmine.SpyObj<ServiceRequestService>;
  let toast: jasmine.SpyObj<ToastService>;
  let activity: ServiceConversationActivity[];

  function create(req: ServiceRequestDto, role: ServiceConversationRole = 'requester', extra: { preloaded?: ServiceRequestMessageDto[]; pollMs?: number } = {}) {
    TestBed.configureTestingModule({
      imports: [ServiceConversationComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ServiceRequestService, useValue: api },
        { provide: ToastService, useValue: toast }
      ]
    });
    const fixture: ComponentFixture<ServiceConversationComponent> = TestBed.createComponent(ServiceConversationComponent);
    fixture.componentInstance.request = req;
    fixture.componentInstance.role = role;
    fixture.componentInstance.pollMs = extra.pollMs ?? 0;
    fixture.componentInstance.preloaded = extra.preloaded ?? null;
    activity = [];
    fixture.componentInstance.activity.subscribe(a => activity.push(a));
    fixture.detectChanges();
    return fixture;
  }

  const el = (f: ComponentFixture<ServiceConversationComponent>) => f.nativeElement as HTMLElement;

  beforeEach(() => {
    api = jasmine.createSpyObj('ServiceRequestService', ['getMessages', 'sendMessage', 'markMessagesRead', 'confirm']);
    toast = jasmine.createSpyObj('ToastService', ['show']);
    api.getMessages.and.returnValue(of([message('m1', true), message('m2', false)]));
    api.markMessagesRead.and.returnValue(of(undefined));
  });

  it('shows the thread with who wrote what and marks the other side\'s messages as read', () => {
    const f = create(request());

    const bubbles = el(f).querySelectorAll('.bubble');
    expect(bubbles.length).toBe(2);
    expect(bubbles[0].classList).toContain('bubble--mine');
    expect(bubbles[1].classList).toContain('bubble--theirs');
    expect(el(f).textContent).toContain('body m2');
    expect(api.markMessagesRead).toHaveBeenCalledWith('r1');
    expect(activity.at(-1)).toEqual({ requestId: 'r1', messageCount: 2, unreadMessageCount: 0, lastMessageAt: '2026-10-10T10:00:00Z' });
  });

  it('does not mark anything read when every message is already read or is the viewer\'s own', () => {
    api.getMessages.and.returnValue(of([message('m1', true), message('m2', false, { readAt: '2026-10-10T11:00:00Z' })]));
    create(request());

    expect(api.markMessagesRead).not.toHaveBeenCalled();
  });

  it('sends a trimmed message, appends it and clears the box', () => {
    api.sendMessage.and.returnValue(of(message('m3', true, { body: 'What is the price?' })));
    const f = create(request());

    f.componentInstance.onDraft('  What is the price?  ');
    f.detectChanges();
    f.componentInstance.send();
    f.detectChanges();

    expect(api.sendMessage).toHaveBeenCalledOnceWith('r1', 'What is the price?');
    expect(f.componentInstance.messages().length).toBe(3);
    expect(f.componentInstance.draft()).toBe('');
    expect(activity.at(-1)?.messageCount).toBe(3);
  });

  it('refuses an empty draft and one over the limit', () => {
    const f = create(request());

    f.componentInstance.onDraft('   ');
    expect(f.componentInstance.canSend()).toBeFalse();
    f.componentInstance.onDraft('x'.repeat(1001));
    expect(f.componentInstance.canSend()).toBeFalse();
    f.componentInstance.send();
    expect(api.sendMessage).not.toHaveBeenCalled();
    f.componentInstance.onDraft('ok');
    expect(f.componentInstance.canSend()).toBeTrue();
  });

  it('keeps the draft and tells the user when sending fails', () => {
    api.sendMessage.and.returnValue(throwError(() => new Error('boom')));
    const f = create(request());

    f.componentInstance.onDraft('hello');
    f.componentInstance.send();

    expect(f.componentInstance.draft()).toBe('hello');
    expect(f.componentInstance.sending()).toBeFalse();
    expect(toast.show).toHaveBeenCalledWith(jasmine.any(String), 'error');
  });

  it('offers confirmation to the customer once the thread has a message, and emits the confirmed request', () => {
    const confirmed = request({ status: 'UnderReview', confirmedAt: '2026-10-10T12:00:00Z' });
    api.confirm.and.returnValue(of(confirmed));
    const f = create(request());
    let emitted: ServiceRequestDto | undefined;
    f.componentInstance.requestChange.subscribe(r => emitted = r);

    expect(el(f).querySelector('.confirm-box')).not.toBeNull();
    f.componentInstance.confirm();

    expect(api.confirm).toHaveBeenCalledOnceWith('r1');
    expect(emitted).toEqual(confirmed);
    expect(toast.show).toHaveBeenCalledWith(jasmine.any(String), 'success');
  });

  it('shows no confirm button before the first message, to the provider, to an admin or after confirmation', () => {
    api.getMessages.and.returnValue(of([]));
    expect(el(create(request())).querySelector('.confirm-box')).toBeNull();
    TestBed.resetTestingModule();

    api.getMessages.and.returnValue(of([message('m1', true)]));
    expect(el(create(request(), 'provider')).querySelector('.confirm-box')).toBeNull();
    TestBed.resetTestingModule();

    expect(el(create(request(), 'admin', { preloaded: [message('m1', true)] })).querySelector('.confirm-box')).toBeNull();
    TestBed.resetTestingModule();

    expect(el(create(request({ status: 'UnderReview' }))).querySelector('.confirm-box')).toBeNull();
  });

  it('is read only for an admin and uses the thread it was given without any call', () => {
    const f = create(request({ status: 'UnderReview' }), 'admin', { preloaded: [message('m1', true), message('m2', false)] });

    expect(api.getMessages).not.toHaveBeenCalled();
    expect(api.markMessagesRead).not.toHaveBeenCalled();
    expect(el(f).querySelector('form.composer')).toBeNull();
    expect(el(f).querySelectorAll('.bubble').length).toBe(2);
  });

  it('keeps an expired or closed request readable but closed for writing, with a reason', () => {
    const expired = create(request({ status: 'Expired' }));
    expect(el(expired).querySelector('form.composer')).toBeNull();
    expect(el(expired).querySelector('.hint')?.textContent).toContain('SERVICE_CONVERSATION.HINT_EXPIRED');
    TestBed.resetTestingModule();

    const closed = create(request({ status: 'Completed' }));
    expect(el(closed).querySelector('.hint')?.textContent).toContain('SERVICE_CONVERSATION.HINT_CLOSED');
  });

  it('explains to each side what an inquiry is', () => {
    expect(el(create(request())).querySelector('.hint')?.textContent).toContain('HINT_INQUIRY_REQUESTER');
    TestBed.resetTestingModule();
    expect(el(create(request(), 'provider')).querySelector('.hint')?.textContent).toContain('HINT_INQUIRY_PROVIDER');
  });

  it('offers a retry when the thread cannot be loaded', () => {
    api.getMessages.and.returnValue(throwError(() => new Error('offline')));
    const f = create(request());

    expect(f.componentInstance.loadFailed()).toBeTrue();
    expect(el(f).querySelector('.state.error')).not.toBeNull();
  });

  it('refreshes quietly on its interval and announces new messages only when the count changed', fakeAsync(() => {
    const f = create(request(), 'requester', { pollMs: 1000 });
    const before = activity.length;

    tick(1000);
    expect(api.getMessages).toHaveBeenCalledTimes(2);
    expect(activity.length).toBe(before); // same two messages: nothing new to announce

    api.getMessages.and.returnValue(of([message('m1', true), message('m2', false), message('m3', false)]));
    tick(1000);
    expect(f.componentInstance.messages().length).toBe(3);
    expect(activity.at(-1)?.messageCount).toBe(3);

    f.destroy();
    tick(5000);
  }));

  it('does not poll a request that can no longer take messages', fakeAsync(() => {
    const f = create(request({ status: 'Completed' }), 'requester', { pollMs: 1000 });

    tick(3000);
    expect(api.getMessages).toHaveBeenCalledTimes(1);
    f.destroy();
  }));
});
