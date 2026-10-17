import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BadgeComponent, BadgeVariant, ButtonComponent, PricePipe } from '@app/shared';
import { AuctionClockService } from '@features/auctions/services';
import { AuctionDetails } from '@features/auctions/models';
import { AuctionStatus } from '@features/auctions/enums';
import { calcMinIncrement, calcTimeRemaining, centsToUnits, toCents } from '@core/utils';
import {
  AlertTriangle,
  CheckCircle,
  Eye,
  Gavel,
  Info,
  Lock,
  LucideAngularModule,
} from 'lucide-angular';
import { TranslocoDirective } from '@jsverse/transloco';

@Component({
  selector: 'app-bidding-hub',
  standalone: true,
  imports: [
    FormsModule,
    PricePipe,
    BadgeComponent,
    ButtonComponent,
    LucideAngularModule,
    TranslocoDirective,
  ],
  templateUrl: './bidding-hub.component.html',
  styleUrl: './bidding-hub.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BiddingHubComponent {
  private readonly clockService = inject(AuctionClockService);
  private readonly router = inject(Router);

  readonly lockIcon = Lock;
  readonly infoIcon = Info;
  readonly checkIcon = CheckCircle;
  readonly alertTriangleIcon = AlertTriangle;
  readonly eyeIcon = Eye;
  readonly gavelIcon = Gavel;

  readonly auction = input.required<AuctionDetails>();
  readonly livePrice = input<number | null>(null);
  readonly isLeading = input<boolean>(false);
  readonly hasBidded = input<boolean>(false);
  readonly isOwner = input<boolean>(false);
  readonly isGuest = input<boolean>(false);
  readonly participantsCount = input<number>(0);
  readonly bidCount = input<number>(0);
  readonly isPlacingBid = input<boolean>(false);
  readonly isLiveConnected = input<boolean>(false);

  readonly placeBid = output<number>();

  readonly priceFlash = signal<boolean>(false);

  readonly currentTime = toSignal(this.clockService.currentTime$, {
    initialValue: Date.now(),
  });

  readonly statusTranslationKey = computed(() => {
    if (this.isEnded() && this.auction().status === AuctionStatus.ACTIVE) {
      return 'ACTIVITY.STATUS.ENDED';
    }
    const status = this.auction()?.status;
    return `ACTIVITY.STATUS.${status?.toUpperCase() || 'ACTIVE'}`;
  });

  readonly statusBadgeVariant = computed<BadgeVariant>(() => {
    if (this.isEnded() && this.auction().status === AuctionStatus.ACTIVE) {
      return 'neutral';
    }
    switch (this.auction().status) {
      case AuctionStatus.ACTIVE:
        return 'success';
      case AuctionStatus.PENDING:
        return 'warning';
      case AuctionStatus.CANCELED:
        return 'danger';
      case AuctionStatus.ENDED:
      default:
        return 'neutral';
    }
  });

  readonly currentDisplayPrice = computed(() => {
    const live = this.livePrice();
    const auc = this.auction();
    return live !== null && live !== undefined ? live : (auc.currentPrice ?? auc.startingPrice);
  });

  // Computes the minimum increment step based on current price (tiers in minor units)
  readonly minIncrementStep = computed(() => calcMinIncrement(this.currentDisplayPrice()));

  // Returns min bid in minor currency unit
  readonly minNextBid = computed(() => {
    if (this.bidCount() === 0) return this.currentDisplayPrice();

    return this.currentDisplayPrice() + this.minIncrementStep();
  });

  // Returns min bid in main currency unit for UI display and input
  readonly minNextBidUnits = computed(() => centsToUnits(this.minNextBid()));

  readonly quickBidIncrements = computed(() => {
    const minStep = this.minIncrementStep();
    const curr = this.currentDisplayPrice();

    return [
      { diff: minStep, amount: curr + minStep, amountUnits: centsToUnits(curr + minStep) },
      { diff: minStep * 2, amount: curr + minStep * 2, amountUnits: centsToUnits(curr + minStep * 2) },
      { diff: minStep * 5, amount: curr + minStep * 5, amountUnits: centsToUnits(curr + minStep * 5) },
      { diff: minStep * 10, amount: curr + minStep * 10, amountUnits: centsToUnits(curr + minStep * 10) },
    ];
  });

  // User custom input in main currency unit
  readonly customAmountInput = signal<number | null>(null);

  // Checks whether the user-entered amount is below the minimum required bid
  readonly isBidInvalid = computed(() => {
    const val = this.customAmountInput();
    return val !== null && (val === undefined || isNaN(val) || toCents(val) < this.minNextBid());
  });

  readonly isTimeExpired = computed(() => {
    const end = Date.parse(this.auction().endTime);
    const now = this.currentTime();
    return !!now && !isNaN(end) && now >= end;
  });

  readonly isPending = computed(() => this.auction().status === AuctionStatus.PENDING);

  readonly isActive = computed(() => this.auction().status === AuctionStatus.ACTIVE && !this.isTimeExpired());

  readonly isEnded = computed(() => {
    const status = this.auction().status;
    return (
      status === AuctionStatus.ENDED ||
      status === AuctionStatus.CANCELED ||
      (status === AuctionStatus.ACTIVE && this.isTimeExpired())
    );
  });

  readonly remainingTime = computed(() => {
    const auc = this.auction();
    const now = this.currentTime();
    if (!now) return null;

    if (this.isPending()) return calcTimeRemaining(auc.startTime, now);
    if (this.isActive()) return calcTimeRemaining(auc.endTime, now);

    return null;
  });

  constructor() {
    effect((onCleanup) => {
      // Flash price effect when livePrice changes
      const price = this.livePrice();
      if (price === null) return;
      this.priceFlash.set(true);
      const timer = setTimeout(() => this.priceFlash.set(false), 800);
      onCleanup(() => clearTimeout(timer));
    });
  }

  selectQuickBid(amountInMinor: number): void {
    if (this.isPlacingBid() || this.isLeading()) return;
    this.customAmountInput.set(centsToUnits(amountInMinor));
  }

  submitBid(): void {
    if (this.isPlacingBid() || this.isLeading()) return;
    const inputVal = this.customAmountInput();
    const amountToBid = inputVal !== null ? toCents(inputVal) : this.minNextBid();

    if (!isNaN(amountToBid) && amountToBid >= this.minNextBid()) {
      this.placeBid.emit(amountToBid);
      this.customAmountInput.set(null); // Reset input after submitting
    }
  }

  goToLogin(event: Event): void {
    event.preventDefault();
    void this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
  }

  goToRegister(event: Event): void {
    event.preventDefault();
    void this.router.navigate(['/auth/register'], { queryParams: { returnUrl: this.router.url } });
  }
}
