import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ComponentRef } from '@angular/core';
import { AuctionClockService } from '@features/auctions/services';
import { AuctionStatus } from '@features/auctions/enums';
import { Auction } from '@features/auctions/models';
import { AuctionCardComponent } from './auction-card.component';
import { provideTransloco, TranslocoLoader, Translation } from '@jsverse/transloco';
import { describe, beforeEach, it, expect } from 'vitest';
import { Observable, of } from 'rxjs';

class TestTranslocoLoader implements TranslocoLoader {
  getTranslation(): Observable<Translation> {
    return of({
      AUCTIONS: {
        CARD: {
          TIME_LEFT: 'Time left',
          TIME_REMAINING: '{{days}}d {{hours}}h {{minutes}}m',
          BID_COUNT: 'bids',
          NO_IMAGE: 'No image',
        },
      },
      CATEGORIES: {
        ELECTRONICS: 'Electronics',
        OTHER: 'Other',
      },
    });
  }
}

describe('AuctionCardComponent', () => {
  let component: AuctionCardComponent;
  let componentRef: ComponentRef<AuctionCardComponent>;
  let fixture: ComponentFixture<AuctionCardComponent>;

  const mockAuction: Auction = {
    id: 1,
    title: 'Vintage Camera',
    description: 'A vintage camera in great condition',
    images: ['camera.jpg'],
    mainImageUrl: 'camera.jpg',
    startingPrice: 1000,
    currentPrice: 1500,
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 86400000 + 3600000).toISOString(), // ~1 day and 1 hour
    status: AuctionStatus.ACTIVE,
    category: 'electronics',
    createdAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuctionCardComponent],
      providers: [
        provideRouter([]),
        AuctionClockService,
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en' },
          loader: TestTranslocoLoader,
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AuctionCardComponent);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;
    componentRef.setInput('auction', mockAuction);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute categoryTranslationKey as a memoized signal', () => {
    expect(component.categoryTranslationKey()).toBe('AUCTIONS.CATEGORIES.ELECTRONICS');
  });

  it('should compute imageUrl as a memoized signal', () => {
    expect(component.imageUrl()).toContain('camera.jpg');
  });

  it('should compute timeRemaining correctly with equality memoization', () => {
    const remaining = component.timeRemaining();
    expect(remaining).not.toBeNull();
    expect(remaining?.days).toBe(1);
    expect(remaining?.hours).toBeGreaterThanOrEqual(0);
    expect(remaining?.minutes).toBeGreaterThanOrEqual(0);
  });

  it('should return null for timeRemaining if auction has ended', () => {
    const pastAuction: Auction = {
      ...mockAuction,
      endTime: new Date(Date.now() - 10000).toISOString(),
    };
    componentRef.setInput('auction', pastAuction);
    fixture.detectChanges();

    expect(component.timeRemaining()).toBeNull();
  });
});
