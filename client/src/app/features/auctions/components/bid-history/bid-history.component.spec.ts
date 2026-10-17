import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ComponentRef, signal } from '@angular/core';
import { AuthService } from '@core/services';
import { AuctionBidItem } from '@features/auctions/models';
import { BidHistoryComponent } from './bid-history.component';
import { provideTransloco, TranslocoLoader, Translation } from '@jsverse/transloco';
import { describe, beforeEach, it, expect } from 'vitest';
import { Observable, of } from 'rxjs';

class TestTranslocoLoader implements TranslocoLoader {
  getTranslation(): Observable<Translation> {
    return of({
      AUCTIONS: {
        DETAIL: {
          HISTORY: {
            TITLE: 'Bid history',
            YOU: 'You',
            YOUR_BID: 'Your bid',
            YOU_INITIAL: 'Y',
            HIGHEST: 'Highest',
            ANONYMOUS_BIDDER: 'Anonymous bidder',
            USER_PREFIX: 'User',
            BID_SINGLE: 'bid',
            BID_MULTIPLE: 'bids',
            LOADING: 'Loading bid history...',
            EMPTY: 'No bids placed yet. Be the first to place a bid!',
            SHOW_ALL: 'Show full history',
          },
        },
      },
    });
  }
}

describe('BidHistoryComponent', () => {
  let component: BidHistoryComponent;
  let componentRef: ComponentRef<BidHistoryComponent>;
  let fixture: ComponentFixture<BidHistoryComponent>;
  const currentUserSignal = signal<{ id: number; firstName: string } | null>({
    id: 42,
    firstName: 'John',
  });

  const mockBids: AuctionBidItem[] = [
    {
      id: 1,
      amount: 250,
      createdAt: new Date().toISOString(),
      user: { id: 42, firstName: 'John', lastName: 'Doe' },
      isMyBid: true,
    },
    {
      id: 2,
      amount: 200,
      createdAt: new Date().toISOString(),
      user: { id: 0, firstName: 'Alice', lastName: 'Smith' },
      isMyBid: false,
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BidHistoryComponent],
      providers: [
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en' },
          loader: TestTranslocoLoader,
        }),
        {
          provide: AuthService,
          useValue: {
            currentUser: currentUserSignal,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BidHistoryComponent);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;
    componentRef.setInput('bids', mockBids);
    componentRef.setInput('totalBids', 2);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should identify user bids correctly via isMyBid', () => {
    expect(component.isMyBid(mockBids[0])).toBe(true);
    expect(component.isMyBid(mockBids[1])).toBe(false);
  });

  it('should render You and badge for the current user bid', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const bidRows = compiled.querySelectorAll('.bid-row');

    expect(bidRows.length).toBe(2);

    const myBidRow = bidRows[0];
    expect(myBidRow.classList.contains('my-bid')).toBe(true);
    expect(myBidRow.textContent).toContain('You');
    expect(myBidRow.textContent).toContain('Your bid');

    const otherBidRow = bidRows[1];
    expect(otherBidRow.classList.contains('my-bid')).toBe(false);
    expect(otherBidRow.textContent).toContain('Alice S.');
    expect(otherBidRow.textContent).not.toContain('Your bid');
  });

  it('should mark the first bid as highest on page 1', () => {
    componentRef.setInput('page', 1);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const bidRows = compiled.querySelectorAll('.bid-row');

    expect(bidRows[0].classList.contains('highest')).toBe(true);
    expect(bidRows[0].querySelector('.top-tag')?.textContent).toContain('Highest');
    expect(bidRows[1].classList.contains('highest')).toBe(false);
    expect(bidRows[1].querySelector('.top-tag')).toBeNull();
  });

  it('should not mark any bid as highest when page is greater than 1', () => {
    componentRef.setInput('page', 2);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const bidRows = compiled.querySelectorAll('.bid-row');

    expect(bidRows[0].classList.contains('highest')).toBe(false);
    expect(bidRows[0].querySelector('.top-tag')).toBeNull();
    expect(bidRows[1].classList.contains('highest')).toBe(false);
    expect(bidRows[1].querySelector('.top-tag')).toBeNull();
  });
});
