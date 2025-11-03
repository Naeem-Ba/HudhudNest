import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WohnungAdd } from './wohnung-add';

describe('WohnungAdd', () => {
  let component: WohnungAdd;
  let fixture: ComponentFixture<WohnungAdd>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WohnungAdd]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WohnungAdd);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
