import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  AppDatePipe,
  BadgeComponent,
  ButtonComponent,
  PopupService,
  PricePipe,
  UserBadgeComponent,
} from '@app/shared';
import { NotificationService } from '@core/services';
import { AuctionsService } from '@features/auctions/services';
import type { MyAuction } from '@features/auctions/models';
import { AuctionStatus } from '@features/auctions/enums';
import {
  ActivityCardComponent,
  type ActivityCardModifier,
} from '../activity-card/activity-card.component';
import { ActivityCardColComponent } from '../activity-card-col/activity-card-col.component';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  LucideAngularModule,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Clock,
  XCircle,
  MoreVertical,
} from 'lucide-angular';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-my-auction-card',
  imports: [
    PricePipe,
    AppDatePipe,
    RouterLink,
    TranslocoDirective,
    LucideAngularModule,
    BadgeComponent,
    ButtonComponent,
    ActivityCardComponent,
    ActivityCardColComponent,
    UserBadgeComponent,
  ],
  templateUrl: './my-auction-card.component.html',
  styleUrl: './my-auction-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyAuctionCardComponent {
  readonly auction = input.required<MyAuction>();
  readonly auctionCanceled = output<number>();

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly router = inject(Router);
  private readonly auctionsService = inject(AuctionsService);
  private readonly popup = inject(PopupService);
  private readonly notifications = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);

  readonly isMenuOpen = signal(false);
  readonly isCanceling = signal(false);

  readonly displayUser = computed(() => {
    const a = this.auction();
    return a.status === AuctionStatus.ENDED ? a.winner : a.highestBidder;
  });

  readonly cardModifier = computed<ActivityCardModifier>(() => {
    const status = this.auction().status;
    if (status === AuctionStatus.ENDED) return 'ended';
    if (status === AuctionStatus.CANCELED) return 'canceled';
    return null;
  });

  readonly editIcon = Edit3;
  readonly cancelIcon = Trash2;
  readonly activeIcon = Clock;
  readonly endedIcon = CheckCircle2;
  readonly canceledIcon = XCircle;
  readonly pendingIcon = AlertCircle;
  readonly menuIcon = MoreVertical;

  readonly AuctionStatus = AuctionStatus;

  toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.isMenuOpen.update((open) => !open);
  }

  closeMenu(): void {
    this.isMenuOpen.set(false);
  }

  onEditClick(event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();
    this.router.navigate(['/edit', this.auction().id]);
  }

  handleCancelAuction(event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();
    this.onCancelAuction(event);
  }

  @HostListener('document:click', ['$event.target'])
  onDocumentClick(target: EventTarget | null): void {
    if (this.isMenuOpen() && !this.elementRef.nativeElement.contains(target as Node)) {
      this.closeMenu();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu();
  }

  async onCancelAuction(event?: Event): Promise<void> {
    event?.stopPropagation();

    const confirmed = await this.popup.open({
      title: this.transloco.translate('ACTIVITY.AUCTIONS.CANCEL_CONFIRM_TITLE'),
      message: this.transloco.translate('ACTIVITY.AUCTIONS.CANCEL_CONFIRM_MSG'),
      confirmText: this.transloco.translate('ACTIVITY.AUCTIONS.CANCEL_CONFIRM_BTN'),
      cancelText: this.transloco.translate('ACTIVITY.AUCTIONS.CANCEL_CANCEL_BTN'),
      mode: 'confirm',
      type: 'warning',
    });

    if (!confirmed) {
      return;
    }

    try {
      this.isCanceling.set(true);
      await firstValueFrom(this.auctionsService.cancelAuction(this.auction().id));
      this.notifications.success(this.transloco.translate('ACTIVITY.AUCTIONS.CANCEL_SUCCESS'));
      this.auctionCanceled.emit(this.auction().id);
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : this.transloco.translate('ACTIVITY.AUCTIONS.CANCEL_ERROR');
      this.notifications.error(message);
    } finally {
      this.isCanceling.set(false);
    }
  }
}
