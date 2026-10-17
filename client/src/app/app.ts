import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterOutlet } from '@angular/router';
import { NotificationService } from '@core/services';
import { PopupComponent, ToastComponent } from '@app/shared';
import { BidSocketService } from '@features/auctions';
import { TranslocoService } from '@jsverse/transloco';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastComponent, PopupComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly socketService = inject(BidSocketService);
  private readonly notificationService = inject(NotificationService);
  private readonly translocoService = inject(TranslocoService);
  private readonly router = inject(Router);

  constructor() {
    this.socketService
      .onAuctionWon()
      .pipe(takeUntilDestroyed())
      .subscribe((evt) => {
        const msg = this.translocoService.translate('TOAST.AUCTION_WON', { price: evt.finalPrice });
        this.notificationService.success(msg);
      });

    this.socketService
      .onOutbid()
      .pipe(takeUntilDestroyed())
      .subscribe((evt) => {
        if (this.isViewingAuction(evt.auctionId)) return;

        const title = evt.auctionTitle || `#${evt.auctionId}`;
        const msg = this.translocoService.translate('TOAST.AUCTION_OUTBID', {
          title,
          price: evt.newAmount,
        });
        this.notificationService.warning(msg);
      });
  }

  private isViewingAuction(auctionId: number): boolean {
    if (this.socketService.activeAuctionId() === auctionId) return true;

    const currentUrl = this.router.url;
    return new RegExp(`^/auctions/${auctionId}(?:[/?#]|$)`).test(currentUrl);
  }
}
