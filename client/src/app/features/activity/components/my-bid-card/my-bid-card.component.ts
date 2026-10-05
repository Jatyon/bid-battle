import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AppDatePipe, BadgeComponent, PricePipe } from '@app/shared';
import { AuctionStatus } from '@features/auctions/enums';
import type { MyBid } from '@features/activity/models';
import { ActivityCardComponent, type ActivityCardModifier } from '../activity-card';
import { ActivityCardColComponent } from '../activity-card-col';
import { TranslocoDirective } from '@jsverse/transloco';
import { LucideAngularModule, Trophy, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-angular';

export type MyBidState = 'winning' | 'outbid' | 'won' | 'lost' | 'canceled';

@Component({
  selector: 'app-my-bid-card',
  imports: [
    PricePipe,
    AppDatePipe,
    TranslocoDirective,
    LucideAngularModule,
    BadgeComponent,
    ActivityCardComponent,
    ActivityCardColComponent,
  ],
  templateUrl: './my-bid-card.component.html',
  styleUrl: './my-bid-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyBidCardComponent {
  readonly bid = input.required<MyBid>();

  readonly wonIcon = Trophy;
  readonly warningIcon = AlertTriangle;
  readonly checkIcon = CheckCircle;
  readonly canceledIcon = XCircle;
  readonly clockIcon = Clock;

  readonly bidState = computed<MyBidState>(() => {
    const b = this.bid();
    const auction = b.auction;

    if (!auction) return 'canceled';

    const { status, currentPrice } = auction;
    const isLeading = b.amount >= currentPrice;

    if (status === AuctionStatus.ACTIVE) return isLeading ? 'winning' : 'outbid';
    if (status === AuctionStatus.ENDED) return isLeading ? 'won' : 'lost';

    return 'canceled';
  });

  readonly cardModifier = computed<ActivityCardModifier>(() => {
    const state = this.bidState();
    if (state === 'won') return 'won';
    if (state === 'outbid') return 'outbid';
    return null;
  });
}
