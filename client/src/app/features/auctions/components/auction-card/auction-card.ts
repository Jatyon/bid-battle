import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { DecimalPipe, DOCUMENT } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { auctionCategoryTranslationKey } from '@core/enums';
import { environment } from '@env/environment';
import { Auction } from '@features/auctions/models/auction.model';
import { AuctionClockService } from '@features/auctions/services';
import { TranslocoDirective } from '@jsverse/transloco';

@Component({
  selector: 'app-auction-card',
  imports: [DecimalPipe, TranslocoDirective],
  templateUrl: './auction-card.html',
  styleUrl: './auction-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuctionCardComponent {
  readonly auction = input.required<Auction>();
  private readonly document = inject(DOCUMENT);
  readonly currentTime = toSignal(inject(AuctionClockService).currentTime$, {
    initialValue: Date.now(),
  });

  timeRemaining(endTime: string): { days: number; hours: number; minutes: number } | null {
    const difference = Date.parse(endTime) - this.currentTime();
    if (difference <= 0) return null;

    const totalMinutes = Math.floor(difference / 60_000);
    return {
      days: Math.floor(totalMinutes / 1440),
      hours: Math.floor((totalMinutes % 1440) / 60),
      minutes: totalMinutes % 60,
    };
  }

  categoryTranslationKey(category: Auction['category']): string {
    return auctionCategoryTranslationKey(category);
  }

  imageUrl(value: string): string {
    if (!value) return '';

    try {
      const base = new URL(environment.apiUrl, this.document.baseURI);
      if (/^https?:\/\//i.test(value)) return value;
      const path = value.startsWith('/uploads/')
        ? value
        : value.startsWith('uploads/')
          ? `/${value}`
          : `/uploads/${value.replace(/^\//, '')}`;
      return new URL(path, base.origin).toString();
    } catch {
      return value;
    }
  }
}
