import { ChangeDetectionStrategy, Component, DOCUMENT, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BadgeComponent } from '@app/shared';
import { auctionCategoryTranslationKey } from '@core/enums';
import type { AuctionCategory } from '@core/enums';
import { resolveImageUrl } from '@core/utils';
import { TranslocoDirective } from '@jsverse/transloco';

export type ActivityCardModifier = 'ended' | 'canceled' | 'won' | 'outbid' | null;

@Component({
  selector: 'app-activity-card',
  imports: [RouterLink, TranslocoDirective, BadgeComponent],
  templateUrl: './activity-card.component.html',
  styleUrl: './activity-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityCardComponent {
  readonly routerLink = input.required<readonly (string | number)[] | string>();
  readonly title = input.required<string>();
  readonly imageUrl = input<string | null | undefined>();
  readonly category = input<string | null | undefined>();
  readonly cardModifier = input<ActivityCardModifier>();

  private readonly document = inject(DOCUMENT);

  readonly fullImageUrl = computed(() => resolveImageUrl(this.imageUrl(), this.document.baseURI));

  categoryTranslationKey(category?: string | null): string {
    return auctionCategoryTranslationKey((category as AuctionCategory) || 'OTHER');
  }
}
