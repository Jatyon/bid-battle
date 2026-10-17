import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AuthService, NotificationService, TitleService } from '@core/services';
import type { PaginatedResponse } from '@core/models';
import type { AuctionCategory } from '@core/enums';
import {
  AuctionBidItem,
  AuctionDetails,
  AuctionEndedEvent,
  AuctionsService,
  AuctionStatus,
  BidRejectedEvent,
  BidSocketService,
  CurrentStateEvent,
  NewHighestBidEvent,
} from '@features/auctions';
import { AuctionDetailPage } from './auction-detail';
import { provideTransloco, TranslocoLoader, Translation } from '@jsverse/transloco';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { Observable, Subject, of } from 'rxjs';

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
        CATEGORIES: {
          ELECTRONICS: 'Electronics',
          VEHICLES: 'Vehicles',
          REAL_ESTATE: 'Real Estate',
          COLLECTIBLES: 'Collectibles',
          FASHION: 'Fashion',
          HOME_GARDEN: 'Home & Garden',
          SPORTS: 'Sports & Outdoors',
          ART: 'Art',
          OTHER: 'Other',
        },
        DETAIL: {
          LOADING: 'Loading auction details...',
          WINNER_CONGRATS: 'Congratulations, you won this auction!',
          FINAL_PURCHASE_PRICE: 'Final purchase price',
          DESCRIPTION_TITLE: 'Description',
          SELLER_TITLE: 'Seller',
          NOT_FOUND_TITLE: 'Auction Not Found',
          NOT_FOUND_MSG: 'The auction you are looking for does not exist or has been removed.',
          BACK_TO_HOME: 'Back to Home',
          LOAD_ERROR: 'Error loading auction details',
          ENDING_SOON_TITLE: 'Auction ending soon!',
          OUTBID_NOTIFICATION_TITLE: '(1) You have been outbid!',
          BID_REJECTED_DEFAULT: 'Bid was rejected.',
          BID_TIMEOUT: 'No response from server. Please try placing your bid again.',
          AUCTION_WON_NOTIFICATION_TITLE: 'You won the auction!',
          CONNECTION_ERROR: 'Connection error occurred.',
          GALLERY: {
            ALT_PREVIEW: 'Auction preview',
            ALT_THUMBNAIL: 'Thumbnail',
            DOWNLOAD_PHOTO: 'Download photo',
            CLOSE_LIGHTBOX: 'Close (Esc)',
            PREVIOUS: 'Previous (←)',
            NEXT: 'Next (→)',
            ALT_FULLVIEW: 'Enlarged photo view',
            ALT_THUMBNAIL_STRIP: 'Thumbnail in strip',
          },
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
            OUTBID_SUBTITLE: 'Another user placed a higher bid.',
            ALREADY_LEADING_TOAST: 'You are already leading this auction.',
          },
          HISTORY: {
            TITLE: 'Bid history',
            MODAL_TITLE: 'All bids',
            BID_SINGLE: 'bid',
            BID_MULTIPLE: 'bids',
            LOADING: 'Loading bid history...',
            EMPTY: 'No bids placed yet. Be the first to place a bid!',
            HIGHEST: 'Highest',
            ANONYMOUS_BIDDER: 'Anonymous bidder',
            USER_PREFIX: 'User',
            SHOW_ALL: 'Show full history',
            YOU: 'You',
            YOUR_BID: 'Your bid',
            YOU_INITIAL: 'Y',
          },
        },
      },
    });
  }
}

describe('AuctionDetailPage', () => {
  let component: AuctionDetailPage;
  let fixture: ComponentFixture<AuctionDetailPage>;
  let mockAuctionsService: {
    getAuctionById: ReturnType<typeof vi.fn>;
    getAuctionBids: ReturnType<typeof vi.fn>;
  };
  let mockSocketService: {
    connect: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof signal<string>>;
    joinAuction: ReturnType<typeof vi.fn>;
    leaveAuction: ReturnType<typeof vi.fn>;
    placeBid: ReturnType<typeof vi.fn>;
    requestCurrentState: ReturnType<typeof vi.fn>;
    onNewHighestBid: ReturnType<typeof vi.fn>;
    onBidRejected: ReturnType<typeof vi.fn>;
    onPresenceUpdate: ReturnType<typeof vi.fn>;
    onAuctionEnded: ReturnType<typeof vi.fn>;
    onAuctionWon: ReturnType<typeof vi.fn>;
    onException: ReturnType<typeof vi.fn>;
    onJoinedAuction: ReturnType<typeof vi.fn>;
    onLeftAuction: ReturnType<typeof vi.fn>;
    onCurrentState: ReturnType<typeof vi.fn>;
    onRejoinedAuction: ReturnType<typeof vi.fn>;
  };
  let mockAuthService: {
    currentUser: ReturnType<typeof signal<{ id: number; email: string } | null>>;
  };
  let mockNotificationService: {
    error: ReturnType<typeof vi.fn>;
    success: ReturnType<typeof vi.fn>;
    warning: ReturnType<typeof vi.fn>;
  };
  let newHighestBidSubject: Subject<NewHighestBidEvent>;
  let auctionEndedSubject: Subject<AuctionEndedEvent>;
  let currentStateSubject: Subject<CurrentStateEvent>;
  let rejoinedAuctionSubject: Subject<CurrentStateEvent>;
  let bidRejectedSubject: Subject<BidRejectedEvent>;

  const mockAuctionDetails: AuctionDetails = {
    id: 1,
    title: 'Gaming Laptop Pro',
    description: 'Brand new in original box, never opened.',
    images: ['img1.jpg', 'img2.jpg'],
    mainImageUrl: 'img1.jpg',
    primaryImageIndex: 0,
    startingPrice: 1000,
    currentPrice: 1200,
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 86400000).toISOString(),
    status: AuctionStatus.ACTIVE,
    category: 'electronics' as AuctionCategory,
    createdAt: new Date().toISOString(),
    owner: { id: 10, firstName: 'John', lastName: 'Doe' },
  };

  beforeEach(async () => {
    newHighestBidSubject = new Subject<NewHighestBidEvent>();
    auctionEndedSubject = new Subject<AuctionEndedEvent>();
    currentStateSubject = new Subject<CurrentStateEvent>();
    rejoinedAuctionSubject = new Subject<CurrentStateEvent>();
    bidRejectedSubject = new Subject<BidRejectedEvent>();

    mockAuctionsService = {
      getAuctionById: vi.fn().mockReturnValue(of(mockAuctionDetails)),
      getAuctionBids: vi
        .fn()
        .mockReturnValue(of({ items: [], total: 0, page: 1, limit: 50, pages: 1 })),
    };

    mockSocketService = {
      connect: vi.fn(),
      status: signal('connected'),
      joinAuction: vi.fn(),
      leaveAuction: vi.fn(),
      placeBid: vi.fn(),
      requestCurrentState: vi.fn(),
      onNewHighestBid: vi.fn().mockReturnValue(newHighestBidSubject),
      onBidRejected: vi.fn().mockReturnValue(bidRejectedSubject),
      onPresenceUpdate: vi.fn().mockReturnValue(new Subject()),
      onAuctionEnded: vi.fn().mockReturnValue(auctionEndedSubject),
      onAuctionWon: vi.fn().mockReturnValue(new Subject()),
      onException: vi.fn().mockReturnValue(new Subject()),
      onJoinedAuction: vi.fn().mockReturnValue(new Subject()),
      onLeftAuction: vi.fn().mockReturnValue(new Subject()),
      onCurrentState: vi.fn().mockReturnValue(currentStateSubject),
      onRejoinedAuction: vi.fn().mockReturnValue(rejoinedAuctionSubject),
    };

    mockAuthService = {
      currentUser: signal({ id: 99, email: 'buyer@test.com' }),
    };

    mockNotificationService = {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AuctionDetailPage],
      providers: [
        provideRouter([]),
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en' },
          loader: TestTranslocoLoader,
        }),
        { provide: AuctionsService, useValue: mockAuctionsService },
        { provide: BidSocketService, useValue: mockSocketService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: NotificationService, useValue: mockNotificationService },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'id' ? '1' : null),
              },
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AuctionDetailPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load auction details', () => {
    expect(component).toBeTruthy();
    expect(mockAuctionsService.getAuctionById).toHaveBeenCalledWith(1);
    expect(component.auction()?.title).toBe('Gaming Laptop Pro');
  });

  it('should join socket auction room on init', () => {
    expect(mockSocketService.joinAuction).toHaveBeenCalledWith(1);
  });

  it('should leave socket auction room on destroy via DestroyRef', () => {
    fixture.destroy();
    expect(mockSocketService.leaveAuction).toHaveBeenCalledWith(1);
  });

  it('should stop title blinking on destroy via DestroyRef', () => {
    const titleService = TestBed.inject(TitleService);
    const stopBlinkSpy = vi.spyOn(titleService, 'stopBlink');
    fixture.destroy();
    expect(stopBlinkSpy).toHaveBeenCalled();
  });

  describe('HTTP vs WebSocket race condition prevention', () => {
    it('should not overwrite livePrice or currentPrice when WebSocket receives higher bid before HTTP details resolve', () => {
      const detailsSubject = new Subject<AuctionDetails>();
      mockAuctionsService.getAuctionById.mockReturnValue(detailsSubject);

      // Trigger initialization for auction 2
      (component as unknown as { initializeAuction: (numId: number) => void }).initializeAuction(2);
      expect(component.livePrice()).toBeNull();

      // WebSocket receives a new bid before HTTP response arrives
      newHighestBidSubject.next({
        auctionId: 2,
        amount: 1500,
        timestamp: '2026-10-15T10:00:00.000Z',
        bid: {
          id: 101,
          amount: 1500,
          createdAt: '2026-10-15T10:00:00.000Z',
          user: { id: 5, firstName: 'Alice' },
        },
      });

      expect(component.livePrice()).toBe(1500);

      // Now HTTP details resolve with an older/stale price
      detailsSubject.next({ ...mockAuctionDetails, id: 2, currentPrice: 1200 });

      // Stale HTTP price (1200) MUST NOT overwrite the higher WebSocket price (1500)
      expect(component.livePrice()).toBe(1500);
      expect(component.auction()?.currentPrice).toBe(1500);
    });

    it('should merge bids from WebSocket and HTTP without losing bids received before HTTP bids resolve', () => {
      const bidsSubject = new Subject<PaginatedResponse<AuctionBidItem>>();
      mockAuctionsService.getAuctionBids.mockReturnValue(bidsSubject);

      (component as unknown as { initializeAuction: (numId: number) => void }).initializeAuction(2);

      // WebSocket delivers new bid #101 while HTTP request is in-flight
      newHighestBidSubject.next({
        auctionId: 2,
        amount: 1500,
        timestamp: '2026-10-15T10:00:00.000Z',
        bid: {
          id: 101,
          amount: 1500,
          createdAt: '2026-10-15T10:00:00.000Z',
          user: { id: 5, firstName: 'Alice' },
        },
      });

      expect(component.bids().length).toBe(1);
      expect(component.bids()[0].id).toBe(101);

      // HTTP bids finish late with older bids
      bidsSubject.next({
        items: [
          {
            id: 100,
            amount: 1200,
            createdAt: '2026-10-15T10:00:00.000Z',
            user: { id: 4, firstName: 'Bob' },
          },
          {
            id: 99,
            amount: 1000,
            createdAt: '2026-10-15T10:00:00.000Z',
            user: { id: 3, firstName: 'Charlie' },
          },
        ],
        total: 2,
        page: 1,
        limit: 5,
      });

      // WebSocket bid #101 must be preserved on top of HTTP items
      expect(component.bids().length).toBe(3);
      expect(component.bids()[0].id).toBe(101);
      expect(component.bids()[1].id).toBe(100);
      expect(component.bids()[2].id).toBe(99);
      expect(component.bidCount()).toBe(3);
    });

    it('should preserve ENDED status if onAuctionEnded arrived before HTTP details resolved', () => {
      const detailsSubject = new Subject<AuctionDetails>();
      mockAuctionsService.getAuctionById.mockReturnValue(detailsSubject);

      (component as unknown as { initializeAuction: (numId: number) => void }).initializeAuction(2);

      // WebSocket emits auction ended while HTTP is in-flight
      auctionEndedSubject.next({
        auctionId: 2,
        finalPrice: 2000,
        timestamp: '2026-10-15T10:00:00.000Z',
      });

      // HTTP details resolve late with ACTIVE status
      detailsSubject.next({
        ...mockAuctionDetails,
        id: 2,
        status: AuctionStatus.ACTIVE,
        currentPrice: 1200,
      });

      expect(component.auction()?.status).toBe('ENDED');
      expect(component.livePrice()).toBe(2000);
      expect(component.auction()?.currentPrice).toBe(2000);
    });

    it('should cancel previous paginated bids request when user navigates pages rapidly', () => {
      const page2Subject = new Subject<PaginatedResponse<AuctionBidItem>>();
      const page3Subject = new Subject<PaginatedResponse<AuctionBidItem>>();

      mockAuctionsService.getAuctionBids.mockImplementation((_id: number, page: number) => {
        if (page === 2) return page2Subject;
        if (page === 3) return page3Subject;
        return of({ items: [], total: 0, page: 1, limit: 10 });
      });

      // User navigates to page 2, then quickly to page 3
      component.loadPaginatedBids(2);
      expect(component.isLoadingPaginatedBids()).toBe(true);

      component.loadPaginatedBids(3);

      // Page 3 resolves first
      page3Subject.next({
        items: [{ id: 30, amount: 3000, createdAt: '2026-10-15T10:00:00.000Z' }],
        total: 50,
        page: 3,
        limit: 10,
      });

      expect(component.paginatedBidsPage()).toBe(3);
      expect(component.paginatedBids()[0].id).toBe(30);

      // Page 2 resolves late — its response must be discarded
      page2Subject.next({
        items: [{ id: 20, amount: 2000, createdAt: '2026-10-15T10:00:00.000Z' }],
        total: 50,
        page: 2,
        limit: 10,
      });

      expect(component.paginatedBidsPage()).toBe(3);
      expect(component.paginatedBids()[0].id).toBe(30);
    });
  });

  describe('Safety timeout for placing bids', () => {
    it('should set isPlacingBid to true and call socketService.placeBid', () => {
      component.handlePlaceBid(1500);

      expect(component.isPlacingBid()).toBe(true);
      expect(mockSocketService.placeBid).toHaveBeenCalledWith(1500);
    });

    it('should automatically reset isPlacingBid and show warning after timeout elapses if no event received', async () => {
      vi.useFakeTimers();
      try {
        component.handlePlaceBid(1500);
        expect(component.isPlacingBid()).toBe(true);

        await vi.advanceTimersByTimeAsync(3999);
        expect(component.isPlacingBid()).toBe(true);
        expect(mockNotificationService.warning).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(component.isPlacingBid()).toBe(false);
        expect(mockNotificationService.warning).toHaveBeenCalledWith(
          'No response from server. Please try placing your bid again.',
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('should cancel timeout and not show warning if new highest bid arrives before timeout', async () => {
      vi.useFakeTimers();
      try {
        component.handlePlaceBid(1500);
        expect(component.isPlacingBid()).toBe(true);

        // WS arrives after 1s
        await vi.advanceTimersByTimeAsync(1000);
        newHighestBidSubject.next({
          auctionId: 1,
          amount: 1500,
          timestamp: '2026-10-15T10:00:00.000Z',
          bid: {
            id: 105,
            amount: 1500,
            createdAt: '2026-10-15T10:00:00.000Z',
            user: { id: 99, firstName: 'Buyer' },
          },
        });

        expect(component.isPlacingBid()).toBe(false);

        // Advance past 4000ms
        await vi.advanceTimersByTimeAsync(4000);
        expect(mockNotificationService.warning).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should cancel timeout and not show warning if bid rejected arrives before timeout', async () => {
      vi.useFakeTimers();
      try {
        component.handlePlaceBid(1500);
        expect(component.isPlacingBid()).toBe(true);

        // WS reject arrives after 500ms
        await vi.advanceTimersByTimeAsync(500);
        bidRejectedSubject.next({
          code: 'BID_TOO_LOW',
          reason: 'Bid too low',
          currentPrice: 1600,
        });

        expect(component.isPlacingBid()).toBe(false);
        expect(component.isLeading()).toBe(false);
        expect(component.livePrice()).toBe(1600);
        expect(component.auction()?.currentPrice).toBe(1600);
        expect(mockNotificationService.error).toHaveBeenCalledWith('Bid too low');

        // Advance past 4000ms
        await vi.advanceTimersByTimeAsync(4000);
        expect(mockNotificationService.warning).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should update livePrice, currentPrice, bidCount and reload bids on BID_TOO_LOW rejection', () => {
      bidRejectedSubject.next({
        code: 'BID_TOO_LOW',
        reason: 'Bid too low',
        currentPrice: 2000,
      });

      expect(component.isPlacingBid()).toBe(false);
      expect(component.isLeading()).toBe(false);
      expect(component.livePrice()).toBe(2000);
      expect(component.auction()?.currentPrice).toBe(2000);
      expect(component.bidCount()).toBeGreaterThanOrEqual(1);
      expect(mockAuctionsService.getAuctionBids).toHaveBeenCalledWith(1, 1, 5);
    });
  });
});
