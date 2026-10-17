import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { SpinnerComponent } from '@app/shared';
import { AuthService, NotificationService } from '@core/services';
import { toCents } from '@core/utils';
import { AuctionDetails, AuctionFormData, UpdateAuctionRequest } from '@features/auctions/models';
import { AuctionFormComponent } from '@features/auctions/components';
import { AuctionsService } from '@features/auctions/services';
import { toLocalDateTime } from '@features/auctions/utils';
import { AuctionStatus } from '@features/auctions/enums';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { LucideAngularModule, AlertTriangle } from 'lucide-angular';

@Component({
  selector: 'app-auction-edit',
  imports: [TranslocoDirective, SpinnerComponent, LucideAngularModule, AuctionFormComponent],
  templateUrl: './auction-edit.html',
  styleUrl: './auction-edit.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuctionEditPage {
  readonly id = input<string>();
  readonly initialAuction = input<AuctionDetails>();

  private readonly auctionsService = inject(AuctionsService);
  private readonly authService = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);

  readonly warningIcon = AlertTriangle;

  readonly auction = signal<AuctionDetails | null>(null);
  readonly isLoading = signal(true);
  readonly isSubmitting = signal(false);
  readonly submitError = signal('');
  readonly hasBids = signal(false);

  constructor() {
    afterNextRender(() => {
      void this.loadAuction();
    });
  }

  private async loadAuction(): Promise<void> {
    const numId = Number(this.id());
    if (!numId || isNaN(numId) || numId <= 0) {
      void this.router.navigate(['/']);
      return;
    }

    const existing = this.initialAuction();
    let auction = existing && existing.id === numId ? existing : null;

    if (!auction) {
      this.isLoading.set(true);
      try {
        auction = await firstValueFrom(this.auctionsService.getAuctionById(numId));
      } catch {
        this.notifications.error('AUCTIONS.EDIT.ERROR_LOAD');
        void this.router.navigate(['/']);
        return;
      } finally {
        this.isLoading.set(false);
      }
    } else {
      this.isLoading.set(false);
    }

    if (!auction) return;

    const currentUser = this.authService.currentUser();
    if (auction.owner?.id !== currentUser?.id) {
      this.notifications.error('AUCTIONS.EDIT.ERROR_NOT_OWNER');
      void this.router.navigate(['/']);
      return;
    }

    this.auction.set(auction);

    try {
      const res = await firstValueFrom(this.auctionsService.getAuctionBids(auction.id, 1, 1));
      this.hasBids.set(res.total > 0);
    } catch {
      // Ignore bids load error
    }
  }

  async handleUpdate(data: AuctionFormData): Promise<void> {
    if (this.isSubmitting() || this.isLoading()) return;

    const currentAuction = this.auction();
    if (!currentAuction) return;

    this.submitError.set('');
    this.isSubmitting.set(true);

    const requestBase: UpdateAuctionRequest = {};

    if (!this.hasBids()) {
      requestBase.title = data.formValues.title.trim();
      requestBase.description = data.formValues.description.trim();
      requestBase.category = data.formValues.category;
      requestBase.startingPrice = toCents(data.formValues.startingPrice);

      const originalEndTimeStr = toLocalDateTime(currentAuction.endTime);

      if (data.formValues.endTime !== originalEndTimeStr) {
        const endTimestamp = new Date(data.formValues.endTime).getTime();
        requestBase.endTime = new Date(endTimestamp).toISOString();
      }
    }

    if (data.formValues.appendDescription) {
      requestBase.appendDescription = data.formValues.appendDescription.trim();
    }

    if (currentAuction.status === AuctionStatus.PENDING) {
      const isImmediate = data.formValues.startImmediately;

      if (isImmediate) {
        // Send current time so the server reschedules the BullMQ job to fire immediately.
        // The backend accepts timestamps up to 5 minutes in the past to tolerate clock skew.
        requestBase.startTime = new Date().toISOString();
      } else if (data.formValues.startTime) {
        requestBase.startTime = new Date(data.formValues.startTime).toISOString();
      }
    }

    const filesToUpload = data.images.filter((img) => img.file).map((img) => img.file as File);
    const existingImageUrls = data.images.filter((img) => !img.file).map((img) => img.previewUrl);

    const auctionImages = currentAuction.images;
    const imagesChanged =
      filesToUpload.length > 0 ||
      existingImageUrls.length !== auctionImages.length ||
      existingImageUrls.some((url, i) => url !== auctionImages[i]) ||
      data.primaryImageIndex !== currentAuction.primaryImageIndex;

    const auctionId = currentAuction.id;

    try {
      if (!this.hasBids() && imagesChanged) {
        await firstValueFrom(
          this.auctionsService.updateAuctionImages(
            auctionId,
            filesToUpload,
            existingImageUrls,
            data.primaryImageIndex,
          ),
        );
      }

      await firstValueFrom(this.auctionsService.updateAuction(auctionId, requestBase));
      this.notifications.success('AUCTIONS.EDIT.SUCCESS');
      void this.router.navigate(['/']);
    } catch {
      this.submitError.set(this.transloco.translate('AUCTIONS.EDIT.ERROR_SAVE'));
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
