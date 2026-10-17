import {
  DestroyRef,
  Injectable,
  PLATFORM_ID,
  Signal,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isPlatformBrowser } from '@angular/common';
import { ConnectionStatus, SocketConnection, SocketService } from '@core/services/socket';
import { SocketExceptionPayload } from '@core/models';
import {
  AuctionEndedEvent,
  AuctionEvent,
  AuctionOutbidEvent,
  BidRejectedEvent,
  CurrentStateEvent,
  NewHighestBidEvent,
  PresenceUpdateEvent,
} from '../models';
import { BidSocketEvent } from '../enums';
import { Observable, filter, race, take, timer } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class BidSocketService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly socketService = inject(SocketService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly connection = signal<SocketConnection | null>(null);
  private readonly currentAuctionId = signal<number | null>(null);
  private lastJoinedAuctionId: number | null = null;
  private needsRejoin = false;
  private previousStatus: ConnectionStatus = 'disconnected';

  readonly status: Signal<ConnectionStatus> = computed(
    () => this.connection()?.status() ?? 'disconnected',
  );
  readonly activeAuctionId: Signal<number | null> = this.currentAuctionId.asReadonly();

  constructor() {
    // Automatically re-join the auction room upon network reconnection
    effect(() => {
      const status = this.status();
      const auctionId = this.currentAuctionId();
      const prevStatus = this.previousStatus;
      this.previousStatus = status;

      if (auctionId !== null) {
        if (prevStatus === 'connected' && status !== 'connected') {
          this.needsRejoin = true;
        } else if (status === 'connected' && this.needsRejoin) {
          this.needsRejoin = false;
          this.connection()?.emit(BidSocketEvent.REJOIN_AUCTION, { auctionId });
        }
      } else {
        this.needsRejoin = false;
      }
    });

    this.destroyRef.onDestroy(() => {
      this.disconnect();
    });
  }

  connect(): void {
    if (!this.isBrowser) return;

    if (!this.connection()) this.connection.set(this.socketService.getOrCreate('/bid'));

    this.connection()?.connect();
  }

  disconnect(): void {
    if (this.connection()) this.connection()?.disconnect();
  }

  joinAuction(auctionId: number): void {
    if (!this.connection()) this.connect();
    this.needsRejoin = false;
    this.currentAuctionId.set(auctionId);
    this.lastJoinedAuctionId = auctionId;
    this.connection()?.emit(BidSocketEvent.JOIN_AUCTION, { auctionId });
  }

  leaveAuction(auctionId: number): void {
    this.connection()?.emit(BidSocketEvent.LEAVE_AUCTION, { auctionId });
    this.needsRejoin = false;

    if (this.currentAuctionId() === auctionId) {
      this.currentAuctionId.set(null);
      this.lastJoinedAuctionId = null;
    }

    const conn = this.connection();

    if (!conn) {
      // No connection — clear state immediately
      this.currentAuctionId.set(null);
      this.lastJoinedAuctionId = null;
      return;
    }

    // Defer state cleanup until the server confirms the leave.
    // race() with timer(3000) ensures cleanup even if the connection drops
    // and the server never sends back `left:auction`.
    race(
      conn
        .on<AuctionEvent>(BidSocketEvent.LEFT_AUCTION)
        .pipe(filter((evt) => evt.auctionId === auctionId)),
      timer(3000),
    )
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.currentAuctionId() === auctionId) {
          this.currentAuctionId.set(null);
          this.lastJoinedAuctionId = null;
        }
      });
  }

  placeBid(amount: number): void {
    this.connection()?.emit(BidSocketEvent.PLACE_BID, { amount });
  }

  requestCurrentState(): void {
    this.connection()?.emit(BidSocketEvent.REQUEST_CURRENT_STATE, {});
  }

  onNewHighestBid(): Observable<NewHighestBidEvent> {
    return this.onEvent<NewHighestBidEvent>(BidSocketEvent.NEW_HIGHEST_BID);
  }

  onBidRejected(): Observable<BidRejectedEvent> {
    return this.onEvent<BidRejectedEvent>(BidSocketEvent.BID_REJECTED);
  }

  onPresenceUpdate(): Observable<PresenceUpdateEvent> {
    return this.onEvent<PresenceUpdateEvent>(BidSocketEvent.PRESENCE_UPDATE);
  }

  onAuctionEnded(): Observable<AuctionEndedEvent> {
    return this.onEvent<AuctionEndedEvent>(BidSocketEvent.AUCTION_ENDED);
  }

  onAuctionWon(): Observable<AuctionEndedEvent> {
    return this.onEvent<AuctionEndedEvent>(BidSocketEvent.AUCTION_WON);
  }

  onOutbid(): Observable<AuctionOutbidEvent> {
    return this.onEvent<AuctionOutbidEvent>(BidSocketEvent.AUCTION_OUTBID);
  }

  onRejoinedAuction(): Observable<CurrentStateEvent> {
    return this.onEvent<CurrentStateEvent>(BidSocketEvent.REJOINED_AUCTION);
  }

  onCurrentState(): Observable<CurrentStateEvent> {
    return this.onEvent<CurrentStateEvent>(BidSocketEvent.CURRENT_STATE);
  }

  onException(): Observable<SocketExceptionPayload> {
    return this.onEvent<SocketExceptionPayload>(BidSocketEvent.EXCEPTION);
  }

  onJoinedAuction(): Observable<AuctionEvent> {
    return this.onEvent<AuctionEvent>(BidSocketEvent.JOINED_AUCTION);
  }

  onLeftAuction(): Observable<AuctionEvent> {
    return this.onEvent<AuctionEvent>(BidSocketEvent.LEFT_AUCTION);
  }

  private onEvent<T>(eventName: BidSocketEvent): Observable<T> {
    if (!this.isBrowser) return new Observable<T>();

    this.connect();
    return this.connection()!.on<T>(eventName).pipe(takeUntilDestroyed(this.destroyRef));
  }
}
