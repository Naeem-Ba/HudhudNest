import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Wohnungen } from './wohnungen';

describe('Wohnungen', () => {
  let component: Wohnungen;
  let fixture: ComponentFixture<Wohnungen>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Wohnungen]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Wohnungen);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
