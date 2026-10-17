import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  BadgeComponent,
  ModalComponent,
  PaginationComponent,
  PricePipe,
  SpinnerComponent,
  UserBadgeComponent,
} from '@app/shared';
import { AuthService, NotificationService, TitleService } from '@core/services';
import { auctionCategoryTranslationKey } from '@core/enums';
import type { PaginatedResponse } from '@core/models';
import {
  AuctionBidItem,
  AuctionDetails,
  AuctionGalleryComponent,
  AuctionsService,
  BidHistoryComponent,
  BidSocketService,
  BiddingHubComponent,
} from '@features/auctions';
import { AuctionStatus } from '@features/auctions/enums';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { LucideAngularModule, Trophy } from 'lucide-angular';
import { Subject, merge, takeUntil, tap } from 'rxjs';

const BID_TIMEOUT_MS = 4000;

@Component({
  selector: 'app-auction-detail',
  standalone: true,
  imports: [
    RouterLink,
    PricePipe,
    BadgeComponent,
    UserBadgeComponent,
    SpinnerComponent,
    TranslocoDirective,
    AuctionGalleryComponent,
    BiddingHubComponent,
    BidHistoryComponent,
    LucideAngularModule,
    PaginationComponent,
    ModalComponent,
  ],
  templateUrl: './auction-detail.html',
  styleUrl: './auction-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuctionDetailPage {
  readonly id = input<string>();

  private readonly route = inject(ActivatedRoute);
  private readonly auctionsService = inject(AuctionsService);
  private readonly socketService = inject(BidSocketService);
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);
  private readonly translocoService = inject(TranslocoService);
  private readonly titleService = inject(TitleService);
  private readonly destroyRef = inject(DestroyRef);
  private bidTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly cancelDetails$ = new Subject<void>();
  private readonly cancelBids$ = new Subject<void>();
  private readonly cancelPaginatedBids$ = new Subject<void>();
  private hasReceivedEndedEvent = false;

  constructor() {
    this.initSocketListeners();

    this.destroyRef.onDestroy(() => {
      this.titleService.stopBlink();
      this.clearPlacingBid();
      this.leaveCurrentAuctionRoom();
    });

    effect(() => {
      const rawId = this.id() ?? this.route.snapshot.paramMap.get('id');
      if (!rawId) return;
      const numId = parseInt(rawId, 10);
      if (isNaN(numId) || this.auctionId() === numId) return;

      this.initializeAuction(numId);
    });

    effect(() => {
      if (!this.currentUser()) {
        this.isLeading.set(false);
        this.clearPlacingBid();
      }
    });
  }

  readonly auctionId = signal<number | null>(null);
  readonly auction = signal<AuctionDetails | null>(null);
  readonly bids = signal<AuctionBidItem[]>([]);
  readonly bidCount = signal<number>(0);
  readonly livePrice = signal<number | null>(null);
  readonly isLeading = signal<boolean>(false);
  readonly participantsCount = signal<number>(0);
  readonly isLoading = signal<boolean>(true);
  readonly isLoadingBids = signal<boolean>(true);
  readonly isPlacingBid = signal<boolean>(false);
  readonly isLiveConnected = computed(() => this.socketService.status() === 'connected');

  readonly trophyIcon = Trophy;

  // Paginated bids modal
  readonly isBidsModalOpen = signal<boolean>(false);
  readonly paginatedBids = signal<AuctionBidItem[]>([]);
  readonly paginatedBidsPage = signal<number>(1);
  readonly paginatedBidsTotalPages = signal<number>(1);
  readonly isLoadingPaginatedBids = signal<boolean>(false);

  readonly currentUser = this.authService.currentUser;

  readonly isOwner = computed(() => {
    const auc = this.auction();
    const user = this.currentUser();
    return !!(auc && user && auc.owner?.id === user.id);
  });

  readonly isGuest = computed(() => !this.currentUser());

  readonly isWinner = computed(() => {
    const auc = this.auction();
    return auc?.status === AuctionStatus.ENDED && this.isLeading();
  });

  readonly hasBidded = computed(() => {
    const user = this.currentUser();

    if (!user) return false;
    return this.bids().some((bid) => bid.user?.id === user.id);
  });

  categoryTranslationKey(category: string): string {
    return auctionCategoryTranslationKey(category);
  }

  private initializeAuction(numId: number): void {
    this.cancelDetails$.next();
    this.cancelBids$.next();
    this.cancelPaginatedBids$.next();
    this.titleService.stopBlink();
    this.leaveCurrentAuctionRoom();
    this.hasReceivedEndedEvent = false;

    this.clearPlacingBid();
    this.isLeading.set(false);
    this.participantsCount.set(0);
    this.livePrice.set(null);
    this.bids.set([]);
    this.bidCount.set(0);
    this.auction.set(null);

    this.auctionId.set(numId);
    this.loadAuctionDetails(numId);
    this.loadAuctionBids(numId);

    this.socketService.connect();
    this.socketService.joinAuction(numId);
  }

  private leaveCurrentAuctionRoom(): void {
    const currentId = this.auctionId();
    if (currentId) {
      this.socketService.leaveAuction(currentId);
    }
  }

  private loadAuctionDetails(id: number): void {
    this.cancelDetails$.next();
    this.isLoading.set(true);
    this.auctionsService
      .getAuctionById(id)
      .pipe(
        takeUntil(this.cancelDetails$),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (details) => {
          if (this.auctionId() !== id) return;
          this.applyAuctionDetails(details);
        },
        error: (err) => {
          if (this.auctionId() !== id) return;
          this.isLoading.set(false);
          this.notificationService.error(
            err?.error?.message || this.translocoService.translate('AUCTIONS.DETAIL.LOAD_ERROR'),
          );
        },
      });
  }

  private applyAuctionDetails(details: AuctionDetails): void {
    const currentLive = this.livePrice();
    const effectivePrice = currentLive !== null ? Math.max(details.currentPrice, currentLive) : details.currentPrice;
    const effectiveStatus = this.hasReceivedEndedEvent ? AuctionStatus.ENDED : details.status;

    this.auction.set({
      ...details,
      currentPrice: effectivePrice,
      status: effectiveStatus,
    });
    this.titleService.setTitle(details.title);
    this.isLoading.set(false);
  }

  private loadAuctionBids(id: number): void {
    this.cancelBids$.next();
    this.isLoadingBids.set(true);
    this.auctionsService
      .getAuctionBids(id, 1, 5)
      .pipe(
        takeUntil(this.cancelBids$),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (res) => {
          if (this.auctionId() !== id) return;
          this.applyAuctionBids(res);
        },
        error: () => {
          if (this.auctionId() !== id) return;
          this.isLoadingBids.set(false);
        },
      });
  }

  private applyAuctionBids(res: PaginatedResponse<AuctionBidItem>): void {
    const httpBidIds = new Set(res.items.map((b) => b.id));
    const wsOnlyBids = this.bids().filter((b) => !httpBidIds.has(b.id));

    this.bids.set([...wsOnlyBids, ...res.items].slice(0, 5));
    this.bidCount.update((currCount) => Math.max(currCount, res.total + wsOnlyBids.length));

    this.isLoadingBids.set(false);
    this.updateLeadingBidderState();
  }

  private updateLeadingBidderState(): void {
    const user = this.currentUser();
    const topBid = this.bids()[0];
    if (topBid && user) {
      this.isLeading.set(topBid.user?.id === user.id);
    }
  }

  private updateLivePrice(price: number): void {
    this.livePrice.update((curr) => (curr !== null ? Math.max(curr, price) : price));
    this.auction.update((auc) => (auc ? { ...auc, currentPrice: Math.max(auc.currentPrice, price) } : null));
  }

  private markAuctionEnded(finalPrice?: number): void {
    this.hasReceivedEndedEvent = true;
    this.clearPlacingBid();
    if (finalPrice != null) {
      this.updateLivePrice(finalPrice);
    }
    this.auction.update((auc) => (auc ? { ...auc, status: AuctionStatus.ENDED } : null));
  }

  private addBid(bid: AuctionBidItem): void {
    this.bids.update((currentBids) => {
      if (currentBids.some((b) => b.id === bid.id)) {
        return currentBids;
      }
      return [bid, ...currentBids].slice(0, 5);
    });
  }

  openBidsModal(): void {
    this.isBidsModalOpen.set(true);
    this.loadPaginatedBids(1);
  }

  closeBidsModal(): void {
    this.cancelPaginatedBids$.next();
    this.isBidsModalOpen.set(false);
  }

  loadPaginatedBids(page: number): void {
    const id = this.auctionId();
    if (!id) return;

    this.cancelPaginatedBids$.next();
    this.isLoadingPaginatedBids.set(true);
    this.auctionsService
      .getAuctionBids(id, page, 10)
      .pipe(
        takeUntil(this.cancelPaginatedBids$),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (res) => {
          if (this.auctionId() !== id) return;
          this.paginatedBids.set(res.items);
          this.paginatedBidsPage.set(res.page);
          this.paginatedBidsTotalPages.set(Math.ceil(res.total / res.limit));
          this.isLoadingPaginatedBids.set(false);
        },
        error: () => {
          if (this.auctionId() !== id) return;
          this.isLoadingPaginatedBids.set(false);
        },
      });
  }

  private initSocketListeners(): void {
    this.listenForBidEvents();
    this.listenForAuctionLifecycle();
    this.listenForPresence();
  }

  private listenForBidEvents(): void {
    this.socketService
      .onNewHighestBid()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evt) => {
        if (evt.auctionId !== this.auctionId()) return;

        this.updateLivePrice(evt.amount);
        this.bidCount.update((c) => c + 1);
        this.clearPlacingBid();

        const wasLeading = this.isLeading();
        const user = this.currentUser();
        const isMyBid = !!user && !!evt.bid && evt.bid.user?.id === user.id;

        if (isMyBid) {
          this.isLeading.set(true);
        } else {
          this.isLeading.set(false);
          if (wasLeading) {
            this.titleService.startBlink(
              this.translocoService.translate('AUCTIONS.DETAIL.OUTBID_NOTIFICATION_TITLE'),
            );
          }
        }

        if (evt.bid) {
          this.addBid(evt.bid);
        } else {
          this.loadAuctionBids(evt.auctionId);
        }
      });

    this.socketService
      .onBidRejected()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evt) => {
        this.clearPlacingBid();
        this.isLeading.set(false);
        this.notificationService.error(
          evt.reason || this.translocoService.translate('AUCTIONS.DETAIL.BID_REJECTED_DEFAULT'),
        );
        if (evt.currentPrice != null) {
          this.updateLivePrice(evt.currentPrice);
          this.bidCount.update((count) => Math.max(count, 1));
          const currentId = this.auctionId();
          if (currentId) this.loadAuctionBids(currentId);
        }
      });
  }

  private listenForAuctionLifecycle(): void {
    this.socketService
      .onAuctionEnded()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evt) => {
        if (evt.auctionId !== this.auctionId()) return;
        this.markAuctionEnded(evt.finalPrice);
      });

    this.socketService
      .onAuctionWon()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evt) => {
        if (evt.auctionId === this.auctionId()) {
          this.isLeading.set(true);
          this.titleService.startBlink(
            this.translocoService.translate('AUCTIONS.DETAIL.AUCTION_WON_NOTIFICATION_TITLE'),
          );
        }
      });

    this.socketService
      .onJoinedAuction()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evt) => {
        if (evt.auctionId === this.auctionId()) this.socketService.requestCurrentState();
      });

    this.socketService
      .onException()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evt) => {
        this.clearPlacingBid();
        this.notificationService.error(
          evt.message || this.translocoService.translate('AUCTIONS.DETAIL.CONNECTION_ERROR'),
        );
      });
  }

  private listenForPresence(): void {
    this.socketService
      .onPresenceUpdate()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evt) => {
        if (evt.auctionId === this.auctionId()) this.participantsCount.set(evt.participantsCount);
      });

    merge(
      this.socketService.onCurrentState(),
      this.socketService.onRejoinedAuction().pipe(
        tap((evt) => {
          if (evt.auctionId === this.auctionId()) this.loadAuctionBids(evt.auctionId);
        }),
      ),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evt) => {
        if (evt.auctionId === this.auctionId()) {
          this.updateLivePrice(evt.currentPrice);
          this.isLeading.set(evt.isLeading);
          this.participantsCount.set(evt.participantsCount);
        }
      });
  }

  private clearPlacingBid(): void {
    if (this.bidTimeoutTimer) {
      clearTimeout(this.bidTimeoutTimer);
      this.bidTimeoutTimer = null;
    }
    this.isPlacingBid.set(false);
  }

  handlePlaceBid(amount: number): void {
    if (this.isPlacingBid()) return;

    if (this.isLeading()) {
      this.notificationService.error(
        this.translocoService.translate('AUCTIONS.DETAIL.HUB.ALREADY_LEADING_TOAST'),
      );
      return;
    }

    this.isPlacingBid.set(true);
    this.socketService.placeBid(amount);

    this.bidTimeoutTimer = setTimeout(() => {
      if (this.isPlacingBid()) {
        this.clearPlacingBid();
        this.notificationService.warning(
          this.translocoService.translate('AUCTIONS.DETAIL.BID_TIMEOUT'),
        );
      }
    }, BID_TIMEOUT_MS);
  }
}
