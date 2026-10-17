import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ComponentRef } from '@angular/core';
import { AuctionDetails } from '@features/auctions/models';
import { AuctionStatus } from '@features/auctions/enums';
import { BiddingHubComponent } from './bidding-hub.component';
import { provideTransloco, TranslocoLoader, Translation } from '@jsverse/transloco';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { Observable, of } from 'rxjs';

class TestTranslocoLoader implements TranslocoLoader {
  getTranslation(): Observable<Translation> {
    return of({
      ACTIVITY: {
        STATUS: {
          ACTIVE: 'Active',
          PENDING: 'Pending',
          ENDED: 'Ended',
          CANCELED: 'Canceled',
        },
      },
      AUCTIONS: {
        DETAIL: {
          HUB: {
            CURRENT_PRICE: 'Current price',
            BID_COUNT: 'Bids placed:',
            ENDS_IN: 'Ends in',
            STARTS_IN: 'Starts in',
            ENDED: 'Auction ended',
            VIEWERS_TITLE: 'Live viewers',
            VIEWING: 'viewing',
            QUICK_BIDS_LABEL: 'Quick bid options',
            YOUR_BID_LABEL: 'Your custom bid amount',
            INPUT_PLACEHOLDER: 'Enter min. {{min}}',
            BID: 'Bid now',
            MIN_BID_HINT: 'Required minimum amount:',
            GUEST_TITLE: 'Sign in to place a bid',
            GUEST_SUBTITLE: 'You must have an active account to participate in auctions.',
            OWNER_TITLE: 'You are the author of this auction',
            OWNER_SUBTITLE: 'You cannot place bids on your own listings.',
            LEADING_TITLE: 'You are currently leading!',
            LEADING_SUBTITLE: 'Your bid is currently the highest.',
            OUTBID_TITLE: 'You have been outbid!',
            OUTBID_SUBTITLE: 'Another user placed a higher bid. Place a new bid to regain the lead.',
            UNITS: {
              DAYS: 'd',
              HOURS: 'h',
              MINUTES: 'm',
              SECONDS: 's',
            },
          },
        },
      },
    });
  }
}

describe('BiddingHubComponent', () => {
  let component: BiddingHubComponent;
  let componentRef: ComponentRef<BiddingHubComponent>;
  let fixture: ComponentFixture<BiddingHubComponent>;

  const mockAuction: AuctionDetails = {
    id: 1,
    title: 'Test Auction',
    description: 'Description',
    images: ['img1.jpg'],
    mainImageUrl: 'img1.jpg',
    primaryImageIndex: 0,
    startingPrice: 100,
    currentPrice: 150,
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 3600000).toISOString(),
    status: AuctionStatus.ACTIVE,
    category: 'other',
    createdAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BiddingHubComponent],
      providers: [
        provideRouter([]),
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en' },
          loader: TestTranslocoLoader,
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BiddingHubComponent);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;
    componentRef.setInput('auction', mockAuction);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute correct current display price', () => {
    expect(component.currentDisplayPrice()).toBe(150);
  });

  it('should emit placeBid when submitBid is called with valid amount', () => {
    const emitSpy = vi.spyOn(component.placeBid, 'emit');
    component.selectQuickBid(300);
    component.submitBid();
    expect(emitSpy).toHaveBeenCalledWith(300);
  });

  it('should not emit placeBid when isPlacingBid is true', () => {
    componentRef.setInput('isPlacingBid', true);
    fixture.detectChanges();

    const emitSpy = vi.spyOn(component.placeBid, 'emit');
    component.submitBid();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should not change customAmountInput when selectQuickBid is called while isPlacingBid is true', () => {
    componentRef.setInput('isPlacingBid', true);
    fixture.detectChanges();

    component.selectQuickBid(300);
    expect(component.customAmountInput()).toBeNull();
  });

  it('should allow bidding starting price when bidCount is 0', () => {
    componentRef.setInput('bidCount', 0);
    fixture.detectChanges();

    expect(component.minNextBid()).toBe(component.currentDisplayPrice());

    const emitSpy = vi.spyOn(component.placeBid, 'emit');
    component.submitBid();
    expect(emitSpy).toHaveBeenCalledWith(component.currentDisplayPrice());
  });

  it('should require minimum increment when bidCount is greater than 0', () => {
    componentRef.setInput('bidCount', 1);
    fixture.detectChanges();

    expect(component.minNextBid()).toBe(
      component.currentDisplayPrice() + component.minIncrementStep(),
    );
  });

  it('should display hours, minutes, and seconds when remaining time is under 1 day', () => {
    // 3 hours, 15 minutes, 30 seconds from now
    const now = Date.now();
    const targetEnd = new Date(now + (3 * 3600 + 15 * 60 + 30) * 1000).toISOString();
    componentRef.setInput('auction', {
      ...mockAuction,
      endTime: targetEnd,
    });
    fixture.detectChanges();

    const digitsEl = fixture.nativeElement.querySelector('.timer-digits');
    expect(digitsEl).toBeTruthy();
    expect(digitsEl.textContent).toContain('03h');
    expect(digitsEl.textContent).toContain('15m');
    expect(digitsEl.textContent).toContain('30s');
    expect(digitsEl.textContent).not.toContain('d');
  });

  it('should display days, hours, and minutes when remaining time is 1 day or more', () => {
    // 2 days, 5 hours, 40 minutes from now
    const now = Date.now();
    const targetEnd = new Date(now + (2 * 86400 + 5 * 3600 + 40 * 60 + 10) * 1000).toISOString();
    componentRef.setInput('auction', {
      ...mockAuction,
      endTime: targetEnd,
    });
    fixture.detectChanges();

    const digitsEl = fixture.nativeElement.querySelector('.timer-digits');
    expect(digitsEl).toBeTruthy();
    expect(digitsEl.textContent).toContain('02d');
    expect(digitsEl.textContent).toContain('05h');
    expect(digitsEl.textContent).toContain('40m');
    expect(digitsEl.textContent).not.toContain('s');
  });

  describe('lifecycle states', () => {
    it('should be active when status is ACTIVE and endTime is in the future', () => {
      expect(component.isActive()).toBe(true);
      expect(component.isPending()).toBe(false);
      expect(component.isEnded()).toBe(false);
      expect(component.statusBadgeVariant()).toBe('success');
    });

    it('should be pending when status is PENDING', () => {
      componentRef.setInput('auction', {
        ...mockAuction,
        status: AuctionStatus.PENDING,
      });
      fixture.detectChanges();

      expect(component.isPending()).toBe(true);
      expect(component.isActive()).toBe(false);
      expect(component.isEnded()).toBe(false);
      expect(component.statusBadgeVariant()).toBe('warning');
    });

    it('should be ended when status is ENDED or CANCELED', () => {
      componentRef.setInput('auction', {
        ...mockAuction,
        status: AuctionStatus.ENDED,
      });
      fixture.detectChanges();

      expect(component.isEnded()).toBe(true);
      expect(component.isActive()).toBe(false);
      expect(component.isPending()).toBe(false);
      expect(component.statusBadgeVariant()).toBe('neutral');

      componentRef.setInput('auction', {
        ...mockAuction,
        status: AuctionStatus.CANCELED,
      });
      fixture.detectChanges();

      expect(component.isEnded()).toBe(true);
      expect(component.statusBadgeVariant()).toBe('danger');
    });

    it('should treat active auction with past endTime as ended', () => {
      const pastEnd = new Date(Date.now() - 10000).toISOString();
      componentRef.setInput('auction', {
        ...mockAuction,
        status: AuctionStatus.ACTIVE,
        endTime: pastEnd,
      });
      fixture.detectChanges();

      expect(component.isTimeExpired()).toBe(true);
      expect(component.isEnded()).toBe(true);
      expect(component.isActive()).toBe(false);
      expect(component.statusBadgeVariant()).toBe('neutral');
      expect(component.statusTranslationKey()).toBe('ACTIVITY.STATUS.ENDED');

      const endedEl = fixture.nativeElement.querySelector('.timer-box.ended');
      expect(endedEl).toBeTruthy();
    });
  });
});
