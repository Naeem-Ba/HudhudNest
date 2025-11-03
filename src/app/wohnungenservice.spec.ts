import { TestBed } from '@angular/core/testing';

import { WohnungenService } from './wohnungenservice';

describe('Wohnungen', () => {
  let service: WohnungenService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WohnungenService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
