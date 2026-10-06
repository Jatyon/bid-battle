import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService } from '@core/services';
import { toCents } from '@core/utils';
import { AuctionFormData, CreateAuctionRequest } from '@features/auctions/models';
import { AuctionsService } from '@features/auctions/services/auctions.service';
import { AuctionFormComponent } from '@features/auctions/components';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-auction-create',
  imports: [TranslocoDirective, AuctionFormComponent],
  templateUrl: './auction-create.html',
  styleUrl: './auction-create.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuctionCreatePage {
  private readonly auctionsService = inject(AuctionsService);
  private readonly notifications = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);

  readonly isSubmitting = signal(false);
  readonly isCreating = signal(false);
  readonly submitError = signal('');

  async handleCreate(data: AuctionFormData): Promise<void> {
    if (this.isSubmitting()) return;

    this.submitError.set('');
    this.isSubmitting.set(true);
    this.isCreating.set(false);

    let failedStage: 'upload' | 'create' = 'upload';

    try {
      const filesToUpload = data.images.filter((img) => img.file).map((img) => img.file as File);
      const isImmediate = data.formValues.startImmediately;
      const startTimestamp =
        !isImmediate && data.formValues.startTime
          ? new Date(data.formValues.startTime).getTime()
          : undefined;
      const endTimestamp = new Date(data.formValues.endTime).getTime();
      const startingPrice = toCents(data.formValues.startingPrice);

      const requestBase: Omit<CreateAuctionRequest, 'imageUrls'> = {
        title: data.formValues.title.trim(),
        description: data.formValues.description.trim(),
        startingPrice,
        ...(startTimestamp ? { startTime: new Date(startTimestamp).toISOString() } : {}),
        endTime: new Date(endTimestamp).toISOString(),
        primaryImageIndex: data.primaryImageIndex,
        category: data.formValues.category,
      };

      const uploadedImages = await firstValueFrom(
        this.auctionsService.uploadAuctionImages(filesToUpload),
      );

      if (uploadedImages.length !== filesToUpload.length) throw new Error(this.transloco.translate('AUCTIONS.CREATE.ERROR_IMAGE_COUNT_MISMATCH'));

      failedStage = 'create';
      this.isCreating.set(true);

      await firstValueFrom(
        this.auctionsService.createAuction({
          ...requestBase,
          imageUrls: uploadedImages.map((image) => image.url),
        }),
      );

      this.notifications.success('AUCTIONS.CREATE.SUCCESS');
      void this.router.navigate(['/']);
    } catch (err: unknown) {
      if (err instanceof Error && err.message && !('status' in err)) {
        this.submitError.set(err.message);
      } else {
        this.submitError.set(
          this.transloco.translate(
            failedStage === 'create'
              ? 'AUCTIONS.CREATE.ERROR_CREATE'
              : 'AUCTIONS.CREATE.ERROR_UPLOAD',
          ),
        );
      }
    } finally {
      this.isSubmitting.set(false);
      this.isCreating.set(false);
    }
  }
}
