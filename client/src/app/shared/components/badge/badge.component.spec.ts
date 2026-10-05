import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { BadgeComponent } from './badge.component';

@Component({
  template: `
    <app-badge variant="success" size="md" [dot]="true" [pulse]="true">
      Active
    </app-badge>
  `,
  imports: [BadgeComponent],
})
class TestHostComponent {}

describe('BadgeComponent', () => {
  let fixture: ComponentFixture<TestHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
  });

  it('should render projected content and proper CSS classes', () => {
    const badgeEl = fixture.nativeElement.querySelector('.badge');
    expect(badgeEl).toBeTruthy();
    expect(badgeEl.classList.contains('badge--success')).toBe(true);
    expect(badgeEl.classList.contains('badge--md')).toBe(true);
    expect(badgeEl.textContent.trim()).toContain('Active');
  });

  it('should render pulsing dot when dot and pulse are true', () => {
    const dotEl = fixture.nativeElement.querySelector('.badge__dot');
    expect(dotEl).toBeTruthy();
    expect(dotEl.classList.contains('badge__dot--pulse')).toBe(true);
  });
});
