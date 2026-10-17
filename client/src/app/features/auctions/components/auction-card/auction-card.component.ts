import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { BadgeComponent, PricePipe, UserBadgeComponent } from '@app/shared';
import { auctionCategoryTranslationKey } from '@core/enums';
import { resolveImageUrl } from '@core/utils';
import { AuctionClockService } from '@features/auctions/services';
import { Auction } from '@features/auctions/models';
import { TranslocoDirective } from '@jsverse/transloco';

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
}

@Component({
  selector: 'app-auction-card',
  imports: [PricePipe, TranslocoDirective, BadgeComponent, UserBadgeComponent, RouterLink],
  templateUrl: './auction-card.component.html',
  styleUrl: './auction-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuctionCardComponent {
  readonly auction = input.required<Auction>();
  private readonly document = inject(DOCUMENT);

  readonly currentTime = toSignal(inject(AuctionClockService).currentTime$, {
    initialValue: Date.now(),
  });

  readonly timeRemaining = computed<TimeRemaining | null>(
    () => {
      const difference = Date.parse(this.auction().endTime) - this.currentTime();

      if (difference <= 0) return null;

      const totalMinutes = Math.floor(difference / 60_000);
      return {
        days: Math.floor(totalMinutes / 1440),
        hours: Math.floor((totalMinutes % 1440) / 60),
        minutes: totalMinutes % 60,
      };
    },
    {
      equal: (a, b) =>
        a === b ||
        (!!a && !!b && a.days === b.days && a.hours === b.hours && a.minutes === b.minutes),
    },
  );

  readonly categoryTranslationKey = computed(() =>
    auctionCategoryTranslationKey(this.auction().category),
  );

  readonly imageUrl = computed(() => {
    const mainImg = this.auction().mainImageUrl;
    return mainImg ? resolveImageUrl(mainImg, this.document.baseURI) : '';
  });
}
