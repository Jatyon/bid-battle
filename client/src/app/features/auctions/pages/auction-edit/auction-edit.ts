import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { SpinnerComponent } from '@app/shared';
import { NotificationService } from '@core/services';
import { AuctionDetails, AuctionFormData, UpdateAuctionRequest } from '@features/auctions/models';
import { AuctionFormComponent } from '@features/auctions/components';
import { AuctionsService } from '@features/auctions/services';
import { toLocalDateTime } from '@features/auctions/utils';
import { AuctionStatus } from '@features/auctions/enums';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { Observable, finalize, catchError, of, switchMap } from 'rxjs';
import { LucideAngularModule, AlertTriangle } from 'lucide-angular';

@Component({
  selector: 'app-auction-edit',
  imports: [TranslocoDirective, SpinnerComponent, LucideAngularModule, AuctionFormComponent],
  templateUrl: './auction-edit.html',
  styleUrl: './auction-edit.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuctionEditPage implements OnInit {
  private readonly auctionsService = inject(AuctionsService);
  private readonly notifications = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly warningIcon = AlertTriangle;

  readonly auction = signal<AuctionDetails | null>(null);
  readonly isLoading = signal(true);
  readonly isSubmitting = signal(false);
  readonly submitError = signal('');
  readonly hasBids = signal(false);

  private auctionId = 0;

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');

    if (!idParam) {
      void this.router.navigate(['/']);
      return;
    }
    this.auctionId = Number(idParam);

    this.auctionsService
      .getAuctionById(this.auctionId)
      .pipe(
        finalize(() => this.isLoading.set(false)),
        catchError(() => {
          this.notifications.error('AUCTIONS.EDIT.ERROR_LOAD');
          void this.router.navigate(['/']);
          return of(null);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((auction) => {
        if (!auction) return;
        this.auction.set(auction);
        this.hasBids.set(auction.bidCount > 0);
      });
  }

  handleUpdate(data: AuctionFormData): void {
    if (this.isSubmitting() || this.isLoading()) return;

    this.submitError.set('');
    this.isSubmitting.set(true);

    const requestBase: UpdateAuctionRequest = {};

    if (!this.hasBids()) {
      requestBase.title = data.formValues.title.trim();
      requestBase.description = data.formValues.description.trim();
      requestBase.category = data.formValues.category;
      requestBase.startingPrice = Math.round(Number(data.formValues.startingPrice) * 100);

      const originalEndTimeStr = toLocalDateTime(this.auction()!.endTime);
      if (data.formValues.endTime !== originalEndTimeStr) {
        const endTimestamp = new Date(data.formValues.endTime).getTime();
        requestBase.endTime = new Date(endTimestamp).toISOString();
      }
    }

    if (data.formValues.appendDescription)
      requestBase.appendDescription = data.formValues.appendDescription.trim();

    if (this.auction()?.status === AuctionStatus.PENDING) {
      const isImmediate = data.formValues.startImmediately;

      if (isImmediate) {
        // Send current time so the server reschedules the BullMQ job to fire immediately.
        // The backend accepts timestamps up to 5 minutes in the past to tolerate clock skew.
        requestBase.startTime = new Date().toISOString();
      } else if (data.formValues.startTime)
        requestBase.startTime = new Date(data.formValues.startTime).toISOString();
    }

    let updateImages$: Observable<{ message: string } | null> = of(null);

    const filesToUpload = data.images.filter((img) => img.file).map((img) => img.file as File);
    const existingImageUrls = data.images.filter((img) => !img.file).map((img) => img.previewUrl);

    const auctionImages = this.auction()!.images;
    const imagesChanged =
      filesToUpload.length > 0 ||
      existingImageUrls.length !== auctionImages.length ||
      existingImageUrls.some((url, i) => url !== auctionImages[i]) ||
      data.primaryImageIndex !== this.auction()!.primaryImageIndex;

    if (!this.hasBids() && imagesChanged) {
      updateImages$ = this.auctionsService.updateAuctionImages(
        this.auctionId,
        filesToUpload,
        existingImageUrls,
        data.primaryImageIndex,
      );
    }

    const updateAuction$ = this.auctionsService.updateAuction(this.auctionId, requestBase);

    (imagesChanged && !this.hasBids()
      ? updateImages$.pipe(switchMap(() => updateAuction$))
      : updateAuction$
    )
      .pipe(
        finalize(() => this.isSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.notifications.success('AUCTIONS.EDIT.SUCCESS');
          void this.router.navigate(['/']);
        },
        error: () => {
          this.submitError.set(this.transloco.translate('AUCTIONS.EDIT.ERROR_SAVE'));
        },
      });
  }
}
