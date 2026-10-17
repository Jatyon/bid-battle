import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AuthService } from '@core/services';
import { BadgeComponent, ButtonComponent, PricePipe, SpinnerComponent } from '@app/shared';
import { AuctionBidItem } from '@features/auctions/models';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

@Component({
  selector: 'app-bid-history',
  standalone: true,
  imports: [
    DatePipe,
    PricePipe,
    BadgeComponent,
    ButtonComponent,
    SpinnerComponent,
    TranslocoDirective,
  ],
  templateUrl: './bid-history.component.html',
  styleUrl: './bid-history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BidHistoryComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly authService = inject(AuthService);

  readonly bids = input<AuctionBidItem[]>([]);
  readonly isLoading = input<boolean>(false);
  readonly totalBids = input<number>(0);
  readonly page = input<number>(1);
  readonly showAll = output<void>();

  readonly currentUser = this.authService.currentUser;

  isHighestBid(first: boolean): boolean {
    return first && this.page() === 1;
  }

  isMyBid(bid: AuctionBidItem): boolean {
    if (bid.isMyBid !== undefined) return bid.isMyBid;
    const currentUserId = this.currentUser()?.id;

    if (!currentUserId || !bid.user?.id) return false;
    return bid.user.id === currentUserId;
  }

  getAvatarInitial(bid: AuctionBidItem): string {
    if (this.isMyBid(bid)) return this.transloco.translate('AUCTIONS.DETAIL.HISTORY.YOU_INITIAL');
    return this.formatBidderName(bid.user).charAt(0).toUpperCase();
  }

  formatBidderName(user: AuctionBidItem['user']): string {
    if (!user) return this.transloco.translate('AUCTIONS.DETAIL.HISTORY.ANONYMOUS_BIDDER');

    if (user.firstName) {
      const first = user.firstName;
      const lastInitial = user.lastName ? ` ${user.lastName.charAt(0)}.` : '';
      return `${first}${lastInitial}`;
    }
    return `${this.transloco.translate('AUCTIONS.DETAIL.HISTORY.USER_PREFIX')} #${user.id}`;
  }
}
